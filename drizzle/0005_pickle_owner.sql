ALTER TABLE pickles ADD COLUMN owner_name TEXT
CHECK (owner_name IS NULL OR length(owner_name) BETWEEN 1 AND 60);
