import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchShipmentAnalysis, fetchOrderMap, approveIntervention } from "../api";
import RiskGauge from "../components/RiskGauge";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Brain, ArrowUpRight, ArrowDownRight, Ruler, Zap, Map as MapIcon,
  CheckCircle2, CircleDot, Clock, Circle, Package,
  Shuffle, RefreshCw, CheckCircle, Megaphone, Activity, ShieldCheck,
} from "lucide-react";

// ── Fix Leaflet default icon paths ──────────────────────────────
// Removed: Using custom divIcons instead to avoid 404s.

// ── Auto-fit map to route bounds ─────────────────────────────────
function MapAutoFit({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords?.length >= 2) {
      map.fitBounds(coords, { padding: [28, 28] });
    }
  }, [coords, map]);
  return null;
}

// ── Custom pin icon ───────────────────────────────────────────────
function makePin(color, label) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${color};
        border:2.5px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>
      ${label
        ? `<div style="background:#0f172a;border:1px solid #334155;border-radius:4px;
            padding:2px 6px;font-size:9px;font-weight:700;color:#e2e8f0;
            white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${label}</div>`
        : ""}
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
  });
}

// ── Checkpoint type → color ───────────────────────────────────────
const CP_COLOR = { origin: "#00CC66", hub: "#FFA500", destination: "#FF4444" };

// ── Intervention styles ───────────────────────────────────────────
const ACTION_STYLES = {
  REROUTE: { bg: "#FF6B35", cls: "reroute", icon: Shuffle },
  CARRIER_SWAP: { bg: "#FFD700", cls: "carrier-swap", icon: RefreshCw },
  CUSTOMS_PRECLR: { bg: "#A8FF3E", cls: "customs", icon: ShieldCheck },
  PRE_ALERT: { bg: "#00C9FF", cls: "pre-alert", icon: Megaphone },
  PRIORITY_UPLIFT: { bg: "#8B5CF6", cls: "priority", icon: Zap },
  MONITOR: { bg: "#64748B", cls: "monitor", icon: Activity },
};

