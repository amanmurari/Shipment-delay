"""
ShipGuard AI — Predictor
Loads the trained XGBoost model and predicts delay risk with SHAP explanations.
Feature schema: Kaggle E-Commerce Shipping Dataset (25 features).
"""

import os
import sys
import pandas as pd
import numpy as np
import joblib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.kaggle_loader import FEATURE_COLS




FEATURE_META = {
    "warehouse_block":       ("Warehouse Block (A–F)",              "positive"),
    "mode_of_shipment":      ("Mode of Shipment",                   "positive"),
    "customer_care_calls":   ("Customer Care Calls",                "positive"),
    "customer_rating":       ("Customer Satisfaction Rating",       "negative"),
    "cost_of_product":       ("Product Cost (USD)",                 "positive"),
    "prior_purchases":       ("Prior Purchases",                    "negative"),
    "product_importance":    ("Product Importance Level",           "positive"),
    "discount_offered":      ("Discount Offered (%)",               "positive"),
    "weight_kg":             ("Shipment Weight (kg)",               "positive"),
    "gender":                ("Customer Gender",                    "positive"),
    "high_discount_flag":    ("High Discount Flag (>35%)",          "positive"),
    "heavy_shipment_flag":   ("Heavy Shipment Flag (>4 kg)",        "positive"),
    "is_sea_freight":        ("Sea Freight Indicator",              "positive"),
    "is_air_freight":        ("Air Freight Indicator",              "negative"),
    "high_care_calls_flag":  ("High Care Calls Flag (≥5)",          "positive"),
    "low_rating_flag":       ("Low Customer Rating Flag (≤2)",      "positive"),
    "calls_x_low_rating":    ("Calls × Low Rating Interaction",     "positive"),
    "cost_weight_ratio":     ("Cost per kg (Value Density)",        "positive"),
    "discount_x_importance": ("Discount × Importance Score",        "positive"),
    "priority_score":        ("Priority Risk Score",                "positive"),
    "calls_per_purchase":    ("Call Intensity per Purchase",        "positive"),
    "effective_discount":    ("Effective Discount (% of value)",    "positive"),
    "warehouse_risk_score":  ("Warehouse Risk Score (1–4)",         "positive"),
    "is_high_importance":    ("High-Importance Product Flag",       "positive"),
    "is_low_importance":     ("Low-Importance Product Flag",        "negative"),
}


