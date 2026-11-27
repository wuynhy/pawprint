import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { api, setAuthToken, setUnauthorizedHandler } from './api';

const TOKEN_KEY = 'pawprint.token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  const signIn = useCallback(async (token) => {
    setAuthToken(token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setUser(await api.me());
  }, []);

  useEffect(() => {
    // Expired or revoked tokens (e.g. after a password change elsewhere) send the user back to login.
    setUnauthorizedHandler(() => void signOut());

    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        try {
          await signIn(token);
        } catch {
          await signOut();
        }
      }
      setLoading(false);
    })();
  }, [signIn, signOut]);

  return <AuthContext.Provider value={{ user, loading, signIn, signOut, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
