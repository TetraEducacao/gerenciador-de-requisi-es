/**
 * API client for Request Manager
 * Handles all communication with the backend API
 * - Loading states
 * - Error handling
 * - Timeout management
 * - Unauthorized access (no secrets in frontend)
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const timeout = options.timeout || REQUEST_TIMEOUT_MS;

  // Get JWT token from Supabase Auth
  let authHeader: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    try {
      const { getAccessToken } = await import('./supabase');
      const token = await getAccessToken();
      if (token) {
        authHeader = { Authorization: `Bearer ${token}` };
      }
    } catch (err) {
      console.error('Failed to get access token:', err);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      // Clear the rejected session before login checks it again.
      if (typeof window !== 'undefined') {
        const { invalidateSession } = await import('./supabase');
        await invalidateSession();
      }
      throw new UnauthorizedError('Sessão inválida ou expirada. Entre novamente.');
    }

    if (response.status === 403) {
      throw new ApiError(403, 'You do not have permission to access this resource');
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(response.status, `HTTP ${response.status}: ${response.statusText}`, data);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError || error instanceof UnauthorizedError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request to ${endpoint} timed out after ${timeout}ms`);
    }

    throw new Error(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Dashboard
// ============================================================================

export interface DashboardMetrics {
  received: number;
  queued: number;
  processing: number;
  succeeded: number;
  failed: number;
  retrying: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return request<DashboardMetrics>('/admin/dashboard/metrics');
}

export interface RecentActivity {
  id: string;
  source_name: string;
  destination_name: string;
  status: string;
  http_status?: number;
  duration_ms: number;
  created_at: string;
}

export async function getRecentActivity(limit = 10): Promise<RecentActivity[]> {
  const data = await request<{ items: RecentActivity[] }>(`/admin/dashboard/activity?limit=${limit}`);
  return data.items;
}

// ============================================================================
// Destinations
// ============================================================================

export interface Destination {
  id: string;
  name: string;
  description?: string;
  url: string;
  http_method: string;
  rate_limit_value?: number;
  rate_limit_unit?: string;
  concurrency_limit: number;
  min_interval_ms: number;
  timeout_ms: number;
  max_attempts: number;
  request_interval_ms?: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDestinationInput {
  name: string;
  description?: string;
  url: string;
  http_method: string;
  rate_limit_value?: number;
  rate_limit_unit?: string;
  concurrency_limit: number;
  min_interval_ms: number;
  timeout_ms: number;
  max_attempts: number;
  request_interval_ms?: number;
}

export async function getDestinations(): Promise<Destination[]> {
  const data = await request<{ data: Destination[] }>('/admin/destinations');
  return data.data;
}

export async function getDestination(id: string): Promise<Destination> {
  const data = await request<{ data: Destination }>(`/admin/destinations/${id}`);
  return data.data;
}

export async function createDestination(data: CreateDestinationInput): Promise<Destination> {
  const result = await request<{ data: Destination }>('/admin/destinations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.data;
}

export async function updateDestination(id: string, data: Partial<CreateDestinationInput>): Promise<Destination> {
  const result = await request<{ data: Destination }>(`/admin/destinations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return result.data;
}

export async function deleteDestination(id: string): Promise<void> {
  await request(`/admin/destinations/${id}`, {
    method: 'DELETE',
  });
}

export async function toggleDestination(id: string, enabled: boolean): Promise<Destination> {
  const result = await request<{ data: Destination }>(`/admin/destinations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
  return result.data;
}

// ============================================================================
// Requests
// ============================================================================

export interface Request {
  id: string;
  source_id: string;
  source_name?: string;
  destination_id: string;
  destination_name?: string;
  status: string;
  attempts: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  last_http_status?: number;
  last_error?: string;
  duration_ms?: number;
}

export interface RequestsListParams {
  status?: string;
  source_id?: string;
  destination_id?: string;
  limit?: number;
  offset?: number;
}

export async function getRequests(params: RequestsListParams = {}): Promise<{ data: Request[]; total: number }> {
  const query = new URLSearchParams();
  if (params.status) query.append('status', params.status);
  if (params.source_id) query.append('source_id', params.source_id);
  if (params.destination_id) query.append('destination_id', params.destination_id);
  if (params.limit) query.append('limit', String(params.limit));
  if (params.offset) query.append('offset', String(params.offset));

  return request<{ data: Request[]; total: number }>(`/admin/requests?${query.toString()}`);
}

export interface RequestDetail extends Request {
  payload?: Record<string, unknown>;
  attempts_list?: {
    attempt_number: number;
    started_at: string;
    completed_at?: string;
    http_status?: number;
    duration_ms?: number;
    error_message?: string;
  }[];
}

export async function getRequestDetail(id: string): Promise<RequestDetail> {
  const data = await request<{ data: RequestDetail }>(`/admin/requests/${id}`);
  return data.data;
}

export async function retryRequest(id: string): Promise<void> {
  await request(`/admin/requests/${id}/retry`, {
    method: 'POST',
  });
}

// ============================================================================
// API Keys
// ============================================================================

export interface ApiKey {
  id: string;
  name: string;
  key_prefix?: string;
  source_id: string;
  source_name?: string;
  created_at: string;
  last_used_at?: string;
  revoked_at?: string;
}

export async function getApiKeys(): Promise<ApiKey[]> {
  const data = await request<{ data: Array<{
    id: string; name: string; sourceId: string; createdAt: string;
    lastUsedAt?: string; revokedAt?: string;
  }> }>('/admin/api-keys');
  return data.data.map((key) => ({
    id: key.id, name: key.name, source_id: key.sourceId,
    created_at: key.createdAt, last_used_at: key.lastUsedAt, revoked_at: key.revokedAt,
  }));
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string; // Full key, only returned once
  key_prefix?: string;
  created_at?: string;
}

export async function createApiKey(name: string, source_id: string): Promise<CreateApiKeyResponse> {
  const result = await request<{ data: CreateApiKeyResponse }>('/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name, sourceId: source_id }),
  });
  return result.data;
}

export async function revokeApiKey(id: string): Promise<void> {
  await request(`/admin/api-keys/${id}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Health
// ============================================================================

export interface HealthStatus {
  api: 'online' | 'degraded' | 'offline';
  redis: 'online' | 'degraded' | 'offline';
  worker: 'online' | 'degraded' | 'offline';
  database?: 'online' | 'degraded' | 'offline';
}

export async function getHealth(): Promise<HealthStatus> {
  try {
    return await request<HealthStatus>('/admin/health', { timeout: 5000 });
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    // Fallback if /admin/health doesn't exist yet
    return {
      api: 'offline',
      redis: 'offline',
      worker: 'offline',
    };
  }
}