class ShipGuardPredictor:
    """Predicts shipment delay risk with explainable AI."""

    def __init__(self, model_path: str = None):
        if model_path is None:
            model_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "..", "trained_models", "shipguard_v1.pkl",
            )
        self.loaded   = False
        self.has_shap = False

        if os.path.exists(model_path):
            bundle = joblib.load(model_path)
            self.model              = bundle["model"]
            self.features           = bundle["features"]
            self.threshold          = bundle.get("threshold", 0.5)
            self.feature_importances = bundle.get("feature_importances", {})
            self.loaded = True

            if bundle.get("explainer") is not None:
                self.explainer = bundle["explainer"]
                self.has_shap  = True
            else:
                try:
                    import shap
                    self.explainer = shap.TreeExplainer(self.model)
                    self.has_shap  = True
                except Exception:
                    self.has_shap = False
        else:
            print(f"WARNING: Model not found at {model_path}. Using fallback scoring.")

    def predict(self, features_dict: dict) -> dict:
        """Predict delay risk for a single shipment."""
        if not self.loaded:
            return self._fallback_predict(features_dict)

        X    = pd.DataFrame([{f: features_dict.get(f, 0) for f in self.features}])
        prob = float(self.model.predict_proba(X)[0][1])

        reasons = (self._shap_explain(X, features_dict)
                   if self.has_shap
                   else self._importance_explain(X, features_dict, prob))

        risk_score = round(prob * 100, 1)

        
        calls   = features_dict.get("customer_care_calls", 3)
        sea     = features_dict.get("is_sea_freight", 0)
        heavy   = features_dict.get("heavy_shipment_flag", 0)
        hi_disc = features_dict.get("high_discount_flag", 0)
        predicted_delay = round(
            calls * 2.5       
            + sea * 10.0      
            + heavy * 3.0     
            + hi_disc * 2.0,  
            1,
        )

        confidence = round(min(abs(prob - 0.5) * 200, 99), 1)

        return {
            "risk_score":          risk_score,
            "risk_level":          self._risk_level(prob),
            "risk_color":          self._risk_color(prob),
            "delay_probability":   round(prob, 4),
            "delay_hrs_predicted": predicted_delay,
            "confidence_pct":      confidence,
            "shap_reasons":        reasons[:3],
            "all_shap_factors":    reasons[:7],
            "model_version":       "v2.0-kaggle",
            "prediction_window":   "48-72 hours",
        }

    

    def _shap_explain(self, X: pd.DataFrame, features_dict: dict) -> list:
        shap_vals = self.explainer.shap_values(X)
        if isinstance(shap_vals, list):
            shap_vals = shap_vals[1]
        contributions = dict(zip(self.features, shap_vals[0]))
        top_factors = sorted(contributions.items(), key=lambda x: abs(x[1]), reverse=True)[:7]
        return self._format_reasons(top_factors, features_dict)

    def _importance_explain(self, X: pd.DataFrame, features_dict: dict, prob: float) -> list:
        contributions = {}
        for feat in self.features:
            importance = self.feature_importances.get(feat, 0.01)
            _, polarity = FEATURE_META.get(feat, (feat, "positive"))
            signed_push = prob - 0.5
            if polarity == "negative":
                signed_push = 0.5 - prob
            contributions[feat] = importance * signed_push
        top_factors = sorted(contributions.items(), key=lambda x: abs(x[1]), reverse=True)[:7]
        return self._format_reasons(top_factors, features_dict)

    def _format_reasons(self, top_factors: list, features_dict: dict) -> list:
        reasons = []
        for feat, shap_val in top_factors:
            feat_value   = features_dict.get(feat, 0)
            direction    = "increasing" if shap_val > 0 else "decreasing"
            display_name, _ = FEATURE_META.get(feat, (feat.replace("_", " ").title(), "positive"))
            arrow = "🔴 ↑" if shap_val > 0 else "🟢 ↓"

            unit = ""
            if feat == "discount_offered" or feat == "effective_discount":
                unit = "%"
            elif feat == "weight_kg":
                unit = " kg"
            elif feat == "cost_of_product":
                unit = " USD"

            reasons.append({
                "feature":      feat,
                "display_name": display_name,
                "value":        f"{feat_value:.1f}{unit}",
                "shap_value":   round(float(shap_val), 4),
                "direction":    direction,
                "arrow":        arrow,
                "description":  f"{arrow} {display_name}: {feat_value:.1f}{unit} — {direction} delay risk",
            })
        return reasons

    def _fallback_predict(self, features: dict) -> dict:
        """Rule-based fallback when model file is not available."""
        calls   = features.get("customer_care_calls", 3)
        rating  = features.get("customer_rating", 3)
        disc    = features.get("high_discount_flag", 0)
        sea     = features.get("is_sea_freight", 0)
        heavy   = features.get("heavy_shipment_flag", 0)
        low_rat = features.get("low_rating_flag", 0)

        risk = (
            (calls / 7) * 0.25
            + disc * 0.20
            + (1 - rating / 5) * 0.20
            + sea * 0.15
            + heavy * 0.10
            + low_rat * 0.10
        )
        risk_score = round(min(risk * 100, 99), 1)
        return {
            "risk_score":          risk_score,
            "risk_level":          self._risk_level(risk),
            "risk_color":          self._risk_color(risk),
            "delay_probability":   round(risk, 4),
            "delay_hrs_predicted": round(calls * 2.5 + sea * 10, 1),
            "confidence_pct":      round(min(risk * 80, 95), 1),
            "shap_reasons": [{
                "feature":      "customer_care_calls",
                "display_name": "Customer Care Calls",
                "value":        f"{calls:.0f}",
                "shap_value":   0.25,
                "direction":    "increasing",
                "arrow":        "🔴 ↑",
                "description":  "Fallback scoring — model file not found",
            }],
            "all_shap_factors":  [],
            "model_version":     "fallback",
            "prediction_window": "48-72 hours",
        }

    @staticmethod
    def _risk_level(prob: float) -> str:
        if prob >= 0.65:
            return "HIGH"
        elif prob >= 0.35:
            return "MEDIUM"
        return "LOW"

    @staticmethod
    def _risk_color(prob: float) -> str:
        if prob >= 0.65:
            return "#FF4444"
        elif prob >= 0.35:
            return "#FFA500"
        return "#00CC66"
