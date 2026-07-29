// Accepts a full URL or a bare host (Render injects the API host via fromService);
// prepends https:// when no protocol is present and strips any trailing slash.
function resolveApiUrl(raw: string | undefined): string {
  if (!raw) return 'http://localhost:4000';
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProto.replace(/\/+$/, '');
}
const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL as string | undefined);

const ACCESS_KEY = 'td_customer_access';
const REFRESH_KEY = 'td_customer_refresh';

export interface Profile {
  accountId: string;
  customerId: string;
  name: string;
  email: string;
  identityVerified?: boolean;
}
export interface Order {
  id: string;
  orderDate: string;
  status: string;
  itemName: string | null;
  itemSku: string | null;
  quantity: number;
  amountCents: number;
  currency: string;
  deliveredAt: string | null;
}
export interface Product {
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  priceCents: number;
  currency: string;
  active: boolean;
}
export interface Ticket {
  id: string;
  subject: string | null;
  body: string;
  status: string;
  category: string | null;
  priority: string | null;
  escalated: boolean | null;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Reply {
  id: string;
  text: string;
  citations: string[];
  status: string;
  createdAt: string;
}
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  profile: Profile;
}

export function getAccess(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}
function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// Refresh tokens are single-use (rotated on the server), so concurrent 401s must
// NOT each fire their own refresh — that would consume+revoke the token multiple
// times and cascade into failures. We de-dupe: all callers share one in-flight refresh.
let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    const res = await fetch(`${API_URL}/auth/customer/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponse;
    setTokens(data.accessToken, data.refreshToken);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null) headers.set('content-type', 'application/json');
  const token = getAccess();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry && (await refresh())) {
    return request<T>(path, init, false);
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      const fieldErrors = body?.details?.fieldErrors as Record<string, string[]> | undefined;
      const firstFieldError = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
      message = body.message ?? firstFieldError ?? body.error ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/auth/customer/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    return data;
  },
  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/auth/customer/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    return data;
  },
  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      await request<void>('/auth/customer/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(
        () => undefined,
      );
    }
    clearTokens();
  },
  me: () => request<{ profile: Profile }>('/auth/customer/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/auth/customer/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  orders: () => request<{ orders: Order[] }>('/me/orders'),
  products: () => request<{ products: Product[] }>('/me/products'),
  createOrder: (payload: { sku: string; quantity: number }) =>
    request<{ order: Order }>('/me/orders', { method: 'POST', body: JSON.stringify(payload) }),
  tickets: () => request<{ tickets: Ticket[] }>('/me/tickets'),
  ticket: (id: string) => request<{ ticket: Ticket; order: Order | null; replies: Reply[] }>(`/me/tickets/${id}`),
  createTicket: (payload: { subject: string; body: string; orderId?: string | null }) =>
    request<{ ticket: Ticket }>('/me/tickets', { method: 'POST', body: JSON.stringify(payload) }),
  replyToTicket: (id: string, text: string) =>
    request<{ reply: Reply }>(`/me/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
  patchTicket: (id: string, body: { status: string }) =>
    request<{ ticket: Ticket; order: Order | null; replies: Reply[] }>(`/me/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
