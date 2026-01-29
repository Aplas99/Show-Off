-- Add custom fields to items table for free-form creation
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS custom_title TEXT,
ADD COLUMN IF NOT EXISTS custom_brand TEXT;
