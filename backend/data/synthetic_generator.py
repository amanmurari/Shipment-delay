"""
Demo Shipment Generator for ShipGuard AI

Generates 5 scripted demo shipments using the Kaggle-based feature schema.
Training data now comes from the real Kaggle E-Commerce Shipping Dataset.
See: backend/data/kaggle_loader.py
"""
from datetime import datetime, timedelta, timezone


from data.kaggle_loader import FEATURE_COLS, compute_features   


CITIES = [
    {"name": "Mumbai",    "lat": 19.0760,  "lng":  72.8777},
    {"name": "Delhi",     "lat": 28.7041,  "lng":  77.1025},
    {"name": "Bangalore", "lat": 12.9716,  "lng":  77.5946},
    {"name": "Chennai",   "lat": 13.0827,  "lng":  80.2707},
    {"name": "Kolkata",   "lat": 22.5726,  "lng":  88.3639},
    {"name": "Hyderabad", "lat": 17.3850,  "lng":  78.4867},
    {"name": "Pune",      "lat": 18.5204,  "lng":  73.8567},
    {"name": "Ahmedabad", "lat": 23.0225,  "lng":  72.5714},
    {"name": "Jaipur",    "lat": 26.9124,  "lng":  75.7873},
    {"name": "Lucknow",   "lat": 26.8467,  "lng":  80.9462},
    {"name": "Dubai",     "lat": 25.2048,  "lng":  55.2708},
    {"name": "Singapore", "lat":  1.3521,  "lng": 103.8198},
    {"name": "Shanghai",  "lat": 31.2304,  "lng": 121.4737},
    {"name": "London",    "lat": 51.5074,  "lng":  -0.1278},
    {"name": "New York",  "lat": 40.7128,  "lng": -74.0060},
]

CARRIERS = [
    "BlueDart Express", "Delhivery", "DTDC", "Gati",
    "Maersk Logistics", "DHL Supply Chain", "FedEx India",
    "Safexpress", "Rivigo", "TCI Freight",
]


