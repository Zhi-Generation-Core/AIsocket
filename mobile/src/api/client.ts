import { API_BASE } from '../config';
import type {
  BindResponse,
  OfflineAction,
  SessionData,
  SummaryData,
  TimelineData,
} from '../types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { bindingId?: string | null } = {}
): Promise<T> {
  const { bindingId, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(bindingId ? { 'X-Binding-Id': bindingId } : {}),
      ...(headers || {}),
    },
  });

  const text = await res.text();
  let data: { error?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `请求失败 (${res.status})`, res.status);
  }

  return (data ?? {}) as T;
}

export const api = {
  bind(inviteCode: string, deviceLabel?: string) {
    return request<BindResponse>('/bind', {
      method: 'POST',
      body: JSON.stringify({ inviteCode, deviceLabel }),
    });
  },

  session(bindingId: string) {
    return request<SessionData>('/session', { bindingId });
  },

  painMap(bindingId: string, body: Record<string, unknown>) {
    return request<{ id: string }>('/pain-map', {
      method: 'POST',
      bindingId,
      body: JSON.stringify(body),
    });
  },

  feedback(bindingId: string, body: Record<string, unknown>) {
    return request<{ id: string; type: string }>('/feedback', {
      method: 'POST',
      bindingId,
      body: JSON.stringify(body),
    });
  },

  timeline(bindingId: string) {
    return request<TimelineData>('/timeline', { bindingId });
  },

  summary(bindingId: string, days = 14) {
    return request<SummaryData>(`/summary?days=${days}`, { bindingId });
  },

  unbind(bindingId: string) {
    return request<{ ok: boolean }>('/unbind', {
      method: 'POST',
      bindingId,
      body: JSON.stringify({}),
    });
  },

  async sendOfflineAction(bindingId: string, action: OfflineAction) {
    if (action.type === 'pain-map') {
      await api.painMap(bindingId, action.body);
      return;
    }
    await api.feedback(bindingId, action.body);
  },
};
