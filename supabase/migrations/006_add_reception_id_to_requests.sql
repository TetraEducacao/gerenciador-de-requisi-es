-- Add reception_id column to requests table to track which reception this request came from
ALTER TABLE requests ADD COLUMN IF NOT EXISTS reception_id TEXT;

-- Create index for faster lookups by reception
CREATE INDEX IF NOT EXISTS idx_requests_reception_id ON requests(reception_id);

-- Add comment explaining the column
COMMENT ON COLUMN requests.reception_id IS 'Identifies the reception (source ID) that originated this request. Useful for tracking webhooks back to their source.';
