-- CF-03: Enforce NOT NULL on folders.color_hex
-- Backfill any existing NULLs before applying constraint

UPDATE folders
SET color_hex = '#7c5cbf'
WHERE color_hex IS NULL;

ALTER TABLE folders
  ALTER COLUMN color_hex SET NOT NULL;
