-- Add reception_destinations table to link sources to destinations
CREATE TABLE IF NOT EXISTS reception_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(source_id)
);

-- Enable RLS
ALTER TABLE reception_destinations ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "reception_destinations_service_access" ON reception_destinations
  FOR ALL USING (auth.role() = 'service_role');

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_reception_destinations_source_id ON reception_destinations(source_id);
CREATE INDEX IF NOT EXISTS idx_reception_destinations_destination_id ON reception_destinations(destination_id);
