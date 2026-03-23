import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapPin, Search, Package, Truck, AlertTriangle,
  Clock, Navigation, ShieldAlert, RefreshCw, Zap,
  Plus, Minus, Route, Hash, Maximize2, Radio, X,
  Activity, Filter, Shield
} from 'lucide-react';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, Circle, CircleMarker
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchOrderMap, fetchDelayLive, fetchOrdersByRoute, fetchDashboardSummary
} from '../api';

// ── Fix default Leaflet marker icon paths ──────────────────────
// Removed: Using custom Lucide/divIcon markers instead to avoid 404s.

// ── Marker factories ────────────────────────────────────────────
function makePin(color, label, size = 28) {
  const labelHtml = label
    ? `<div style="margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:4px;
        padding:2px 6px;font-size:10px;font-weight:700;color:#1f2937;
        white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.1);
        font-family:Inter,sans-serif;max-width:90px;overflow:hidden;text-overflow:ellipsis">${label}</div>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
        background:${color};border:3px solid #fff;
        box-shadow:0 2px 10px rgba(0,0,0,0.25);transform:rotate(-45deg)"></div>
      ${labelHtml}
    </div>`,
    iconSize: [Math.max(size + 20, 70), size + 28],
    iconAnchor: [Math.max(size + 20, 70) / 2, size],
    popupAnchor: [0, -size - 4],
  });
}

function makeCurrentPin(label) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:36px;height:36px">
        <div style="position:absolute;inset:0;border-radius:50%;
          background:rgba(16,185,129,0.25);animation:map-ping 1.8s ease-out infinite"></div>
        <div style="position:absolute;top:50%;left:50%;
          transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;
          background:#10b981;border:3px solid #fff;box-shadow:0 2px 8px rgba(16,185,129,0.5)"></div>
      </div>
      <div style="margin-top:4px;background:#fff;border:1px solid #a7f3d0;border-radius:4px;
        padding:2px 6px;font-size:10px;font-weight:700;color:#065f46;
        white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.1);font-family:Inter,sans-serif">${label}</div>
    </div>`,
    iconSize: [80, 56],
    iconAnchor: [40, 36],
    popupAnchor: [0, -40],
  });
}

function makeAlertPin(city) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div class="delay-map-marker">
        <div class="delay-pulse-ring"></div>
        <div class="delay-pulse-ring" style="animation-delay:0.4s"></div>
        <div class="delay-core" style="display:flex;align-items:center;justify-content:center;
          font-size:10px;color:#fff;font-weight:700">!</div>
      </div>
      <div style="margin-top:4px;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;
        padding:2px 6px;font-size:10px;font-weight:700;color:#dc2626;
        white-space:nowrap;font-family:Inter,sans-serif">${city}</div>
    </div>`,
    iconSize: [80, 60],
    iconAnchor: [40, 36],
    popupAnchor: [0, -40],
  });
}

function makeIllDriverPin(city) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:34px;height:34px">
        <div style="position:absolute;inset:0;border-radius:50%;
          background:rgba(245,158,11,0.3);animation:map-ping 2s ease-out infinite"></div>
        <div style="position:absolute;top:50%;left:50%;
          transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;
          background:#f59e0b;border:2px solid #fff;
          box-shadow:0 2px 8px rgba(245,158,11,0.6);
          display:flex;align-items:center;justify-content:center;font-size:13px">🤒</div>
      </div>
      <div style="margin-top:4px;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;
        padding:2px 5px;font-size:9px;font-weight:700;color:#92400e;
        white-space:nowrap;font-family:Inter,sans-serif">DRIVERS FAULT</div>
    </div>`,
    iconSize: [90, 58],
    iconAnchor: [45, 34],
    popupAnchor: [0, -38],
  });
}

function makeCarrierDefectPin(city) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:34px;height:34px">
        <div style="position:absolute;inset:0;border-radius:50%;
          background:rgba(249,115,22,0.3);animation:map-ping 1.6s ease-out infinite"></div>
        <div style="position:absolute;top:50%;left:50%;
          transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;
          background:#f97316;border:2px solid #fff;
          box-shadow:0 2px 8px rgba(249,115,22,0.6);
          display:flex;align-items:center;justify-content:center;font-size:13px">⚙️</div>
      </div>
      <div style="margin-top:4px;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;
        padding:2px 5px;font-size:9px;font-weight:700;color:#9a3412;
        white-space:nowrap;font-family:Inter,sans-serif">CARRIER FAULT</div>
    </div>`,
    iconSize: [100, 58],
    iconAnchor: [50, 34],
    popupAnchor: [0, -38],
  });
}

// ── Traffic zone computation ─────────────────────────────────────
function computeTrafficZones(fleet) {
  // Group shipment endpoints (origin + dest) by rounded lat/lng cell (~50km grid)
  const cells = {};
  fleet.forEach(ship => {
    [
      { lat: ship.origin_lat, lng: ship.origin_lng, city: ship.origin_city },
      { lat: ship.dest_lat || ship.lat, lng: ship.dest_lng || ship.lng, city: ship.dest_city || ship.city },
    ].forEach(pt => {
      if (!pt.lat || !pt.lng) return;
      // Round to ~0.4° ≈ 45 km grid
      const key = `${(Math.round(pt.lat / 0.4) * 0.4).toFixed(1)}_${(Math.round(pt.lng / 0.4) * 0.4).toFixed(1)}`;
      if (!cells[key]) cells[key] = { lat: pt.lat, lng: pt.lng, count: 0, city: pt.city };
      cells[key].count++;
    });
  });

  return Object.values(cells).map(cell => {
    const level =
      cell.count >= 8 ? 'HEAVY' :
        cell.count >= 5 ? 'MODERATE' :
          cell.count >= 3 ? 'LIGHT' : null;
    if (!level) return null;
    return {
      lat: cell.lat,
      lng: cell.lng,
      city: cell.city,
      count: cell.count,
      level,
      color: level === 'HEAVY' ? '#ef4444' : level === 'MODERATE' ? '#f59e0b' : '#10b981',
      radius: level === 'HEAVY' ? 40000 : level === 'MODERATE' ? 25000 : 15000,
      opacity: level === 'HEAVY' ? 0.18 : level === 'MODERATE' ? 0.13 : 0.09,
    };
  }).filter(Boolean);
}

