-- Add filter_rules column to reception_destinations for conditional routing
ALTER TABLE reception_destinations ADD COLUMN IF NOT EXISTS filter_rules JSONB;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_reception_destinations_filter_rules ON reception_destinations USING GIN(filter_rules);

-- Add comment explaining the column
COMMENT ON COLUMN reception_destinations.filter_rules IS 'JSON rules to conditionally route webhooks. Example: {"user_agent": "GuzzleHttp/7", "headers": {"x-custom": "value"}, "payload": {"status": "PAID"}}';
