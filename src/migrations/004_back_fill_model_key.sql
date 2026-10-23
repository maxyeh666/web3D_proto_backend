UPDATE assets
SET model_key = 'default-cube'
WHERE model_key IS NULL;

ALTER TABLE assets
ALTER COLUMN model_key SET NOT NULL;