"""
Kaggle E-Commerce Shipping Dataset Loader

Downloads and preprocesses the real Kaggle dataset for model training.
Dataset : E-Commerce Shipping Dataset (prachi13/customer-analytics)
Source  : https://www.kaggle.com/datasets/prachi13/customer-analytics
Target  : Reached.on.Time_Y.N  →  1 = delayed, 0 = on time

Setup (one-time):
    pip install kaggle
    
    
"""

import os
import sys
import pandas as pd
import numpy as np

DATASET_SLUG = "prachi13/customer-analytics"
DATA_FILE    = "Train.csv"


_HERE       = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH  = os.path.join(_HERE, "kaggle_train.csv")


FEATURE_COLS = [
    
    "warehouse_block",       
    "mode_of_shipment",      
    "customer_care_calls",   
    "customer_rating",       
    "cost_of_product",       
    "prior_purchases",       
    "product_importance",    
    "discount_offered",      
    "weight_kg",             
    "gender",                
    
    "high_discount_flag",    
    "heavy_shipment_flag",   
    "is_sea_freight",        
    "is_air_freight",        
    "high_care_calls_flag",  
    "low_rating_flag",       
    "calls_x_low_rating",    
    "cost_weight_ratio",     
    "discount_x_importance", 
    "priority_score",        
    "calls_per_purchase",    
    "effective_discount",    
    "warehouse_risk_score",  
    "is_high_importance",    
    "is_low_importance",     
]




def _download(cache_path: str = CACHE_PATH) -> pd.DataFrame:
    """Download dataset from Kaggle API.

    Requires:
        pip install kaggle
        ~/.kaggle/kaggle.json  with {"username": "...", "key": "..."}
    """
    if os.path.exists(cache_path):
        print(f"[kaggle_loader] Using cached data: {cache_path}")
        return pd.read_csv(cache_path)

    print(f"[kaggle_loader] Downloading {DATASET_SLUG} from Kaggle …")
    try:
        import kaggle                                   
        import tempfile, shutil
        with tempfile.TemporaryDirectory() as tmp:
            kaggle.api.dataset_download_files(
                DATASET_SLUG, path=tmp, unzip=True
            )
            
            src = os.path.join(tmp, DATA_FILE)
            if not os.path.exists(src):
                csvs = [f for f in os.listdir(tmp) if f.endswith(".csv")]
                if not csvs:
                    raise FileNotFoundError(f"No CSV found after unzip in {tmp}")
                src = os.path.join(tmp, csvs[0])
            shutil.copy(src, cache_path)
        print(f"[kaggle_loader] Saved to {cache_path}")
        return pd.read_csv(cache_path)

    except ImportError:
        raise ImportError(
            "\nkaggle package not installed.\n"
            "  pip install kaggle\n"
            "Then place your API key at ~/.kaggle/kaggle.json\n"
            "(download from https://www.kaggle.com/settings → API → Create New Token)\n"
        )
    except Exception as exc:
        raise RuntimeError(
            f"\nFailed to download from Kaggle: {exc}\n\n"
            f"Manual fallback:\n"
            f"  1. Go to https://www.kaggle.com/datasets/{DATASET_SLUG}\n"
            f"  2. Download the zip and extract '{DATA_FILE}'\n"
            f"  3. Copy it to:  {cache_path}\n"
        )




