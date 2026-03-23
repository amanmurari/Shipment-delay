import random
import string
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session


try:
    from models.predictor import ShipGuardPredictor as _ShipGuardPredictor
    from data.kaggle_loader import compute_features as _compute_features
    _predictor = _ShipGuardPredictor()
except Exception:
    _predictor = None
    _compute_features = None

from ..database import get_db
from ..db_models import User, Order, TrackingCheckpoint, DelayEvent
from ..schemas import OrderCreate, OrderOut, OrderMapData
from ..auth_utils import get_current_user

router = APIRouter(prefix="/orders", tags=["orders"])

HUB_CITIES = [
    {"city": "Mumbai",     "lat": 19.0760, "lng": 72.8777},
    {"city": "Delhi",      "lat": 28.6139, "lng": 77.2090},
    {"city": "Bangalore",  "lat": 12.9716, "lng": 77.5946},
    {"city": "Chennai",    "lat": 13.0827, "lng": 80.2707},
    {"city": "Kolkata",    "lat": 22.5726, "lng": 88.3639},
    {"city": "Hyderabad",  "lat": 17.3850, "lng": 78.4867},
    {"city": "Pune",       "lat": 18.5204, "lng": 73.8567},
    {"city": "Ahmedabad",  "lat": 23.0225, "lng": 72.5714},
    {"city": "Jaipur",     "lat": 26.9124, "lng": 75.7873},
    {"city": "Surat",      "lat": 21.1702, "lng": 72.8311},
    {"city": "Lucknow",    "lat": 26.8467, "lng": 80.9462},
    {"city": "Chandigarh", "lat": 30.7333, "lng": 76.7794},
]

REASON_ICONS = {
    "TSUNAMI":         "TSUNAMI",
    "CYCLONE":         "CYCLONE",
    "FLOOD":           "FLOOD",
    "STORM":           "STORM",
    "EARTHQUAKE":      "EARTHQUAKE",
    "STRIKE":          "STRIKE",
    "CUSTOMS_HOLD":    "CUSTOMS",
    "POLITICAL_UNREST":"UNREST",
    "ACCIDENT":        "ACCIDENT",
    "PORT_CONGESTION": "PORT",
    "WEATHER":         "WEATHER",
}


def _make_order_id():
    return "ORD-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


def _pick_hubs(origin_lat, origin_lng, dest_lat, dest_lng, count=2):
    mid_lat = (origin_lat + dest_lat) / 2
    mid_lng = (origin_lng + dest_lng) / 2
    scored = sorted(HUB_CITIES, key=lambda h: abs(h["lat"] - mid_lat) + abs(h["lng"] - mid_lng))
    return scored[:count]


def _build_checkpoints(db, order):
    hubs = _pick_hubs(order.origin_lat, order.origin_lng, order.dest_lat, order.dest_lng)
    checkpoints = [TrackingCheckpoint(
        order_id=order.id, sequence=0,
        city=order.origin_city, lat=order.origin_lat, lng=order.origin_lng,
        checkpoint_type="origin", status="completed", arrived_at=order.created_at,
    )]
    for i, hub in enumerate(hubs, start=1):
        status = "upcoming"
        if order.status in ("IN_TRANSIT", "AT_HUB", "DELIVERED") and i == 1:
            status = "completed"
        if order.status == "AT_HUB" and i == 1:
            status = "current"
        checkpoints.append(TrackingCheckpoint(
            order_id=order.id, sequence=i,
            city=hub["city"], lat=hub["lat"], lng=hub["lng"],
            checkpoint_type="hub", status=status,
            notes="Distribution Hub " + hub["city"],
        ))
    checkpoints.append(TrackingCheckpoint(
        order_id=order.id, sequence=len(hubs) + 1,
        city=order.dest_city, lat=order.dest_lat, lng=order.dest_lng,
        checkpoint_type="destination",
        status="completed" if order.status == "DELIVERED" else "upcoming",
    ))
    db.add_all(checkpoints)
    db.commit()


