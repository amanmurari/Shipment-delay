import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAlerts } from '../api';
import { Bell, Activity, CheckCircle, ShieldAlert, AlertTriangle, History, Check } from 'lucide-react';

export default function Alerts() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const navigate = useNavigate();

    useEffect(() => {
        fetchAlerts()
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));

        // Auto-refresh every 30 seconds
        const interval = setInterval(() => {
            fetchAlerts().then(setData).catch(console.error);
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;
    if (!data) return <div className="loading-spinner">Failed to load alerts</div>;

    const alerts = data.active_alerts || [];
    const history = data.alert_history || [];

    const filteredAlerts = filter === 'all'
        ? alerts
        : alerts.filter(a => {
            if (filter === 'critical') return a.risk_score >= 80;
            if (filter === 'high') return a.risk_score >= 65 && a.risk_score < 80;
            return true;
        });

    return (
        <div className="fade-in">
            <div className="page-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Bell size={28} /> Alert Center</h2>
                        <p>Real-time risk alerts — {data.total_active} active alerts</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '6px 12px', borderRadius: '20px', fontSize: '12px',
                            background: 'rgba(255, 68, 68, 0.1)', color: '#FF4444',
                            border: '1px solid rgba(255, 68, 68, 0.2)',
                            animation: 'pulse 2s infinite', fontWeight: 600
                        }}>
                            <Activity size={14} /> LIVE
                        </span>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="glass-card" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                        { key: 'all', label: `All (${alerts.length})` },
                        { key: 'critical', label: `Critical (${alerts.filter(a => a.risk_score >= 80).length})` },
                        { key: 'high', label: `High (${alerts.filter(a => a.risk_score >= 65 && a.risk_score < 80).length})` },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`btn ${filter === f.key ? 'btn-primary' : 'btn-outline'}`}
                            style={{ padding: '6px 14px', fontSize: '11px' }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Auto-refreshing every 30s
                </div>
            </div>

            <div className="grid-sidebar" style={{ gridTemplateColumns: '1fr 340px', marginTop: '20px' }}>
                {/* Active Alerts */}
                <div>
                    <div className="glass-card">
                        <div className="card-header">
                            <div className="card-title"><span className="icon"></span> Active Alerts</div>
                        </div>

                        {filteredAlerts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', color: 'var(--risk-low)' }}>
                                    <CheckCircle size={48} />
                                </div>
                                <div>No alerts matching your filter</div>
                            </div>
                        ) : (
                            filteredAlerts.map((alert, i) => (
                                <div
                                    key={alert.id}
                                    className="alert-item high fade-in"
                                    style={{ animationDelay: `${i * 0.05}s`, cursor: 'pointer' }}
                                    onClick={() => navigate(`/shipment/${alert.shipment_id}`)}
                                >
                                    <div className="alert-icon" style={{ color: alert.risk_score >= 80 ? '#FF4444' : '#FFA500' }}>
                                        {alert.risk_score >= 80 ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
                                    </div>
                                    <div className="alert-content">
                                        <div className="alert-message">{alert.message}</div>
                                        <div style={{ marginTop: '6px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                            {alert.reasons && alert.reasons.slice(0, 2).map((reason, j) => (
                                                <span key={j} style={{
                                                    fontSize: '11px', color: 'var(--text-muted)',
                                                    padding: '2px 8px', background: 'var(--bg-elevated)',
                                                    borderRadius: '4px',
                                                }}>
                                                    {reason}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="alert-time">
                                            Priority: P{alert.priority} · {new Date(alert.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{
                                            fontSize: '24px', fontWeight: 800,
                                            color: alert.risk_score >= 80 ? '#FF4444' : '#FFA500',
                                            fontFamily: "'JetBrains Mono'",
                                        }}>
                                            {alert.risk_score}%
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            RISK SCORE
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Side */}
                <div>
                    {/* Alert Stats */}
                    <div className="glass-card">
                        <div className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={18} className="icon" /> Alert Summary
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldAlert size={14} color="#FF4444" /> Critical (80%+)</span>
                                <span style={{ fontSize: '20px', fontWeight: 700, color: '#FF4444', fontFamily: "'JetBrains Mono'" }}>
                                    {alerts.filter(a => a.risk_score >= 80).length}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} color="#FFA500" /> High (65-79%)</span>
                                <span style={{ fontSize: '20px', fontWeight: 700, color: '#FFA500', fontFamily: "'JetBrains Mono'" }}>
                                    {alerts.filter(a => a.risk_score >= 65 && a.risk_score < 80).length}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Active</span>
                                <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-blue)', fontFamily: "'JetBrains Mono'" }}>
                                    {alerts.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Escalation Timer */}
                    <div className="glass-card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                            Auto-Escalation
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--risk-medium)', fontFamily: "'JetBrains Mono'" }}>
                            30 min
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Unacknowledged alerts escalate to supervisor
                        </div>
                    </div>

                    {/* Action History */}
                    <div className="glass-card">
                        <div className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <History size={18} className="icon" /> Recent Actions
                        </div>
                        {history.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                                No actions taken yet
                            </div>
                        ) : (
                            history.slice(-5).reverse().map((h, i) => (
                                <div key={i} style={{
                                    padding: '10px', borderRadius: '8px',
                                    background: 'var(--bg-card)', marginBottom: '8px',
                                    fontSize: '12px',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--risk-low)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Check size={14} /> {h.action || h.type}
                                        </span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                            {new Date(h.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                                        {h.message || `${h.shipment_id} — ${h.action}`}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
