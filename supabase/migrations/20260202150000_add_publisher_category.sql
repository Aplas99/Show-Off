-- Add custom publisher and category columns to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS custom_publisher TEXT,
ADD COLUMN IF NOT EXISTS custom_category TEXT;
