import { createContext, useContext, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));

  async function authenticate(path, email, password) {
    const data = await api(path, { method: 'POST', body: { email, password } });
    localStorage.setItem('token', data.token);
    setToken(data.token);
  }

  const login = (email, password) => authenticate('/auth/login', email, password);
  const register = (email, password) => authenticate('/auth/register', email, password);

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);