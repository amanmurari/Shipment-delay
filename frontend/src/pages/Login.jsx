import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser } from '../api';
import { LogIn, UserPlus, Package } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState('login');   // 'login' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await loginUser(form.username, form.password);
        login({ username: data.username, role: data.role, token: data.access_token });
        navigate(data.role === 'admin' ? '/admin' : '/');
      } else {
        await registerUser(form.username, form.email, form.password, form.role);
        setMode('login');
        setError('');
        setForm(prev => ({ ...prev, email: '', password: '' }));
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <Package size={36} className="login-logo" />
          <h1>ShipGuard AI</h1>
          <p>predictive shipment management</p>
        </div>

        {/* Tab switcher */}
        <div className="login-tabs">
          <button
            className={`login-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            <LogIn size={15} /> Sign In
          </button>
          <button
            className={`login-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            <UserPlus size={15} /> Register
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              name="username"
              type="text"
              placeholder="Enter username"
              value={form.username}
              onChange={handleChange}
              required
              autoComplete="username"
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label>Email</label>
              <input
                name="email"
                type="email"
                placeholder="Enter email"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Password</label>
            <input
              name="password"
              type="password"
              placeholder="Enter password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label>Role</label>
              <select name="role" value={form.role} onChange={handleChange}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Demo credentials hint */}
        <div className="login-hint">
          <span>Demo:</span> admin / admin123 &nbsp;|&nbsp; user1 / user123
        </div>
      </div>
    </div>
  );
}