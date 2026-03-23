
import os
import sys
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()


TELEGRAM_BOT_TOKEN    = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID      = os.getenv("TELEGRAM_CHAT_ID", "")
TWILIO_ACCOUNT_SID    = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN     = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_WHATSAPP  = os.getenv("TWILIO_FROM_WHATSAPP", "whatsapp:+14155238886")  
TWILIO_TO_WHATSAPP    = os.getenv("TWILIO_TO_WHATSAPP", "")

MOCK_MODE = not TELEGRAM_BOT_TOKEN and not TWILIO_ACCOUNT_SID


def _risk_emoji(risk_score: float) -> str:
    if risk_score >= 80:
        return "🚨"
    elif risk_score >= 65:
        return "⚠️"
    return "🟡"


def build_telegram_message(shipment: dict, risk: dict, interventions: list) -> str:
    """Build a clean Telegram Markdown message."""
    sid = shipment["shipment_id"]
    score = risk["risk_score"]
    level = risk["risk_level"]
    delay = risk.get("delay_hrs_predicted", 0)
    origin = shipment["origin_city"]
    dest   = shipment["dest_city"]
    carrier = shipment.get("carrier_name", "Unknown")
    priority = shipment.get("priority_level", 3)
    sla = shipment.get("sla_deadline", "")
    emoji = _risk_emoji(score)

    
    shap_lines = ""
    for r in risk.get("shap_reasons", [])[:3]:
        arrow = "🔴↑" if r.get("direction", "increasing") == "increasing" else "🟢↓"
        label = r.get("display_name") or r.get("feature", "Signal")
        val   = r.get("value") or r.get("description", "")
        shap_lines += f"  {arrow} {label}: {val}\n"

    
    intv_lines = ""
    for intv in interventions[:2]:
        name = intv.get("display_name") or intv.get("action", "Action")
        cost = intv.get("cost_display", "")
        intv_lines += f"  • {name} ({cost})\n"

    try:
        sla_fmt = datetime.fromisoformat(sla).strftime("%d %b %Y, %H:%M UTC")
    except Exception:
        sla_fmt = sla

    msg = (
        f"{emoji} *ShipGuard AI — HIGH RISK ALERT*\n\n"
        f"*Shipment:* `{sid}` (P{priority})\n"
        f"*Route:* {origin} → {dest}\n"
        f"*Carrier:* {carrier}\n"
        f"*SLA Deadline:* {sla_fmt}\n\n"
        f"*Risk Score:* {score}% — *{level}*\n"
        f"*Predicted Delay:* {delay} hrs\n\n"
        f"*Why at risk:*\n{shap_lines}\n"
        f"*Recommended Actions:*\n{intv_lines}\n"
        f"_Review at: http://localhost:5173/shipment/{sid}_"
    )
    return msg


def build_whatsapp_message(shipment: dict, risk: dict, interventions: list) -> str:
    """Plain-text version for WhatsApp (no markdown)."""
    sid    = shipment["shipment_id"]
    score  = risk["risk_score"]
    level  = risk["risk_level"]
    delay  = risk.get("delay_hrs_predicted", 0)
    origin = shipment["origin_city"]
    dest   = shipment["dest_city"]
    emoji  = _risk_emoji(score)

    top_reason = risk.get("shap_reasons", [{}])[0]
    reason_text = f"{top_reason.get('display_name', 'N/A')}: {top_reason.get('value', '')}" if top_reason else ""

    top_intv = interventions[0] if interventions else {}
    intv_text = f"{top_intv.get('display_name', 'N/A')} ({top_intv.get('cost_display', '')})" if top_intv else ""

    return (
        f"{emoji} ShipGuard AI HIGH RISK ALERT\n\n"
        f"Shipment: {sid}\n"
        f"Route: {origin} to {dest}\n"
        f"Risk: {score}% ({level})\n"
        f"Predicted Delay: {delay} hrs\n\n"
        f"Top Risk Factor: {reason_text}\n"
        f"Recommended: {intv_text}\n\n"
        f"Review: http://localhost:5173/shipment/{sid}"
    )


