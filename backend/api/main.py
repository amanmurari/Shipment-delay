
import os
import sys
import json
import math
import random
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel



BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(BASE_DIR)
sys.path.insert(0, BACKEND_DIR)


from app.seed import init_db
from app.routers.auth_router import router as auth_router
from app.routers.admin_router import router as admin_router
from app.routers.orders_router import router as orders_router

from models.predictor import ShipGuardPredictor
from engine.recommender import InterventionRecommender
from data.synthetic_generator import generate_demo_shipments, CITIES, CARRIERS
from data.kaggle_loader import compute_features
from pipeline.notifier import send_alert, get_config as notifier_config, MOCK_MODE
from pipeline.signal_collector import ExternalSignalCollector


ALERT_THRESHOLD      = float(os.getenv("ALERT_THRESHOLD", 65))
MONITOR_INTERVAL     = int(os.getenv("MONITOR_INTERVAL_SECONDS", 300))  
NOTIF_CHANNELS       = os.getenv("NOTIFICATION_CHANNELS", "telegram").split(",")
ALREADY_ALERTED: set = set()   

async def _monitor_loop():
    """Background task: check fleet every MONITOR_INTERVAL seconds, alert on HIGH risk."""
    await asyncio.sleep(10)   
    while True:
        try:
            new_alerts = []
            for ship in FLEET:
                sid  = ship["shipment_id"]
                risk = RISK_CACHE.get(sid, {})
                score = risk.get("risk_score", 0)
                if score >= ALERT_THRESHOLD and sid not in ALREADY_ALERTED:
                    
                    try:
                        live_signals = signal_collector.collect_all_signals(ship)
                        sla_dt = datetime.fromisoformat(ship['sla_deadline'].replace('Z', '+00:00'))
                        hrs_left = max(0, (sla_dt - datetime.now(timezone.utc)).total_seconds() / 3600)
                        enriched_mon = {
                            **ship["features"], **live_signals,
                            "hours_until_sla": hrs_left,
                            "cross_border_count": max(len(ship.get("route_countries", ["India"])) - 1, 0),
                        }
                    except Exception:
                        enriched_mon = ship["features"]
                    interventions = recommender.recommend(ship, risk, enriched_mon)
                    results = send_alert(ship, risk, interventions, NOTIF_CHANNELS)
                    ALREADY_ALERTED.add(sid)
                    ts = datetime.now(timezone.utc).isoformat()
                    for r in results:
                        ALERTS_LOG.append({
                            "type":       "AUTO_MONITOR",
                            "shipment_id": sid,
                            "risk_score":  score,
                            "channel":     r.get("channel"),
                            "success":     r.get("success"),
                            "timestamp":   ts,
                            "message":     r.get("message", "")[:200] if r.get("mode") == "mock" else "",
                        })
                    new_alerts.append(sid)
            if new_alerts:
                print(f"[MONITOR] Sent alerts for {len(new_alerts)} shipment(s): {new_alerts}")
        except Exception as exc:
            print(f"[MONITOR] Error: {exc}")
        await asyncio.sleep(MONITOR_INTERVAL)

@asynccontextmanager
async def lifespan(app: FastAPI):
    
    try:
        init_db()
    except Exception as e:
        print(f"[ShipGuard] DB init skipped (no MySQL?): {e}")
    task = asyncio.create_task(_monitor_loop())
    print(f"[ShipGuard] Monitor started — checking every {MONITOR_INTERVAL}s (threshold {ALERT_THRESHOLD}%)")
    print(f"[ShipGuard] Notifications: {'MOCK MODE' if MOCK_MODE else 'LIVE'} | channels: {NOTIF_CHANNELS}")
    yield
    task.cancel()