// ── Constants ──────────────────────────────────────────────────
const REASON_LABEL = {
  TSUNAMI: 'Tsunami', CYCLONE: 'Cyclone', FLOOD: 'Flood', STORM: 'Storm',
  EARTHQUAKE: 'Earthquake', STRIKE: 'Strike', CUSTOMS_HOLD: 'Customs Hold',
  POLITICAL_UNREST: 'Political Unrest', ACCIDENT: 'Accident',
  PORT_CONGESTION: 'Port Congestion', WEATHER: 'Severe Weather',
};
const SEV_COLOR = { LOW: '#2563eb', MEDIUM: '#f59e0b', HIGH: '#ef4444', CRITICAL: '#ef4444' };
const STATUS_COLOR = {
  PENDING: '#9ca3af', IN_TRANSIT: '#2563eb', AT_HUB: '#7c3aed',
  DELIVERED: '#10b981', DELAYED: '#ef4444', CUSTOMS_HOLD: '#f59e0b',
};
const RISK_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981' };

function fmt(sec) {
  if (sec <= 0) return 'Crisis clearing…';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${s}s remaining`;
  return `${s}s remaining`;
}

// ── Main component ─────────────────────────────────────────────
export default function MapView() {
  const [searchParams] = useSearchParams();
  const mapRef = useRef(null);
  const pollRef = useRef(null);
  const tickRef = useRef(null);
  const fleetTimerRef = useRef(null);

  // ── Fleet (live overview) state ────────────────────────────
  const [fleet, setFleet] = useState([]);
  const [, setFleetStats] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [selectedFleetShip, setSelectedFleetShip] = useState(null);

  // ── Map layer toggles ──────────────────────────────────────
  const [showTraffic, setShowTraffic] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'ill' | 'defective' | 'high'

  // ── Order-track state ──────────────────────────────────────
  const [mode, setMode] = useState('id');
  const [input, setInput] = useState(searchParams.get('order') || '');
  const [originInput, setOriginInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [trackData, setTrackData] = useState(null);
  const [delay, setDelay] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [, setLastRefresh] = useState(null);
  const [routeResults, setRouteResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCP, setActiveCP] = useState(null);
  const [sidePanel, setSidePanel] = useState('fleet'); // 'fleet' | 'track'

  // ── map helpers ────────────────────────────────────────────
  const zoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
  const zoomOut = useCallback(() => mapRef.current?.zoomOut(), []);
  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (trackData?.route_coords?.length > 1) {
      map.fitBounds(trackData.route_coords, { padding: [60, 60], animate: true });
    } else if (fleet.length > 0) {
      const pts = fleet.filter(s => s.dest_lat && s.dest_lng).map(s => [s.dest_lat, s.dest_lng]);
      if (pts.length) map.fitBounds(pts, { padding: [40, 40], animate: true });
    }
  }, [trackData, fleet]);

  // ── Load full fleet from dashboard ────────────────────────
  async function loadFleet(silent = false) {
    if (!silent) setFleetLoading(true);
    try {
      const data = await fetchDashboardSummary();
      // Merge fleet_map (geo + new fields) with all_shipments (details) by shipment_id
      const detailMap = {};
      (data.all_shipments || []).forEach(s => { detailMap[s.shipment_id] = s; });
      const merged = (data.fleet_map || []).map(geo => ({
        ...geo,
        ...(detailMap[geo.shipment_id] || {}),
      }));
      setFleet(merged);
      setFleetStats(data.stat_cards || null);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error('Fleet load error', e);
    } finally {
      setFleetLoading(false);
    }
  }

  // Auto-refresh fleet every 30 s
  useEffect(() => {
    loadFleet();
    fleetTimerRef.current = setInterval(() => loadFleet(true), 30000);
    return () => clearInterval(fleetTimerRef.current);
  }, []);

  // Fit map to fleet when first loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fleet.length === 0 || trackData) return;
    const pts = fleet.filter(s => s.dest_lat && s.dest_lng).map(s => [s.dest_lat, s.dest_lng]);
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], animate: true });
  }, [fleet]);

  // Auto-search if ?order= in URL
  useEffect(() => {
    const id = searchParams.get('order');
    if (id) { setSidePanel('track'); searchById(id); }
    return () => { clearInterval(pollRef.current); clearInterval(tickRef.current); };
  }, []);

  // ── Traffic zones computed from fleet ─────────────────────
  const trafficZones = useMemo(() => computeTrafficZones(fleet), [fleet]);

  // ── Filtered fleet for map rendering ──────────────────────
  const filteredFleet = useMemo(() => {
    if (filterMode === 'ill') return fleet.filter(s => s.driver_ill);
    if (filterMode === 'defective') return fleet.filter(s => s.carrier_defective);
    if (filterMode === 'high') return fleet.filter(s => s.risk_level === 'HIGH');
    return fleet;
  }, [fleet, filterMode]);

  // ── Order-track search ────────────────────────────────────
  async function searchById(id) {
    const t = (id || input).trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(''); setTrackData(null); setDelay(null);
    setRouteResults(null); setSelectedFleetShip(null);
    clearInterval(pollRef.current); clearInterval(tickRef.current);
    try {
      const result = await fetchOrderMap(t);
      setTrackData(result);
      setSidePanel('track');
      if (result.active_delay) {
        setDelay(result.active_delay);
        setCountdown(result.active_delay.seconds_remaining);
        startPolling(t); startTick(result.active_delay.seconds_remaining);
      }
      const map = mapRef.current;
      if (map && result.route_coords?.length > 1)
        map.fitBounds(result.route_coords, { padding: [60, 60], animate: true });
    } catch (err) { setError(err.message || 'Order not found'); }
    finally { setLoading(false); }
  }

  async function searchByRoute() {
    if (!originInput.trim() && !destInput.trim()) return;
    setLoading(true); setError(''); setTrackData(null); setDelay(null);
    clearInterval(pollRef.current); clearInterval(tickRef.current);
    try {
      const results = await fetchOrdersByRoute(originInput.trim(), destInput.trim());
      setRouteResults(results);
      setSidePanel('track');
      if (!results.length) setError('No shipments found for this route');
    } catch (err) { setError(err.message || 'Search failed'); }
    finally { setLoading(false); }
  }

  function startPolling(orderId) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchDelayLive(orderId);
        if (res.active_delay) {
          setDelay(res.active_delay);
          setCountdown(res.active_delay.seconds_remaining);
          setLastRefresh(new Date());
        } else {
          setDelay(null);
          clearInterval(pollRef.current); clearInterval(tickRef.current);
        }
      } catch { }
    }, 30000);
  }
  function startTick(initial) {
    setCountdown(initial);
    tickRef.current = setInterval(() => setCountdown(p => p > 0 ? p - 1 : 0), 1000);
  }

  function clearTrack() {
    setTrackData(null); setDelay(null); setRouteResults(null); setError('');
    setInput(''); setOriginInput(''); setDestInput('');
    clearInterval(pollRef.current); clearInterval(tickRef.current);
    setSidePanel('fleet');
    setTimeout(fitAll, 100);
  }

  function switchMode(m) {
    setMode(m); setError(''); setRouteResults(null);
  }

  // ── Track any fleet shipment from marker click ─────────────
  function trackFleetShip(ship) {
    setInput(ship.shipment_id);
    setSidePanel('track');
    switchMode('id');
    searchById(ship.shipment_id);
  }

  // ── Derived display values ────────────────────────────────
  const altRoute = trackData?.alt_route || null;
  const altRouteReasons = trackData?.alt_route_reasons || [];
  const shapReasons = trackData?.shap_reasons || [];
  const routeCoords = trackData?.route_coords || [];
  const mapCenter = [22.5, 78.9];
  const riskColor = trackData ? (RISK_COLOR[trackData.risk_level] || '#2563eb') : '#2563eb';
  const statusColor = trackData ? (STATUS_COLOR[trackData.status] || '#9ca3af') : '#9ca3af';
  const sevColor = delay ? (SEV_COLOR[delay.severity] || '#ef4444') : '#ef4444';

  // ── Fit map when track data or delay changes ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trackData) return;
    if (delay) map.setView([delay.stuck_lat, delay.stuck_lng], 9, { animate: true });
    else if (routeCoords.length > 1) map.fitBounds(routeCoords, { padding: [60, 60], animate: true });
  }, [trackData, delay]);

  // ── Risk/issue counts for fleet stats bar ─────────────────
  const highCount = fleet.filter(s => s.risk_level === 'HIGH').length;
  const medCount = fleet.filter(s => s.risk_level === 'MEDIUM').length;
  const lowCount = fleet.filter(s => s.risk_level === 'LOW').length;
  const illCount = fleet.filter(s => s.driver_ill).length;
  const defectiveCount = fleet.filter(s => s.carrier_defective).length;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>

      {/* ── Top stats bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 10, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-blue)', fontWeight: 700, fontSize: 13 }}>
          <Activity size={15} />
          Live Fleet
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>
            {fleet.length} shipments
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'HIGH', count: highCount, color: '#ef4444', bg: '#fef2f2' },
            { label: 'MEDIUM', count: medCount, color: '#f59e0b', bg: '#fffbeb' },
            { label: 'LOW', count: lowCount, color: '#10b981', bg: '#f0fdf4' },
            { label: '🤒 ILL', count: illCount, color: '#d97706', bg: '#fffbeb' },
            { label: '⚙ FAULT', count: defectiveCount, color: '#f97316', bg: '#fff7ed' },
          ].map(({ label, count, color, bg }) => (
            <span key={label} style={{
              fontSize: 11, fontWeight: 700, color,
              background: bg, padding: '3px 10px',
              border: `1px solid ${color}40`, borderRadius: 20, cursor: 'default',
            }}>
              {label}: {count}
            </span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {lastRefreshed && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              <RefreshCw size={10} style={{ marginRight: 3 }} /> {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => loadFleet()} disabled={fleetLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px',
              borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap'
            }}>
            <RefreshCw size={12} className={fleetLoading ? 'spin-icon' : ''} /> Refresh
          </button>
          {trackData && (
            <button onClick={clearTrack} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px',
              borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca',
              color: '#ef4444', cursor: 'pointer', whiteSpace: 'nowrap'
            }}>
              <X size={12} /> Clear Track
            </button>
          )}
        </div>
      </div>

      {/* ── Main layout: side panel + map ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 12, flex: 1, minHeight: 0 }}>

        {/* ── LEFT SIDE PANEL ── */}
        <div className="map-sidebar-scroll" style={{ overflowY: 'auto', paddingRight: 4, minWidth: 0, paddingBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 'min-content' }}>

          {/* Panel tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'fleet', label: 'Fleet Overview', icon: <Radio size={13} /> },
              { key: 'track', label: 'Track Order', icon: <Hash size={13} /> },
            ].map(tab => (
              <button key={tab.key} onClick={() => setSidePanel(tab.key)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: sidePanel === tab.key ? 'var(--accent-blue)' : 'var(--bg-card)',
                color: sidePanel === tab.key ? '#fff' : 'var(--text-secondary)',
                border: sidePanel === tab.key ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
              }}>{tab.icon} {tab.label}</button>
            ))}
          </div>

          {/* ── FLEET OVERVIEW PANEL ── */}
          {sidePanel === 'fleet' && (
            <>
              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: `All (${fleet.length})`, color: 'var(--accent-blue)' },
                  { key: 'high', label: `🔴 High (${highCount})`, color: '#ef4444' },
                  { key: 'ill', label: `🤒 Ill (${illCount})`, color: '#d97706' },
                  { key: 'defective', label: `⚙ Fault (${defectiveCount})`, color: '#f97316' },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilterMode(f.key)} style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 12, cursor: 'pointer',
                    background: filterMode === f.key ? f.color : 'var(--bg-secondary)',
                    color: filterMode === f.key ? '#fff' : f.color,
                    border: `1px solid ${f.color}60`,
                  }}>{f.label}</button>
                ))}
              </div>

              {/* Selected ship details */}
              {selectedFleetShip ? (
                <div className="glass-card" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--accent-blue)', fontSize: 14 }}>
                      {selectedFleetShip.shipment_id}
                    </span>
                    <button onClick={() => setSelectedFleetShip(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <X size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{selectedFleetShip.origin_city || selectedFleetShip.city}</span>
                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{selectedFleetShip.dest_city || selectedFleetShip.city}</span>
                  </div>
                  {/* Status badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: RISK_COLOR[selectedFleetShip.risk_level],
                      background: `${RISK_COLOR[selectedFleetShip.risk_level]}15`,
                      border: `1px solid ${RISK_COLOR[selectedFleetShip.risk_level]}40`,
                      padding: '2px 8px', borderRadius: 20,
                    }}>{selectedFleetShip.risk_level} RISK</span>
                    {selectedFleetShip.driver_ill && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#92400e',
                        background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: 20
                      }}>
                        🤒 Driver Ill
                      </span>
                    )}
                    {selectedFleetShip.carrier_defective && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#9a3412',
                        background: '#fff7ed', border: '1px solid #fed7aa', padding: '2px 8px', borderRadius: 20
                      }}>
                        ⚙ Carrier Fault
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { l: 'Risk Score', v: `${selectedFleetShip.risk_score}%` },
                      { l: 'Carrier', v: selectedFleetShip.carrier_name },
                      { l: 'Priority', v: `P${selectedFleetShip.priority_level}` },
                      { l: 'SLA', v: selectedFleetShip.sla_deadline ? new Date(selectedFleetShip.sla_deadline).toLocaleString() : '—' },
                    ].map(({ l, v }) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Risk bar */}
                  <div style={{ marginTop: 8, height: 5, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                    <div style={{
                      height: '100%', width: `${selectedFleetShip.risk_score}%`,
                      background: RISK_COLOR[selectedFleetShip.risk_level], borderRadius: 3, transition: 'width 1s',
                    }} />
                  </div>
                  {/* Track button */}
                  <button onClick={() => trackFleetShip(selectedFleetShip)}
                    style={{
                      marginTop: 10, width: '100%', padding: '8px', borderRadius: 7,
                      background: 'var(--accent-blue)', color: '#fff', border: 'none',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}>
                    <Navigation size={12} /> Track Full Route
                  </button>
                </div>
              ) : (
                <div className="glass-card" style={{ marginBottom: 0, textAlign: 'center', padding: '16px' }}>
                  <MapPin size={22} style={{ color: 'var(--border-medium)', marginBottom: 6 }} />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Click any marker on the map
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {filteredFleet.length} shipments shown
                  </div>
                </div>
              )}

              {/* All shipments scrollable list */}
              <div className="glass-card" style={{ marginBottom: 0, padding: '10px 12px' }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <Filter size={12} />
                  {filterMode === 'all' ? `All Shipments (${fleet.length})` :
                    filterMode === 'high' ? `High Risk (${highCount})` :
                      filterMode === 'ill' ? `Driver's Fault (${illCount})` :
                        `Carrier Fault (${defectiveCount})`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
                  {filteredFleet
                    .sort((a, b) => b.risk_score - a.risk_score)
                    .map(s => {
                      const col = RISK_COLOR[s.risk_level] || '#10b981';
                      return (
                        <div key={s.shipment_id}
                          onClick={() => {
                            setSelectedFleetShip(s);
                            if (s.dest_lat && s.dest_lng)
                              mapRef.current?.setView([s.dest_lat, s.dest_lng], 8, { animate: true });
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
                            borderRadius: 7, cursor: 'pointer',
                            background: selectedFleetShip?.shipment_id === s.shipment_id ? `${col}15` : 'var(--bg-secondary)',
                            border: `1px solid ${selectedFleetShip?.shipment_id === s.shipment_id ? col + '60' : 'var(--border-subtle)'}`,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: col, fontFamily: 'JetBrains Mono' }}>
                              {s.shipment_id}
                            </div>
                            <div style={{ fontSize: 9, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.origin_city} → {s.dest_city || s.city}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: col }}>{s.risk_score}%</span>
                            <div style={{ display: 'flex', gap: 2 }}>
                              {s.driver_ill && <span style={{ fontSize: 8 }}>🤒</span>}
                              {s.carrier_defective && <span style={{ fontSize: 8 }}>⚙️</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}

          {/* ── ORDER TRACK PANEL ── */}
          {sidePanel === 'track' && (
            <>
              {/* Mode tabs */}
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { key: 'id', icon: <Hash size={12} />, label: 'By Order ID' },
                  { key: 'route', icon: <Route size={12} />, label: 'By Route' },
                ].map(tab => (
                  <button key={tab.key} onClick={() => switchMode(tab.key)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: mode === tab.key ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                    color: mode === tab.key ? '#fff' : 'var(--text-secondary)',
                    border: mode === tab.key ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                  }}>{tab.icon}{tab.label}</button>
                ))}
              </div>

              {/* Search inputs */}
              {mode === 'id' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="map-search-input-wrap">
                    <Search size={15} className="map-search-icon" />
                    <input className="map-search-input" type="text"
                      placeholder="Enter Order ID  e.g. ORD-DEMO0003"
                      value={input} onChange={e => setInput(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && searchById()} />
                  </div>
                  <button className="btn btn-primary" onClick={() => searchById()} disabled={loading}
                    style={{ width: '100%', padding: '10px' }}>
                    {loading ? <><RefreshCw size={13} className="spin-icon" /> Searching…</> : <><Search size={13} /> Track Shipment</>}
                  </button>
                  {/* All shipment IDs as quick-select chips */}
                  {!trackData && !loading && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Zap size={10} /> Quick-select any shipment:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                        {fleet.map(s => (
                          <button key={s.shipment_id}
                            onClick={() => { setInput(s.shipment_id); searchById(s.shipment_id); }}
                            style={{
                              fontSize: 9, padding: '3px 7px', borderRadius: 10, cursor: 'pointer',
                              background: RISK_COLOR[s.risk_level] + '20',
                              color: RISK_COLOR[s.risk_level],
                              border: `1px solid ${RISK_COLOR[s.risk_level]}50`,
                              fontFamily: 'JetBrains Mono', fontWeight: 700,
                            }}>
                            {s.shipment_id}
                            {s.driver_ill ? ' 🤒' : ''}
                            {s.carrier_defective ? ' ⚙' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="map-search-input-wrap">
                    <MapPin size={14} className="map-search-icon" style={{ color: '#2563eb' }} />
                    <input className="map-search-input" placeholder="Origin  e.g. Mumbai"
                      value={originInput} onChange={e => setOriginInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchByRoute()} />
                  </div>
                  <div className="map-search-input-wrap">
                    <MapPin size={14} className="map-search-icon" style={{ color: '#ef4444' }} />
                    <input className="map-search-input" placeholder="Destination  e.g. Delhi"
                      value={destInput} onChange={e => setDestInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchByRoute()} />
                  </div>
                  <button className="btn btn-primary" onClick={searchByRoute} disabled={loading}
                    style={{ width: '100%', padding: '10px' }}>
                    {loading ? <><RefreshCw size={13} className="spin-icon" /> Searching…</> : <><Search size={13} /> Search Route</>}
                  </button>
                </div>
              )}

              {error && <div className="map-error"><AlertTriangle size={14} /> {error}</div>}

              {/* Route results */}
              {routeResults?.length > 0 && !trackData && (
                <div className="glass-card" style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                    {routeResults.length} shipment{routeResults.length !== 1 ? 's' : ''} found
                  </div>
                  {routeResults.map(r => (
                    <div key={r.order_id}
                      onClick={() => { setInput(r.order_id); switchMode('id'); setTimeout(() => searchById(r.order_id), 0); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                        border: `1px solid ${r.has_delay ? '#fecaca' : 'var(--border-subtle)'}`,
                        borderRadius: 8, cursor: 'pointer', background: 'var(--bg-secondary)',
                        marginBottom: 6, transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                      <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 11, color: 'var(--accent-blue)' }}>{r.order_id}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{r.origin_city} → {r.dest_city}</span>
                      {r.has_delay && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Tracked order detail */}
              {trackData && (
                <>
                  {/* Delay banner */}
                  {delay && (
                    <div className={`delay-banner sev-${delay.severity.toLowerCase()}`} style={{ height: 'auto', minHeight: '60px' }}>
                      <div className="delay-banner-left" style={{ flex: 1, minWidth: 0 }}>
                        <div className="delay-banner-icon"><AlertTriangle size={18} /></div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div className="delay-banner-title" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{delay.reason_title}</div>
                          <div className="delay-banner-sub" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Stuck at <strong>{delay.stuck_city}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="delay-banner-right" style={{ flexShrink: 0 }}>
                        <div className="delay-countdown" style={{ fontSize: 13 }}>{fmt(countdown)}</div>
                      </div>
                    </div>
                  )}

                  {/* Order summary card */}
                  <div className="glass-card" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--accent-blue)', fontSize: 14 }}>
                        {trackData.order_id}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: statusColor,
                        background: `${statusColor}15`, border: `1px solid ${statusColor}40`,
                        borderRadius: 6, padding: '2px 8px'
                      }}>{trackData.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>From</span>
                        <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{trackData.origin?.city}</span>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>→</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>To</span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>{trackData.destination?.city}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trackData.carrier_name}</span>
                        <span style={{ flexShrink: 0 }}>Risk: <span style={{ color: riskColor, fontWeight: 700 }}>{trackData.risk_score}%</span></span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 4, padding: '8px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Weight</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trackData.weight_kg} kg</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Priority</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>P{trackData.priority_level}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gridColumn: 'span 2', minWidth: 0 }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order Date</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{new Date(trackData.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${trackData.risk_score}%`, background: riskColor, borderRadius: 3 }} />
                    </div>
                  </div>

                  {/* Delay detail */}
                  {delay && (
                    <div className={`delay-detail-card sev-${delay.severity.toLowerCase()}`} style={{ marginBottom: 0 }}>
                      <div className="delay-detail-header">
                        <ShieldAlert size={13} /><span>Delay Reason</span>
                        <span className={`sev-badge sev-${delay.severity.toLowerCase()}`}>{delay.severity}</span>
                      </div>
                      <div className="delay-type-label" style={{ padding: '6px 12px 0', fontSize: 13 }}>
                        {REASON_LABEL[delay.reason_type] || delay.reason_type}
                      </div>
                      <p className="delay-description" style={{ fontSize: 12 }}>{delay.description}</p>
                      <div className="delay-info-grid">
                        {[
                          { l: 'Stuck At', v: delay.stuck_city },
                          { l: 'Extra Delay', v: `+${delay.additional_delay_hours}h` },
                        ].map(({ l, v }) => (
                          <div key={l} className="delay-info-item">
                            <span className="di-label">{l}</span>
                            <span className="di-value">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Checkpoints timeline */}
                  <div className="glass-card" style={{ marginBottom: 0 }}>
                    <div className="card-title" style={{ marginBottom: 10, fontSize: 12 }}>
                      <Navigation size={12} className="icon" /> Checkpoints
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>click to zoom</span>
                    </div>
                    <div className="map-timeline">
                      {trackData.checkpoints.map((cp, i) => (
                        <div key={i}
                          className={`map-timeline-item ${activeCP === i ? 'active-cp' : ''} ${cp.status === 'delayed' ? 'delayed' : cp.status}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setActiveCP(i);
                            mapRef.current?.setView([cp.lat, cp.lng], 11, { animate: true });
                          }}>
                          <div className="map-timeline-dot">
                            {cp.type === 'origin' ? <MapPin size={10} /> : cp.type === 'destination' ? <Package size={10} /> : <Truck size={10} />}
                          </div>
                          {i < trackData.checkpoints.length - 1 && (
                            <div className={`map-timeline-line ${cp.status === 'completed' ? 'solid' : 'dashed'}`} />
                          )}
                          <div className="map-timeline-info">
                            <div className="map-timeline-city">
                              {cp.city}
                              {delay && cp.city === delay.stuck_city && <span className="stuck-chip">STUCK</span>}
                            </div>
                            <div className="map-timeline-type" style={{ fontSize: 10 }}>{cp.type.replace('_', ' ')}</div>
                            {cp.arrived_at && (
                              <div className="map-timeline-time"><Clock size={9} /> {new Date(cp.arrived_at).toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Diverted route info */}
                  {altRoute && (
                    <div className="glass-card" style={{ marginBottom: 0, borderLeft: '3px solid #10b981' }}>
                      <div className="card-title" style={{ marginBottom: 8, fontSize: 12, color: '#10b981' }}>
                        <Route size={12} className="icon" /> Suggested Divert Route
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Via <strong style={{ color: '#10b981' }}>{altRoute.hub?.city}</strong> hub
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>(shown in green)</span>
                      </div>

                      {/* Why this route is suggested */}
                      {(altRouteReasons.length > 0 || shapReasons.length > 0) && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Why rerouted
                          </div>
                          {(altRouteReasons.length > 0 ? altRouteReasons : shapReasons.map(r => r.description)).map((reason, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 5 }}>
                              <span style={{ color: '#f59e0b', fontSize: 10, marginTop: 2, flexShrink: 0 }}>▲</span>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{reason}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Original vs divert comparison */}
                      <div style={{ marginTop: 10, padding: '8px', background: 'rgba(16,185,129,0.06)', borderRadius: 6, fontSize: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: 'var(--text-muted)' }}>Original hub</span>
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>
                            {trackData.checkpoints?.find(c => c.type === 'hub')?.city || '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Suggested hub</span>
                          <span style={{ color: '#10b981', fontWeight: 600 }}>{altRoute.hub?.city}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ETA */}
                  <div className="glass-card" style={{ marginBottom: 0 }}>
                    {[
                      { label: 'Current ETA', val: trackData.current_eta ? new Date(trackData.current_eta).toLocaleString() : '—', color: '#2563eb' },
                      {
                        label: 'SLA Deadline', val: trackData.sla_deadline ? new Date(trackData.sla_deadline).toLocaleString() : '—',
                        color: trackData.sla_deadline && new Date(trackData.sla_deadline) < new Date() ? '#ef4444' : '#10b981'
                      },
                    ].map(row => (
                      <div key={row.label}>
                        {row.label === 'Current ETA' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, padding: '10px', background: 'rgba(37,99,235,0.04)', borderRadius: 8, border: '1px solid rgba(37,99,235,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              <span>{row.label}</span>
                              <Clock size={10} />
                            </div>
                            <div style={{ color: row.color, fontWeight: 700, fontSize: 13, fontFamily: 'JetBrains Mono' }}>{row.val}</div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6, padding: '10px', background: row.color + '05', borderRadius: 8, border: `1px solid ${row.color}15` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              <span>{row.label}</span>
                              <Shield size={10} />
                            </div>
                            <div style={{ color: row.color, fontWeight: 700, fontSize: 13, fontFamily: 'JetBrains Mono' }}>{row.val}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          </div>
        </div>

        {/* ── MAP (right side) ── */}
        <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', minHeight: 500, minWidth: 0 }}>

          {/* Zoom + layer controls */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { icon: <Plus size={15} />, fn: zoomIn, title: 'Zoom in' },
              { icon: <Minus size={15} />, fn: zoomOut, title: 'Zoom out' },
              { icon: <Maximize2 size={13} />, fn: fitAll, title: 'Fit all' },
            ].map(({ icon, fn, title }) => (
              <button key={title} onClick={fn} title={title} style={{
                width: 32, height: 32, borderRadius: 8,
                background: '#fff', border: '1px solid #e5e7eb',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#374151',
              }}>{icon}</button>
            ))}
            {/* Traffic toggle */}
            <button onClick={() => setShowTraffic(p => !p)} title="Toggle Traffic Layer" style={{
              width: 32, height: 32, borderRadius: 8,
              background: showTraffic ? '#ef4444' : '#fff',
              border: showTraffic ? '1px solid #ef4444' : '1px solid #e5e7eb',
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: showTraffic ? '#fff' : '#374151',
              fontSize: 13, fontWeight: 700,
            }}>
              🚦
            </button>
          </div>

          {/* Legend */}
          <div className="map-legend" style={{ right: 'auto', left: 12, bottom: 12, maxWidth: 160 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Legend</div>
            <div className="map-legend-item"><span style={{ background: '#ef4444', borderRadius: '50%' }} />HIGH risk</div>
            <div className="map-legend-item"><span style={{ background: '#f59e0b', borderRadius: '50%' }} />MEDIUM risk</div>
            <div className="map-legend-item"><span style={{ background: '#10b981', borderRadius: '50%' }} />LOW risk</div>
            <div className="map-legend-item"><span style={{ background: '#f59e0b', borderRadius: '50%', border: '1px solid #d97706' }} /> Driver's Fault</div>
            <div className="map-legend-item"><span style={{ background: '#f97316', borderRadius: '50%' }} />Carrier Fault</div>
            {showTraffic && <>
              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0', paddingTop: 4, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Traffic Layer</div>
              <div className="map-legend-item"><span style={{ background: '#ef444440', border: '1px solid #ef4444', borderRadius: 2 }} />Heavy traffic</div>
              <div className="map-legend-item"><span style={{ background: '#f59e0b30', border: '1px solid #f59e0b', borderRadius: 2 }} />Moderate traffic</div>
              <div className="map-legend-item"><span style={{ background: '#10b98120', border: '1px solid #10b981', borderRadius: 2 }} />Light traffic</div>
            </>}
            {trackData && <div className="map-legend-item"><span style={{ background: '#2563eb' }} />Tracked route</div>}
            {trackData?.alt_route && <div className="map-legend-item"><span style={{ background: '#10b981' }} />Diverted route</div>}
            {delay && <div className="map-legend-item"><span style={{ background: '#ef4444' }} />Delay point</div>}
          </div>

          {fleetLoading && fleet.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-lg)',
            }}>
              <RefreshCw size={24} className="spin-icon" style={{ color: 'var(--accent-blue)' }} />
            </div>
          )}

          <MapContainer
            ref={mapRef}
            center={mapCenter}
            zoom={5}
            zoomControl={false}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-lg)', minHeight: 500 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />

            {/* ── TRAFFIC LAYER — simulated from shipment density ── */}
            {showTraffic && !trackData && trafficZones.map((zone, i) => (
              <Circle
                key={`traffic-${i}`}
                center={[zone.lat, zone.lng]}
                radius={zone.radius}
                pathOptions={{
                  color: zone.color,
                  fillColor: zone.color,
                  fillOpacity: zone.opacity,
                  weight: 1.5,
                  dashArray: zone.level === 'HEAVY' ? undefined : '4 4',
                }}
              >
                <Popup maxWidth={180}>
                  <div style={{ fontFamily: 'Inter,sans-serif', padding: '2px' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: zone.color, marginBottom: 4 }}>
                      {zone.level === 'HEAVY' ? '🔴' : zone.level === 'MODERATE' ? '🟠' : '🟢'} {zone.level} Traffic
                    </div>
                    <div style={{ fontSize: 11, color: '#374151' }}>
                      {zone.city && <div>Near: <strong>{zone.city}</strong></div>}
                      <div>{zone.count} active shipments in zone</div>
                    </div>
                  </div>
                </Popup>
              </Circle>
            ))}

            {/* ── LIVE FLEET — markers for all shipments ── */}
            {!trackData && filteredFleet.map(ship => {
              if (!ship.dest_lat || !ship.dest_lng) return null;
              const col = RISK_COLOR[ship.risk_level] || '#10b981';
              const isSelected = selectedFleetShip?.shipment_id === ship.shipment_id;

              // Special markers for ill driver or carrier fault (only when those filters active or individually marked)
              if (ship.driver_ill && filterMode === 'ill') {
                return (
                  <Marker
                    key={ship.shipment_id}
                    position={[ship.dest_lat, ship.dest_lng]}
                    icon={makeIllDriverPin(ship.dest_city || ship.city)}
                    eventHandlers={{ click: () => { setSelectedFleetShip(ship); setSidePanel('fleet'); } }}
                  >
                    <Popup maxWidth={220}>
                      <div style={{ fontFamily: 'Inter,sans-serif', padding: '4px 2px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#d97706', marginBottom: 5 }}>🤒 Driver Ill</div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-blue)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>{ship.shipment_id}</div>
                        <div style={{ fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: '#2563eb', fontWeight: 600 }}>{ship.origin_city}</span>{' → '}
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>{ship.dest_city || ship.city}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Carrier: {ship.carrier_name}</div>
                        <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', padding: '4px 8px', borderRadius: 6 }}>
                          ⚠ Driver health issue may cause delays
                        </div>
                        <button onClick={() => trackFleetShip(ship)}
                          style={{
                            marginTop: 8, width: '100%', padding: '5px', borderRadius: 6,
                            background: 'var(--accent-blue)', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer'
                          }}>
                          Track Route →
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                );
              }

              if (ship.carrier_defective && filterMode === 'defective') {
                return (
                  <Marker
                    key={ship.shipment_id}
                    position={[ship.dest_lat, ship.dest_lng]}
                    icon={makeCarrierDefectPin(ship.dest_city || ship.city)}
                    eventHandlers={{ click: () => { setSelectedFleetShip(ship); setSidePanel('fleet'); } }}
                  >
                    <Popup maxWidth={220}>
                      <div style={{ fontFamily: 'Inter,sans-serif', padding: '4px 2px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#f97316', marginBottom: 5 }}>⚙ Carrier Fault</div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-blue)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>{ship.shipment_id}</div>
                        <div style={{ fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: '#2563eb', fontWeight: 600 }}>{ship.origin_city}</span>{' → '}
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>{ship.dest_city || ship.city}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#9a3412', background: '#fff7ed', padding: '4px 8px', borderRadius: 6 }}>
                          ⚠ Carrier <strong>{ship.carrier_name}</strong> has performance issues
                        </div>
                        <button onClick={() => trackFleetShip(ship)}
                          style={{
                            marginTop: 8, width: '100%', padding: '5px', borderRadius: 6,
                            background: 'var(--accent-blue)', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer'
                          }}>
                          Track Route →
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                );
              }

              // Default circle marker for all/high/normal view
              return (
                <CircleMarker
                  key={ship.shipment_id}
                  center={[ship.dest_lat, ship.dest_lng]}
                  radius={isSelected ? 11 : (ship.risk_level === 'HIGH' ? 9 : ship.driver_ill || ship.carrier_defective ? 8 : 7)}
                  pathOptions={{
                    color: isSelected ? '#fff' : (ship.driver_ill ? '#d97706' : ship.carrier_defective ? '#f97316' : col),
                    fillColor: ship.driver_ill ? '#f59e0b' : ship.carrier_defective ? '#f97316' : col,
                    fillOpacity: 0.9,
                    weight: isSelected ? 3 : (ship.driver_ill || ship.carrier_defective ? 2 : 1.5),
                  }}
                  eventHandlers={{
                    click: () => {
                      setSelectedFleetShip(ship);
                      setSidePanel('fleet');
                    },
                  }}
                >
                  <Popup maxWidth={240}>
                    <div style={{ fontFamily: 'Inter,sans-serif', padding: '4px 2px' }}>
                      <div style={{
                        fontWeight: 700, fontSize: 13, color: 'var(--accent-blue)', marginBottom: 5,
                        fontFamily: 'JetBrains Mono'
                      }}>
                        {ship.shipment_id}
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#2563eb', fontWeight: 600 }}>{ship.origin_city}</span>
                        {' → '}
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>{ship.dest_city || ship.city}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: col,
                          background: `${col}20`, border: `1px solid ${col}40`,
                          padding: '1px 6px', borderRadius: 12,
                        }}>{ship.risk_level} — {ship.risk_score}%</span>
                        <span style={{
                          fontSize: 10, color: '#6b7280', padding: '1px 6px',
                          background: '#f3f4f6', borderRadius: 12
                        }}>{ship.status}</span>
                        {ship.driver_ill && (
                          <span style={{
                            fontSize: 10, color: '#92400e', background: '#fffbeb',
                            border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 12
                          }}>🤒 river</span>
                        )}
                        {ship.carrier_defective && (
                          <span style={{
                            fontSize: 10, color: '#9a3412', background: '#fff7ed',
                            border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: 12
                          }}>⚙ Carrier Fault</span>
                        )}
                      </div>
                      {ship.carrier_name && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Carrier: {ship.carrier_name}</div>
                      )}
                      <button onClick={() => trackFleetShip(ship)}
                        style={{
                          width: '100%', padding: '5px', borderRadius: 6,
                          background: 'var(--accent-blue)', color: '#fff', border: 'none',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer'
                        }}>
                        Track Full Route →
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* ── Also draw origin→dest line for selected fleet ship ── */}
            {!trackData && selectedFleetShip?.origin_lat && selectedFleetShip?.dest_lat && (
              <Polyline
                positions={[
                  [selectedFleetShip.origin_lat, selectedFleetShip.origin_lng],
                  [selectedFleetShip.dest_lat, selectedFleetShip.dest_lng],
                ]}
                pathOptions={{
                  color: RISK_COLOR[selectedFleetShip.risk_level] || '#2563eb',
                  weight: 2, opacity: 0.7, dashArray: '8 5',
                }}
              />
            )}

            {/* ── TRACKED ORDER — route + checkpoints ── */}
            {trackData && (
              <>
                {/* Original route — gray + strikethrough style when diverted */}
                <Polyline
                  positions={routeCoords}
                  pathOptions={{
                    color: altRoute ? '#94a3b8' : (delay ? '#94a3b8' : '#2563eb'),
                    weight: altRoute ? 2 : (delay ? 2 : 3),
                    opacity: altRoute ? 0.45 : (delay ? 0.5 : 0.8),
                    dashArray: '10 6',
                    className: (!altRoute && !delay) ? 'route-animated' : '',
                  }}
                />

                {/* Diverted (safe) route — green solid */}
                {altRoute && (
                  <Polyline
                    positions={altRoute.coords}
                    pathOptions={{ color: '#10b981', weight: 4, opacity: 0.95, dashArray: '0' }}
                  />
                )}

                {trackData.checkpoints.map((cp, i) => {
                  const isCurrent = cp.status === 'current';
                  const isStuck = delay && cp.city === delay.stuck_city;
                  const isRiskyHub = altRoute && cp.type === 'hub';
                  const icon = isStuck ? makeAlertPin(cp.city)
                    : isRiskyHub ? makeAlertPin(cp.city)
                      : isCurrent ? makeCurrentPin(cp.city)
                        : cp.type === 'origin' ? makePin('#2563eb', cp.city)
                          : cp.type === 'destination' ? makePin('#ef4444', cp.city)
                            : makePin('#7c3aed', cp.city, 22);
                  return (
                    <Marker key={i} position={[cp.lat, cp.lng]} icon={icon}
                      eventHandlers={{ click: () => setActiveCP(i) }}>
                      <Popup maxWidth={260}>
                        <div style={{ fontFamily: 'Inter,sans-serif', padding: '4px' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: isRiskyHub ? '#dc2626' : '#111' }}>
                            {isRiskyHub ? '⚠ Risky Hub — ' : ''}{cp.city}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: isRiskyHub ? 8 : 0 }}>
                            {cp.type.replace('_', ' ').toUpperCase()}
                          </div>
                          {isRiskyHub && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
                                Why this path is avoided:
                              </div>
                              {(altRouteReasons.length > 0 ? altRouteReasons : shapReasons.map(r => r.description || r.feature)).map((reason, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginBottom: 5 }}>
                                  <span style={{ color: '#f59e0b', flexShrink: 0 }}>▲</span>
                                  <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.4 }}>{reason}</span>
                                </div>
                              ))}
                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#fef2f2', borderRadius: 6, fontSize: 11, color: '#991b1b', borderLeft: '3px solid #dc2626' }}>
                                Divert via <strong>{altRoute.hub?.city}</strong> instead →
                              </div>
                            </div>
                          )}
                          {isStuck && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>⚠ Shipment stuck here</div>}
                          {cp.arrived_at && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{new Date(cp.arrived_at).toLocaleString()}</div>}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Safe alternate hub marker */}
                {altRoute && (
                  <Marker position={[altRoute.hub.lat, altRoute.hub.lng]} icon={makePin('#10b981', '✓ ' + altRoute.hub.city, 26)}>
                    <Popup maxWidth={240}>
                      <div style={{ fontFamily: 'Inter,sans-serif', padding: '4px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#10b981', marginBottom: 6 }}>
                          ✓ Recommended Hub — {altRoute.hub.city}
                        </div>
                        <div style={{ fontSize: 11, color: '#374151', marginBottom: 6 }}>
                          This hub avoids the risk factors on the original route.
                        </div>
                        <div style={{ padding: '6px 8px', background: '#f0fdf4', borderRadius: 6, fontSize: 11, color: '#166534', borderLeft: '3px solid #10b981' }}>
                          Green path = AI-suggested safe route
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}
                {delay && (
                  <>
                    <Circle
                      center={[delay.stuck_lat, delay.stuck_lng]} radius={45000}
                      pathOptions={{ color: sevColor, fillColor: sevColor, fillOpacity: 0.06, weight: 2, dashArray: '6 4' }}
                    />
                    <Marker position={[delay.stuck_lat, delay.stuck_lng]}
                      icon={makeAlertPin(delay.stuck_city)} zIndexOffset={1000}>
                      <Popup maxWidth={250}>
                        <div style={{ fontFamily: 'Inter,sans-serif', padding: '2px' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626', marginBottom: 4 }}>{delay.reason_title}</div>
                          <div style={{ fontSize: 11, color: '#374151', marginBottom: 6, lineHeight: 1.5 }}>{delay.description}</div>
                          <div style={{ fontSize: 11 }}>
                            <div><strong>Crisis ends:</strong> {new Date(delay.estimated_end).toLocaleString()}</div>
                            <div><strong>Extra delay:</strong> +{delay.additional_delay_hours}h</div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  </>
                )}
              </>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
