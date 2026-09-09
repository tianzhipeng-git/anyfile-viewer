CREATE TABLE feedback (
  project_key TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'other')),
  message TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'ignored')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (project_key, submission_id)
);
CREATE INDEX feedback_project_created ON feedback (project_key, created_at DESC);
