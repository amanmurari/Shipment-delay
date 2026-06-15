# ShipGuard AI

**AI-Based Early Warning System for Shipment Delays**

ShipGuard AI predicts shipment delay risk up to 62 hours in advance using XGBoost + SHAP explainability, automatically alerts operators via Telegram, and recommends ranked interventions to prevent SLA breaches.

---

## Features

- **Risk Prediction** — XGBoost model (ROC-AUC 0.913) scores every shipment HIGH / MEDIUM / LOW with a 0–100% delay probability
- **SHAP Explainability** — Top 7 reasons per prediction with plain-English descriptions (e.g. "Sea freight — slowest mode, highest delay risk")
- **Intervention Recommender** — Ranked actions (reroute, carrier swap, driver handover, expedite customs) with real INR cost deltas and ROI computed from OSRM distances
- **Live External Signals** — Weather (Open-Meteo), traffic (OSRM), news events (GDelt), customs dwell, port congestion — no API keys needed
- **Automated Monitor** — Background loop checks the fleet every 5 minutes; fires Telegram alerts for any shipment crossing the 65% risk threshold
- **Financial Forecast** — 30-day SLA penalty exposure model broken down by carrier, priority class, and daily forecast with vs. without intervention curves
- **Fleet Map** — Interactive Leaflet map with route lines, alternate route suggestions for HIGH-risk shipments, and live risk overlays
- **Role-Based Auth** — JWT-authenticated frontend with user / admin roles; admin dashboard for user management
- **Analytics Dashboard** — Carrier heatmap, risk trend (7-day), model metrics, and ROI summary

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Recharts, Leaflet |
| Backend | FastAPI, Uvicorn, Python 3.10+ |
| ML | XGBoost, SHAP, scikit-learn, pandas, numpy |
| Auth | JWT (python-jose), bcrypt, SQLAlchemy |
| Database | SQLite (dev) / MySQL (production) |
| Notifications | Telegram Bot API |
| External APIs | Open-Meteo, OSRM, GDelt (all free, no key) |
| Containerization | Docker, Docker Compose |

---

## Project Structure

```
shipment/
├── backend/
│   ├── api/
│   │   └── main.py            # FastAPI app, all REST endpoints
│   ├── app/
│   │   ├── auth_utils.py      # JWT helpers
│   │   ├── db_models.py       # SQLAlchemy ORM models
│   │   ├── database.py        # DB session / engine
│   │   ├── seed.py            # Initial user seed
│   │   └── routers/
│   │       ├── auth_router.py
│   │       ├── admin_router.py
│   │       └── orders_router.py
│   ├── data/
│   │   ├── kaggle_loader.py   # Feature engineering (25 features)
│   │   └── synthetic_generator.py
│   ├── engine/
│   │   └── recommender.py     # Intervention engine (OSRM-backed costs)
│   ├── models/
│   │   ├── predictor.py       # XGBoost + SHAP inference
│   │   └── trainer.py         # Model training script
│   ├── pipeline/
│   │   ├── notifier.py        # Telegram / mock alerting
│   │   ├── signal_collector.py # Live external signals
│   │   └── nlp_analyzer.py
│   ├── trained_models/
│   │   └── shipguard_v1.pkl   # Pre-trained model bundle
│   ├── train_model.py         # Re-train from CSV
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── MissionControl.jsx   # Main dashboard
│       │   ├── ShipmentDetail.jsx   # Per-shipment AI analysis
│       │   ├── MapView.jsx          # Fleet + route map
│       │   ├── Analytics.jsx        # Carrier heatmap & model metrics
│       │   ├── Alerts.jsx           # Live alert feed
│       │   ├── FinancialForecast.jsx
│       │   ├── AdminDashboard.jsx
│       │   └── Login.jsx
│       ├── components/
│       │   ├── RiskGauge.jsx
│       │   └── NotificationBell.jsx
│       └── context/AuthContext.jsx
├── start.bat                  # One-click local start (Windows)
└── docker-compose.yml
```

---

## Quick Start

### Option 1 — Docker (recommended)

```bash
git clone <repo-url>
cd shipment
docker-compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| MySQL | localhost:3306 |

### Option 2 — Local (Windows one-click)

```bash
# Make sure Python venv is set up first (see Backend Setup below)
start.bat
```

### Option 3 — Manual

**Backend**
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## Configuration

Copy `.env.example` to `.env` inside the `backend/` folder:

```bash
cp backend/.env.example backend/.env
```

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | _(empty)_ | BotFather token — leave blank for mock/console mode |
| `TELEGRAM_CHAT_ID` | _(empty)_ | Your Telegram chat or group ID |
| `NOTIFICATION_CHANNELS` | `telegram` | Comma-separated channel list |
| `ALERT_THRESHOLD` | `65` | Risk score (%) that triggers auto-alerts |
| `MONITOR_INTERVAL_SECONDS` | `300` | How often the background monitor checks the fleet |

**Getting Telegram credentials**
1. Message `@BotFather` on Telegram → `/newbot` → copy the token
2. Send `/start` to your new bot
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the `id` field

When credentials are absent the system runs in **mock mode** — alerts are printed to the console instead of sent.

---

## ML Model

- **Algorithm:** XGBoost binary classifier
- **Features:** 25 engineered features across 5 groups
  - Shipment Details (warehouse block, mode, weight)
  - Customer Behavior (care calls, rating, prior purchases)
  - Product & Pricing (cost, importance, discount)
  - Risk Flags (high discount, sea freight, heavy shipment, low rating)
  - Derived Signals (calls × rating interaction, cost/weight ratio, warehouse risk score, …)
- **Training data:** Kaggle — [E-Commerce Shipping Dataset](https://www.kaggle.com/datasets/prachi13/customer-analytics)
- **Performance:**

| Metric | Score |
|---|---|
| ROC-AUC | 0.913 |
| Precision | 0.83 |
| Recall | 0.88 |
| F1 | 0.855 |
| PR-AUC | 0.72 |
| Avg prediction window | 62 hours |

**Retrain the model**
```bash
cd backend
python train_model.py
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/api/dashboard/summary` | Stat cards, top-risk shipments, fleet map data |
| GET | `/api/shipments` | Filterable shipment list (`?risk_level=HIGH&carrier=DHL`) |
| GET | `/api/shipments/{id}/analysis` | Full AI analysis: risk + SHAP + interventions + timeline |
| GET | `/api/shipments/{id}/map` | Route coords, checkpoints, alternate route for HIGH risk |
| POST | `/api/shipments/{id}/interventions/approve` | Approve an intervention; triggers background notification |
| GET | `/api/analytics/overview` | Carrier heatmap, ROI, model metrics, risk trend |
| GET | `/api/alerts` | Active alerts + action history |
| POST | `/api/alerts/action` | Acknowledge / dismiss / escalate an alert |
| GET | `/api/signals/{id}` | Live external signals (weather, traffic, customs) |
| GET | `/api/financial/forecast` | 30-day loss forecast by carrier and priority |
| GET | `/api/carrier-stats` | On-time delivery rates computed from live fleet |
| GET | `/api/notifications/config` | Current notification setup |
| POST | `/api/notifications/test` | Fire a test alert for the highest-risk shipment |
| POST | `/api/notifications/send` | Manually alert any shipment to specified channels |
| GET | `/api/model/info` | Model metadata |

Full interactive docs at **http://localhost:8000/docs**

---

## Default Credentials

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| User | `user1` | `user123` |

---

## Screenshots

> Dashboard → Shipment Detail → Map → Analytics → Financial Forecast → Alerts

*(Add screenshots here)*

---

## License

MIT
