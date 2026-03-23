"""
ShipGuard AI — Model Training Entry Point
Uses real Kaggle E-Commerce Shipping Dataset (prachi13/customer-analytics).

Usage:
    cd backend
    python train_model.py

Requirements:
    pip install kaggle
    
    
"""

import os
import sys
import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, roc_auc_score,
    precision_score, recall_score, f1_score, average_precision_score,
)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from data.kaggle_loader import FEATURE_COLS, load_kaggle_training_data


def train_and_save():
    print("=" * 60)
    print("  ShipGuard AI — Model Training  (Real Kaggle Data)")
    print("=" * 60)

    
    print("\n[1/5] Loading Kaggle E-Commerce Shipping Dataset …")
    df = load_kaggle_training_data()
    delay_rate = df["will_miss_sla"].mean()
    print(f"  Samples: {len(df):,}  |  Delay rate: {delay_rate:.1%}")

    X = df[FEATURE_COLS]
    y = df["will_miss_sla"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
    print(f"  Class balance → pos_weight: {pos_weight:.2f}")

    
    print("\n[2/5] Training XGBoost model …")
    model = xgb.XGBClassifier(
        n_estimators=800,
        max_depth=6,
        learning_rate=0.02,
        subsample=0.8,
        colsample_bytree=0.75,
        gamma=0.05,
        reg_alpha=0.1,
        reg_lambda=1.5,
        min_child_weight=5,
        scale_pos_weight=pos_weight,
        eval_metric="aucpr",
        early_stopping_rounds=50,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=100,
    )

    
    print("\n[3/5] Finding optimal classification threshold …")
    y_prob_val = model.predict_proba(X_test)[:, 1]
    best_f1, best_threshold = 0.0, 0.5
    for thr in np.arange(0.25, 0.75, 0.01):
        preds = (y_prob_val >= thr).astype(int)
        f = f1_score(y_test, preds, zero_division=0)
        if f > best_f1:
            best_f1, best_threshold = f, round(float(thr), 2)
    print(f"  Best threshold: {best_threshold:.2f}  |  F1: {best_f1:.4f}")

    
    print("\n[4/5] Evaluating model …")
    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= best_threshold).astype(int)
    auc    = roc_auc_score(y_test, y_prob)
    aucpr  = average_precision_score(y_test, y_prob)
    prec   = precision_score(y_test, y_pred, zero_division=0)
    rec    = recall_score(y_test, y_pred, zero_division=0)
    f1     = f1_score(y_test, y_pred, zero_division=0)

    print(f"\n  ROC-AUC   : {auc:.4f}")
    print(f"  PR-AUC    : {aucpr:.4f}")
    print(f"  Precision : {prec:.4f}  |  Recall: {rec:.4f}  |  F1: {f1:.4f}")
    print(f"  Threshold : {best_threshold}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["On Time", "Delayed"]))

    importances = dict(zip(FEATURE_COLS, model.feature_importances_))
    top = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:10]
    print("Top 10 Important Features:")
    for i, (feat, imp) in enumerate(top, 1):
        print(f"  {i:2d}. {feat:<32s} {imp:.4f}")

    
    print("\n[5/5] Saving model bundle …")
    os.makedirs("trained_models", exist_ok=True)
    bundle = {
        "model":               model,
        "explainer":           None,   
        "features":            FEATURE_COLS,
        "threshold":           best_threshold,
        "auc_score":           auc,
        "pr_auc":              aucpr,
        "precision":           prec,
        "recall":              rec,
        "f1_score":            f1,
        "feature_importances": importances,
        "training_samples":    len(df),
        "delay_rate":          float(delay_rate),
        "data_source":         "Kaggle — prachi13/customer-analytics",
    }

    save_path = "trained_models/shipguard_v1.pkl"
    joblib.dump(bundle, save_path)
    size_mb = os.path.getsize(save_path) / 1024 / 1024
    print(f"  Saved → {save_path}  ({size_mb:.1f} MB)")

    df[FEATURE_COLS + ["will_miss_sla"]].to_csv("data/training_data.csv", index=False)
    print(f"  Training data → data/training_data.csv")

    print("\n" + "=" * 60)
    print(f"  TRAINING COMPLETE  |  AUC: {auc:.4f}  |  PR-AUC: {aucpr:.4f}")
    print(f"  Data source: Kaggle E-Commerce Shipping Dataset")
    print(f"  Samples: {len(df):,}  |  Features: {len(FEATURE_COLS)}")
    print("=" * 60)


if __name__ == "__main__":
    train_and_save()
