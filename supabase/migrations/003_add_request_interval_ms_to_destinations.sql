-- Add request_interval_ms column to destinations table
-- Allows per-destination configuration of processing intervals

ALTER TABLE destinations
ADD COLUMN request_interval_ms INTEGER DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN destinations.request_interval_ms IS 'Interval in milliseconds to wait between sending requests to this destination (0-60000ms). NULL or 0 means no delay.';

-- Create index for potential future queries
CREATE INDEX IF NOT EXISTS idx_destinations_request_interval_ms ON destinations(request_interval_ms) WHERE request_interval_ms IS NOT NULL;