def generate_demo_shipments():
    """
    Generate 5 scripted demo shipments with Kaggle-schema features.

    Base fields  (warehouse_block, mode_of_shipment, customer_care_calls,
                  customer_rating, cost_of_product, prior_purchases,
                  product_importance, discount_offered, weight_kg, gender)
    are set per-scenario, then compute_features() derives all 25 FEATURE_COLS.
    """
    now = datetime.now(timezone.utc)

    scenarios = [
        
        {
            "shipment_id":   "SH-4821",
            "origin_city":   "Mumbai",
            "dest_city":     "London",
            "origin_lat":    19.0760, "origin_lng":  72.8777,
            "dest_lat":      51.5074, "dest_lng":   -0.1278,
            "carrier_name":  "Maersk Logistics",
            "sla_deadline":  (now + timedelta(hours=62)).isoformat(),
            "current_eta":   (now + timedelta(hours=68)).isoformat(),
            "weight_kg":     5.5,
            "priority_level": 5,
            "route_countries": ["India", "UAE", "UK"],
            "status":        "IN_TRANSIT",
            "created_at":    (now - timedelta(days=4)).isoformat(),
            
            "_base": {
                "warehouse_block":    3,   
                "mode_of_shipment":   2,   
                "customer_care_calls": 6,
                "customer_rating":    1,
                "cost_of_product":  250,
                "prior_purchases":    3,
                "product_importance": 2,   
                "discount_offered":  55,
                "weight_kg":        5.5,
                "gender":             1,
            },
            "demo_note": "HERO DEMO — Sea freight + 6 care calls + 55% discount → HIGH risk REROUTE",
        },

        
        {
            "shipment_id":   "SH-3310",
            "origin_city":   "Delhi",
            "dest_city":     "Dubai",
            "origin_lat":    28.7041, "origin_lng":  77.1025,
            "dest_lat":      25.2048, "dest_lng":   55.2708,
            "carrier_name":  "Gati",
            "sla_deadline":  (now + timedelta(hours=48)).isoformat(),
            "current_eta":   (now + timedelta(hours=52)).isoformat(),
            "weight_kg":     4.5,
            "priority_level": 4,
            "route_countries": ["India", "UAE"],
            "status":        "IN_TRANSIT",
            "created_at":    (now - timedelta(days=3)).isoformat(),
            "_base": {
                "warehouse_block":    1,   
                "mode_of_shipment":   2,   
                "customer_care_calls": 5,
                "customer_rating":    2,
                "cost_of_product":  220,
                "prior_purchases":    4,
                "product_importance": 2,   
                "discount_offered":  45,
                "weight_kg":        4.5,
                "gender":             0,
            },
            "demo_note": "5 care calls + low rating + heavy sea freight → CARRIER SWAP",
        },

        
        {
            "shipment_id":   "SH-2290",
            "origin_city":   "Chennai",
            "dest_city":     "Singapore",
            "origin_lat":    13.0827, "origin_lng":  80.2707,
            "dest_lat":       1.3521, "dest_lng":  103.8198,
            "carrier_name":  "DHL Supply Chain",
            "sla_deadline":  (now + timedelta(hours=56)).isoformat(),
            "current_eta":   (now + timedelta(hours=54)).isoformat(),
            "weight_kg":     3.8,
            "priority_level": 3,
            "route_countries": ["India", "Singapore"],
            "status":        "IN_TRANSIT",
            "created_at":    (now - timedelta(days=2)).isoformat(),
            "_base": {
                "warehouse_block":    2,   
                "mode_of_shipment":   1,   
                "customer_care_calls": 3,
                "customer_rating":    3,
                "cost_of_product":  190,
                "prior_purchases":    5,
                "product_importance": 2,   
                "discount_offered":  30,
                "weight_kg":        3.8,
                "gender":             1,
            },
            "demo_note": "High-importance product, warehouse C risk → CUSTOMS PRE-CLEARANCE",
        },

        
        {
            "shipment_id":   "SH-1190",
            "origin_city":   "Bangalore",
            "dest_city":     "Hyderabad",
            "origin_lat":    12.9716, "origin_lng":  77.5946,
            "dest_lat":      17.3850, "dest_lng":   78.4867,
            "carrier_name":  "BlueDart Express",
            "sla_deadline":  (now + timedelta(hours=24)).isoformat(),
            "current_eta":   (now + timedelta(hours=22)).isoformat(),
            "weight_kg":     2.8,
            "priority_level": 4,
            "route_countries": ["India"],
            "status":        "IN_TRANSIT",
            "created_at":    (now - timedelta(days=1)).isoformat(),
            "_base": {
                "warehouse_block":    0,   
                "mode_of_shipment":   1,   
                "customer_care_calls": 4,
                "customer_rating":    3,
                "cost_of_product":  160,
                "prior_purchases":    4,
                "product_importance": 1,   
                "discount_offered":  25,
                "weight_kg":        2.8,
                "gender":             0,
            },
            "demo_note": "Medium risk 52% + premium customer → PRE-ALERT",
        },

        
        {
            "shipment_id":   "SH-0870",
            "origin_city":   "Pune",
            "dest_city":     "Ahmedabad",
            "origin_lat":    18.5204, "origin_lng":  73.8567,
            "dest_lat":      23.0225, "dest_lng":   72.5714,
            "carrier_name":  "Delhivery",
            "sla_deadline":  (now + timedelta(hours=36)).isoformat(),
            "current_eta":   (now + timedelta(hours=28)).isoformat(),
            "weight_kg":     1.2,
            "priority_level": 2,
            "route_countries": ["India"],
            "status":        "IN_TRANSIT",
            "created_at":    (now - timedelta(hours=18)).isoformat(),
            "_base": {
                "warehouse_block":    4,   
                "mode_of_shipment":   0,   
                "customer_care_calls": 1,
                "customer_rating":    5,
                "cost_of_product":  120,
                "prior_purchases":    6,
                "product_importance": 0,   
                "discount_offered":   5,
                "weight_kg":        1.2,
                "gender":             1,
            },
            "demo_note": "LOW RISK — Air freight, happy customer, minimal discount",
        },
    ]

    result = []
    for s in scenarios:
        base = s.pop("_base")
        s["features"] = compute_features(base)
        result.append(s)
    return result
