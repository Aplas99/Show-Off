-- Allow items to be created without a linked product (manual creation)
ALTER TABLE items ALTER COLUMN product_ean DROP NOT NULL;

-- Add flag to track if item was verified against the product database
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