def _build_alt_route(order, delay_evt, checkpoints):
    """Compute a bypass route using a hub not already in the shipment's path."""
    if not delay_evt:
        return None
    used = {cp.city for cp in checkpoints}
    used.add(delay_evt.stuck_city)
    mid_lat = (order.origin_lat + order.dest_lat) / 2
    mid_lng = (order.origin_lng + order.dest_lng) / 2
    candidates = [h for h in HUB_CITIES if h["city"] not in used]
    if not candidates:
        return None
    alt = min(candidates, key=lambda h: abs(h["lat"] - mid_lat) + abs(h["lng"] - mid_lng))
    return {
        "coords": [
            [order.origin_lat, order.origin_lng],
            [alt["lat"], alt["lng"]],
            [order.dest_lat, order.dest_lng],
        ],
        "hub": alt,
    }


def _build_delay_dict(delay_evt):
    now = datetime.now(timezone.utc)
    crisis_end = delay_evt.estimated_end
    if crisis_end.tzinfo is None:
        crisis_end = crisis_end.replace(tzinfo=timezone.utc)
    seconds_remaining = max(0, int((crisis_end - now).total_seconds()))
    new_eta = crisis_end + timedelta(hours=delay_evt.additional_delay_hours)
    return {
        "id":                    delay_evt.id,
        "reason_type":           delay_evt.reason_type,
        "reason_icon":           REASON_ICONS.get(delay_evt.reason_type, "WARNING"),
        "reason_title":          delay_evt.reason_title,
        "description":           delay_evt.description,
        "stuck_city":            delay_evt.stuck_city,
        "stuck_lat":             delay_evt.stuck_lat,
        "stuck_lng":             delay_evt.stuck_lng,
        "severity":              delay_evt.severity,
        "started_at":            delay_evt.started_at.isoformat(),
        "estimated_end":         crisis_end.isoformat(),
        "seconds_remaining":     seconds_remaining,
        "additional_delay_hours":delay_evt.additional_delay_hours,
        "updated_eta":           new_eta.isoformat(),
        "last_updated":          delay_evt.last_updated.isoformat(),
        "is_active":             delay_evt.is_active,
    }


