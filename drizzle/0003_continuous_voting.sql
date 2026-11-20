CREATE TABLE new_pickles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_number INTEGER NOT NULL UNIQUE CHECK (entry_number BETWEEN 1 AND 9999999),
  pickle_name TEXT CHECK (pickle_name IS NULL OR length(pickle_name) BETWEEN 1 AND 60),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO new_pickles (id, entry_number, pickle_name)
SELECT number, number, name FROM pickles;
--> statement-breakpoint
CREATE TABLE new_votes (
  id TEXT PRIMARY KEY NOT NULL,
  pickle_id INTEGER NOT NULL REFERENCES new_pickles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('best-tasting', 'worst-tasting', 'most-unique', 'worst-looking', 'worst-smelling')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO new_votes (id, pickle_id, category)
SELECT 'legacy:' || rowid, pickle_number, category FROM votes;
--> statement-breakpoint
DROP TRIGGER remove_pickle_votes;
--> statement-breakpoint
DROP TABLE votes;
--> statement-breakpoint
DROP TABLE pickles;
--> statement-breakpoint
ALTER TABLE new_pickles RENAME TO pickles;
--> statement-breakpoint
ALTER TABLE new_votes RENAME TO votes;
--> statement-breakpoint
CREATE INDEX votes_pickle_category ON votes (pickle_id, category);
--> statement-breakpoint
DROP TABLE pickle_delete_limit;
