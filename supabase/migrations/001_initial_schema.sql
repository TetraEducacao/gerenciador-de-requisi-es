-- sources table (create first - no dependencies)
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- api_keys table (depends on sources)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT revoked_after_created CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- destinations table (no dependencies)
CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  url TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST' CHECK (http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  headers JSONB,
  auth_config JSONB,
  timeout_ms INTEGER DEFAULT 30000 CHECK (timeout_ms > 0),
  rate_limit_value INTEGER CHECK (rate_limit_value IS NULL OR rate_limit_value > 0),
  rate_limit_unit TEXT CHECK (rate_limit_unit IS NULL OR rate_limit_unit IN ('second', 'minute', 'hour')),
  concurrency_limit INTEGER DEFAULT 5 CHECK (concurrency_limit > 0),
  min_interval_ms INTEGER DEFAULT 0 CHECK (min_interval_ms >= 0),
  max_attempts INTEGER DEFAULT 3 CHECK (max_attempts > 0),
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- requests table (depends on sources, destinations)
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
  source_name TEXT,
  destination_name TEXT,
  idempotency_key TEXT UNIQUE,
  payload JSONB,
  headers JSONB,
  method TEXT DEFAULT 'POST',
  content_type TEXT DEFAULT 'application/json',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'retrying', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_http_status INTEGER,
  last_error TEXT,
  duration_ms INTEGER
);

-- request_attempts table (depends on requests)
CREATE TABLE IF NOT EXISTS request_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  http_status INTEGER,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_message TEXT,
  UNIQUE(request_id, attempt_number)
);

-- audit_logs table (no dependencies)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================================================
-- INDEXES (for frequent queries)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_api_keys_source_id ON api_keys(source_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys(revoked_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_destination_id ON requests(destination_id);
CREATE INDEX IF NOT EXISTS idx_requests_source_id ON requests(source_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_idempotency_key ON requests(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_request_attempts_request_id ON request_attempts(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role access (needed for backend API)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sources' AND policyname = 'sources_service_access'
  ) THEN
    CREATE POLICY "sources_service_access" ON sources FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'destinations' AND policyname = 'destinations_service_access'
  ) THEN
    CREATE POLICY "destinations_service_access" ON destinations FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'api_keys' AND policyname = 'api_keys_service_access'
  ) THEN
    CREATE POLICY "api_keys_service_access" ON api_keys FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests' AND policyname = 'requests_service_access'
  ) THEN
    CREATE POLICY "requests_service_access" ON requests FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'request_attempts' AND policyname = 'request_attempts_service_access'
  ) THEN
    CREATE POLICY "request_attempts_service_access" ON request_attempts FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_service_access'
  ) THEN
    CREATE POLICY "audit_logs_service_access" ON audit_logs FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