// ── Helpers ───────────────────────────────────────────────────────
function fmtDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────────
export default function ShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState({});

  useEffect(() => {
    fetchShipmentAnalysis(id)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));

    // Fetch route/map data for the mini-map
    fetchOrderMap(id)
      .then(setMapData)
      .catch(() => { });
  }, [id]);

  const handleApprove = async (shipmentId, actionType) => {
    try {
      await approveIntervention(shipmentId, actionType);
      setApproved(prev => ({ ...prev, [actionType]: true }));
    } catch (err) {
      console.error("Approval failed:", err);
    }
  };

  if (loading)
    return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!data)
    return <div className="loading-spinner">Shipment not found</div>;

  const { shipment, risk, interventions, timeline, feature_groups } = data;

  // ── Route map data ──────────────────────────────────────────────
  const routeCoords = mapData?.route_coords ?? [];
  const checkpoints = mapData?.checkpoints ?? [];
  // Fallback center: midpoint of origin/destination
  const mapCenter = shipment.origin_lat
    ? [(shipment.origin_lat + (shipment.dest_lat ?? shipment.origin_lat)) / 2,
    (shipment.origin_lng + (shipment.dest_lng ?? shipment.origin_lng)) / 2]
    : [20.5, 78.9];

  return (
    <div className="fade-in" style={{ paddingBottom: "40px" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
        <button onClick={() => navigate("/")} className="btn btn-outline" style={{ padding: "8px 14px" }}>
          ← Back
        </button>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: "12px", margin: 0 }}>
            <span style={{ fontFamily: "'JetBrains Mono'", color: "var(--accent-blue)" }}>
              {shipment.shipment_id}
            </span>
            <span className={`risk-badge ${risk.risk_level.toLowerCase()}`}>{risk.risk_level}</span>
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            {shipment.origin_city} → {shipment.dest_city} · {shipment.carrier_name} · P{shipment.priority_level}
          </p>
        </div>
      </div>

      {/* ── Two-column grid (align-items:start prevents stretch/overlap) ── */}
      <div
        className="grid-2"
        style={{ alignItems: "start", gap: "20px" }}
      >

        {/* ══ LEFT COLUMN ══════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Risk Gauge */}
          <div className="glass-card" style={{ textAlign: "center" }}>
            <RiskGauge score={risk.risk_score} size={240} />
            <div style={{ display: "flex", justifyContent: "center", gap: "28px", marginTop: "12px" }}>
              {[
                ["Delay Predicted", `${risk.delay_hrs_predicted} hrs`, "var(--risk-high)"],
                ["Confidence", `${risk.confidence_pct}%`, "var(--accent-blue)"],
                ["Window", risk.prediction_window, "var(--accent-purple)"],
              ].map(([label, value, color]) => (
                <div key={label}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* SHAP Explanations */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Brain size={17} className="icon" /> AI Explanation — Why This Risk?
              </div>
            </div>
            {risk.all_shap_factors?.map((factor, i) => {
              const maxAbs = Math.max(...risk.all_shap_factors.map(f => Math.abs(f.shap_value)));
              const barW = (Math.abs(factor.shap_value) / maxAbs) * 100;
              const inc = factor.direction === "increasing";
              const col = inc ? "#FF4444" : "#00CC66";
              return (
                <div key={i} className="shap-bar">
                  <div className="shap-label" title={factor.description}>{factor.display_name}</div>
                  <div className="shap-bar-track">
                    <div
                      className="shap-bar-fill"
                      style={{ width: `${barW}%`, background: `${col}22`, borderLeft: `3px solid ${col}`, justifyContent: "space-between", paddingLeft: "8px" }}
                    >
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "'JetBrains Mono'" }}>
                        {factor.value}
                      </span>
                      <span style={{ paddingRight: "8px", display: "flex", alignItems: "center" }}>
                        {inc
                          ? <ArrowUpRight color={col} size={14} />
                          : <ArrowDownRight color={col} size={14} />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feature Breakdown */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Ruler size={17} className="icon" /> Feature Breakdown (25 Features)
              </div>
            </div>
            {feature_groups && Object.entries(feature_groups).map(([group, feats]) => (
              <div key={group} style={{ marginBottom: "14px" }}>
                <div style={{
                  fontSize: "11px", fontWeight: 600, color: "var(--accent-cyan)",
                  textTransform: "uppercase", letterSpacing: "1px",
                  marginBottom: "8px", paddingBottom: "5px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}>
                  {group}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 18px" }}>
                  {Object.entries(feats).map(([key, val]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {key.replace(/_/g, " ")}
                      </span>
                      <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono'", fontWeight: 500 }}>
                        {typeof val === "number" ? val.toFixed(1) : val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ RIGHT COLUMN ═════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ── Route Map ──────────────────────────────────────── */}
          <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Map header */}
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                <MapIcon size={17} className="icon" /> Live Route Map
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {shipment.origin_city} → {shipment.dest_city}
              </span>
            </div>

            {/* Leaflet map */}
            <div style={{ height: "260px", position: "relative" }}>
              {routeCoords.length >= 2 ? (
                <MapContainer
                  center={mapCenter}
                  zoom={4}
                  style={{ height: "100%", width: "100%" }}
                  zoomControl={false}
                  scrollWheelZoom={false}
                  dragging={false}
                  doubleClickZoom={false}
                  attributionControl={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <MapAutoFit coords={routeCoords} />

                  {/* Dashed route line */}
                  <Polyline
                    positions={routeCoords}
                    color="#3B82F6"
                    weight={2.5}
                    opacity={0.9}
                    dashArray="8 5"
                  />

                  {/* Checkpoint markers */}
                  {checkpoints.map((cp, i) => (
                    <Marker
                      key={i}
                      position={[cp.lat, cp.lng]}
                      icon={makePin(CP_COLOR[cp.type] ?? "#888", cp.city)}
                    >
                      <Popup>
                        <strong>{cp.city}</strong><br />
                        {cp.type} · {cp.status}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              ) : (
                /* Fallback: simple 2-point display while map data loads */
                shipment.origin_lat ? (
                  <MapContainer
                    center={mapCenter}
                    zoom={5}
                    style={{ height: "100%", width: "100%" }}
                    zoomControl={false}
                    scrollWheelZoom={false}
                    dragging={false}
                    doubleClickZoom={false}
                    attributionControl={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Polyline
                      positions={[
                        [shipment.origin_lat, shipment.origin_lng],
                        [shipment.dest_lat, shipment.dest_lng],
                      ]}
                      color="#3B82F6"
                      weight={2.5}
                      dashArray="8 5"
                    />
                    <Marker
                      position={[shipment.origin_lat, shipment.origin_lng]}
                      icon={makePin("#00CC66", shipment.origin_city)}
                    />
                    <Marker
                      position={[shipment.dest_lat, shipment.dest_lng]}
                      icon={makePin("#FF4444", shipment.dest_city)}
                    />
                  </MapContainer>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                    Loading map…
                  </div>
                )
              )}
            </div>

            {/* Legend */}
            <div style={{
              padding: "8px 14px",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex", gap: "16px",
            }}>
              {[["#00CC66", "Origin"], ["#FFA500", "Hub"], ["#FF4444", "Destination"]].map(([color, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Interventions ─────────────────────────────────── */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Zap size={17} className="icon" /> AI-Recommended Interventions
              </div>
            </div>
            {interventions.map((intv, i) => {
              const style = ACTION_STYLES[intv.action] ?? ACTION_STYLES.MONITOR;
              const ActIcon = style.icon;
              return (
                <div key={i} className={`intervention-card ${style.cls}`}>
                  <div className="intervention-header">
                    <span
                      className="intervention-type"
                      style={{ background: `${style.bg}30`, color: style.bg, display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <ActIcon size={13} /> #{intv.rank} {intv.display_name}
                    </span>
                    {intv.sla_saved && <span className="sla-saved-badge">SLA SAVED</span>}
                  </div>
                  <p className="intervention-desc">{intv.description}</p>
                  <div className="intervention-footer">
                    <div className="intervention-meta">
                      <span>{intv.cost_display}</span>
                      <span>{(intv.confidence * 100).toFixed(0)}%</span>
                      {intv.lead_time_hrs > 0 && <span>{intv.lead_time_hrs}h lead</span>}
                      <span>ROI {intv.roi_display}</span>
                    </div>
                    {intv.action !== "MONITOR" && (
                      <button
                        className={`btn-approve ${approved[intv.action] ? "approved" : ""}`}
                        style={{ background: approved[intv.action] ? undefined : style.bg }}
                        onClick={() => handleApprove(shipment.shipment_id, intv.action)}
                        disabled={approved[intv.action]}
                      >
                        {approved[intv.action] ? "APPROVED" : "APPROVE & EXECUTE"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Journey Timeline ──────────────────────────────── */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle size={17} className="icon" /> Journey Timeline
              </div>
            </div>
            <div className="timeline-steps">
              {timeline.map((event, i) => {
                const isLast = i === timeline.length - 1;
                const icon =
                  event.status === "completed" ? <CheckCircle2 size={15} color="#00CC66" /> :
                    event.status === "current" ? <CircleDot size={15} color="#3B82F6" /> :
                      event.status === "deadline" ? <Clock size={15} color="#FFA500" /> :
                        <Circle size={15} color="#64748B" />;
                return (
                  <div key={i} className="timeline-step-wrap">
                    <div className={`timeline-step-node ${event.status}`}>
                      <div className={`timeline-step-dot ${event.status}`} />
                      <div className="timeline-step-status" style={{ transform: "translateX(-4px)" }}>{icon}</div>
                    </div>
                    {!isLast && (
                      <div className={`timeline-step-line ${timeline[i + 1]?.status === "upcoming" || timeline[i + 1]?.status === "deadline"
                        ? "dashed" : "solid"
                        }`} />
                    )}
                    <div className="timeline-step-label">
                      <div className="timeline-step-name">{event.event}</div>
                      <div className="timeline-step-location">{event.location}</div>
                      <div className="timeline-step-time">{fmtDate(event.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Product Information ────────────────────────────── */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Package size={17} className="icon" /> Product Information
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                ["Cost", `₹${data.features?.cost_of_product || "—"}`],
                ["Discount Offered", `${data.features?.discount_offered || 0}%`],
                ["Importance", data.features?.product_importance === 2 ? "High" : data.features?.product_importance === 1 ? "Medium" : "Low"],
                ["Customer Rating", `${data.features?.customer_rating || "—"}/5`],
                ["Prior Purchases", data.features?.prior_purchases || "—"],
                ["Care Calls", data.features?.customer_care_calls || "—"],
                ["Warehouse Block", data.features?.warehouse_block || "—"],
                ["Mode", data.features?.mode_of_shipment === 2 ? "Sea" : data.features?.mode_of_shipment === 1 ? "Road" : "Air"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 500, marginTop: "3px" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Shipment Details ──────────────────────────────── */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Package size={17} className="icon" /> Shipment Details
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                ["Weight", `${shipment.weight_kg} kg`],
                ["Priority", `P${shipment.priority_level}`],
                ["Status", shipment.status],
                ["Carrier", shipment.carrier_name],
                ["Countries", (shipment.route_countries || []).join(" → ") || "—"],
                ["SLA Deadline", fmtDate(shipment.sla_deadline)],
                ["Current ETA", fmtDate(shipment.current_eta)],
                ["Created", fmtDate(shipment.created_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 500, marginTop: "3px" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}