def send_telegram(shipment: dict, risk: dict, interventions: list) -> dict:
    """Send a Telegram alert. Returns {success, message, error}."""
    if MOCK_MODE:
        msg = build_telegram_message(shipment, risk, interventions)
        safe_msg = "\n[MOCK TELEGRAM]\n" + msg.encode('ascii', errors='replace').decode('ascii') + "\n"
        sys.stdout.buffer.write(safe_msg.encode('utf-8', errors='replace'))
        sys.stdout.buffer.flush()
        return {"success": True, "channel": "telegram", "mode": "mock", "message": msg}

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return {"success": False, "channel": "telegram", "error": "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env"}

    msg = build_telegram_message(shipment, risk, interventions)
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        resp = requests.post(url, json={
            "chat_id":    TELEGRAM_CHAT_ID,
            "text":       msg,
            "parse_mode": "Markdown",
        }, timeout=10)
        resp.raise_for_status()
        return {"success": True, "channel": "telegram", "mode": "live", "message_id": resp.json().get("result", {}).get("message_id")}
    except Exception as e:
        return {"success": False, "channel": "telegram", "error": str(e)}


def send_whatsapp(shipment: dict, risk: dict, interventions: list) -> dict:
    """Send a WhatsApp message via Twilio. Returns {success, message, error}."""
    if MOCK_MODE:
        msg = build_whatsapp_message(shipment, risk, interventions)
        safe_msg = "\n[MOCK WHATSAPP]\n" + msg.encode('ascii', errors='replace').decode('ascii') + "\n"
        sys.stdout.buffer.write(safe_msg.encode('utf-8', errors='replace'))
        sys.stdout.buffer.flush()
        return {"success": True, "channel": "whatsapp", "mode": "mock", "message": msg}

    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_TO_WHATSAPP]):
        return {"success": False, "channel": "whatsapp", "error": "Missing Twilio credentials in .env"}

    msg = build_whatsapp_message(shipment, risk, interventions)
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    try:
        resp = requests.post(url,
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            data={
                "From": TWILIO_FROM_WHATSAPP,
                "To":   f"whatsapp:{TWILIO_TO_WHATSAPP.replace('whatsapp:', '')}",
                "Body": msg,
            }, timeout=10)
        resp.raise_for_status()
        return {"success": True, "channel": "whatsapp", "mode": "live", "sid": resp.json().get("sid")}
    except Exception as e:
        return {"success": False, "channel": "whatsapp", "error": str(e)}


def send_alert(shipment: dict, risk: dict, interventions: list, channels: list = None) -> list:
    """
    Send alert to specified channels.
    channels: list of "telegram" | "whatsapp" (default: all configured channels)
    Returns list of results from each channel.
    """
    if channels is None:
        channels = []
        if TELEGRAM_BOT_TOKEN or MOCK_MODE:
            channels.append("telegram")
        if TWILIO_ACCOUNT_SID or MOCK_MODE:
            channels.append("whatsapp")
        if not channels:
            channels = ["telegram"]   

    results = []
    for ch in channels:
        if ch == "telegram":
            results.append(send_telegram(shipment, risk, interventions))
        elif ch == "whatsapp":
            results.append(send_whatsapp(shipment, risk, interventions))
    return results


def get_config() -> dict:
    """Return current notification configuration (without secrets)."""
    return {
        "mode":           "mock" if MOCK_MODE else "live",
        "telegram":       {"enabled": bool(TELEGRAM_BOT_TOKEN), "chat_id_set": bool(TELEGRAM_CHAT_ID)},
        "whatsapp":       {"enabled": bool(TWILIO_ACCOUNT_SID), "to_set": bool(TWILIO_TO_WHATSAPP)},
        "instructions": {
            "telegram": [
                "1. Message @BotFather on Telegram → /newbot",
                "2. Copy the token → set TELEGRAM_BOT_TOKEN=<token> in backend/.env",
                "3. Send /start to your bot, then visit:",
                "   https://api.telegram.org/bot<TOKEN>/getUpdates",
                "4. Copy 'id' from result → set TELEGRAM_CHAT_ID=<id> in backend/.env",
                "5. Restart the backend — notifications will go live immediately"
            ],
            "whatsapp": [
                "1. Sign up at https://www.twilio.com/try-twilio",
                "2. Go to Messaging → Try WhatsApp Sandbox",
                "3. Set in backend/.env:",
                "   TWILIO_ACCOUNT_SID=ACxxxxxxxxxx",
                "   TWILIO_AUTH_TOKEN=xxxxxxxxxx",
                "   TWILIO_TO_WHATSAPP=+91XXXXXXXXXX  (your phone with country code)"
            ]
        }
    }
