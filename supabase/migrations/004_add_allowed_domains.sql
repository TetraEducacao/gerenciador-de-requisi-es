-- Create allowed_domains table for public/unauthenticated access
CREATE TABLE IF NOT EXISTS allowed_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE allowed_domains ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access (admin)
CREATE POLICY "allowed_domains_service_access" ON allowed_domains
  FOR ALL USING (auth.role() = 'service_role');

-- Create index for fast domain lookups
CREATE INDEX IF NOT EXISTS idx_allowed_domains_domain ON allowed_domains(domain);
CREATE INDEX IF NOT EXISTS idx_allowed_domains_enabled ON allowed_domains(enabled) WHERE enabled = true;

-- Add comment
COMMENT ON TABLE allowed_domains IS 'Domains allowed to send requests without authentication (whitelist)';
COMMENT ON COLUMN allowed_domains.domain IS 'Domain name (e.g., n8n-hook.tetraeducacao.com.br)';
COMMENT ON COLUMN allowed_domains.enabled IS 'Whether this domain is currently allowed';
