import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { api, ApiError } from '../api/client';
import { clearBindingId, getBindingId, setBindingId } from '../storage/bindingStorage';
import {
  enqueueOffline,
  flushOfflineQueue,
  getOfflineQueueLength,
} from '../storage/offlineQueue';
import type { OfflineAction, SessionData } from '../types';

interface SessionContextValue {
  loading: boolean;
  bindingId: string | null;
  session: SessionData | null;
  offlineCount: number;
  isOnline: boolean;
  error: string | null;
  bind: (inviteCode: string) => Promise<void>;
  refresh: () => Promise<void>;
  unbind: () => Promise<void>;
  submitPainMap: (body: Record<string, unknown>) => Promise<void>;
  submitFeedback: (body: Record<string, unknown>) => Promise<void>;
  syncOffline: () => Promise<number>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [bindingId, setBindingIdState] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshOfflineCount = useCallback(async () => {
    setOfflineCount(await getOfflineQueueLength());
  }, []);

  const syncOffline = useCallback(async () => {
    if (!bindingId) return 0;
    const sent = await flushOfflineQueue((action) =>
      api.sendOfflineAction(bindingId, action)
    );
    await refreshOfflineCount();
    return sent;
  }, [bindingId, refreshOfflineCount]);

  const loadSession = useCallback(
    async (id: string) => {
      const data = await api.session(id);
      setSession(data);
      setError(null);
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!bindingId) return;
    await loadSession(bindingId);
    await syncOffline();
  }, [bindingId, loadSession, syncOffline]);

  const bind = useCallback(async (inviteCode: string) => {
    const res = await api.bind(inviteCode.trim(), 'SocketAI Android');
    await setBindingId(res.bindingId);
    setBindingIdState(res.bindingId);
    setSession({ case: res.case, recentVersions: res.recentVersions });
    setError(null);
    await flushOfflineQueue((action) => api.sendOfflineAction(res.bindingId, action));
    await refreshOfflineCount();
  }, [refreshOfflineCount]);

  const unbind = useCallback(async () => {
    if (bindingId) {
      try {
        await api.unbind(bindingId);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
      }
    }
    await clearBindingId();
    setBindingIdState(null);
    setSession(null);
    setError(null);
  }, [bindingId]);

  const submitWithOffline = useCallback(
    async (action: OfflineAction, onlineSend: () => Promise<void>) => {
      if (!bindingId) throw new Error('未绑定病例');
      const net = await NetInfo.fetch();
      const online = net.isConnected !== false && net.isInternetReachable !== false;

      if (!online) {
        await enqueueOffline(action);
        await refreshOfflineCount();
        return;
      }

      try {
        await onlineSend();
      } catch (e) {
        if (e instanceof ApiError && e.status >= 500) {
          await enqueueOffline(action);
          await refreshOfflineCount();
          return;
        }
        throw e;
      }
    },
    [bindingId, refreshOfflineCount]
  );

  const submitPainMap = useCallback(
    (body: Record<string, unknown>) =>
      submitWithOffline({ type: 'pain-map', body }, async () => {
        await api.painMap(bindingId!, body);
      }),
    [bindingId, submitWithOffline]
  );

  const submitFeedback = useCallback(
    (body: Record<string, unknown>) =>
      submitWithOffline({ type: 'feedback', body }, async () => {
        await api.feedback(bindingId!, body);
      }),
    [bindingId, submitWithOffline]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const id = await getBindingId();
        if (!mounted) return;
        if (id) {
          setBindingIdState(id);
          try {
            await loadSession(id);
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
              await clearBindingId();
              setBindingIdState(null);
            } else {
              setError(e instanceof Error ? e.message : '加载失败');
            }
          }
        }
        await refreshOfflineCount();
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadSession, refreshOfflineCount]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      setIsOnline(online);
      if (online && bindingId) {
        syncOffline().catch(() => {});
      }
    });
    return unsub;
  }, [bindingId, syncOffline]);

  const value = useMemo(
    () => ({
      loading,
      bindingId,
      session,
      offlineCount,
      isOnline,
      error,
      bind,
      refresh,
      unbind,
      submitPainMap,
      submitFeedback,
      syncOffline,
    }),
    [
      loading,
      bindingId,
      session,
      offlineCount,
      isOnline,
      error,
      bind,
      refresh,
      unbind,
      submitPainMap,
      submitFeedback,
      syncOffline,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession 须在 SessionProvider 内使用');
  return ctx;
}
