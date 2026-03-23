
import random
from datetime import datetime, timedelta, timezone

from .database import engine, SessionLocal
from .db_models import Base, User, Order, TrackingCheckpoint, DelayEvent
from .auth_utils import hash_password

DEMO_ORDERS = [
    {
        "order_id": "ORD-DEMO0001",
        "origin_city": "Mumbai",    "origin_lat": 19.0760, "origin_lng": 72.8777,
        "dest_city": "Delhi",       "dest_lat": 28.6139,   "dest_lng": 77.2090,
        "carrier": "BlueEx Cargo",  "status": "IN_TRANSIT", "risk_score": 72.4, "risk_level": "HIGH",
    },
    {
        "order_id": "ORD-DEMO0002",
        "origin_city": "Bangalore", "origin_lat": 12.9716, "origin_lng": 77.5946,
        "dest_city": "Chennai",     "dest_lat": 13.0827,   "dest_lng": 80.2707,
        "carrier": "SpeedShip",     "status": "DELIVERED",  "risk_score": 18.2, "risk_level": "LOW",
    },
    {
        "order_id": "ORD-DEMO0003",
        "origin_city": "Kolkata",   "origin_lat": 22.5726, "origin_lng": 88.3639,
        "dest_city": "Hyderabad",   "dest_lat": 17.3850,   "dest_lng": 78.4867,
        "carrier": "SafeMove",      "status": "DELAYED",    "risk_score": 78.9, "risk_level": "HIGH",
    },
    {
        "order_id": "ORD-DEMO0004",
        "origin_city": "Jaipur",    "origin_lat": 26.9124, "origin_lng": 75.7873,
        "dest_city": "Pune",        "dest_lat": 18.5204,   "dest_lng": 73.8567,
        "carrier": "QuickFreight",  "status": "DELAYED",    "risk_score": 83.1, "risk_level": "HIGH",
    },
    {
        "order_id": "ORD-DEMO0005",
        "origin_city": "Ahmedabad", "origin_lat": 23.0225, "origin_lng": 72.5714,
        "dest_city": "Lucknow",     "dest_lat": 26.8467,   "dest_lng": 80.9462,
        "carrier": "BlueEx Cargo",  "status": "AT_HUB",    "risk_score": 45.0, "risk_level": "MEDIUM",
    },
]

HUB_POOL = [
    {"city": "Surat",      "lat": 21.1702, "lng": 72.8311},
    {"city": "Nagpur",     "lat": 21.1458, "lng": 79.0882},
    {"city": "Bhopal",     "lat": 23.2599, "lng": 77.4126},
    {"city": "Indore",     "lat": 22.7196, "lng": 75.8577},
    {"city": "Chandigarh", "lat": 30.7333, "lng": 76.7794},
]



DEMO_DELAYS = {
    "ORD-DEMO0003": {
        "reason_type": "CYCLONE",
        "reason_title": "Severe Cyclone — Bay of Bengal",
        "description": (
            "Cyclone 'DANA' has made landfall near Visakhapatnam with wind speeds exceeding 150 km/h. "
            "All road and rail freight operations in Andhra Pradesh and parts of Odisha are suspended. "
            "NDRF teams are on standby. Port operations at Vizag halted indefinitely."
        ),
        "stuck_city": "Visakhapatnam",
        "stuck_lat": 17.6868,
        "stuck_lng": 83.2185,
        "severity": "CRITICAL",
        "delay_hours_from_now": -3,      
        "crisis_lasts_hours": 7,         
        "additional_delay_hours": 9,     
    },
    "ORD-DEMO0004": {
        "reason_type": "TSUNAMI",
        "reason_title": "Tsunami Warning — Gujarat Coast",
        "description": (
            "A 7.2-magnitude undersea earthquake off the Gujarat coast has triggered a tsunami warning. "
            "All cargo movement through Surat distribution hub is halted by authorities. "
            "Evacuation of coastal warehouses is underway. Expected to resume operations once the all-clear is issued."
        ),
        "stuck_city": "Surat",
        "stuck_lat": 21.1702,
        "stuck_lng": 72.8311,
        "severity": "CRITICAL",
        "delay_hours_from_now": -1,
        "crisis_lasts_hours": 6,
        "additional_delay_hours": 8,
    },
}


