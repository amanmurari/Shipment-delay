import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchAlerts } from '../api';
import { Bell, ShieldAlert, CheckCircle2 } from 'lucide-react';

function timeAgo(ts) {
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

function formatReason(reasons) {
    if (!reasons || reasons.length === 0) return '';
    const raw = reasons[0];
    const clean = raw.replace(/^(?:🔴|🟢|↑|↓|⚠️|\s)+/u, '').split('—').pop().trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export default function NotificationBell() {
    const [alerts, setAlerts] = useState([]);
    const [showPanel, setShowPanel] = useState(false);
    const [seenIds, setSeenIds] = useState(new Set());
    const panelRef = useRef(null);

    useEffect(() => {
        const load = () =>
            fetchAlerts()
                .then(d => setAlerts(d.active_alerts || []))
                .catch(() => { });
        load();
        const id = setInterval(load, 30000);
        return () => clearInterval(id);
    }, []);

    // Close on outside click
    useEffect(() => {
        function onClickOutside(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setShowPanel(false);
            }
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const unread = alerts.filter(a => !seenIds.has(a.id)).length;

    function toggle() {
        setShowPanel(v => !v);
        if (!showPanel) setSeenIds(new Set(alerts.map(a => a.id)));
    }

    return (
        <div className="notif-bell-wrap" ref={panelRef}>
            <button className="notif-bell-btn" onClick={toggle}>
                <Bell size={20} />
                <span className="notif-bell-label">Alerts</span>
                {unread > 0 && (
                    <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>
                )}
            </button>

            {showPanel && (
                <div className="notif-panel">
                    <div className="notif-panel-header">
                        <span>Active Alerts</span>
                        <span className="notif-panel-count">{alerts.length} shipments</span>
                    </div>

                    {alerts.length === 0 && (
                        <div className="notif-empty" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                            <CheckCircle2 size={16} color="var(--risk-low)" /> All shipments on track
                        </div>
                    )}

                    {alerts.slice(0, 6).map(a => (
                        <Link
                            key={a.id}
                            to={`/shipment/${a.shipment_id}`}
                            className="notif-item"
                            onClick={() => setShowPanel(false)}
                        >
                            <div className="notif-item-header">
                                <span className="notif-item-id" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ShieldAlert size={14} color="var(--risk-high)" /> {a.shipment_id}
                                </span>
                                <span className="notif-item-score">{a.risk_score}%</span>
                            </div>
                            <div className="notif-item-msg">
                                Risk increased to {a.risk_score}%.{' '}
                                {formatReason(a.reasons)}
                            </div>
                            <div className="notif-item-footer">
                                <span className="notif-item-action">Recommended: Reroute</span>
                                <span className="notif-item-time">{timeAgo(a.timestamp)}</span>
                            </div>
                        </Link>
                    ))}

                    {alerts.length > 6 && (
                        <Link
                            to="/alerts"
                            className="notif-more"
                            onClick={() => setShowPanel(false)}
                        >
                            View all {alerts.length} alerts →
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}