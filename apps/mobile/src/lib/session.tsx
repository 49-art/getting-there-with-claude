import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { ApiError, api, isOnlineConfigured, setBearer, type Me } from './api';

const TOKEN_KEY = 'gt.session';

async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null; // web uses an HttpOnly cookie
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function saveToken(token: string | null) {
  if (Platform.OS === 'web') return;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

interface SessionValue {
  ready: boolean;
  online: boolean;
  me: Me | null;
  signedIn: boolean;
  refresh: () => void;
  register: (username: string) => Promise<{ recoveryKey: string }>;
  signIn: (username: string, recoveryKey: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [tokenLoaded, setTokenLoaded] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    loadToken().then((t) => {
      setBearer(t);
      setTokenLoaded(true);
    });
  }, []);

  const meQuery = useQuery({
    queryKey: ['me'],
    enabled: tokenLoaded && isOnlineConfigured,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    queryFn: async () => {
      try {
        return await api<Me | null>('/me?optional=1');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });

  const adopt = useCallback(
    async (token?: string) => {
      if (token) {
        setBearer(token);
        await saveToken(token);
      }
      await qc.invalidateQueries();
    },
    [qc],
  );

  const value: SessionValue = {
      ready: !isOnlineConfigured || (tokenLoaded && !meQuery.isPending),
      online: isOnlineConfigured,
      me: meQuery.data ?? null,
      signedIn: !!meQuery.data,
      refresh: () => void meQuery.refetch(),
      register: async (username) => {
        const r = await api<{ recoveryKey: string; token?: string }>('/auth/register', { body: { username, device: Platform.OS } });
        await adopt(r.token);
        return { recoveryKey: r.recoveryKey };
      },
      signIn: async (username, recoveryKey) => {
        const r = await api<{ token?: string }>('/auth/signin', { body: { username, recoveryKey, device: Platform.OS } });
        await adopt(r.token);
      },
      signOut: async () => {
        try {
          await api('/auth/signout', { body: {} });
        } catch {
          /* already signed out */
        }
        setBearer(null);
        await saveToken(null);
        qc.setQueryData(['me'], null);
        await qc.invalidateQueries();
      },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
