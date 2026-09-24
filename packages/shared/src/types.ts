// ============================================================================
// Domain Types
// ============================================================================

export type RequestStatus = 'queued' | 'processing' | 'succeeded' | 'retrying' | 'failed' | 'cancelled';
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RateLimitUnit = 'second' | 'minute' | 'hour';

// ============================================================================
// Request/Response Payloads
// ============================================================================

export interface CreateRequestPayload {
  destination_id: string;
  method?: HTTPMethod;
  payload?: unknown;
  headers?: Record<string, string>;
  idempotency_key?: string;
  content_type?: string;
}

export interface RequestResponse {
  request_id: string;
  status: RequestStatus;
  created_at: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// API Key Management
// ============================================================================

export interface ApiKeyPayload {
  name: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string; // Full key only shown once at creation
  source_id: string;
  created_at: string;
}

export interface ApiKeyListResponse {
  id: string;
  name: string;
  source_id: string;
  created_at: string;
  last_used_at?: string;
  revoked_at?: string;
}

// ============================================================================
// Destination Management
// ============================================================================

export interface DestinationConfig {
  id?: string;
  name: string;
  description?: string;
  url: string;
  http_method: HTTPMethod;
  headers?: Record<string, string>;
  auth_config?: Record<string, unknown>;
  timeout_ms?: number;
  rate_limit_value?: number;
  rate_limit_unit?: RateLimitUnit;
  concurrency_limit?: number;
  min_interval_ms?: number;
  max_attempts?: number;
  request_interval_ms?: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Database Models (for internal use)
// ============================================================================

export interface DbApiKey {
  id: string;
  name: string;
  key_hash: string;
  source_id: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface DbSource {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface DbDestination {
  id: string;
  name: string;
  description?: string;
  url: string;
  http_method: string;
  headers?: Record<string, string>;
  auth_config?: Record<string, unknown>;
  timeout_ms: number;
  rate_limit_value?: number;
  rate_limit_unit?: string;
  concurrency_limit: number;
  min_interval_ms: number;
  max_attempts: number;
  request_interval_ms?: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbRequest {
  id: string;
  source_id?: string;
  destination_id: string;
  idempotency_key?: string;
  payload?: unknown;
  content_type: string;
  status: RequestStatus;
  attempts: number;
  created_at: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  last_http_status?: number;
  last_error?: string;
}

export interface DbRequestAttempt {
  id: string;
  request_id: string;
  attempt_number: number;
  started_at: string;
  completed_at?: string;
  http_status?: number;
  duration_ms?: number;
  error_message?: string;
}

// ============================================================================
// Job Queue Types
// ============================================================================

export interface QueueJob {
  requestId: string;
  sourceId?: string;
  destinationId: string;
  payload?: unknown;
  headers?: Record<string, string>;
  method?: HTTPMethod;
  contentType?: string;
}

// ============================================================================
// Worker/Processing Types
// ============================================================================

export interface ProcessingResult {
  success: boolean;
  httpStatus?: number;
  duration: number;
  error?: string;
  retryable: boolean;
}
