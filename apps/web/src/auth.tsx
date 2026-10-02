/** Who is signed in, for the whole app. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@gtm/shared';
import { api, ApiProblem, setSignedOutHandler } from './api.js';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  setUser: (user: SessionUser) => void;
}

const Context = createContext<AuthState>({
  user: null,
  loading: true,
  signIn: async () => {
    throw new Error('No auth provider');
  },
  signOut: async () => undefined,
  setUser: () => undefined,
});

export function useAuth(): AuthState {
  return useContext(Context);
}

/** The signed-in person, for screens that only render behind a guard. */
export function useUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('This screen needs a signed-in person');
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: SessionUser }>('/auth/me')
      .then((body) => {
        if (!cancelled) setUser(body.user);
      })
      .catch((error: unknown) => {
        // A 401 here just means nobody is signed in yet.
        if (!(error instanceof ApiProblem) || error.status !== 401) {
          console.error('Could not read the session', error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 from anywhere sends the app back to the sign-in screen.
  useEffect(() => {
    setSignedOutHandler(() => {
      setUser(null);
      queryClient.clear();
    });
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const body = await api.post<{ user: SessionUser }>('/auth/login', { email, password });
      setUser(body.user);
      queryClient.clear();
      return body.user;
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
    queryClient.clear();
    // Anything typed but unsaved belongs to the person who was signed in.
    try {
      sessionStorage.clear();
    } catch {
      // Private browsing can refuse; nothing here is essential.
    }
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut, setUser }),
    [user, loading, signIn, signOut],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
