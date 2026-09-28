-- Add user_agent column to requests table to track the original user-agent header
ALTER TABLE requests ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Create index for tracking by user-agent
CREATE INDEX IF NOT EXISTS idx_requests_user_agent ON requests(user_agent);

-- Add comment explaining the column
COMMENT ON COLUMN requests.user_agent IS 'The original user-agent header from the incoming webhook request, passed through to destinations as X-Reception-UserAgent header.';
