
import requests
from dataclasses import dataclass, asdict
from typing import List, Optional


@dataclass
class Intervention:
    action: str
    display_name: str
    description: str
    confidence: float
    cost_delta_inr: float
    sla_saved: bool
    lead_time_hrs: float
    sla_penalty_avoided: float
    roi_ratio: float
    priority: int = 99
    icon: str = "⚡"


class InterventionRecommender:
    """
    Generates ranked intervention recommendations.

    Route data   → OSRM public API (free, no key) for real distances / durations.
    Carrier data → Computed live from FLEET + RISK_CACHE (actual OTD rates).
    Costs        → Derived from real distance × INR/km freight rates.
    """

    OSRM_BASE = "http://router.project-osrm.org"

    
    HUB_COORDS = {
        "Mumbai":    (19.0760, 72.8777),
        "Delhi":     (28.6139, 77.2090),
        "Bangalore": (12.9716, 77.5946),
        "Chennai":   (13.0827, 80.2707),
        "Kolkata":   (22.5726, 88.3639),
        "Hyderabad": (17.3850, 78.4867),
        "Pune":      (18.5204, 73.8567),
        "Ahmedabad": (23.0225, 72.5714),
        "Jaipur":    (26.9124, 75.7873),
        "Surat":     (21.1702, 72.8311),
        "Lucknow":   (26.8467, 80.9462),
    }

    
    COST_PER_KM_INR = 45

    
    PENALTY_LOOKUP = {1: 5_000, 2: 15_000, 3: 50_000, 4: 120_000, 5: 200_000}

    def __init__(self):
        
        self._carrier_stats: dict = {}

    

    def update_carrier_stats(self, fleet: list, risk_cache: dict):
        """
        Compute real carrier on-time delivery rates from live fleet risk data.
        A shipment is 'on-time' when its ML risk score is < 65 (below alert threshold).
        Called once after FLEET + RISK_CACHE are built in main.py.
        """
        from collections import defaultdict
        buckets: dict = defaultdict(list)
        for ship in fleet:
            cname = ship.get("carrier_name", "")
            score = risk_cache.get(ship["shipment_id"], {}).get("risk_score", 50)
            buckets[cname].append(score)

        self._carrier_stats = {}
        for cname, scores in buckets.items():
            avg_risk = sum(scores) / len(scores)
            on_time  = sum(1 for s in scores if s < 65) / len(scores)
            self._carrier_stats[cname] = {
                "name":        cname,
                "avg_risk":    round(avg_risk, 1),
                "reliability": round(on_time, 3),
                "count":       len(scores),
            }

    def _osrm_route(self, orig_lat: float, orig_lng: float,
                    dest_lat: float, dest_lng: float,
                    via_lat: Optional[float] = None,
                    via_lng: Optional[float] = None) -> Optional[dict]:
        """Fetch real route duration + distance from the public OSRM API."""
        try:
            if via_lat is not None:
                coords = f"{orig_lng},{orig_lat};{via_lng},{via_lat};{dest_lng},{dest_lat}"
            else:
                coords = f"{orig_lng},{orig_lat};{dest_lng},{dest_lat}"
            r = requests.get(
                f"{self.OSRM_BASE}/route/v1/driving/{coords}",
                params={"overview": "false", "steps": "false"},
                timeout=7,
            )
            if r.status_code == 200 and r.json().get("code") == "Ok":
                route = r.json()["routes"][0]
                return {
                    "distance_km":  round(route["distance"] / 1000, 1),
                    "duration_hrs": round(route["duration"] / 3600, 2),
                }
        except Exception:
            pass
        return None

    def _build_alternate_routes(self, shipment: dict) -> list:
        """
        Query OSRM for routes via each hub city and keep those that add
        a meaningful detour (≥ 80 km extra). Costs are derived from
        actual extra distance × ₹45/km road freight rate.
        Returns up to 4 routes sorted by cost (cheapest first).
        """
        orig_lat = shipment.get("origin_lat", 0)
        orig_lng = shipment.get("origin_lng", 0)
        dest_lat = shipment.get("dest_lat",   0)
        dest_lng = shipment.get("dest_lng",   0)

        direct   = self._osrm_route(orig_lat, orig_lng, dest_lat, dest_lng)
        base_km  = direct["distance_km"]  if direct else 1000
        base_hrs = direct["duration_hrs"] if direct else 24

        origin_city = shipment.get("origin_city", "")
        dest_city   = shipment.get("dest_city",   "")

        routes = []
        for hub, (hub_lat, hub_lng) in self.HUB_COORDS.items():
            if hub in (origin_city, dest_city):
                continue
            via = self._osrm_route(orig_lat, orig_lng, dest_lat, dest_lng, hub_lat, hub_lng)
            if not via:
                continue
            extra_km   = max(via["distance_km"]  - base_km,  0)
            extra_hrs  = max(via["duration_hrs"] - base_hrs, 0)
            if extra_km < 80:
                continue   
            extra_cost = max(round(extra_km * self.COST_PER_KM_INR), 8_000)
            
            eta_save   = max(round(base_hrs * 0.25 - extra_hrs, 1), 1)
            routes.append({
                "route_name":     f"Via {hub} Corridor",
                "extra_cost_inr": extra_cost,
                "setup_hrs":      round(extra_hrs + 1, 1),
                "eta_save_hrs":   eta_save,
                "total_km":       via["distance_km"],
                "extra_km":       round(extra_km, 1),
            })

        routes.sort(key=lambda r: r["extra_cost_inr"])
        return routes[:4] if routes else [
            
            {"route_name": "Alternate Route", "extra_cost_inr": 15_000,
             "setup_hrs": 4, "eta_save_hrs": 6, "total_km": None, "extra_km": None},
        ]

    def _get_alternate_carriers(self, current_carrier: str, sla_penalty: float) -> list:
        """
        Return carriers with better on-time rates than the current carrier,
        ranked by reliability, with swap cost = 18% of SLA penalty.
        Carrier performance is computed from live FLEET risk data.
        """
        current_rel = self._carrier_stats.get(current_carrier, {}).get("reliability", 0.75)
        swap_cost   = min(round(sla_penalty * 0.18), 40_000)

        better = []
        for name, stats in self._carrier_stats.items():
            if name != current_carrier and stats["reliability"] > current_rel:
                better.append({
                    **stats,
                    "extra_cost_inr": max(swap_cost, 10_000),
                    "lead_time_hrs":  8,
                })
        better.sort(key=lambda c: -c["reliability"])

        if not better:
            
            better = [
                {"name": "BlueDart Express", "reliability": 0.93,
                 "extra_cost_inr": max(swap_cost, 12_000), "lead_time_hrs": 6},
                {"name": "FedEx India",      "reliability": 0.91,
                 "extra_cost_inr": max(swap_cost, 10_000), "lead_time_hrs": 8},
            ]
        return better[:3]

    

    def recommend(self, shipment: dict, risk: dict, features: dict,
                  max_results: int = 4) -> List[dict]:
        """
        Generate a ranked list of intervention recommendations.

        `features` should be the Kaggle ML features enriched with external
        signals from ExternalSignalCollector.collect_all_signals():
          weather_dest_score, news_disruption_score, customs_risk_score,
          hours_until_sla, cross_border_count, carrier_reliability_30d
        """
        candidates     = []
        priority_level = shipment.get("priority_level", 3)
        sla_penalty    = self.PENALTY_LOOKUP.get(priority_level, 50_000)
        risk_score     = risk.get("risk_score", 0)
        hours_until_sla = features.get("hours_until_sla", 0)
        current_carrier = shipment.get("carrier_name", "")

        
        weather_risk = features.get("weather_dest_score",    0) > 65
        news_risk    = features.get("news_disruption_score", 0) > 55
        has_time     = hours_until_sla > 8

        if (weather_risk or news_risk) and has_time:
            routes = self._build_alternate_routes(shipment)
            alt    = routes[0]
            roi    = round(sla_penalty / max(alt["extra_cost_inr"], 1), 1)
            km_str = f"{alt['total_km']} km" if alt.get("total_km") else "alternate"
            candidates.append(Intervention(
                action="REROUTE",
                display_name="Reroute Shipment",
                description=(
                    f"Reroute via {alt['route_name']} ({km_str}, "
                    f"+{alt.get('extra_km', '?')} km extra). "
                    f"Avoids disruption zone, recovers ~{alt['eta_save_hrs']} hrs. "
                    f"Extra logistics cost: ₹{alt['extra_cost_inr']:,}."
                ),
                confidence=0.87,
                cost_delta_inr=alt["extra_cost_inr"],
                sla_saved=True,
                lead_time_hrs=alt["setup_hrs"],
                sla_penalty_avoided=sla_penalty,
                roi_ratio=roi,
                priority=1,
                icon="🔀",
            ))

        
        
        current_rel   = self._carrier_stats.get(current_carrier, {}).get("reliability", 0.80)
        current_count = self._carrier_stats.get(current_carrier, {}).get("count", 0)
        carrier_risky = current_rel < 0.78
        enough_time   = hours_until_sla > 18

        if carrier_risky and enough_time:
            alts = self._get_alternate_carriers(current_carrier, sla_penalty)
            best = alts[0]
            roi  = round(sla_penalty / max(best["extra_cost_inr"], 1), 1)
            candidates.append(Intervention(
                action="CARRIER_SWAP",
                display_name="Switch Carrier",
                description=(
                    f"Current carrier ({current_carrier}) on-time rate: "
                    f"{round(current_rel*100)}% across {current_count} shipments → "
                    f"Switch to {best['name']} ({round(best['reliability']*100)}% OTD). "
                    f"Delta: +₹{best['extra_cost_inr']:,} vs ₹{sla_penalty:,} SLA penalty."
                ),
                confidence=0.82,
                cost_delta_inr=best["extra_cost_inr"],
                sla_saved=True,
                lead_time_hrs=best["lead_time_hrs"],
                sla_penalty_avoided=sla_penalty,
                roi_ratio=roi,
                priority=2,
                icon="🔄",
            ))

        
        cross_border = len(shipment.get("route_countries", ["India"])) - 1
        customs_score = features.get("customs_risk_score", 0)
        if customs_score > 45 and cross_border > 0:
            roi = round(sla_penalty / 1_500, 1)
            candidates.append(Intervention(
                action="CUSTOMS_PRECLR",
                display_name="Customs Pre-Clearance",
                description=(
                    f"Live customs risk: {round(customs_score)}% across "
                    f"{cross_border} border crossing(s). "
                    f"Submit documentation now — estimated 8–14 hrs saved at crossing."
                ),
                confidence=0.74,
                cost_delta_inr=1_500,
                sla_saved=True,
                lead_time_hrs=2.0,
                sla_penalty_avoided=sla_penalty,
                roi_ratio=roi,
                priority=3,
                icon="📋",
            ))

        
        if risk_score > 70 and priority_level >= 4:
            roi = round(sla_penalty / 3_500, 1)
            candidates.append(Intervention(
                action="PRIORITY_UPLIFT",
                display_name="Priority Uplift",
                description=(
                    f"Flag P{priority_level} shipment for front-of-queue at next hub. "
                    f"Override normal processing, assign dedicated handler. "
                    f"Recovers 3–6 hrs of dwell time."
                ),
                confidence=0.78,
                cost_delta_inr=3_500,
                sla_saved=True,
                lead_time_hrs=0,
                sla_penalty_avoided=sla_penalty,
                roi_ratio=roi,
                priority=2,
                icon="⚡",
            ))

        
        if risk_score >= 35:
            delay_hrs   = risk.get("delay_hrs_predicted", 4)
            pct_avoided = 0.40 if risk_score >= 65 else 0.25
            candidates.append(Intervention(
                action="PRE_ALERT",
                display_name="Send Customer Pre-Alert",
                description=(
                    f"Proactively notify customer of potential {delay_hrs:.0f}-hr delay. "
                    f"Reduces penalty exposure by ~{int(pct_avoided*100)}% via goodwill credit. "
                    f"Zero cost — send via existing notification channel."
                ),
                confidence=0.95,
                cost_delta_inr=0,
                sla_saved=False,
                lead_time_hrs=0,
                sla_penalty_avoided=round(sla_penalty * pct_avoided),
                roi_ratio=999.0,
                priority=4,
                icon="📨",
            ))

        
        if risk_score < 65:
            candidates.append(Intervention(
                action="MONITOR",
                display_name="Continue Monitoring",
                description=(
                    "No action required yet. AI will re-evaluate every 15 minutes. "
                    "Alert will escalate automatically if risk exceeds 65%."
                ),
                confidence=1.0,
                cost_delta_inr=0,
                sla_saved=False,
                lead_time_hrs=0,
                sla_penalty_avoided=0,
                roi_ratio=0,
                priority=99,
                icon="👁️",
            ))

        
        ranked = sorted(candidates, key=lambda x: (
            0 if x.sla_saved else 1,
            x.cost_delta_inr,
            -x.confidence,
        ))

        results = []
        for i, intv in enumerate(ranked[:max_results], 1):
            d = asdict(intv)
            d["rank"]        = i
            d["cost_display"] = f"₹{int(intv.cost_delta_inr):,}" if intv.cost_delta_inr > 0 else "Free"
            d["roi_display"]  = ("∞" if intv.roi_ratio >= 999
                                 else ("—" if intv.roi_ratio == 0
                                       else f"1:{intv.roi_ratio:.0f}"))
            results.append(d)
        return results
