from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime



class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True



class CheckpointOut(BaseModel):
    id: int
    sequence: int
    city: str
    lat: float
    lng: float
    checkpoint_type: str
    status: str
    notes: Optional[str]
    arrived_at: Optional[datetime]

    class Config:
        from_attributes = True



class OrderCreate(BaseModel):
    origin_city: str
    origin_lat: float
    origin_lng: float
    dest_city: str
    dest_lat: float
    dest_lng: float
    carrier_name: Optional[str] = "ShipGuard Express"
    priority_level: int = 3
    weight_kg: float = 100.0
    sla_deadline: Optional[datetime] = None


class OrderOut(BaseModel):
    id: int
    order_id: str
    user_id: int
    origin_city: str
    origin_lat: float
    origin_lng: float
    dest_city: str
    dest_lat: float
    dest_lng: float
    carrier_name: Optional[str]
    status: str
    priority_level: int
    weight_kg: float
    sla_deadline: Optional[datetime]
    current_eta: Optional[datetime]
    created_at: datetime
    risk_score: float
    risk_level: str
    checkpoints: List[CheckpointOut] = []

    class Config:
        from_attributes = True



class AdminStats(BaseModel):
    total_users: int
    total_orders: int
    pending_orders: int
    in_transit_orders: int
    delivered_orders: int
    delayed_orders: int
    avg_shipping_hours: float
    high_risk_orders: int


class OrderMapData(BaseModel):
    order_id: str
    status: str
    risk_score: float
    risk_level: str
    origin: dict
    destination: dict
    checkpoints: List[dict]
    route_coords: List[List[float]]
    carrier_name: Optional[str]
    weight_kg: float
    priority_level: int
    created_at: datetime
    sla_deadline: Optional[datetime]
    current_eta: Optional[datetime]
    active_delay: Optional[dict] = None   
    alt_route: Optional[dict] = None     


class DelayEventOut(BaseModel):
    id: int
    reason_type: str
    reason_title: str
    description: str
    stuck_city: str
    stuck_lat: float
    stuck_lng: float
    severity: str
    started_at: datetime
    estimated_end: datetime
    additional_delay_hours: float
    last_updated: datetime
    is_active: bool

    class Config:
        from_attributes = True