def _preprocess(raw: pd.DataFrame) -> pd.DataFrame:
    """Encode + feature-engineer the raw Kaggle CSV into FEATURE_COLS + target."""
    df = raw.copy()

    
    df.rename(columns={
        "Warehouse_block":     "warehouse_block_raw",
        "Mode_of_Shipment":    "mode_raw",
        "Customer_care_calls": "customer_care_calls",
        "Customer_rating":     "customer_rating",
        "Cost_of_the_Product": "cost_of_product",
        "Prior_purchases":     "prior_purchases",
        "Product_importance":  "importance_raw",
        "Gender":              "gender_raw",
        "Discount_offered":    "discount_offered",
        "Weight_in_gms":       "weight_gms",
        "Reached.on.Time_Y.N": "will_miss_sla",
    }, inplace=True)

    
    df["warehouse_block"]    = df["warehouse_block_raw"].map(
                                   {"A": 0, "B": 1, "C": 2, "D": 3, "F": 4}
                               ).fillna(2).astype(int)
    df["mode_of_shipment"]   = df["mode_raw"].map(
                                   {"Flight": 0, "Road": 1, "Ship": 2}
                               ).fillna(1).astype(int)
    df["product_importance"] = df["importance_raw"].map(
                                   {"Low": 0, "Medium": 1, "High": 2}
                               ).fillna(1).astype(int)
    df["gender"]             = df["gender_raw"].map({"F": 0, "M": 1}).fillna(0).astype(int)

    
    df["weight_kg"] = df["weight_gms"] / 1000.0

    
    df["high_discount_flag"]    = (df["discount_offered"] > 35).astype(int)
    df["heavy_shipment_flag"]   = (df["weight_kg"] > 4.0).astype(int)
    df["is_sea_freight"]        = (df["mode_of_shipment"] == 2).astype(int)
    df["is_air_freight"]        = (df["mode_of_shipment"] == 0).astype(int)
    df["high_care_calls_flag"]  = (df["customer_care_calls"] >= 5).astype(int)
    df["low_rating_flag"]       = (df["customer_rating"] <= 2).astype(int)
    df["calls_x_low_rating"]    = df["customer_care_calls"] * df["low_rating_flag"]
    df["cost_weight_ratio"]     = df["cost_of_product"] / df["weight_kg"].clip(lower=0.1)
    df["discount_x_importance"] = df["discount_offered"] * df["product_importance"]
    df["priority_score"]        = df["product_importance"] * (6 - df["customer_rating"])
    df["calls_per_purchase"]    = df["customer_care_calls"] / df["prior_purchases"].clip(lower=1)
    df["effective_discount"]    = df["discount_offered"] / (df["cost_of_product"] / 100.0).clip(lower=0.1)
    df["warehouse_risk_score"]  = df["warehouse_block"].map(
                                      {0: 2, 1: 3, 2: 4, 3: 3, 4: 1}
                                  ).fillna(2).astype(float)
    df["is_high_importance"]    = (df["product_importance"] == 2).astype(int)
    df["is_low_importance"]     = (df["product_importance"] == 0).astype(int)

    return df




def load_kaggle_training_data(cache_path: str = CACHE_PATH) -> pd.DataFrame:
    """Full pipeline: download → preprocess → return ML-ready DataFrame."""
    raw = _download(cache_path)
    df  = _preprocess(raw)

    missing = [c for c in FEATURE_COLS + ["will_miss_sla"] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns after preprocessing: {missing}")

    print(f"[kaggle_loader] Dataset ready: {len(df):,} rows | "
          f"Delay rate: {df['will_miss_sla'].mean():.1%} | "
          f"Features: {len(FEATURE_COLS)}")
    return df


def compute_features(raw_dict: dict) -> dict:
    """
    Compute all 25 FEATURE_COLS from a raw shipment dict.

    Expected raw keys (from generate_demo_shipments / _make_features):
        warehouse_block, mode_of_shipment, customer_care_calls, customer_rating,
        cost_of_product, prior_purchases, product_importance, discount_offered,
        weight_kg, gender
    """
    d = dict(raw_dict)  

    wh  = d.get("warehouse_block", 2)
    mod = d.get("mode_of_shipment", 1)
    cal = d.get("customer_care_calls", 3)
    rat = d.get("customer_rating", 3)
    cos = d.get("cost_of_product", 150)
    pri = d.get("prior_purchases", 4)
    imp = d.get("product_importance", 1)
    dis = d.get("discount_offered", 10)
    wt  = d.get("weight_kg", 3.0)

    d["high_discount_flag"]    = int(dis > 35)
    d["heavy_shipment_flag"]   = int(wt > 4.0)
    d["is_sea_freight"]        = int(mod == 2)
    d["is_air_freight"]        = int(mod == 0)
    d["high_care_calls_flag"]  = int(cal >= 5)
    d["low_rating_flag"]       = int(rat <= 2)
    d["calls_x_low_rating"]    = cal * d["low_rating_flag"]
    d["cost_weight_ratio"]     = round(cos / max(wt, 0.1), 2)
    d["discount_x_importance"] = dis * imp
    d["priority_score"]        = imp * (6 - rat)
    d["calls_per_purchase"]    = round(cal / max(pri, 1), 3)
    d["effective_discount"]    = round(dis / max(cos / 100.0, 0.1), 2)
    wh_risk_map                = {0: 2, 1: 3, 2: 4, 3: 3, 4: 1}
    d["warehouse_risk_score"]  = wh_risk_map.get(wh, 2)
    d["is_high_importance"]    = int(imp == 2)
    d["is_low_importance"]     = int(imp == 0)

    return {k: d[k] for k in FEATURE_COLS}



if __name__ == "__main__":
    df = load_kaggle_training_data()
    print(df[FEATURE_COLS + ["will_miss_sla"]].head())
    print("\nFeature dtypes:")
    print(df[FEATURE_COLS].dtypes)
