CREATE TRIGGER remove_pickle_votes
BEFORE DELETE ON pickles
BEGIN
  DELETE FROM votes WHERE pickle_number = OLD.number;
END;
--> statement-breakpoint
CREATE TABLE pickle_delete_limit (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time_bucket INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