def _pick_hubs(origin_lat, origin_lng, dest_lat, dest_lng):
    mid_lat = (origin_lat + dest_lat) / 2
    mid_lng = (origin_lng + dest_lng) / 2
    scored = sorted(HUB_POOL, key=lambda h: abs(h["lat"] - mid_lat) + abs(h["lng"] - mid_lng))
    return scored[:2]


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return  

        admin = User(
            username="admin", email="admin@shipguard.ai",
            hashed_password=hash_password("admin123"), role="admin",
        )
        demo = User(
            username="user1", email="user1@example.com",
            hashed_password=hash_password("user123"), role="user",
        )
        db.add_all([admin, demo])
        db.commit()
        db.refresh(admin)
        db.refresh(demo)

        now = datetime.now(timezone.utc)
        rng = random.Random(42)

        for od in DEMO_ORDERS:
            order = Order(
                order_id=od["order_id"],
                user_id=demo.id,
                origin_city=od["origin_city"], origin_lat=od["origin_lat"], origin_lng=od["origin_lng"],
                dest_city=od["dest_city"],     dest_lat=od["dest_lat"],     dest_lng=od["dest_lng"],
                carrier_name=od["carrier"],
                status=od["status"],
                priority_level=rng.randint(1, 5),
                weight_kg=round(rng.uniform(50, 3000), 1),
                risk_score=od["risk_score"],
                risk_level=od["risk_level"],
                sla_deadline=now + timedelta(days=rng.randint(1, 5)),
                current_eta=now + timedelta(days=rng.randint(2, 4)),
                created_at=now - timedelta(days=rng.randint(1, 10)),
            )
            db.add(order)
            db.commit()
            db.refresh(order)

            
            hubs = _pick_hubs(order.origin_lat, order.origin_lng, order.dest_lat, order.dest_lng)
            cps = [TrackingCheckpoint(
                order_id=order.id, sequence=0,
                city=order.origin_city, lat=order.origin_lat, lng=order.origin_lng,
                checkpoint_type="origin", status="completed", arrived_at=order.created_at,
            )]
            for j, hub in enumerate(hubs, start=1):
                hub_status = "completed" if od["status"] in ("IN_TRANSIT", "DELIVERED") else (
                    "current" if od["status"] == "AT_HUB" else "upcoming"
                )
                if od["status"] == "DELAYED" and j == 1:
                    hub_status = "delayed"
                cps.append(TrackingCheckpoint(
                    order_id=order.id, sequence=j,
                    city=hub["city"], lat=hub["lat"], lng=hub["lng"],
                    checkpoint_type="hub", status=hub_status,
                    notes=f"Distribution Hub — {hub['city']}",
                ))
            cps.append(TrackingCheckpoint(
                order_id=order.id, sequence=len(hubs) + 1,
                city=order.dest_city, lat=order.dest_lat, lng=order.dest_lng,
                checkpoint_type="destination",
                status="completed" if od["status"] == "DELIVERED" else "upcoming",
            ))
            db.add_all(cps)
            db.commit()

            
            if od["order_id"] in DEMO_DELAYS:
                d = DEMO_DELAYS[od["order_id"]]
                started = now + timedelta(hours=d["delay_hours_from_now"])
                crisis_end = now + timedelta(hours=d["crisis_lasts_hours"])
                delay_evt = DelayEvent(
                    order_id=order.id,
                    reason_type=d["reason_type"],
                    reason_title=d["reason_title"],
                    description=d["description"],
                    stuck_city=d["stuck_city"],
                    stuck_lat=d["stuck_lat"],
                    stuck_lng=d["stuck_lng"],
                    severity=d["severity"],
                    started_at=started,
                    estimated_end=crisis_end,
                    additional_delay_hours=d["additional_delay_hours"],
                    last_updated=now,
                    is_active=True,
                )
                db.add(delay_evt)
                db.commit()

        print("[ShipGuard] DB seeded: admin/admin123  user1/user123  5 demo orders  2 delay events")
    finally:
        db.close()
