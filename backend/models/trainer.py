"""
ShipGuard AI — Model Trainer (Kaggle Real Data)
Trains XGBoost on the real Kaggle E-Commerce Shipping Dataset.
"""

import os
import sys
import pandas as pd
import numpy as np
import xgboost as xgb
import shap
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.kaggle_loader import FEATURE_COLS, load_kaggle_training_data


def train_model(df: pd.DataFrame = None, save_path: str = "trained_models"):
    """Train XGBoost on real Kaggle data and save model bundle with SHAP explainer."""
    if df is None:
        df = load_kaggle_training_data()

    X = df[FEATURE_COLS]
    y = df["will_miss_sla"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    pos_weight = (y_train == 0).sum() / (y_train == 1).sum()

    model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.75,
        scale_pos_weight=pos_weight,
        eval_metric="auc",
        early_stopping_rounds=30,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)
    auc    = roc_auc_score(y_test, y_prob)

    print("\n" + "=" * 60)
    print("  ShipGuard AI — Model Training Complete (Kaggle Data)")
    print("=" * 60)
    print(f"  Dataset size  : {len(df):,} samples  (real Kaggle data)")
    print(f"  Delay rate    : {y.mean():.1%}")
    print(f"  ROC-AUC Score : {auc:.4f}")
    print(f"  pos_weight    : {pos_weight:.2f}")
    print("=" * 60)
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["On Time", "Delayed"]))

    
    print("Building SHAP explainer …")
    explainer = shap.TreeExplainer(model)

    importances = dict(zip(FEATURE_COLS, model.feature_importances_))
    top_features = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:10]
    print("\nTop 10 Important Features:")
    for i, (feat, imp) in enumerate(top_features, 1):
        print(f"  {i:2d}. {feat:<30s} {imp:.4f}")

    
    os.makedirs(save_path, exist_ok=True)
    bundle = {
        "model":               model,
        "explainer":           explainer,
        "features":            FEATURE_COLS,
        "threshold":           0.5,
        "auc_score":           auc,
        "feature_importances": importances,
        "training_date":       pd.Timestamp.now().isoformat(),
        "training_samples":    len(df),
        "delay_rate":          float(y.mean()),
        "data_source":         "Kaggle — prachi13/customer-analytics",
    }
    save_file = os.path.join(save_path, "shipguard_v1.pkl")
    joblib.dump(bundle, save_file)
    print(f"\nModel saved to: {save_file}")
    print(f"Bundle size   : {os.path.getsize(save_file) / 1024 / 1024:.1f} MB")

    return model, explainer, auc


if __name__ == "__main__":
    train_model()