@router.post("", response_model=OrderOut, status_code=201)
def create_order(body: OrderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    
    if _predictor and _compute_features:
        
        mode = 2 if body.weight_kg > 4 else (1 if body.weight_kg > 2 else 0)  
        importance = 2 if body.priority_level >= 5 else (1 if body.priority_level >= 3 else 0)
        
        
        care_calls = min(1 + body.priority_level, 7)
        rating = max(5 - body.priority_level + 1, 1)
        
        discount = min(body.priority_level * 7 + (body.weight_kg / 10), 60.0)
        base = {
            "warehouse_block":     min(body.priority_level - 1, 4),
            "mode_of_shipment":    mode,
            "customer_care_calls": care_calls,
            "customer_rating":     rating,
            "cost_of_product":     200.0,
            "prior_purchases":     3,
            "product_importance":  importance,
            "discount_offered":    round(discount, 1),
            "weight_kg":           body.weight_kg,
            "gender":              0,
        }
        features = _compute_features(base)
        ml_result = _predictor.predict(features)
        risk_score = ml_result['risk_score']
        risk_level = ml_result['risk_level']
    else:
        rng = random.Random()
        risk_score = round(rng.uniform(10, 90), 1)
        risk_level = "HIGH" if risk_score >= 65 else ("MEDIUM" if risk_score >= 35 else "LOW")
    now = datetime.now(timezone.utc)
    order = Order(
        order_id=_make_order_id(), user_id=current_user.id,
        origin_city=body.origin_city, origin_lat=body.origin_lat, origin_lng=body.origin_lng,
        dest_city=body.dest_city,     dest_lat=body.dest_lat,     dest_lng=body.dest_lng,
        carrier_name=body.carrier_name, priority_level=body.priority_level, weight_kg=body.weight_kg,
        status="PENDING",
        sla_deadline=body.sla_deadline or (now + timedelta(days=5)),
        current_eta=now + timedelta(days=3),
        risk_score=risk_score, risk_level=risk_level,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    _build_checkpoints(db, order)
    db.refresh(order)
    return order


@router.get("/my", response_model=List[OrderOut])
def my_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Order).filter(Order.user_id == current_user.id).order_by(Order.created_at.desc()).all()


@router.get("/hubs")
def get_hubs(current_user: User = Depends(get_current_user)):
    """Return the list of hub cities used for routing."""
    return HUB_CITIES


@router.get("/by-route")
def search_by_route(
    origin: str = "",
    destination: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find orders matching an origin/destination city (partial, case-insensitive)."""
    query = db.query(Order)
    if current_user.role != "admin":
        query = query.filter(Order.user_id == current_user.id)
    if origin.strip():
        query = query.filter(Order.origin_city.ilike(f"%{origin.strip()}%"))
    if destination.strip():
        query = query.filter(Order.dest_city.ilike(f"%{destination.strip()}%"))
    orders = query.order_by(Order.created_at.desc()).limit(20).all()
    results = []
    for o in orders:
        delay_evt = (
            db.query(DelayEvent)
            .filter(DelayEvent.order_id == o.id, DelayEvent.is_active.is_(True))
            .first()
        )
        results.append({
            "order_id": o.order_id,
            "status": o.status,
            "risk_score": o.risk_score,
            "risk_level": o.risk_level,
            "origin_city": o.origin_city,
            "dest_city": o.dest_city,
            "carrier_name": o.carrier_name,
            "has_delay": delay_evt is not None,
            "delay_severity": delay_evt.severity if delay_evt else None,
        })
    return results


@router.get("/search/{order_id}", response_model=OrderMapData)
def get_order_map(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = db.query(Order).filter(Order.order_id == order_id.upper()).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found: " + order_id)
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    cp_list = []
    route_coords = [[order.origin_lat, order.origin_lng]]
    for cp in order.checkpoints:
        route_coords.append([cp.lat, cp.lng])
        cp_list.append({
            "sequence": cp.sequence, "city": cp.city,
            "lat": cp.lat, "lng": cp.lng,
            "type": cp.checkpoint_type, "status": cp.status,
            "notes": cp.notes,
            "arrived_at": cp.arrived_at.isoformat() if cp.arrived_at else None,
        })

    delay_evt = (
        db.query(DelayEvent)
        .filter(DelayEvent.order_id == order.id, DelayEvent.is_active.is_(True))
        .order_by(DelayEvent.started_at.desc())
        .first()
    )
    active_delay = _build_delay_dict(delay_evt) if delay_evt else None
    alt_route = _build_alt_route(order, delay_evt, order.checkpoints)

    return OrderMapData(
        order_id=order.order_id, status=order.status,
        risk_score=order.risk_score, risk_level=order.risk_level,
        origin={"city": order.origin_city, "lat": order.origin_lat, "lng": order.origin_lng},
        destination={"city": order.dest_city, "lat": order.dest_lat, "lng": order.dest_lng},
        checkpoints=cp_list, route_coords=route_coords,
        carrier_name=order.carrier_name,
        weight_kg=order.weight_kg,
        priority_level=order.priority_level,
        created_at=order.created_at,
        sla_deadline=order.sla_deadline, current_eta=order.current_eta,
        active_delay=active_delay, alt_route=alt_route,
    )


@router.get("/{order_id}/delay")
def get_delay_live(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Lightweight polling endpoint — fresh countdown every call."""
    order = db.query(Order).filter(Order.order_id == order_id.upper()).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    delay_evt = (
        db.query(DelayEvent)
        .filter(DelayEvent.order_id == order.id, DelayEvent.is_active.is_(True))
        .order_by(DelayEvent.started_at.desc())
        .first()
    )
    return {"active_delay": _build_delay_dict(delay_evt) if delay_evt else None}


@router.patch("/{order_id}/status")
def update_order_status(
    order_id: str, new_status: str,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.order_id == order_id.upper()).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    valid = {"PENDING", "IN_TRANSIT", "AT_HUB", "CUSTOMS_HOLD", "DELIVERED", "DELAYED"}
    if new_status.upper() not in valid:
        raise HTTPException(status_code=400, detail="Invalid status.")
    order.status = new_status.upper()
    db.commit()
    return {"order_id": order.order_id, "status": order.status}
