
import requests
from datetime import datetime, timezone, timedelta


class ExternalSignalCollector:
    """
    Collects real-time external risk signals using free public APIs —
    no API key required for any source.

    APIs used:
      - Weather  : Open-Meteo  (https://open-meteo.com)          — free, no key
      - Traffic  : OSRM        (http://router.project-osrm.org)  — free, no key
      - News     : GDelt v2    (https://api.gdeltproject.org)    — free, no key
      - Customs  : derived from World Bank complexity scores + day-of-week
      - Port     : derived from time-of-day + destination weather
    """

    OSRM_BASE     = "http://router.project-osrm.org"
    OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast"
    GDELT_URL     = "https://api.gdeltproject.org/api/v2/doc/doc"

    
    CUSTOMS_COMPLEXITY = {
        "India": 3, "China": 4, "USA": 2, "UK": 2, "UAE": 2,
        "Singapore": 1, "Germany": 1, "France": 2, "Netherlands": 1,
        "Pakistan": 5, "Bangladesh": 4, "Sri Lanka": 3,
        "Nepal": 4, "Myanmar": 5, "Vietnam": 3, "Thailand": 2,
        "Malaysia": 2, "Indonesia": 3, "Philippines": 3,
        "Japan": 2, "South Korea": 2, "Australia": 2,
        "Canada": 2, "Mexico": 3, "Brazil": 4,
    }

    

    def get_weather_risk(self, lat: float, lng: float) -> dict:
        """
        Real weather data from Open-Meteo (free, no key).
        Returns a 0–100 risk score derived from wind speed, precipitation,
        visibility, and cloud cover.
        """
        if not lat or not lng:
            return {"weather_score": 0.0, "source": "no-coords"}
        try:
            r = requests.get(self.OPENMETEO_URL, params={
                "latitude":        lat,
                "longitude":       lng,
                "current":         "wind_speed_10m,precipitation,visibility,cloud_cover",
                "wind_speed_unit": "kmh",
                "timezone":        "UTC",
            }, timeout=6)
            if r.status_code == 200:
                curr  = r.json().get("current", {})
                wind  = float(curr.get("wind_speed_10m", 0) or 0)
                rain  = float(curr.get("precipitation",  0) or 0)
                vis   = float(curr.get("visibility",  10000) or 10000)
                cloud = float(curr.get("cloud_cover",     0) or 0)

                wind_risk  = min(wind / 80,     1.0)   
                rain_risk  = min(rain / 25,     1.0)   
                vis_risk   = 1 - min(vis / 10000, 1.0) 
                cloud_risk = cloud / 100

                score = (wind_risk*0.35 + rain_risk*0.35 + vis_risk*0.20 + cloud_risk*0.10) * 100
                return {
                    "weather_score":    round(score, 1),
                    "wind_kmh":         wind,
                    "rain_mmh":         rain,
                    "visibility_m":     vis,
                    "cloud_pct":        cloud,
                    "source":           "open-meteo",
                }
        except Exception:
            pass
        return {"weather_score": 15.0, "source": "fallback"}

    

    def get_traffic_delay(self, orig_lat: float, orig_lng: float,
                          dest_lat: float, dest_lng: float) -> dict:
        """
        Real road routing from OSRM public API (free, no key).
        Traffic delay is estimated from actual route duration × time-of-day
        congestion factor (India Standard Time peak hours).
        """
        if not all([orig_lat, orig_lng, dest_lat, dest_lng]):
            return {"traffic_delay_minutes": 0.0, "source": "no-coords"}
        try:
            coords = f"{orig_lng},{orig_lat};{dest_lng},{dest_lat}"
            r = requests.get(
                f"{self.OSRM_BASE}/route/v1/driving/{coords}",
                params={"overview": "false", "steps": "false"},
                timeout=8,
            )
            if r.status_code == 200 and r.json().get("code") == "Ok":
                route    = r.json()["routes"][0]
                dist_km  = route["distance"] / 1000
                base_hrs = route["duration"] / 3600

                
                hour_ist = (datetime.now(timezone.utc).hour + 5) % 24
                if   8 <= hour_ist <= 10 or 17 <= hour_ist <= 20:
                    factor = 1.40   
                elif 6 <= hour_ist <= 22:
                    factor = 1.15   
                else:
                    factor = 1.02   

                delay_min = round((base_hrs * 3600 * (factor - 1)) / 60, 1)
                return {
                    "traffic_delay_minutes": min(delay_min, 180),
                    "route_distance_km":     round(dist_km, 1),
                    "route_duration_hrs":    round(base_hrs, 2),
                    "congestion_factor":     factor,
                    "source":                "osrm",
                }
        except Exception:
            pass
        return {"traffic_delay_minutes": 15.0, "source": "fallback"}

    

    def get_news_disruption(self, route_countries: list) -> dict:
        """
        Real global event / news data from GDelt v2 (free, no key).
        Queries for logistics-related disruption events in the shipment countries
        over the past 72 hours and scores them using NLP zero-shot classification
        (no hardcoded keywords — the model understands semantics).
        """
        if not route_countries:
            return {"news_disruption_score": 0.0, "source": "no-countries"}
        try:
            from pipeline.nlp_analyzer import analyze_news_batch

            query = " OR ".join([f'"{c}" logistics' for c in route_countries[:3]])
            since = (datetime.now(timezone.utc) - timedelta(hours=72)).strftime("%Y%m%d%H%M%S")

            r = requests.get(self.GDELT_URL, params={
                "query":         query,
                "mode":          "artlist",
                "maxrecords":    "25",
                "format":        "json",
                "STARTDATETIME": since,
            }, timeout=10, headers={"User-Agent": "ShipGuardAI/1.0"})

            if r.status_code == 200:
                articles = r.json().get("articles", [])
                analysis = analyze_news_batch(articles, route_countries=route_countries)
                return {
                    "news_disruption_score": analysis["disruption_score"],
                    "articles_found":        analysis["articles_analyzed"],
                    "articles_after_dedup":  analysis["articles_after_dedup"],
                    "disruption_count":      analysis["disruption_count"],
                    "top_category":          analysis["top_category"],
                    "trend_delta":           analysis["trend_delta"],
                    "affected_locations":    analysis["affected_locations"],
                    "affected_orgs":         analysis["affected_orgs"],
                    "nlp_method":            analysis["method"],
                    "source":                "gdelt+nlp",
                }
        except Exception:
            pass
        return {"news_disruption_score": 5.0, "source": "fallback"}

    

    def get_customs_risk(self, route_countries: list) -> dict:
        """
        Customs risk score (0–100) derived from:
          - Per-country complexity scores (World Bank Doing Business data)
          - Day-of-week pattern (Mon / Fri = paperwork rush; weekends = skeleton staff)
        No external API needed.
        """
        if len(route_countries) <= 1:
            return {"customs_risk_score": 0.0}   

        complexity = sum(self.CUSTOMS_COMPLEXITY.get(c, 3) for c in route_countries)
        dow        = datetime.now(timezone.utc).weekday()   
        dow_factor = 1.30 if dow in (0, 4) else (1.50 if dow >= 5 else 1.0)
        score      = min(complexity * 5 * dow_factor, 100)
        return {"customs_risk_score": round(score, 1)}

    

    def get_port_congestion(self, dest_lat: float = None, dest_lng: float = None,
                            weather_score: float = 0) -> dict:
        """
        Port congestion index derived from:
          - Time of day (ports busiest 04–20 UTC)
          - Day of week (weekends = reduced operations)
          - Destination weather severity (bad weather slows port ops)
        No external API needed — deterministic and always fresh.
        """
        hour     = datetime.now(timezone.utc).hour
        dow      = datetime.now(timezone.utc).weekday()
        time_load = 1.40 if 4 <= hour <= 20 else 0.60
        dow_load  = 0.55 if dow >= 5 else 1.0
        wx_factor = 1 + (weather_score / 200)
        index     = round(min(0.8 * time_load * dow_load * wx_factor, 5.0), 2)
        return {"port_congestion_index": index}

    

    def collect_all_signals(self, shipment: dict) -> dict:
        """
        Fetch all external risk signals for a shipment.
        Returns a flat dict suitable for merging into the features dict
        passed to InterventionRecommender.recommend().
        """
        signals = {
            "shipment_id": shipment.get("shipment_id", ""),
            "timestamp":   datetime.now(timezone.utc).isoformat(),
        }

        
        w_dest   = self.get_weather_risk(shipment.get("dest_lat",   0),
                                         shipment.get("dest_lng",   0))
        w_origin = self.get_weather_risk(shipment.get("origin_lat", 0),
                                         shipment.get("origin_lng", 0))
        signals["weather_dest_score"]    = w_dest["weather_score"]
        signals["weather_origin_score"]  = w_origin["weather_score"]
        signals["weather_wind_kmh"]      = w_dest.get("wind_kmh",      0)
        signals["weather_rain_mmh"]      = w_dest.get("rain_mmh",      0)
        signals["weather_visibility_m"]  = w_dest.get("visibility_m",  10000)

        
        traffic = self.get_traffic_delay(
            shipment.get("origin_lat", 0), shipment.get("origin_lng", 0),
            shipment.get("dest_lat",   0), shipment.get("dest_lng",   0),
        )
        signals["traffic_delay_minutes"] = traffic["traffic_delay_minutes"]
        signals["route_distance_km"]     = traffic.get("route_distance_km",  0)
        signals["route_duration_hrs"]    = traffic.get("route_duration_hrs", 0)
        signals["congestion_factor"]     = traffic.get("congestion_factor",  1.0)

        
        port = self.get_port_congestion(
            shipment.get("dest_lat"), shipment.get("dest_lng"),
            w_dest["weather_score"],
        )
        signals["port_congestion_index"] = port["port_congestion_index"]

        
        news = self.get_news_disruption(shipment.get("route_countries", []))
        signals["news_disruption_score"] = news["news_disruption_score"]
        signals["news_articles_found"]   = news.get("articles_found", 0)

        
        customs = self.get_customs_risk(shipment.get("route_countries", []))
        signals["customs_risk_score"]    = customs["customs_risk_score"]

        
        signals["_sources"] = {
            "weather": w_dest.get("source"),
            "traffic": traffic.get("source"),
            "news":    news.get("source"),
        }

        return signals
