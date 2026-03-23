
import re
import math
import hashlib
import logging
from functools import lru_cache
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)





DISRUPTION_LABELS: List[str] = [
    "port strike or labor dispute",
    "natural disaster affecting transport",
    "supply chain or logistics disruption",
    "customs or border closure",
    "infrastructure damage or road accident",
    "political unrest or civil disturbance",
    "fuel or energy shortage affecting freight",
    "pandemic or health crisis affecting movement",
    "normal business or unrelated news",
]


LABEL_SEVERITY: Dict[str, float] = {
    "port strike or labor dispute":               1.00,
    "natural disaster affecting transport":        0.95,
    "supply chain or logistics disruption":        0.90,
    "customs or border closure":                   0.85,
    "infrastructure damage or road accident":      0.80,
    "political unrest or civil disturbance":       0.65,
    "fuel or energy shortage affecting freight":   0.70,
    "pandemic or health crisis affecting movement":0.75,
    "normal business or unrelated news":           0.00,
}


HIGH_IMPACT_LABELS = {
    "port strike or labor dispute",
    "natural disaster affecting transport",
    "customs or border closure",
}





_zs_pipeline = None   
_ner_pipeline = None  


def _load_zs_pipeline():
    global _zs_pipeline
    if _zs_pipeline is not None:
        return _zs_pipeline
    try:
        from transformers import pipeline as hf_pipeline
        logger.info("[NLP] Loading zero-shot model …")
        _zs_pipeline = hf_pipeline(
            "zero-shot-classification",
            model="cross-encoder/nli-distilroberta-base",
            device=-1,
            multi_label=True,          
        )
        logger.info("[NLP] Zero-shot model ready.")
    except Exception as e:
        logger.warning(f"[NLP] Model unavailable ({e}). Using TF-IDF fallback.")
        _zs_pipeline = "tfidf"
    return _zs_pipeline


def _load_ner_pipeline():
    """Optional NER pipeline — loads only if transformers is available."""
    global _ner_pipeline
    if _ner_pipeline is not None:
        return _ner_pipeline
    try:
        from transformers import pipeline as hf_pipeline
        logger.info("[NLP] Loading NER model …")
        _ner_pipeline = hf_pipeline(
            "ner",
            model="dslim/bert-base-NER",
            aggregation_strategy="simple",
            device=-1,
        )
        logger.info("[NLP] NER model ready.")
    except Exception:
        _ner_pipeline = "unavailable"
    return _ner_pipeline






_TFIDF_CORPUS = [
    "port strike workers walkout labor union protest shutdown blockade",
    "cyclone hurricane flood earthquake tsunami wildfire disaster storm",
    "supply chain cargo delay shipment hold logistics stuck warehouse backlog",
    "customs border closed suspended seized regulatory clearance documentation",
    "bridge collapse road highway accident infrastructure rail derailment",
    "riot civil unrest political demonstration coup curfew violence",
    "fuel shortage diesel energy crisis petroleum transport grounded",
    "pandemic lockdown quarantine disease outbreak health restriction",
]


def _tfidf_score(text: str) -> Dict:
    def tokenize(s): return re.findall(r"[a-z]+", s.lower())
    def term_freq(tokens):
        freq: Dict[str, int] = {}
        for t in tokens:
            freq[t] = freq.get(t, 0) + 1
        total = len(tokens) or 1
        return {t: c / total for t, c in freq.items()}

    q_tokens = tokenize(text)
    if not q_tokens:
        return {"label": "normal business or unrelated news", "score": 0.0}

    q_tf = term_freq(q_tokens)
    vocab = set(q_tokens)
    for doc in _TFIDF_CORPUS:
        vocab.update(tokenize(doc))

    N = len(_TFIDF_CORPUS) + 1
    idf = {t: math.log(N / (1 + sum(1 for d in _TFIDF_CORPUS if t in tokenize(d))))
           for t in vocab}

    def vec(tf_d):
        return {t: tf_d.get(t, 0) * idf[t] for t in vocab}

    def cosine(a, b):
        dot = sum(a[t] * b[t] for t in vocab)
        na  = math.sqrt(sum(v * v for v in a.values())) or 1e-9
        nb  = math.sqrt(sum(v * v for v in b.values())) or 1e-9
        return dot / (na * nb)

    q_vec = vec(q_tf)
    best, best_label = 0.0, "normal business or unrelated news"
    for i, doc in enumerate(_TFIDF_CORPUS):
        sim = cosine(q_vec, vec(term_freq(tokenize(doc))))
        if sim > best:
            best, best_label = sim, DISRUPTION_LABELS[i]
    return {"label": best_label, "score": min(best * 2.8, 1.0)}






