import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Package, AlertTriangle, CheckCircle2, Clock,
  ShieldAlert, TrendingUp, Map, RefreshCw, LogOut, Truck
} from 'lucide-react';
import { fetchAdminStats, fetchAdminUsers, fetchAdminOrders, fetchDelayedOrders, fetchShipments } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_COLOR = {
  PENDING: '#a0aab5',
  IN_TRANSIT: '#00f2fe',
  AT_HUB: '#b026ff',
  DELIVERED: '#00cc66',
  DELAYED: '#ff0844',
  CUSTOMS_HOLD: '#f5576c',
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [delayed, setDelayed] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const [s, u, o, d, fl] = await Promise.all([
        fetchAdminStats(),
        fetchAdminUsers(),
        fetchAdminOrders(),
        fetchDelayedOrders(),
        fetchShipments({ limit: 200 }),
      ]);
      setStats(s);
      setUsers(u);
      setOrders(o);
      setDelayed(d);
      setFleet(fl?.shipments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;

  const fleetHighRisk = fleet.filter(s => s.risk_level === 'HIGH').length;

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Admin Dashboard</h2>
          <p>Full system overview — users, orders & logistics</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-outline" onClick={load} style={{ padding: '10px 18px', fontSize: '13px' }}>
            <RefreshCw size={14} style={{ marginRight: '6px' }} /> Refresh
          </button>
          <button className="btn btn-outline" onClick={handleLogout} style={{ padding: '10px 18px', fontSize: '13px', borderColor: '#ff0844', color: '#ff0844' }}>
            <LogOut size={14} style={{ marginRight: '6px' }} /> Logout
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="stat-grid">
          <div className="stat-card accent">
            <div className="label"><Users size={13} style={{ marginRight: 5 }} />Total Users</div>
            <div className="value">{stats.total_users}</div>
            <div className="sub">Registered accounts</div>
          </div>
          <div className="stat-card accent">
            <div className="label"><Package size={13} style={{ marginRight: 5 }} />Total Orders</div>
            <div className="value">{stats.total_orders}</div>
            <div className="sub">{stats.in_transit_orders} in transit</div>
          </div>
          <div className="stat-card risk-high">
            <div className="label"><AlertTriangle size={13} style={{ marginRight: 5 }} />Delayed</div>
            <div className="value">{stats.delayed_orders}</div>
            <div className="sub">Need immediate action</div>
          </div>
          <div className="stat-card risk-low">
            <div className="label"><CheckCircle2 size={13} style={{ marginRight: 5 }} />Delivered</div>
            <div className="value">{stats.delivered_orders}</div>
            <div className="sub">Successfully completed</div>
          </div>
          <div className="stat-card risk-medium">
            <div className="label"><ShieldAlert size={13} style={{ marginRight: 5 }} />High Risk</div>
            <div className="value">{(stats.high_risk_orders || 0) + fleetHighRisk}</div>
            <div className="sub">Require monitoring</div>
          </div>
          <div className="stat-card accent">
            <div className="label"><Clock size={13} style={{ marginRight: 5 }} />Avg Ship Time</div>
            <div className="value" style={{ fontSize: '26px' }}>{stats.avg_shipping_hours}h</div>
            <div className="sub">Average hours to delivery</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {['overview', 'orders', 'fleet', 'users', 'delayed'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 20px', fontSize: '12px', textTransform: 'capitalize' }}
          >
            {t === 'delayed' ? `Delayed (${delayed.length})`
              : t === 'users'   ? `Users (${users.length})`
              : t === 'orders'  ? `DB Orders (${orders.length})`
              : t === 'fleet'   ? `Fleet Products (${fleet.length})`
              : 'Overview'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && stats && (
        <div className="grid-2">
          <div className="glass-card">
            <div className="card-title" style={{ marginBottom: 16 }}><TrendingUp size={16} className="icon" /> Order Status Breakdown</div>
            {[
              { label: 'In Transit',    count: stats.in_transit_orders, color: STATUS_COLOR.IN_TRANSIT },
              { label: 'Pending',       count: stats.pending_orders,    color: STATUS_COLOR.PENDING },
              { label: 'Delivered',     count: stats.delivered_orders,  color: STATUS_COLOR.DELIVERED },
              { label: 'Delayed',       count: stats.delayed_orders,    color: STATUS_COLOR.DELAYED },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: item.color, fontWeight: 600 }}>{item.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{item.count}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-primary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(item.count / Math.max(stats.total_orders, 1)) * 100}%`, background: item.color, borderRadius: 4, transition: 'width 1s ease' }} />
                </div>
              </div>
            ))}
          </div>

          <div className="glass-card">
            <div className="card-title" style={{ marginBottom: 16 }}><AlertTriangle size={16} className="icon" /> Top Delayed Orders</div>
            {delayed.slice(0, 5).map(o => (
              <div key={o.order_id}
                style={{ padding: '12px', borderRadius: 8, border: '1px solid var(--border-subtle)', marginBottom: 8, cursor: 'pointer', background: 'var(--bg-card)' }}
                onClick={() => navigate(`/map?order=${o.order_id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ff0844', fontSize: 13 }}>{o.order_id}</span>
                  <span style={{ fontSize: 11, color: STATUS_COLOR[o.status] || '#a0aab5', fontWeight: 600, border: `1px solid ${STATUS_COLOR[o.status] || '#a0aab5'}`, borderRadius: 4, padding: '2px 8px' }}>{o.status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{o.origin_city} &rarr; {o.dest_city}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Risk: <span style={{ color: '#ff0844' }}>{o.risk_score}%</span> &middot; {o.carrier_name}</div>
              </div>
            ))}
            {delayed.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No delayed orders</div>}
          </div>
        </div>
      )}

      {/* All DB Orders Tab */}
      {tab === 'orders' && (
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title"><Package size={16} className="icon" /> All DB Orders (User-Created)</div>
          </div>
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: 13 }}>
              No user-created orders yet. Check Fleet Products tab for live shipments.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Route</th>
                    <th>Carrier</th>
                    <th>Weight</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>SLA Deadline</th>
                    <th>Map</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.order_id}>
                      <td><span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--accent-blue)', fontSize: 13 }}>{o.order_id}</span></td>
                      <td style={{ fontSize: 12 }}>{o.origin_city} &rarr; {o.dest_city}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{o.carrier_name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{o.weight_kg} kg</td>
                      <td style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)' }}>P{o.priority_level}</td>
                      <td>
                        <span style={{ fontSize: 11, color: STATUS_COLOR[o.status] || '#a0aab5', border: `1px solid ${STATUS_COLOR[o.status] || '#a0aab5'}`, borderRadius: 4, padding: '3px 10px', fontWeight: 600 }}>
                          {o.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: o.risk_level === 'HIGH' ? '#ff0844' : o.risk_level === 'MEDIUM' ? '#f5576c' : '#00f2fe', fontWeight: 700, fontFamily: 'JetBrains Mono', fontSize: 13 }}>
                          {o.risk_score}%
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {o.sla_deadline ? new Date(o.sla_deadline).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-outline"
                          style={{ padding: '4px 12px', fontSize: 11 }}
                          onClick={() => navigate(`/map?order=${o.order_id}`)}
                        >
                          <Map size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fleet Products Tab — live in-memory fleet (all users) */}
      {tab === 'fleet' && (
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title"><Truck size={16} className="icon" /> Fleet Products — All Active Shipments</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Shipment ID</th>
                  <th>Route</th>
                  <th>Carrier</th>
                  <th>Weight</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>SLA Deadline</th>
                  <th>Map</th>
                </tr>
              </thead>
              <tbody>
                {fleet.sort((a, b) => b.risk_score - a.risk_score).map(s => (
                  <tr key={s.shipment_id}>
                    <td>
                      <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--accent-blue)', fontSize: 13 }}>
                        {s.shipment_id}
                      </span>
                      {s.driver_ill && <span style={{ fontSize: 10, marginLeft: 4 }}>🤒</span>}
                      {s.carrier_defective && <span style={{ fontSize: 10, marginLeft: 2 }}>⚙️</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{s.origin_city} &rarr; {s.dest_city}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.carrier_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.weight_kg ? `${s.weight_kg} kg` : '—'}</td>
                    <td style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)' }}>P{s.priority_level}</td>
                    <td>
                      <span style={{ fontSize: 11, color: STATUS_COLOR[s.status] || '#a0aab5', border: `1px solid ${STATUS_COLOR[s.status] || '#a0aab5'}`, borderRadius: 4, padding: '3px 10px', fontWeight: 600 }}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: s.risk_level === 'HIGH' ? '#ff0844' : s.risk_level === 'MEDIUM' ? '#f5576c' : '#00f2fe', fontWeight: 700, fontFamily: 'JetBrains Mono', fontSize: 13 }}>
                        {s.risk_score}% <span style={{ fontSize: 10, fontWeight: 400 }}>({s.risk_level})</span>
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.sla_deadline ? new Date(s.sla_deadline).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '4px 12px', fontSize: 11 }}
                        onClick={() => navigate(`/map?order=${s.shipment_id}`)}
                      >
                        <Map size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title"><Users size={16} className="icon" /> Registered Users</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{u.id}</td>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, color: u.role === 'admin' ? '#b026ff' : '#00f2fe', border: `1px solid ${u.role === 'admin' ? '#b026ff' : '#00f2fe'}`, borderRadius: 4, padding: '3px 10px' }}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: u.is_active ? '#00cc66' : '#ff0844', fontSize: 12, fontWeight: 600 }}>
                        {u.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delayed Tab */}
      {tab === 'delayed' && (
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title"><AlertTriangle size={16} className="icon" /> Delayed / High-Risk Orders</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Order ID</th><th>Route</th><th>Status</th><th>Risk Score</th><th>SLA Deadline</th><th>ETA</th><th>Map</th></tr>
              </thead>
              <tbody>
                {delayed.map(o => (
                  <tr key={o.order_id}>
                    <td><span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ff0844', fontSize: 13 }}>{o.order_id}</span></td>
                    <td style={{ fontSize: 12 }}>{o.origin_city} &rarr; {o.dest_city}</td>
                    <td><span style={{ fontSize: 11, color: STATUS_COLOR[o.status], border: `1px solid ${STATUS_COLOR[o.status]}`, borderRadius: 4, padding: '3px 10px', fontWeight: 600 }}>{o.status}</span></td>
                    <td><span style={{ color: '#ff0844', fontWeight: 700, fontFamily: 'JetBrains Mono' }}>{o.risk_score}%</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.sla_deadline ? new Date(o.sla_deadline).toLocaleString() : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.current_eta ? new Date(o.current_eta).toLocaleString() : '—'}</td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => navigate(`/map?order=${o.order_id}`)}>
                        <Map size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
                {delayed.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No delayed orders</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
