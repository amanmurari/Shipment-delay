import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Zap, Map, ShieldCheck, LogOut, LogIn, IndianRupee } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MissionControl from './pages/MissionControl';
import ShipmentDetail from './pages/ShipmentDetail';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import MapView from './pages/MapView';
import FinancialForecast from './pages/FinancialForecast';
import NotificationBell from './components/NotificationBell';
import './index.css';

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>ShipGuard AI</h1>
        <p>predictive shipment management</p>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon"><LayoutDashboard size={20} /></span> Dashboard
        </NavLink>
        <NavLink to="/map" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon"><Map size={20} /></span> Track Order
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon"><BarChart3 size={20} /></span> Event Stats
        </NavLink>
        <NavLink to="/alerts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon"><Zap size={20} /></span> Live Updates
        </NavLink>
        <NavLink to="/financial" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon"><IndianRupee size={20} /></span> Loss Forecast
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="icon"><ShieldCheck size={20} /></span> Admin
          </NavLink>
        )}
      </nav>

      <NotificationBell />

      <div className="sidebar-footer">
        {user ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 }}>
              {user.role === 'admin' ? 'Admin' : 'User'} · {user.username}
            </div>
            <button
              onClick={handleLogout}
              style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid rgba(255,8,68,0.3)', borderRadius: 6, color: '#ff0844', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <LogOut size={13} /> Logout
            </button>
          </div>
        ) : (
          <NavLink to="/login" style={{ display: 'block', marginBottom: 10 }}>
            <button style={{ width: '100%', padding: '8px', background: 'rgba(0,242,254,0.1)', border: '1px solid rgba(0,242,254,0.3)', borderRadius: 6, color: '#00f2fe', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <LogIn size={13} /> Sign In
            </button>
          </NavLink>
        )}
        <div className="model-badge">
          <span className="pulse"></span>
          SYSTEM STATUS: ONLINE
        </div>
      </div>
    </aside>
  );
}

function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><MissionControl /></ProtectedRoute>} />
          <Route path="/shipment/:id" element={<ProtectedRoute><ShipmentDetail /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
          <Route path="/map" element={<ProtectedRoute><MapView /></ProtectedRoute>} />
          <Route path="/financial" element={<ProtectedRoute><FinancialForecast /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout />
      </Router>
    </AuthProvider>
  );
}