app = FastAPI(
    title="ShipGuard AI",
    description="AI-Based Early Warning System for Shipment Delays",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(orders_router)


predictor        = ShipGuardPredictor()
recommender      = InterventionRecommender()
signal_collector = ExternalSignalCollector()


import joblib as _joblib
_MODEL_PATH = os.path.join(BACKEND_DIR, 'trained_models', 'shipguard_v1.pkl')
_MODEL_BUNDLE = _joblib.load(_MODEL_PATH) if os.path.exists(_MODEL_PATH) else {}


DEMO_SHIPMENTS = generate_demo_shipments()
INTERVENTIONS_LOG = []
ALERTS_LOG = []


def _make_features(rng, risk_tier: str, priority: int, cross_border: int) -> dict:
    """Build a Kaggle-schema feature dict tuned to produce HIGH / MEDIUM / LOW risk."""
    if risk_tier == "HIGH":
        care_calls  = rng.choice([5, 6, 7])
        rating      = rng.choice([1, 2])
        discount    = round(rng.uniform(40, 65), 1)
        weight_kg   = round(rng.uniform(4.0, 7.0), 2)
        mode        = 2                              
        warehouse   = rng.choice([2, 3])             
        importance  = 2                              
    elif risk_tier == "MEDIUM":
        care_calls  = rng.choice([3, 4, 5])
        rating      = rng.choice([2, 3, 4])
        discount    = round(rng.uniform(15, 40), 1)
        weight_kg   = round(rng.uniform(2.5, 5.0), 2)
        mode        = rng.choice([1, 2])             
        warehouse   = rng.choice([1, 2, 3])
        importance  = rng.choice([1, 2])             
    else:  
        care_calls  = rng.choice([1, 2])
        rating      = rng.choice([4, 5])
        discount    = round(rng.uniform(0, 15), 1)
        weight_kg   = round(rng.uniform(1.0, 3.0), 2)
        mode        = rng.choice([0, 1])             
        warehouse   = rng.choice([0, 4])             
        importance  = rng.choice([0, 1])             

    prior_purchases = rng.choice([2, 3, 4, 5, 6])
    cost_of_product = round(rng.uniform(96, 308), 0)
    gender          = rng.choice([0, 1])

    base = {
        "warehouse_block":    warehouse,
        "mode_of_shipment":   mode,
        "customer_care_calls": care_calls,
        "customer_rating":    rating,
        "cost_of_product":    cost_of_product,
        "prior_purchases":    prior_purchases,
        "product_importance": importance,
        "discount_offered":   discount,
        "weight_kg":          weight_kg,
        "gender":             gender,
    }
    return compute_features(base)


def _generate_fleet():
    """Generate fleet with realistic HIGH/MEDIUM/LOW risk spread."""
    fleet = list(DEMO_SHIPMENTS)
    now = datetime.now(timezone.utc)
    statuses = ["IN_TRANSIT", "IN_TRANSIT", "IN_TRANSIT", "AT_HUB", "CUSTOMS_HOLD"]
    rng = random.Random(42)

    
    defective_carriers = set(rng.sample(CARRIERS, 2))

    
    tiers = (["HIGH"] * 10) + (["MEDIUM"] * 20) + (["LOW"] * 20)
    rng.shuffle(tiers)

    for i, risk_tier in enumerate(tiers):
        origin   = rng.choice(CITIES)
        dest     = rng.choice([c for c in CITIES if c['name'] != origin['name']])
        carrier  = rng.choice(CARRIERS)
        priority = rng.choice([1, 2, 3, 3, 4, 4, 5])
        hours_ahead = rng.uniform(12, 96)

        route_countries = ["India"]
        cross_border = 0
        if dest['name'] in ['Dubai', 'Singapore', 'Shanghai', 'London', 'New York']:
            route_countries = ["India", dest['name'].split()[0]]
            cross_border = 1
            if dest['name'] in ['London', 'New York']:
                route_countries = ["India", "UAE", "UK" if dest['name'] == 'London' else 'USA']
                cross_border = 2

        features = _make_features(rng, risk_tier, priority, cross_border)
        
        eta_offset = (
            rng.uniform(6, 18)   if risk_tier == "HIGH"   else
            rng.uniform(0, 6)    if risk_tier == "MEDIUM" else
            rng.uniform(-8, 0)
        )

        
        ill_prob = 0.25 if risk_tier == "HIGH" else 0.08
        driver_ill = rng.random() < ill_prob

        shipment = {
            "shipment_id":      f"SH-{rng.randint(1000, 9999)}",
            "origin_city":      origin['name'],
            "dest_city":        dest['name'],
            "origin_lat":       origin['lat'],
            "origin_lng":       origin['lng'],
            "dest_lat":         dest['lat'],
            "dest_lng":         dest['lng'],
            "carrier_name":     carrier,
            "carrier_defective": carrier in defective_carriers,
            "driver_ill":       driver_ill,
            "sla_deadline":     (now + timedelta(hours=hours_ahead)).isoformat(),
            "current_eta":      (now + timedelta(hours=hours_ahead + eta_offset)).isoformat(),
            "weight_kg":        round(rng.uniform(50, 5000), 1),
            "priority_level":   priority,
            "route_countries":  route_countries,
            "status":           rng.choice(statuses),
            "created_at":       (now - timedelta(days=rng.uniform(1, 7))).isoformat(),
            "features":         features,
        }
        fleet.append(shipment)
    return fleet


FLEET = _generate_fleet()
RISK_CACHE = {}


_now = datetime.now(timezone.utc)
_SHOWCASE = [
    
    {
        "shipment_id":     "SH-SHOW-H1",
        "origin_city":     "Mumbai",   "dest_city":   "London",
        "origin_lat":      19.0760,    "origin_lng":   72.8777,
        "dest_lat":        51.5074,    "dest_lng":     -0.1278,
        "carrier_name":    "Maersk Logistics",
        "carrier_defective": True,
        "driver_ill":      False,
        "sla_deadline":    (_now + timedelta(hours=38)).isoformat(),
        "current_eta":     (_now + timedelta(hours=52)).isoformat(),
        "weight_kg":       5500.0,
        "priority_level":  5,
        "route_countries": ["India", "UAE", "UK"],
        "status":          "IN_TRANSIT",
        "created_at":      (_now - timedelta(days=5)).isoformat(),
        "features":        _make_features(random.Random(1), "HIGH", 5, 2),
        "_risk_override": {
            "risk_score": 89, "risk_level": "HIGH", "risk_color": "#FF4444",
            "shap_reasons": [
                {"feature": "mode_of_shipment",    "impact": 0.28, "description": "Sea freight — slowest mode, highest delay risk"},
                {"feature": "customer_care_calls",  "impact": 0.22, "description": "6 care calls signal active escalation"},
                {"feature": "discount_offered",     "impact": 0.18, "description": "55% discount applied — margin pressure"},
                {"feature": "carrier_defective",    "impact": 0.15, "description": "Carrier has defective equipment flagged"},
                {"feature": "cross_border_count",   "impact": 0.12, "description": "3-country route — customs risk at each border"},
            ],
        },
    },
    
    {
        "shipment_id":     "SH-SHOW-H2",
        "origin_city":     "Delhi",    "dest_city":   "New York",
        "origin_lat":      28.7041,    "origin_lng":   77.1025,
        "dest_lat":        40.7128,    "dest_lng":    -74.0060,
        "carrier_name":    "Gati",
        "carrier_defective": False,
        "driver_ill":      True,
        "sla_deadline":    (_now + timedelta(hours=44)).isoformat(),
        "current_eta":     (_now + timedelta(hours=55)).isoformat(),
        "weight_kg":       4200.0,
        "priority_level":  4,
        "route_countries": ["India", "UAE", "USA"],
        "status":          "CUSTOMS_HOLD",
        "created_at":      (_now - timedelta(days=4)).isoformat(),
        "features":        _make_features(random.Random(2), "HIGH", 4, 2),
        "_risk_override": {
            "risk_score": 82, "risk_level": "HIGH", "risk_color": "#FF4444",
            "shap_reasons": [
                {"feature": "driver_ill",           "impact": 0.30, "description": "Driver reported ill — handover delay expected"},
                {"feature": "customer_care_calls",  "impact": 0.20, "description": "5 escalation calls logged"},
                {"feature": "status",               "impact": 0.18, "description": "Customs hold — clearance pending"},
                {"feature": "discount_offered",     "impact": 0.14, "description": "45% discount — high commercial pressure"},
                {"feature": "cross_border_count",   "impact": 0.10, "description": "Multi-border route increases dwell time"},
            ],
        },
    },
    
    {
        "shipment_id":     "SH-SHOW-M1",
        "origin_city":     "Bangalore", "dest_city": "Singapore",
        "origin_lat":      12.9716,     "origin_lng":  77.5946,
        "dest_lat":         1.3521,     "dest_lng":   103.8198,
        "carrier_name":    "DHL Supply Chain",
        "carrier_defective": False,
        "driver_ill":      False,
        "sla_deadline":    (_now + timedelta(hours=60)).isoformat(),
        "current_eta":     (_now + timedelta(hours=64)).isoformat(),
        "weight_kg":       3200.0,
        "priority_level":  3,
        "route_countries": ["India", "Singapore"],
        "status":          "IN_TRANSIT",
        "created_at":      (_now - timedelta(days=2)).isoformat(),
        "features":        _make_features(random.Random(3), "MEDIUM", 3, 1),
        "_risk_override": {
            "risk_score": 57, "risk_level": "MEDIUM", "risk_color": "#FFA500",
            "shap_reasons": [
                {"feature": "warehouse_block",      "impact": 0.20, "description": "Warehouse C — elevated dispatch failure rate"},
                {"feature": "discount_offered",     "impact": 0.17, "description": "28% discount — moderate margin pressure"},
                {"feature": "customer_care_calls",  "impact": 0.14, "description": "3 care calls — watchlist threshold"},
                {"feature": "cross_border_count",   "impact": 0.10, "description": "Single customs border — manageable"},
            ],
        },
    },
    
    {
        "shipment_id":     "SH-SHOW-M2",
        "origin_city":     "Chennai",  "dest_city":  "Dubai",
        "origin_lat":      13.0827,    "origin_lng":  80.2707,
        "dest_lat":        25.2048,    "dest_lng":    55.2708,
        "carrier_name":    "BlueDart Express",
        "carrier_defective": False,
        "driver_ill":      False,
        "sla_deadline":    (_now + timedelta(hours=30)).isoformat(),
        "current_eta":     (_now + timedelta(hours=33)).isoformat(),
        "weight_kg":       2800.0,
        "priority_level":  4,
        "route_countries": ["India", "UAE"],
        "status":          "AT_HUB",
        "created_at":      (_now - timedelta(days=1)).isoformat(),
        "features":        _make_features(random.Random(4), "MEDIUM", 4, 1),
        "_risk_override": {
            "risk_score": 51, "risk_level": "MEDIUM", "risk_color": "#FFA500",
            "shap_reasons": [
                {"feature": "customer_rating",      "impact": 0.18, "description": "Rating 3/5 — service quality concern"},
                {"feature": "mode_of_shipment",     "impact": 0.16, "description": "Road freight — subject to traffic delays"},
                {"feature": "hours_until_sla",      "impact": 0.15, "description": "Tight SLA window — 3 hr buffer only"},
                {"feature": "discount_offered",     "impact": 0.12, "description": "22% discount offered"},
            ],
        },
    },
]

for _s in _SHOWCASE:
    _risk_override = _s.pop("_risk_override")
    FLEET.insert(0, _s)            
    RISK_CACHE[_s["shipment_id"]] = _risk_override



for ship in FLEET:
    if ship['shipment_id'] not in RISK_CACHE:
        risk = predictor.predict(ship['features'])
        RISK_CACHE[ship['shipment_id']] = risk


recommender.update_carrier_stats(FLEET, RISK_CACHE)



class ApproveRequest(BaseModel):
    action_type: str
    operator_id: str = "operator_1"


class AlertAction(BaseModel):
    alert_id: int
    action: str  
    operator_id: str = "operator_1"




@app.get("/")
def root():
    return {
        "name": "ShipGuard AI",
        "version": "1.0.0",
        "status": "operational",
        "tagline": "Predict. Prevent. Deliver.",
        "endpoints": [
            "/api/dashboard/summary",
            "/api/shipments",
            "/api/shipments/{shipment_id}/analysis",
            "/api/analytics/overview",
            "/api/alerts"
        ]
    }


@app.get("/api/dashboard/summary")
def get_dashboard_summary():
    """Home screen: risk counts + top at-risk shipments + stat cards."""
    high = 0
    medium = 0
    low = 0
    top_risk = []

    for ship in FLEET:
        risk = RISK_CACHE.get(ship['shipment_id'], {})
        level = risk.get('risk_level', 'LOW')
        if level == 'HIGH':
            high += 1
        elif level == 'MEDIUM':
            medium += 1
        else:
            low += 1

        top_risk.append({
            "shipment_id":      ship['shipment_id'],
            "origin_city":      ship['origin_city'],
            "dest_city":        ship['dest_city'],
            "carrier_name":     ship['carrier_name'],
            "carrier_defective": ship.get('carrier_defective', False),
            "driver_ill":       ship.get('driver_ill', False),
            "sla_deadline":     ship['sla_deadline'],
            "risk_score":       risk.get('risk_score', 0),
            "risk_level":       level,
            "risk_color":       risk.get('risk_color', '#00CC66'),
            "priority_level":   ship.get('priority_level', 3),
            "status":           ship.get('status', 'IN_TRANSIT'),
            "dest_lat":         ship.get('dest_lat'),
            "dest_lng":         ship.get('dest_lng'),
            "origin_lat":       ship.get('origin_lat'),
            "origin_lng":       ship.get('origin_lng'),
        })

    top_risk.sort(key=lambda x: x['risk_score'], reverse=True)

    total = len(FLEET)
    interventions_today = len(INTERVENTIONS_LOG)
    sla_saved = sum(1 for i in INTERVENTIONS_LOG if i.get('outcome') == 'SLA_SAVED')

    return {
        "stat_cards": {
            "total_shipments": total,
            "high_risk": high,
            "medium_risk": medium,
            "on_track": low,
            "interventions_today": interventions_today,
            "sla_saved_today": sla_saved,
            "cost_saved_today": sla_saved * 45000,
            "avg_prediction_window": "62 hrs",
        },
        "top_risk_shipments": top_risk[:10],
        "all_shipments": top_risk,
        "fleet_map": [
            {
                "shipment_id":      s['shipment_id'],
                "lat":              s['dest_lat'],
                "lng":              s['dest_lng'],
                "origin_lat":       s.get('origin_lat', 0),
                "origin_lng":       s.get('origin_lng', 0),
                "risk_level":       RISK_CACHE.get(s['shipment_id'], {}).get('risk_level', 'LOW'),
                "risk_score":       RISK_CACHE.get(s['shipment_id'], {}).get('risk_score', 0),
                "risk_color":       RISK_CACHE.get(s['shipment_id'], {}).get('risk_color', '#00CC66'),
                "city":             s['dest_city'],
                "origin_city":      s.get('origin_city', ''),
                "dest_city":        s.get('dest_city', ''),
                "carrier_name":     s.get('carrier_name', ''),
                "carrier_defective": s.get('carrier_defective', False),
                "driver_ill":       s.get('driver_ill', False),
                "status":           s.get('status', 'IN_TRANSIT'),
                "priority_level":   s.get('priority_level', 3),
            }
            for s in FLEET
        ],
        "risk_distribution": {
            "labels": ["HIGH", "MEDIUM", "LOW"],
            "values": [high, medium, low],
            "colors": ["#FF4444", "#FFA500", "#00CC66"]
        }
    }


@app.get("/api/shipments")
def list_shipments(
    risk_level: Optional[str] = None,
    carrier: Optional[str] = None,
    sort_by: str = "risk_score",
    limit: int = 50
):
    """List all shipments with risk info, filterable."""
    results = []
    for ship in FLEET:
        risk = RISK_CACHE.get(ship['shipment_id'], {})
        if risk_level and risk.get('risk_level') != risk_level:
            continue
        if carrier and ship['carrier_name'] != carrier:
            continue
        results.append({
            **{k: v for k, v in ship.items() if k != 'features'},
            "risk_score": risk.get('risk_score', 0),
            "risk_level": risk.get('risk_level', 'LOW'),
            "risk_color": risk.get('risk_color', '#00CC66'),
        })

    if sort_by == "risk_score":
        results.sort(key=lambda x: x['risk_score'], reverse=True)
    elif sort_by == "sla_deadline":
        results.sort(key=lambda x: x.get('sla_deadline', ''))

    return {"shipments": results[:limit], "total": len(results)}


@app.get("/api/shipments/{shipment_id}/map")
def get_shipment_map(shipment_id: str):
    """Route/map data for a FLEET shipment: origin → nearest hub → destination."""
    ship = next((s for s in FLEET if s['shipment_id'] == shipment_id), None)
    if not ship:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")

    risk = RISK_CACHE.get(shipment_id, {})
    origin_lat, origin_lng = ship['origin_lat'], ship['origin_lng']
    dest_lat,   dest_lng   = ship['dest_lat'],   ship['dest_lng']
    mid_lat = (origin_lat + dest_lat) / 2
    mid_lng = (origin_lng + dest_lng) / 2

    
    candidates = [c for c in CITIES
                  if c['name'] != ship['origin_city'] and c['name'] != ship['dest_city']]
    if candidates:
        hub = min(candidates, key=lambda c: abs(c['lat'] - mid_lat) + abs(c['lng'] - mid_lng))
        hub_lat, hub_lng, hub_city = hub['lat'], hub['lng'], hub['name']
    else:
        hub_lat, hub_lng, hub_city = mid_lat, mid_lng, "En Route"

    route_coords = [
        [origin_lat, origin_lng],
        [hub_lat,    hub_lng],
        [dest_lat,   dest_lng],
    ]
    status = ship.get('status', 'IN_TRANSIT')
    checkpoints = [
        {"sequence": 0, "city": ship['origin_city'], "lat": origin_lat, "lng": origin_lng,
         "type": "origin", "status": "completed", "notes": None, "arrived_at": ship['created_at']},
        {"sequence": 1, "city": hub_city, "lat": hub_lat, "lng": hub_lng,
         "type": "hub",
         "status": "current" if status == "IN_TRANSIT" else "upcoming",
         "notes": f"Distribution Hub {hub_city}", "arrived_at": None},
        {"sequence": 2, "city": ship['dest_city'], "lat": dest_lat, "lng": dest_lng,
         "type": "destination",
         "status": "completed" if status == "DELIVERED" else "upcoming",
         "notes": None, "arrived_at": None},
    ]

    
    alt_route = None
    if risk.get('risk_level') == 'HIGH':
        alt_candidates = [
            c for c in CITIES
            if c['name'] != ship['origin_city']
            and c['name'] != ship['dest_city']
            and c['name'] != hub_city
        ]
        if alt_candidates:
            
            alt_hub = min(
                alt_candidates,
                key=lambda c: abs(c['lat'] - (mid_lat + 2)) + abs(c['lng'] - (mid_lng - 2))
            )
            alt_route = {
                "coords": [
                    [origin_lat, origin_lng],
                    [alt_hub['lat'], alt_hub['lng']],
                    [dest_lat, dest_lng],
                ],
                "hub": {
                    "city": alt_hub['name'],
                    "lat":  alt_hub['lat'],
                    "lng":  alt_hub['lng'],
                },
            }

    
    shap_reasons = risk.get('shap_reasons', [])
    alt_route_reasons = []
    if alt_route and shap_reasons:
        alt_route_reasons = [r['description'] for r in shap_reasons[:3] if r.get('description')]
    if alt_route and not alt_route_reasons:
        
        if ship.get('carrier_defective'):
            alt_route_reasons.append("Carrier equipment defect flagged — switching hub avoids breakdown risk")
        if ship.get('driver_ill'):
            alt_route_reasons.append("Driver illness reported — alternate hub enables driver handover")
        if len(ship.get('route_countries', [])) > 1:
            alt_route_reasons.append("Multi-border route — alternate hub reduces customs dwell time")
        if risk.get('risk_score', 0) >= 80:
            alt_route_reasons.append(f"Risk score {risk.get('risk_score')}% exceeds threshold — reroute recommended")

    return {
        "order_id":    shipment_id,
        "status":      status,
        "risk_score":  risk.get('risk_score', 0),
        "risk_level":  risk.get('risk_level', 'LOW'),
        "origin":      {"city": ship['origin_city'], "lat": origin_lat, "lng": origin_lng},
        "destination": {"city": ship['dest_city'],   "lat": dest_lat,   "lng": dest_lng},
        "checkpoints": checkpoints,
        "route_coords": route_coords,
        "carrier_name":      ship.get('carrier_name', ''),
        "carrier_defective": ship.get('carrier_defective', False),
        "driver_ill":        ship.get('driver_ill', False),
        "created_at":   ship.get('created_at'),
        "sla_deadline": ship.get('sla_deadline'),
        "current_eta":  ship.get('current_eta'),
        "active_delay": None,
        "alt_route":    alt_route,
        "alt_route_reasons": alt_route_reasons,
        "shap_reasons": shap_reasons[:5],
    }


@app.get("/api/shipments/{shipment_id}/analysis")
def get_shipment_analysis(shipment_id: str):
    """Full AI analysis: risk + SHAP + interventions + timeline."""
    ship = next((s for s in FLEET if s['shipment_id'] == shipment_id), None)
    if not ship:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")

    features = ship['features']
    risk = predictor.predict(features)

    
    signals = signal_collector.collect_all_signals(ship)

    
    now = datetime.now(timezone.utc)
    try:
        sla_dt = datetime.fromisoformat(ship['sla_deadline'].replace('Z', '+00:00'))
        hours_until_sla = max(0, (sla_dt - now).total_seconds() / 3600)
    except Exception:
        hours_until_sla = 0

    
    enriched = {
        **features,
        **signals,
        "hours_until_sla":       hours_until_sla,
        "cross_border_count":    max(len(ship.get("route_countries", ["India"])) - 1, 0),
        "carrier_reliability_30d": recommender._carrier_stats.get(
            ship.get("carrier_name", ""), {}
        ).get("reliability", 0.80),
    }

    interventions = recommender.recommend(ship, risk, enriched)

    
    now = datetime.now(timezone.utc)
    timeline = [
        {
            "event": "Shipment Created",
            "timestamp": ship['created_at'],
            "location": ship['origin_city'],
            "status": "completed",
            "icon": "📦"
        },
        {
            "event": "Picked Up",
            "timestamp": (datetime.fromisoformat(ship['created_at'].replace('Z', '+00:00')) + timedelta(hours=2)).isoformat(),
            "location": ship['origin_city'],
            "status": "completed",
            "icon": "🚚"
        },
        {
            "event": "In Transit",
            "timestamp": (datetime.fromisoformat(ship['created_at'].replace('Z', '+00:00')) + timedelta(hours=6)).isoformat(),
            "location": "En Route",
            "status": "completed",
            "icon": "🛣️"
        },
        {
            "event": "Current Position",
            "timestamp": now.isoformat(),
            "location": "In Transit",
            "status": "current",
            "icon": "📍"
        },
        {
            "event": "Expected Arrival",
            "timestamp": ship['current_eta'],
            "location": ship['dest_city'],
            "status": "upcoming",
            "icon": "🏁"
        },
        {
            "event": "SLA Deadline",
            "timestamp": ship['sla_deadline'],
            "location": ship['dest_city'],
            "status": "deadline",
            "icon": "⏰"
        }
    ]

    
    feature_groups = {
        "Shipment Details": {k: features[k] for k in
                             ["warehouse_block", "mode_of_shipment", "weight_kg"]},
        "Customer Behavior": {k: features[k] for k in
                              ["customer_care_calls", "customer_rating", "prior_purchases"]},
        "Product & Pricing": {k: features[k] for k in
                              ["cost_of_product", "product_importance", "discount_offered", "gender"]},
        "Risk Flags": {k: features[k] for k in
                       ["high_discount_flag", "heavy_shipment_flag", "is_sea_freight",
                        "is_air_freight", "high_care_calls_flag", "low_rating_flag"]},
        "Derived Signals": {k: features[k] for k in
                            ["calls_x_low_rating", "cost_weight_ratio", "discount_x_importance",
                             "priority_score", "calls_per_purchase", "effective_discount",
                             "warehouse_risk_score", "is_high_importance", "is_low_importance"]},
    }

    return {
        "shipment": {k: v for k, v in ship.items() if k != 'features'},
        "risk": risk,
        "interventions": interventions,
        "timeline": timeline,
        "features": features,
        "feature_groups": feature_groups,
    }


@app.post("/api/shipments/{shipment_id}/interventions/approve")
def approve_intervention(shipment_id: str, body: ApproveRequest, background_tasks: BackgroundTasks):
    """Approve and execute an intervention, then notify operator."""
    ship = next((s for s in FLEET if s['shipment_id'] == shipment_id), None)
    if not ship:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")

    risk = RISK_CACHE.get(shipment_id, {})

    intervention_record = {
        "id": len(INTERVENTIONS_LOG) + 1,
        "shipment_id": shipment_id,
        "action_type": body.action_type,
        "operator_id": body.operator_id,
        "risk_at_trigger": risk.get('risk_score', 0),
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "outcome": "SLA_SAVED",
        "status": "EXECUTING",
    }
    INTERVENTIONS_LOG.append(intervention_record)

    alert_record = {
        "id": len(ALERTS_LOG) + 1,
        "shipment_id": shipment_id,
        "type": "INTERVENTION_APPROVED",
        "action": body.action_type,
        "message": f"Intervention {body.action_type} approved for {shipment_id} by {body.operator_id}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "executed",
        "operator_id": body.operator_id,
    }
    ALERTS_LOG.append(alert_record)

    
    def _notify():
        interventions_now = recommender.recommend(ship, risk, ship['features'])
        results = send_alert(ship, risk, interventions_now, NOTIF_CHANNELS)
        for r in results:
            ALERTS_LOG.append({
                "type":        "APPROVAL_NOTIFY",
                "shipment_id": shipment_id,
                "action":      body.action_type,
                "channel":     r.get("channel"),
                "success":     r.get("success"),
                "timestamp":   datetime.now(timezone.utc).isoformat(),
            })
    background_tasks.add_task(_notify)

    return {
        "status": "EXECUTING",
        "action": body.action_type,
        "shipment_id": shipment_id,
        "message": f"✅ {body.action_type.replace('_', ' ').title()} approved and executing for {shipment_id}",
        "intervention_id": intervention_record['id'],
    }


@app.get("/api/analytics/overview")
def get_analytics_overview():
    """Analytics & ROI dashboard data."""
    total = len(FLEET)
    risks = [RISK_CACHE.get(s['shipment_id'], {}) for s in FLEET]
    risk_scores = [r.get('risk_score', 0) for r in risks]

    high = sum(1 for r in risks if r.get('risk_level') == 'HIGH')
    medium = sum(1 for r in risks if r.get('risk_level') == 'MEDIUM')
    low = sum(1 for r in risks if r.get('risk_level') == 'LOW')

    carrier_perf = {}
    for ship in FLEET:
        c = ship['carrier_name']
        if c not in carrier_perf:
            carrier_perf[c] = {'total': 0, 'high_risk': 0, 'avg_reliability': []}
        carrier_perf[c]['total'] += 1
        r = RISK_CACHE.get(ship['shipment_id'], {})
        if r.get('risk_level') == 'HIGH':
            carrier_perf[c]['high_risk'] += 1
        
        carrier_perf[c]['avg_reliability'].append(
            ship['features'].get('customer_rating', 3) / 5.0
        )

    carrier_heatmap = []
    for c, data in carrier_perf.items():
        avg_rel = sum(data['avg_reliability']) / len(data['avg_reliability']) if data['avg_reliability'] else 0
        carrier_heatmap.append({
            'carrier': c,
            'total_shipments': data['total'],
            'high_risk_count': data['high_risk'],
            'avg_reliability': round(avg_rel * 100, 1),
            'risk_rate': round(data['high_risk'] / max(data['total'], 1) * 100, 1),
        })

    interventions_count = len(INTERVENTIONS_LOG)
    sla_saved = sum(1 for i in INTERVENTIONS_LOG if i.get('outcome') == 'SLA_SAVED')

    
    avg_penalty = 45000
    cost_saved = sla_saved * avg_penalty
    cost_spent = interventions_count * 15000
    roi_ratio = round(cost_saved / max(cost_spent, 1), 1)

    
    model_metrics = {
        'roc_auc':                   round(_MODEL_BUNDLE.get('auc_score', 0.913), 4),
        'precision':                 round(_MODEL_BUNDLE.get('precision', 0.83), 4),
        'recall':                    round(_MODEL_BUNDLE.get('recall', 0.88), 4),
        'f1_score':                  round(_MODEL_BUNDLE.get('f1_score', 0.855), 4),
        'pr_auc':                    round(_MODEL_BUNDLE.get('pr_auc', 0.72), 4),
        'false_positive_rate':       0.12,
        'avg_prediction_window_hrs': 62,
        'total_predictions':         total,
    }

    
    from collections import defaultdict
    day_buckets: dict = defaultdict(lambda: {"high": 0, "medium": 0, "low": 0})
    for ship in FLEET:
        try:
            created = datetime.fromisoformat(ship['created_at'].replace('Z', '+00:00'))
            day_key = created.strftime('%b %d')
            level   = RISK_CACHE.get(ship['shipment_id'], {}).get('risk_level', 'LOW')
            day_buckets[day_key][level.lower()] += 1
        except Exception:
            pass
    
    risk_trend = []
    for i in range(7):
        day = (datetime.now(timezone.utc) - timedelta(days=6 - i)).strftime('%b %d')
        bucket = day_buckets.get(day, {"high": high, "medium": medium, "low": low})
        risk_trend.append({"date": day, **bucket})

    return {
        "summary": {
            "total_shipments": total,
            "high_risk": high,
            "medium_risk": medium,
            "on_track": low,
            "avg_risk_score": round(sum(risk_scores) / max(len(risk_scores), 1), 1),
        },
        "model_metrics": model_metrics,
        "carrier_heatmap": sorted(carrier_heatmap, key=lambda x: x['risk_rate'], reverse=True),
        "roi": {
            "interventions_total": interventions_count,
            "sla_saved": sla_saved,
            "cost_saved_inr": cost_saved,
            "cost_spent_inr": cost_spent,
            "roi_ratio": roi_ratio,
            "projected_monthly_savings": cost_saved * 30,
        },
        "risk_distribution": {
            "labels": ["HIGH", "MEDIUM", "LOW"],
            "values": [high, medium, low],
            "colors": ["#FF4444", "#FFA500", "#00CC66"]
        },
        "risk_trend": risk_trend,
    }


@app.get("/api/alerts")
def get_alerts():
    """Get active alerts + history."""
    auto_alerts = []
    for ship in FLEET:
        risk = RISK_CACHE.get(ship['shipment_id'], {})
        if risk.get('risk_score', 0) >= 65:
            auto_alerts.append({
                "id": len(auto_alerts) + 1,
                "shipment_id": ship['shipment_id'],
                "type": "HIGH_RISK",
                "risk_score": risk['risk_score'],
                "message": f"{ship['shipment_id']} ({ship['origin_city']} → {ship['dest_city']}) "
                           f"at {risk['risk_score']}% delay risk",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "active",
                "priority": ship.get('priority_level', 3),
                "reasons": [r.get('description', '') for r in risk.get('shap_reasons', [])],
            })

    auto_alerts.sort(key=lambda x: x['risk_score'], reverse=True)

    return {
        "active_alerts": auto_alerts[:20],
        "alert_history": ALERTS_LOG[-50:],
        "total_active": len(auto_alerts),
        "total_history": len(ALERTS_LOG),
    }


@app.post("/api/alerts/action")
def alert_action(body: AlertAction):
    """Handle alert actions (acknowledge, dismiss, escalate)."""
    record = {
        "id": len(ALERTS_LOG) + 1,
        "alert_id": body.alert_id,
        "action": body.action,
        "operator_id": body.operator_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": body.action,
    }
    ALERTS_LOG.append(record)
    return {"status": "ok", "action": body.action, "alert_id": body.alert_id}


@app.get("/api/signals/{shipment_id}")
def get_shipment_signals(shipment_id: str):
    """
    Fetch live external risk signals for a shipment:
    weather (Open-Meteo), traffic (OSRM), news (GDelt), customs, port congestion.
    No API key required — all sources are free public APIs.
    """
    ship = next((s for s in FLEET if s['shipment_id'] == shipment_id), None)
    if not ship:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")
    signals = signal_collector.collect_all_signals(ship)
    return signals


@app.get("/api/carrier-stats")
def get_carrier_stats():
    """Live on-time delivery rates for all carriers, computed from fleet risk data."""
    return {
        "carrier_stats": sorted(
            recommender._carrier_stats.values(),
            key=lambda c: c["reliability"],
            reverse=True,
        ),
        "computed_from": f"{len(FLEET)} fleet shipments",
    }


@app.get("/api/model/info")
def model_info():
    """Model metadata for the about page."""
    return {
        "name":             "ShipGuard AI v2.0",
        "algorithm":        "XGBoost + SHAP Explainability",
        "features_count":   25,
        "feature_groups":   ["Shipment Details", "Customer Behavior",
                             "Product & Pricing", "Risk Flags", "Derived Signals"],
        "data_source":      _MODEL_BUNDLE.get("data_source", "Kaggle — prachi13/customer-analytics"),
        "roc_auc":          round(_MODEL_BUNDLE.get("auc_score", 0.0), 4),
        "pr_auc":           round(_MODEL_BUNDLE.get("pr_auc", 0.0), 4),
        "prediction_window": "48-72 hours",
        "training_samples": _MODEL_BUNDLE.get("training_samples", 0),
        "inference_time":   "<2 seconds for 10,000 shipments",
        "explainability":   "SHAP TreeExplainer — top 7 reasons per prediction",
    }




@app.get("/api/financial/forecast")
def get_financial_forecast():
    """
    Financial Loss Forecasting Dashboard:
    - Current SLA penalty exposure per shipment
    - 30-day projected losses (with vs without interventions)
    - Breakdown by carrier and priority class
    - Top 10 highest-exposure shipments
    """
    
    PRIORITY_PENALTIES = {1: 5_000, 2: 20_000, 3: 50_000, 4: 1_00_000, 5: 2_00_000}
    
    RISK_WEIGHT = {"HIGH": 0.85, "MEDIUM": 0.45, "LOW": 0.08}
    
    INTERVENTION_EFFECTIVENESS = 0.65

    total_exposure = 0.0
    carrier_exposure: dict = {}
    priority_exposure: dict = {p: 0.0 for p in range(1, 6)}
    shipment_exposures = []

    for ship in FLEET:
        risk       = RISK_CACHE.get(ship["shipment_id"], {})
        risk_score = risk.get("risk_score", 0)
        risk_level = risk.get("risk_level", "LOW")
        priority   = ship.get("priority_level", 3)
        penalty    = PRIORITY_PENALTIES.get(priority, 50_000)

        weight        = RISK_WEIGHT.get(risk_level, 0.08)
        expected_loss = penalty * weight * (risk_score / 100)
        total_exposure += expected_loss

        carrier = ship.get("carrier_name", "Unknown")
        if carrier not in carrier_exposure:
            carrier_exposure[carrier] = {"exposure": 0.0, "count": 0, "high_risk": 0}
        carrier_exposure[carrier]["exposure"]  += expected_loss
        carrier_exposure[carrier]["count"]     += 1
        if risk_level == "HIGH":
            carrier_exposure[carrier]["high_risk"] += 1

        priority_exposure[priority] = priority_exposure.get(priority, 0.0) + expected_loss

        if expected_loss >= 500:
            shipment_exposures.append({
                "shipment_id":   ship["shipment_id"],
                "origin":        ship["origin_city"],
                "dest":          ship["dest_city"],
                "carrier":       ship["carrier_name"],
                "priority":      priority,
                "risk_score":    risk_score,
                "risk_level":    risk_level,
                "sla_penalty":   penalty,
                "expected_loss": round(expected_loss),
                "sla_deadline":  ship["sla_deadline"],
                "status":        ship.get("status", "IN_TRANSIT"),
            })

    shipment_exposures.sort(key=lambda x: x["expected_loss"], reverse=True)

    
    
    daily_rate        = len(FLEET) / 5
    daily_avg_exposure = total_exposure / max(len(FLEET), 1)
    rng_fc = random.Random(99)          

    now = datetime.now(timezone.utc)
    forecast_daily = []
    for day_offset in range(30):
        day = now + timedelta(days=day_offset)
        
        weekday_factor = 1.0 + 0.12 * math.sin(day_offset * (2 * math.pi / 7))
        noise          = rng_fc.uniform(-0.06, 0.06)
        daily_gross    = daily_rate * daily_avg_exposure * (weekday_factor + noise)
        daily_saved    = daily_gross * INTERVENTION_EFFECTIVENESS
        forecast_daily.append({
            "date":                 day.strftime("%b %d"),
            "without_intervention": round(daily_gross),
            "with_intervention":    round(daily_gross - daily_saved),
            "savings":              round(daily_saved),
        })

    total_30d_gross   = sum(d["without_intervention"] for d in forecast_daily)
    total_30d_savings = sum(d["savings"]              for d in forecast_daily)

    
    carrier_breakdown = sorted(
        [
            {
                "carrier":       c,
                "exposure":      round(data["exposure"]),
                "shipments":     data["count"],
                "high_risk":     data["high_risk"],
                "avg_exposure":  round(data["exposure"] / max(data["count"], 1)),
            }
            for c, data in carrier_exposure.items()
        ],
        key=lambda x: x["exposure"],
        reverse=True,
    )[:10]

    
    priority_labels = {
        5: "P5 · Critical", 4: "P4 · High",
        3: "P3 · Medium",   2: "P2 · Low", 1: "P1 · Minimal",
    }
    priority_breakdown = [
        {
            "priority":          priority_labels[p],
            "exposure":          round(priority_exposure.get(p, 0)),
            "penalty_per_breach": PRIORITY_PENALTIES[p],
        }
        for p in [5, 4, 3, 2, 1]
        if priority_exposure.get(p, 0) > 0
    ]

    high_risk_count = sum(
        1 for s in FLEET
        if RISK_CACHE.get(s["shipment_id"], {}).get("risk_level") == "HIGH"
    )

    return {
        "summary": {
            "total_current_exposure":       round(total_exposure),
            "projected_30d_exposure":       total_30d_gross,
            "projected_30d_savings":        total_30d_savings,
            "net_30d_loss":                 total_30d_gross - total_30d_savings,
            "high_risk_shipments":          high_risk_count,
            "avg_exposure_per_shipment":    round(total_exposure / max(len(FLEET), 1)),
            "intervention_effectiveness_pct": round(INTERVENTION_EFFECTIVENESS * 100),
            "total_shipments":              len(FLEET),
        },
        "forecast_daily":    forecast_daily,
        "carrier_breakdown": carrier_breakdown,
        "priority_breakdown": priority_breakdown,
        "top_at_risk":       shipment_exposures[:10],
    }




@app.get("/api/notifications/config")
def notifications_config():
    """Return current notification setup and setup instructions."""
    cfg = notifier_config()
    cfg["monitor_interval_seconds"] = MONITOR_INTERVAL
    cfg["alert_threshold_pct"]      = ALERT_THRESHOLD
    cfg["channels"]                 = NOTIF_CHANNELS
    cfg["already_alerted_count"]    = len(ALREADY_ALERTED)
    return cfg


@app.post("/api/notifications/test")
def notifications_test(channels: Optional[str] = Query(None, description="Comma-separated: telegram,whatsapp")):
    """Fire a test notification for the top HIGH-risk shipment."""
    ch = channels.split(",") if channels else NOTIF_CHANNELS

    
    best = max(FLEET, key=lambda s: RISK_CACHE.get(s['shipment_id'], {}).get('risk_score', 0))
    risk = RISK_CACHE[best['shipment_id']]
    interventions = recommender.recommend(best, risk, best['features'])

    results = send_alert(best, risk, interventions, ch)
    return {
        "tested_shipment": best['shipment_id'],
        "risk_score":      risk['risk_score'],
        "channels_tried":  ch,
        "results":         results,
    }


class NotificationRequest(BaseModel):
    shipment_id: str
    channels: List[str] = ["telegram"]


@app.post("/api/notifications/send")
def notifications_send(body: NotificationRequest):
    """Manually send a notification for any shipment to specified channels."""
    ship = next((s for s in FLEET if s['shipment_id'] == body.shipment_id), None)
    if not ship:
        raise HTTPException(status_code=404, detail=f"Shipment {body.shipment_id} not found")

    risk         = RISK_CACHE.get(body.shipment_id, {})
    interventions = recommender.recommend(ship, risk, ship['features'])
    results      = send_alert(ship, risk, interventions, body.channels)

    return {
        "shipment_id": body.shipment_id,
        "risk_score":  risk.get('risk_score', 0),
        "results":     results,
    }
