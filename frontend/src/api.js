const API_BASE = 'http://localhost:8000';

function authHeaders() {
  const stored = localStorage.getItem('shipguard_auth');
  if (!stored) return { 'Content-Type': 'application/json' };
  try {
    const { token } = JSON.parse(stored);
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Existing ShipGuard endpoints ──────────────────────────────
export async function fetchDashboardSummary() {
  return request('/api/dashboard/summary');
}

export async function fetchShipments(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/shipments?${query}`);
}

export async function fetchShipmentAnalysis(shipmentId) {
  return request(`/api/shipments/${shipmentId}/analysis`);
}

export async function approveIntervention(shipmentId, actionType, operatorId = 'operator_1') {
  return request(`/api/shipments/${shipmentId}/interventions/approve`, {
    method: 'POST',
    body: JSON.stringify({ action_type: actionType, operator_id: operatorId }),
  });
}

export async function fetchAnalytics() {
  return request('/api/analytics/overview');
}

export async function fetchAlerts() {
  return request('/api/alerts');
}

export async function fetchModelInfo() {
  return request('/api/model/info');
}

// ── Auth ──────────────────────────────────────────────────────
export async function loginUser(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function registerUser(username, email, password, role = 'user') {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, role }),
  });
}

export async function fetchMe() {
  return request('/auth/me');
}

// ── Admin ─────────────────────────────────────────────────────
export async function fetchAdminStats() {
  return request('/admin/stats');
}

export async function fetchAdminUsers() {
  return request('/admin/users');
}

export async function fetchAdminOrders(status = null, riskLevel = null) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (riskLevel) params.set('risk_level', riskLevel);
  return request(`/admin/orders?${params}`);
}

export async function fetchDelayedOrders() {
  return request('/admin/orders/delayed');
}

// ── Orders / Map ──────────────────────────────────────────────
export async function fetchOrderMap(orderId) {
  // Try DB-stored orders first (ORD-* IDs), then fall back to in-memory fleet (SH-* IDs)
  try {
    return await request(`/orders/search/${orderId}`);
  } catch {
    return request(`/api/shipments/${orderId}/map`);
  }
}

export async function fetchMyOrders() {
  return request('/orders/my');
}

export async function createOrder(body) {
  return request('/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchDelayLive(orderId) {
  return request(`/orders/${orderId}/delay`);
}

export async function fetchHubs() {
  return request('/orders/hubs');
}

export async function fetchOrdersByRoute(origin, destination) {
  const params = new URLSearchParams();
  if (origin) params.set('origin', origin);
  if (destination) params.set('destination', destination);
  return request(`/orders/by-route?${params}`);
}

// ── Financial Forecast ─────────────────────────────────────────
export async function fetchFinancialForecast() {
  return request('/api/financial/forecast');
}