def extract_entities(titles: List[str]) -> Dict[str, List[str]]:
    """
    Extract location (LOC) and organisation (ORG) entities from headlines.
    Uses NER model when available; falls back to capitalised-noun heuristic.

    Returns  {"locations": [...], "organizations": [...]}
    """
    pipe = _load_ner_pipeline()
    locations, organizations = [], []

    if pipe != "unavailable":
        try:
            combined = " | ".join(t for t in titles if t)
            entities = pipe(combined[:512])   
            for ent in entities:
                word = ent.get("word", "").replace("#
                if not word:
                    continue
                if ent["entity_group"] in ("LOC", "GPE"):
                    if word not in locations:
                        locations.append(word)
                elif ent["entity_group"] == "ORG":
                    if word not in organizations:
                        organizations.append(word)
            return {"locations": locations[:10], "organizations": organizations[:10]}
        except Exception:
            pass

    
    cap_re = re.compile(r"\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b")
    STOP   = {"The", "This", "That", "When", "After", "Over", "New", "Report"}
    for title in titles:
        for match in cap_re.findall(title):
            if match not in STOP and len(match) > 3:
                locations.append(match)
    return {"locations": list(dict.fromkeys(locations))[:10], "organizations": []}






_URGENCY_RE = re.compile(
    r"\b(breaking|urgent|emergency|imminent|immediate|critical|alert|crisis"
    r"|warning|red alert|SOS|major|severe|extreme|catastrophic|ongoing|escalat)\b",
    re.IGNORECASE,
)


def urgency_boost(title: str) -> float:
    """Returns 0.0–0.30 additive boost based on urgency language in headline."""
    hits = len(_URGENCY_RE.findall(title))
    return min(hits * 0.12, 0.30)






def _jaccard(a: str, b: str) -> float:
    sa = set(re.findall(r"[a-z]+", a.lower()))
    sb = set(re.findall(r"[a-z]+", b.lower()))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def deduplicate_articles(articles: List[Dict], threshold: float = 0.65) -> List[Dict]:
    """
    Remove near-duplicate articles (same event covered by multiple outlets).
    Keeps the first occurrence. Threshold 0.65 = 65% word overlap → duplicate.
    """
    unique, seen_titles = [], []
    for art in articles:
        title = (art.get("title") or "").strip()
        if any(_jaccard(title, t) >= threshold for t in seen_titles):
            continue
        unique.append(art)
        seen_titles.append(title)
    return unique






def recency_weight(seendate_str: str) -> float:
    """
    GDelt `seendate` format: "20240315T120000Z"
    Returns weight:  2.0 if < 6 h old  |  1.5 if < 24 h  |  1.0 otherwise
    """
    try:
        dt = datetime.strptime(seendate_str, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        age_h = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        if age_h < 6:   return 2.0
        if age_h < 24:  return 1.5
    except Exception:
        pass
    return 1.0






def route_relevance(title: str, route_countries: List[str]) -> float:
    """
    Returns 1.0–1.5 multiplier.
    If the article headline explicitly mentions one of the shipment's route
    countries, the disruption is more likely to affect this specific shipment.
    """
    title_lower = title.lower()
    for country in route_countries:
        if country.lower() in title_lower:
            return 1.50
    return 1.00






@lru_cache(maxsize=512)
def _cached_classify(title: str) -> Tuple[str, float]:
    """Cache classification result by title text (avoids re-inference)."""
    pipe = _load_zs_pipeline()
    if pipe == "tfidf":
        r = _tfidf_score(title)
        return r["label"], r["score"]
    try:
        out    = pipe(title, DISRUPTION_LABELS, truncation=True, max_length=256)
        
        for label, score in zip(out["labels"], out["scores"]):
            if label != "normal business or unrelated news":
                return label, float(score)
        return out["labels"][0], float(out["scores"][0])
    except Exception as e:
        logger.warning(f"[NLP] Inference error: {e}")
        r = _tfidf_score(title)
        return r["label"], r["score"]






def _trend_delta(article_scores: List[Tuple[float, float, str]]) -> float:
    """
    article_scores: list of (weighted_score, age_hours, title)
    Returns delta: positive = disruption intensifying, negative = calming.
    Compares mean score of articles < 24 h vs 24–72 h.
    """
    recent = [s for s, age, _ in article_scores if age < 24]
    older  = [s for s, age, _ in article_scores if 24 <= age < 72]
    if not recent or not older:
        return 0.0
    return round((sum(recent) / len(recent)) - (sum(older) / len(older)), 3)






def _batch_classify(titles: List[str]) -> List[Tuple[str, float]]:
    """
    Send ALL titles to the model in a single call.
    Falls back to per-title TF-IDF if model unavailable.
    Results are also stored in the LRU cache.
    """
    if not titles:
        return []

    pipe = _load_zs_pipeline()

    if pipe == "tfidf":
        results = []
        for t in titles:
            r = _tfidf_score(t)
            results.append((r["label"], r["score"]))
        return results

    
    cached, uncached_idx, uncached_titles = {}, [], []
    for i, t in enumerate(titles):
        key = hashlib.md5(t.encode()).hexdigest()
        if _cached_classify.cache_info().currsize > 0:
            try:
                label, conf = _cached_classify(t)
                cached[i] = (label, conf)
                continue
            except Exception:
                pass
        uncached_idx.append(i)
        uncached_titles.append(t)

    
    if uncached_titles:
        try:
            batch_out = pipe(
                uncached_titles,
                DISRUPTION_LABELS,
                truncation=True,
                max_length=256,
                batch_size=8,
            )
            if isinstance(batch_out, dict):   
                batch_out = [batch_out]

            for i, (idx, out) in enumerate(zip(uncached_idx, batch_out)):
                
                label, conf = out["labels"][0], float(out["scores"][0])
                for lbl, sc in zip(out["labels"], out["scores"]):
                    if lbl != "normal business or unrelated news":
                        label, conf = lbl, float(sc)
                        break
                cached[idx] = (label, conf)
                _cached_classify.__wrapped__(uncached_titles[i])  

        except Exception as e:
            logger.warning(f"[NLP] Batch inference error: {e} — falling back per-title")
            for i, (idx, t) in enumerate(zip(uncached_idx, uncached_titles)):
                r = _tfidf_score(t)
                cached[idx] = (r["label"], r["score"])

    return [cached.get(i, ("normal business or unrelated news", 0.0))
            for i in range(len(titles))]






def classify_article(title: str, snippet: str = "") -> Dict:
    """
    Classify a single article. Returns full classification dict.
    Useful for individual article analysis.
    """
    text = f"{title} {snippet}".strip() or title
    if len(text) < 4:
        return {"label": "normal business or unrelated news",
                "confidence": 1.0, "severity": 0.0, "is_disruption": False,
                "urgency_boost": 0.0}

    label, conf = _cached_classify(text)
    boost = urgency_boost(text)
    adj_conf = min(conf + boost, 1.0)
    severity = LABEL_SEVERITY.get(label, 0.0)

    
    is_disruption = severity > 0.0 and (
        adj_conf > 0.45 or label in HIGH_IMPACT_LABELS
    )
    return {
        "label":         label,
        "confidence":    round(adj_conf, 3),
        "severity":      severity,
        "is_disruption": is_disruption,
        "urgency_boost": round(boost, 3),
    }


def analyze_news_batch(
    articles: List[Dict],
    route_countries: Optional[List[str]] = None,
) -> Dict:
    """
    Full NLP pipeline over a list of GDelt article dicts.

    Enhancements vs v1:
      - Deduplication before scoring
      - True batch inference (single model call)
      - Recency × route-relevance × urgency weighting
      - Named-entity extraction (affected locations / organisations)
      - Trend delta (disruption intensifying or calming?)

    Returns:
    {
      "disruption_score":   0–100,
      "articles_analyzed":  int,
      "articles_after_dedup": int,
      "disruption_count":   int,
      "top_category":       str,
      "top_category_count": int,
      "trend_delta":        float,   
      "affected_locations": [str],
      "affected_orgs":      [str],
      "article_results":    [{title, category, confidence, severity, weight}],
      "method":             "zero-shot" | "tfidf",
    }
    """
    route_countries = route_countries or []

    
    if not articles:
        return {
            "disruption_score":     0.0,
            "articles_analyzed":    0,
            "articles_after_dedup": 0,
            "disruption_count":     0,
            "top_category":         "normal business or unrelated news",
            "top_category_count":   0,
            "trend_delta":          0.0,
            "affected_locations":   [],
            "affected_orgs":        [],
            "article_results":      [],
            "method":               "none",
        }

    
    deduped = deduplicate_articles(articles)

    
    titles    = [(a.get("title") or "").strip() for a in deduped]
    seendates = [a.get("seendate", "") for a in deduped]

    
    pipe   = _load_zs_pipeline()
    method = "tfidf" if pipe == "tfidf" else "zero-shot"

    classifications = _batch_classify([t for t in titles if t])

    
    results           = []
    weighted_scores   = []
    article_score_age = []   
    label_counts: Dict[str, int] = {}
    disruption_cnt = 0

    cls_idx = 0
    for i, title in enumerate(titles):
        seendate = seendates[i]
        if not title:
            continue

        label, conf = classifications[cls_idx]
        cls_idx += 1

        severity = LABEL_SEVERITY.get(label, 0.0)
        boost    = urgency_boost(title)
        adj_conf = min(conf + boost, 1.0)

        is_disruption = severity > 0.0 and (
            adj_conf > 0.45 or label in HIGH_IMPACT_LABELS
        )

        
        r_weight   = recency_weight(seendate)
        rv_mult    = route_relevance(title, route_countries)
        raw_score  = adj_conf * severity
        final_w    = raw_score * r_weight * rv_mult

        
        try:
            dt      = datetime.strptime(seendate, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            age_hrs = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        except Exception:
            age_hrs = 48.0

        if is_disruption:
            disruption_cnt += 1
            label_counts[label] = label_counts.get(label, 0) + 1
            weighted_scores.append(final_w)
            article_score_age.append((raw_score, age_hrs, title))

        results.append({
            "title":            title,
            "category":         label,
            "confidence":       round(adj_conf, 3),
            "severity":         severity,
            "urgency_boost":    round(boost, 3),
            "recency_weight":   r_weight,
            "route_relevance":  rv_mult,
            "is_disruption":    is_disruption,
            "seendate":         seendate,
        })

    
    if weighted_scores:
        mean_w           = sum(weighted_scores) / len(weighted_scores)
        density_factor   = min(1 + 0.05 * disruption_cnt, 1.5)  
        raw_final        = mean_w * density_factor * 100
        disruption_score = round(min(raw_final * 1.6, 100.0), 1)
    else:
        disruption_score = 0.0

    
    top_category       = (max(label_counts, key=label_counts.get)
                          if label_counts else "normal business or unrelated news")
    top_category_count = label_counts.get(top_category, 0)
    trend              = _trend_delta(article_score_age)

    
    disruptive_titles = [r["title"] for r in results if r["is_disruption"]]
    entities          = extract_entities(disruptive_titles[:10])

    return {
        "disruption_score":     disruption_score,
        "articles_analyzed":    len(articles),
        "articles_after_dedup": len(deduped),
        "disruption_count":     disruption_cnt,
        "top_category":         top_category,
        "top_category_count":   top_category_count,
        "trend_delta":          trend,
        "affected_locations":   entities["locations"],
        "affected_orgs":        entities["organizations"],
        "article_results":      results,
        "method":               method,
    }
