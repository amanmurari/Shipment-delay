import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // { username, role, token }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('shipguard_auth');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('shipguard_auth');
      }
    }
    setLoading(false);
  }, []);

  function login(userData) {
    setUser(userData);
    localStorage.setItem('shipguard_auth', JSON.stringify(userData));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('shipguard_auth');
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
