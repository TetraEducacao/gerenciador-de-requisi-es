-- Remove UNIQUE constraint to allow multiple destinations per reception
ALTER TABLE reception_destinations DROP CONSTRAINT IF EXISTS reception_destinations_source_id_key;

-- Add composite unique constraint to prevent duplicates
ALTER TABLE reception_destinations ADD CONSTRAINT unique_source_destination UNIQUE(source_id, destination_id);

-- Create index for faster lookups when fetching all destinations for a source
CREATE INDEX IF NOT EXISTS idx_reception_destinations_source_dest ON reception_destinations(source_id, destination_id);
