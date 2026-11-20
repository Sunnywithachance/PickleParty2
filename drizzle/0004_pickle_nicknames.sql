ALTER TABLE pickles ADD COLUMN pickle_nickname TEXT
CHECK (pickle_nickname IS NULL OR length(pickle_nickname) BETWEEN 1 AND 60);
