from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

MYSQL_URL  = os.getenv("DATABASE_URL", "mysql+pymysql://shipguard:shipguard123@localhost:3306/shipguard_db")
SQLITE_URL = "sqlite:///./shipguard_local.db"

def _make_engine(url, **kw):
    return create_engine(url, **kw)


try:
    engine = _make_engine(MYSQL_URL, pool_pre_ping=True, pool_recycle=3600)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("[DB] Connected to MySQL")
except Exception as e:
    print(f"[DB] MySQL not available ({e.__class__.__name__}), using SQLite fallback")
    engine = _make_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
