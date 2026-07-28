import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getAccess, clearTokens, type AgentProfile } from './api';

interface AuthState {
  profile: AgentProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccess()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((r) => setProfile(r.profile))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      profile,
      loading,
      login: async (email, password) => {
        const r = await api.login(email, password);
        setProfile(r.profile);
      },
      logout: async () => {
        await api.logout();
        setProfile(null);
      },
    }),
    [profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
