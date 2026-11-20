CREATE TABLE pickles (
  number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 9999999)
);
--> statement-breakpoint
CREATE TABLE votes (
  voter TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('best-tasting', 'worst-tasting', 'most-unique', 'worst-looking', 'worst-smelling')),
  pickle_number INTEGER NOT NULL REFERENCES pickles(number),
  PRIMARY KEY (voter, category)
);
--> statement-breakpoint
CREATE INDEX votes_category_pickle ON votes(category, pickle_number);
