-- Create external_tokens table for third-party authorization
CREATE TABLE IF NOT EXISTS external_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE external_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access (admin)
CREATE POLICY "external_tokens_service_access" ON external_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_external_tokens_token ON external_tokens(token);
CREATE INDEX IF NOT EXISTS idx_external_tokens_enabled ON external_tokens(enabled) WHERE enabled = true;

-- Add comment
COMMENT ON TABLE external_tokens IS 'Authorized third-party API tokens (e.g., Guru, n8n, Zapier)';
COMMENT ON COLUMN external_tokens.name IS 'Name/label of the third-party (e.g., Guru, n8n)';
COMMENT ON COLUMN external_tokens.token IS 'The actual token/secret';
COMMENT ON COLUMN external_tokens.enabled IS 'Whether this token is currently active';
