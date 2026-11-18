CREATE TABLE IF NOT EXISTS scores (
  day        TEXT    NOT NULL,
  cls        TEXT    NOT NULL,
  no         INTEGER NOT NULL,
  ok         INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  best       INTEGER NOT NULL DEFAULT 0,
  plays      INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (day, cls, no)
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (day, cls, ok DESC, best DESC);
