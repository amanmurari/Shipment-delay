from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List

from ..database import get_db
from ..db_models import User, Order
from ..schemas import AdminStats, UserOut, OrderOut
from ..auth_utils import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
def get_admin_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_users = db.query(User).count()
    total_orders = db.query(Order).count()

    pending = db.query(Order).filter(Order.status == "PENDING").count()
    in_transit = db.query(Order).filter(Order.status == "IN_TRANSIT").count()
    delivered = db.query(Order).filter(Order.status == "DELIVERED").count()

    now = datetime.now(timezone.utc)
    delayed = db.query(Order).filter(
        Order.status.in_(["PENDING", "IN_TRANSIT", "AT_HUB"]),
        Order.sla_deadline < now
    ).count()
    delayed += db.query(Order).filter(Order.risk_level == "HIGH").count()

    high_risk = db.query(Order).filter(Order.risk_level == "HIGH").count()

    
    delivered_orders = db.query(Order).filter(
        Order.status == "DELIVERED",
        Order.sla_deadline != None
    ).all()
    if delivered_orders:
        total_hours = sum(
            (o.sla_deadline - o.created_at).total_seconds() / 3600
            for o in delivered_orders
            if o.sla_deadline and o.created_at
        )
        avg_hours = round(total_hours / len(delivered_orders), 1)
    else:
        avg_hours = 0.0

    return AdminStats(
        total_users=total_users,
        total_orders=total_orders,
        pending_orders=pending,
        in_transit_orders=in_transit,
        delivered_orders=delivered,
        delayed_orders=delayed,
        avg_shipping_hours=avg_hours,
        high_risk_orders=high_risk,
    )


@router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.get("/orders", response_model=List[OrderOut])
def list_all_orders(
    status: str = None,
    risk_level: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(Order)
    if status:
        q = q.filter(Order.status == status.upper())
    if risk_level:
        q = q.filter(Order.risk_level == risk_level.upper())
    return q.order_by(Order.created_at.desc()).limit(limit).all()


@router.get("/orders/delayed", response_model=List[OrderOut])
def list_delayed_orders(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    overdue = db.query(Order).filter(
        Order.status.in_(["PENDING", "IN_TRANSIT", "AT_HUB"]),
        Order.sla_deadline < now
    ).all()
    high_risk = db.query(Order).filter(
        Order.risk_level == "HIGH",
        Order.status != "DELIVERED"
    ).all()
    
    seen = set()
    result = []
    for o in overdue + high_risk:
        if o.id not in seen:
            seen.add(o.id)
            result.append(o)
    result.sort(key=lambda o: o.risk_score, reverse=True)
    return result


@router.delete("/users/{user_id}")
def deactivate_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"message": f"User {user.username} deactivated"}
