from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="user", nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    orders = relationship("Order", back_populates="user")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String(50), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    origin_city = Column(String(100), nullable=False)
    origin_lat = Column(Float, nullable=False)
    origin_lng = Column(Float, nullable=False)
    dest_city = Column(String(100), nullable=False)
    dest_lat = Column(Float, nullable=False)
    dest_lng = Column(Float, nullable=False)

    carrier_name = Column(String(100))
    status = Column(String(30), default="PENDING")
    priority_level = Column(Integer, default=3)
    weight_kg = Column(Float, default=100.0)

    sla_deadline = Column(DateTime, nullable=True)
    current_eta = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    risk_score = Column(Float, default=0.0)
    risk_level = Column(String(20), default="LOW")

    user = relationship("User", back_populates="orders")
    checkpoints = relationship(
        "TrackingCheckpoint",
        back_populates="order",
        order_by="TrackingCheckpoint.sequence"
    )
    delay_events = relationship("DelayEvent", back_populates="order")


class TrackingCheckpoint(Base):
    __tablename__ = "tracking_checkpoints"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    sequence = Column(Integer, nullable=False)

    city = Column(String(100), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    checkpoint_type = Column(String(50))
    status = Column(String(30), default="upcoming")
    notes = Column(Text, nullable=True)
    arrived_at = Column(DateTime, nullable=True)

    order = relationship("Order", back_populates="checkpoints")


class DelayEvent(Base):
    """Tracks why a shipment is delayed: calamity, strike, customs, etc."""
    __tablename__ = "delay_events"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)

    reason_type  = Column(String(50),  nullable=False)   
    reason_title = Column(String(200), nullable=False)   
    description  = Column(Text,        nullable=False)   

    
    stuck_city = Column(String(100), nullable=False)
    stuck_lat  = Column(Float, nullable=False)
    stuck_lng  = Column(Float, nullable=False)

    severity = Column(String(20), default="HIGH")        

    
    started_at             = Column(DateTime, nullable=False)
    estimated_end          = Column(DateTime, nullable=False)  
    additional_delay_hours = Column(Float, default=2.0)        
    last_updated           = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    is_active = Column(Boolean, default=True)

    order = relationship("Order", back_populates="delay_events")
