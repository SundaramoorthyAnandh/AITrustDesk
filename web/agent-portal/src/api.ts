// Accepts a full URL or a bare host (Render injects the API host via fromService);
// prepends https:// when no protocol is present and strips any trailing slash.
function resolveApiUrl(raw: string | undefined): string {
  if (!raw) return 'http://localhost:4000';
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProto.replace(/\/+$/, '');
}
const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL as string | undefined);

const ACCESS_KEY = 'td_agent_access';
const REFRESH_KEY = 'td_agent_refresh';

export interface AgentProfile {
  accountId: string;
  name: string;
  email: string;
  role: string;
}
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  profile: AgentProfile;
}
export interface TicketRow {
  id: string;
  subject: string | null;
  status: string;
  category: string | null;
  priority: string | null;
  escalated: boolean | null;
  createdAt: string;
  updatedAt: string;
  customerId: string;
  customerName: string;
  orderId: string | null;
}
export interface Ticket {
  id: string;
  customerId: string;
  orderId: string | null;
  subject: string | null;
  body: string;
  status: string;
  category: string | null;
  priority: string | null;
  escalated: boolean | null;
  createdAt: string;
  updatedAt: string;
}
export interface Customer {
  id: string;
  name: string;
  email: string;
  identityVerified: boolean;
  emailVerified: boolean;
}
export interface Order {
  id: string;
  orderDate: string;
  status: string;
  itemName: string | null;
  itemSku: string | null;
  amountCents: number;
  currency: string;
  deliveredAt: string | null;
}
export interface Draft {
  id: string;
  ticketId: string;
  text: string;
  citations: string[];
  status: string;
  editedByAgentId?: string | null;
  editedAt?: string | null;
  createdAt: string;
}
export interface ToolCall {
  id: string;
  ticketId: string;
  toolName: string;
  args: Record<string, unknown>;
  idempotencyKey: string;
  status: string;
  result: Record<string, unknown> | null;
  createdAt: string;
}
export interface Trace {
  id: string;
  ticketId: string | null;
  runType: string;
  retrievedDocIds: string[];
  guardrailResult: string | null;
  finalStatus: string;
  provider: string | null;
  latencyMs: number | null;
  createdAt: string;
}
export interface SearchHit {
  docId: string;
  score: number;
  snippet: string;
}
export interface ToolCatalogEntry {
  name: string;
  label?: string | null;
  description: string;
  sensitive: boolean;
  requiresApproval: boolean;
}
export interface Job<T = unknown> {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'done' | 'error';
  result: T | null;
  error: string | null;
}
export interface EvalMetrics {
  triageAccuracy: number;
  priorityAccuracy: number;
  citationCoverage: number;
  unsafeActionBlockingRate: number;
  escalationBehavior: number;
}
export interface EvalSummary {
  provider: string;
  totalCases: number;
  metrics: EvalMetrics;
  denominators: Record<string, number>;
  cases: Array<{
    id: string;
    description: string;
    predictedCategory: string;
    predictedPriority: string;
    systemEscalated: boolean;
    draftStatus: string;
    guardrailKind: string;
    citations: string[];
    checks: Record<string, boolean | null>;
  }>;
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
    const res = await fetch(`${API_URL}/auth/agent/refresh`, {
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
  if (res.status === 401) {
    clearTokens();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
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

/** Poll a job until it finishes (build-prompt §1.8 non-blocking pattern). */
export async function pollJob<T>(jobId: string, timeoutMs = 30_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const job = await request<Job<T>>(`/jobs/${jobId}`);
    if (job.status === 'done') return job.result as T;
    if (job.status === 'error') throw new Error(job.error ?? 'Job failed');
    if (Date.now() - start > timeoutMs) throw new Error('Job timed out');
    await new Promise((r) => setTimeout(r, 350));
  }
}

export const api = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/auth/agent/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    return data;
  },
  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken)
      await request<void>('/auth/agent/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(
        () => undefined,
      );
    clearTokens();
  },
  me: () => request<{ profile: AgentProfile }>('/auth/agent/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/auth/agent/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  tickets: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ tickets: TicketRow[] }>(`/agent/tickets${qs ? `?${qs}` : ''}`);
  },
  ticket: (id: string) => request<{ ticket: Ticket; customer: Customer; order: Order | null }>(`/agent/tickets/${id}`),
  drafts: (id: string) => request<{ drafts: Draft[] }>(`/agent/tickets/${id}/drafts`),
  actions: (id: string) => request<{ actions: ToolCall[] }>(`/agent/tickets/${id}/actions`),
  traces: (id: string) => request<{ traces: Trace[] }>(`/agent/tickets/${id}/traces`),
  search: (id: string) => request<{ query: string; hits: SearchHit[] }>(`/agent/tickets/${id}/search`),

  triage: (id: string) => request<{ jobId: string }>(`/agent/tickets/${id}/triage`, { method: 'POST' }),
  draft: (id: string) => request<{ jobId: string }>(`/agent/tickets/${id}/draft`, { method: 'POST' }),

  editDraft: (draftId: string, text: string, citations?: string[]) =>
    request<Draft>(`/agent/drafts/${draftId}`, {
      method: 'PATCH',
      body: JSON.stringify(citations ? { text, citations } : { text }),
    }),
  sendDraft: (draftId: string) => request<Draft>(`/agent/drafts/${draftId}/send`, { method: 'POST' }),
  patchTicket: (id: string, body: { status?: string; assign?: boolean }) =>
    request(`/agent/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  catalog: () => request<{ tools: ToolCatalogEntry[] }>('/agent/catalog'),
  recommend: (id: string, toolName: string, args: Record<string, unknown>) =>
    request<ToolCall>(`/agent/tickets/${id}/actions`, { method: 'POST', body: JSON.stringify({ toolName, args }) }),
  approve: (actionId: string, note?: string) =>
    request<ToolCall>(`/agent/actions/${actionId}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
  reject: (actionId: string, note?: string) =>
    request<ToolCall>(`/agent/actions/${actionId}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  runEval: () => request<{ jobId: string }>('/agent/eval', { method: 'POST' }),
  latestEval: () => request<{ run: { id: string; startedAt: string; summary: EvalSummary } | null }>('/agent/eval/latest'),
};
