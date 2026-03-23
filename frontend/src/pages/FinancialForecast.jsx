import { useState, useEffect } from 'react';
import { fetchFinancialForecast } from '../api';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingDown, AlertTriangle, ShieldCheck, IndianRupee,
  Truck, ArrowUpRight, ArrowDownRight, Package,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────
function fmt(n) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

const RISK_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981' };
const PRIORITY_BG = {
  'P5 · Critical': '#fee2e2', 'P4 · High': '#fef3c7',
  'P3 · Medium': '#dbeafe',  'P2 · Low': '#d1fae5', 'P1 · Minimal': '#f3f4f6',
};
const PRIORITY_FG = {
  'P5 · Critical': '#dc2626', 'P4 · High': '#d97706',
  'P3 · Medium': '#2563eb',   'P2 · Low': '#059669', 'P1 · Minimal': '#6b7280',
};

// ── Custom tooltip for area chart ────────────────────────────
function AreaTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '12px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    }}>
      <p style={{ fontWeight: 700, marginBottom: 8, color: '#111827' }}>{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 4 }}>
          <span style={{ color: p.color, fontSize: 12 }}>{p.name}</span>
          <span style={{ fontWeight: 600, fontSize: 12 }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload[0] && payload[1] && (
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6 }}>
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
            Saved: {fmt(payload[0].value - payload[1].value)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Custom tooltip for bar chart ─────────────────────────────
function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ fontSize: 12, color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

export default function FinancialForecast() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetchFinancialForecast()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="loading-spinner"><div className="spinner"></div></div>
  );
  if (error) return (
    <div className="loading-spinner" style={{ color: '#ef4444' }}>Failed to load: {error}</div>
  );
  if (!data) return null;

  const { summary, forecast_daily, carrier_breakdown, priority_breakdown, top_at_risk } = data;

  // Show every 3rd day label to avoid crowding
  const forecastTicks = forecast_daily
    .filter((_, i) => i % 3 === 0)
    .map(d => d.date);

  return (
    <div className="fade-in">
      {/* ── Page Header ── */}
      <div className="page-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IndianRupee size={24} style={{ color: 'var(--accent-blue)' }} />
          Financial Loss Forecasting
        </h2>
        <p>SLA penalty exposure · 30-day projected losses · Intervention savings</p>
      </div>

      {/* ── KPI Cards ── */}
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="stat-card risk-high">
          <div className="label">Current Exposure</div>
          <div className="value" style={{ fontSize: 22 }}>{fmt(summary.total_current_exposure)}</div>
          <div className="sub">SLA penalty risk in active fleet</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid #f59e0b' }}>
          <div className="label">30-Day Gross Risk</div>
          <div className="value" style={{ fontSize: 22, color: '#d97706' }}>
            {fmt(summary.projected_30d_exposure)}
          </div>
          <div className="sub">Without any interventions</div>
        </div>

        <div className="stat-card risk-low">
          <div className="label">Projected Savings</div>
          <div className="value" style={{ fontSize: 22 }}>{fmt(summary.projected_30d_savings)}</div>
          <div className="sub">
            <ArrowDownRight size={12} style={{ display: 'inline' }} />
            {summary.intervention_effectiveness_pct}% intervention effectiveness
          </div>
        </div>

        <div className="stat-card accent">
          <div className="label">Net 30-Day Loss</div>
          <div className="value" style={{ fontSize: 22 }}>{fmt(summary.net_30d_loss)}</div>
          <div className="sub">After applying interventions</div>
        </div>

        <div className="stat-card">
          <div className="label">High-Risk Shipments</div>
          <div className="value" style={{ color: '#ef4444' }}>{summary.high_risk_shipments}</div>
          <div className="sub">of {summary.total_shipments} total in fleet</div>
        </div>

        <div className="stat-card">
          <div className="label">Avg Exposure / Shipment</div>
          <div className="value" style={{ fontSize: 22 }}>{fmt(summary.avg_exposure_per_shipment)}</div>
          <div className="sub">Expected penalty per shipment</div>
        </div>
      </div>

      {/* ── 30-Day Forecast Area Chart ── */}
      <div style={{
        background: '#fff', borderRadius: 16, padding: '24px 28px',
        border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
              30-Day Loss Projection
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280' }}>
              Daily SLA penalty exposure — with vs without proactive interventions
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: '#fca5a5', display: 'inline-block' }} />
              Without interventions
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: '#6ee7b7', display: 'inline-block' }} />
              With interventions
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={forecast_daily} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              ticks={forecastTicks}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={v => fmt(v)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false} tickLine={false} width={70}
            />
            <Tooltip content={<AreaTooltip />} />
            <Area
              type="monotone" dataKey="without_intervention"
              name="Without interventions"
              stroke="#ef4444" strokeWidth={2}
              fill="url(#gradRed)"
            />
            <Area
              type="monotone" dataKey="with_intervention"
              name="With interventions"
              stroke="#10b981" strokeWidth={2}
              fill="url(#gradGreen)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Two-column: Carrier + Priority charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* Carrier Exposure */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px 24px',
          border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Truck size={18} color="#2563eb" />
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Penalty Exposure by Carrier</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={carrier_breakdown}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number" tickFormatter={v => fmt(v)}
                tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              />
              <YAxis
                type="category" dataKey="carrier"
                tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={80}
              />
              <Tooltip content={<BarTooltip />} />
              <Bar dataKey="exposure" name="Exposure" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Exposure */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px 24px',
          border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={18} color="#f59e0b" />
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Exposure by Priority Class</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={priority_breakdown}
              margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="priority"
                tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={v => fmt(v)}
                tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={60}
              />
              <Tooltip content={<BarTooltip />} />
              <Bar dataKey="exposure" name="Exposure" radius={[4, 4, 0, 0]}>
                {priority_breakdown.map((entry, i) => (
                  <rect key={i} fill={PRIORITY_FG[entry.priority] || '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Priority legend pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {priority_breakdown.map(p => (
              <span key={p.priority} style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: PRIORITY_BG[p.priority] || '#f3f4f6',
                color: PRIORITY_FG[p.priority] || '#6b7280',
              }}>
                {p.priority} · {fmt(p.exposure)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Top At-Risk Shipments Table ── */}
      <div style={{
        background: '#fff', borderRadius: 16, padding: '20px 28px',
        border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Package size={18} color="#7c3aed" />
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Top 10 Shipments by Penalty Exposure</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['Shipment', 'Route', 'Carrier', 'Priority', 'Risk', 'SLA Penalty', 'Expected Loss', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top_at_risk.map((s, i) => (
                <tr key={s.shipment_id} style={{
                  borderBottom: '1px solid #f9fafb',
                  background: i % 2 === 0 ? '#fff' : '#fafafa',
                }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>
                    {s.shipment_id}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#374151' }}>
                    {s.origin} → {s.dest}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.carrier}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                      background: s.priority >= 4 ? '#fee2e2' : s.priority === 3 ? '#dbeafe' : '#d1fae5',
                      color: s.priority >= 4 ? '#dc2626' : s.priority === 3 ? '#2563eb' : '#059669',
                    }}>
                      P{s.priority}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      background: `${RISK_COLORS[s.risk_level]}20`,
                      color: RISK_COLORS[s.risk_level],
                    }}>
                      {s.risk_score}% · {s.risk_level}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                    {fmt(s.sla_penalty)}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#dc2626' }}>
                    {fmt(s.expected_loss)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 8,
                      background: '#f1f5f9', color: '#475569',
                    }}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 10,
          background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
          border: '1px solid #bfdbfe',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} color="#2563eb" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
              Intervention potential: Save {fmt(summary.projected_30d_savings)} over 30 days
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Applying interventions to HIGH-risk shipments reduces losses by{' '}
            <strong style={{ color: '#059669' }}>{summary.intervention_effectiveness_pct}%</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
