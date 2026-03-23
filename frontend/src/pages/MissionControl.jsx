import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDashboardSummary, approveIntervention } from "../api";
import RiskGauge from "../components/RiskGauge";
import {
  Shuffle,
  RefreshCw,
  Megaphone,
  LayoutList,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Truck,
  Package,
  Clock,
  Check,
  X,
  Loader2,
  PieChart,
} from "lucide-react";

const QUICK_ACTIONS = [
  {
    type: "REROUTE",
    label: "Reroute",
    icon: <Shuffle size={14} />,
    levels: ["HIGH"],
  },
  {
    type: "CARRIER_SWAP",
    label: "Carrier",
    icon: <RefreshCw size={14} />,
    levels: ["HIGH", "MEDIUM"],
  },
  {
    type: "PRE_ALERT",
    label: "Notify",
    icon: <Megaphone size={14} />,
    levels: ["HIGH", "MEDIUM"],
  },
];

export default function MissionControl() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [actionStates, setActionStates] = useState({});
  const navigate = useNavigate();

  async function handleQuickAction(e, shipmentId, actionType) {
    e.stopPropagation();
    const key = `${shipmentId}:${actionType}`;
    setActionStates((prev) => ({ ...prev, [key]: "loading" }));
    try {
      await approveIntervention(shipmentId, actionType);
      setActionStates((prev) => ({ ...prev, [key]: "done" }));
    } catch {
      setActionStates((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  useEffect(() => {
    fetchDashboardSummary()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
      </div>
    );
  if (!data)
    return (
      <div className="loading-spinner">
        Failed to load data. Is the backend running?
      </div>
    );

  const stats = data.stat_cards;
  const shipments =
    filter === "ALL"
      ? data.all_shipments
      : data.all_shipments.filter((s) => s.risk_level === filter);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Event Dashboard</h2>
        <p>
          Real-time Festival Intelligence — {stats.total_shipments} teams
          registered
        </p>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card accent">
          <div className="label">Total Teams</div>
          <div className="value">{stats.total_shipments}</div>
          <div className="sub">Active registrations</div>
        </div>
        <div
          className="stat-card risk-high"
          onClick={() => setFilter("HIGH")}
          style={{ cursor: "pointer" }}
        >
          <div
            className="label"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <ShieldAlert size={14} color="var(--risk-high)" /> Critical Ops
          </div>
          <div className="value">{stats.high_risk}</div>
          <div className="sub">Immediate attention needed</div>
        </div>
        <div
          className="stat-card risk-medium"
          onClick={() => setFilter("MEDIUM")}
          style={{ cursor: "pointer" }}
        >
          <div
            className="label"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <AlertTriangle size={14} color="var(--risk-medium)" /> Warning
          </div>
          <div className="value">{stats.medium_risk}</div>
          <div className="sub">Monitor closely</div>
        </div>
        <div
          className="stat-card risk-low"
          onClick={() => setFilter("LOW")}
          style={{ cursor: "pointer" }}
        >
          <div
            className="label"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <CheckCircle2 size={14} color="var(--risk-low)" /> Nominal
          </div>
          <div className="value">{stats.on_track}</div>
          <div className="sub">Proceeding as planned</div>
        </div>
        <div className="stat-card accent">
          <div className="label">System Hacks</div>
          <div className="value">{stats.interventions_today}</div>
          <div className="sub">{stats.sla_saved_today} breaches prevented</div>
        </div>
        <div className="stat-card accent">
          <div className="label">Prize Pool</div>
          <div className="value" style={{ fontSize: "24px" }}>
            ₹{(stats.cost_saved_today || 0).toLocaleString()}
          </div>
          <div className="sub">Distributed today</div>
        </div>
      </div>

      {/* Map + Table */}
      <div
        className="grid-sidebar"
        style={{ gridTemplateColumns: "1fr 360px" }}
      >
        {/* Shipment Table */}
        <div className="glass-card">
          <div className="card-header">
            <div
              className="card-title"
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <LayoutList size={18} className="icon" />
              Live Roster Overview
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  fontWeight: 400,
                }}
              >
                ({shipments.length} events)
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {["ALL", "HIGH", "MEDIUM", "LOW"].map((level) => (
                <button
                  key={level}
                  onClick={() => setFilter(level)}
                  className={`btn ${filter === level ? "btn-primary" : "btn-outline"}`}
                  style={{ padding: "6px 14px", fontSize: "11px" }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team ID</th>
                  <th>Event Location</th>
                  <th>Sponsor</th>
                  <th>Tier</th>
                  <th>Hack Score</th>
                  <th>Risk</th>
                  <th>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {shipments.slice(0, 20).map((s, i) => {
                  const riskColor = s.risk_color; // Define riskColor here
                  return (
                    <tr
                      key={s.shipment_id}
                      onClick={() => navigate(`/shipment/${s.shipment_id}`)}
                      style={{ animationDelay: `${i * 0.03}s` }}
                      className="fade-in"
                    >
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: "var(--bg-secondary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Package
                              size={18}
                              style={{ color: "var(--text-secondary)" }}
                            />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: 700,
                                fontFamily: "JetBrains Mono",
                              }}
                            >
                              {s.shipment_id}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {s.carrier_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {s.origin_city}
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "16px",
                            }}
                          >
                            →
                          </span>
                          {s.dest_city || s.city}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              className={`risk-badge ${s.risk_level.toLowerCase()}`}
                            >
                              {s.risk_level}
                            </span>
                            <span
                              className={`priority-badge p${s.priority_level}`}
                            >
                              P{s.priority_level}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="risk-score-bar" style={{ gap: "8px" }}>
                          <div
                            className="risk-bar-track"
                            style={{ width: "60px", flex: "none" }}
                          >
                            <div
                              className="risk-bar-fill"
                              style={{
                                width: `${s.risk_score}%`,
                                background: riskColor,
                              }}
                            />
                          </div>
                          <span className="risk-score-num">
                            {s.risk_score}%
                          </span>
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            flexWrap: "nowrap",
                          }}
                        >
                          {QUICK_ACTIONS.filter((a) =>
                            a.levels.includes(s.risk_level),
                          ).map((action) => {
                            const key = `${s.shipment_id}:${action.type}`;
                            const state = actionStates[key];
                            return (
                              <button
                                key={action.type}
                                onClick={(e) =>
                                  handleQuickAction(
                                    e,
                                    s.shipment_id,
                                    action.type,
                                  )
                                }
                                disabled={
                                  state === "loading" || state === "done"
                                }
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  border: `1px solid ${state === "done" ? "#00CC66" : state === "error" ? "#FF4444" : "var(--border-subtle)"}`,
                                  borderRadius: "6px",
                                  background:
                                    state === "done"
                                      ? "rgba(0,204,102,0.12)"
                                      : "var(--bg-primary)",
                                  color:
                                    state === "done"
                                      ? "#00CC66"
                                      : state === "error"
                                        ? "#FF4444"
                                        : "var(--text-secondary)",
                                  cursor:
                                    state === "loading" || state === "done"
                                      ? "default"
                                      : "pointer",
                                  whiteSpace: "nowrap",
                                  transition: "all 0.2s",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                                title={action.label}
                              >
                                {state === "loading" ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : state === "done" ? (
                                  <Check size={12} />
                                ) : state === "error" ? (
                                  <X size={12} />
                                ) : (
                                  action.icon
                                )}{" "}
                                {state === "done"
                                  ? "Done"
                                  : state === "error"
                                    ? "Err"
                                    : action.label}
                              </button>
                            );
                          })}
                          {s.risk_level === "LOW" && (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--text-muted)",
                              }}
                            >
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Quick Gauges */}
        <div>
          <div className="glass-card">
            <div
              className="card-title"
              style={{
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertTriangle size={18} className="icon" /> Critical Alerts
            </div>
            {data.top_risk_shipments.slice(0, 3).map((s) => (
              <div
                key={s.shipment_id}
                onClick={() => navigate(`/shipment/${s.shipment_id}`)}
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  marginBottom: "10px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: "var(--bg-card)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = s.risk_color)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "var(--border-subtle)")
                }
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono'",
                      fontWeight: 600,
                      color: s.risk_color,
                    }}
                  >
                    {s.shipment_id}
                  </span>
                  <span className={`risk-badge ${s.risk_level.toLowerCase()}`}>
                    {s.risk_score}%
                  </span>
                </div>
                <div
                  style={{ fontSize: "12px", color: "var(--text-secondary)" }}
                >
                  {s.origin_city} &rarr; {s.dest_city}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    marginTop: "4px",
                  }}
                >
                  {s.carrier_name} &middot; T{s.priority_level}
                </div>
              </div>
            ))}
          </div>

          {/* Risk Distribution */}
          <div className="glass-card">
            <div
              className="card-title"
              style={{
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <PieChart size={18} className="icon" /> Status Breakdown
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {[
                {
                  label: "CRITICAL",
                  count: stats.high_risk,
                  color: "var(--risk-high)",
                  total: stats.total_shipments,
                },
                {
                  label: "WARNING",
                  count: stats.medium_risk,
                  color: "var(--risk-medium)",
                  total: stats.total_shipments,
                },
                {
                  label: "NOMINAL",
                  count: stats.on_track,
                  color: "var(--risk-low)",
                  total: stats.total_shipments,
                },
              ].map((item) => (
                <div key={item.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      marginBottom: "6px",
                    }}
                  >
                    <span style={{ color: item.color, fontWeight: 600 }}>
                      {item.label}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {item.count} (
                      {Math.round((item.count / item.total) * 100)}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      background: "var(--bg-primary)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(item.count / item.total) * 100}%`,
                        background: item.color,
                        borderRadius: "4px",
                        transition: "width 1s ease",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prediction Window */}
        </div>
      </div>
    </div>
  );
}
