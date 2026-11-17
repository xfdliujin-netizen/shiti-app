-- Additive migration: independent of records, images, and child learning history.
CREATE TABLE IF NOT EXISTS bank_questions (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 12),
 knowledge_id TEXT NOT NULL,
 difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 3),
 review_status TEXT NOT NULL CHECK(review_status IN ('pending','checked','rejected')),
 batch TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(length(payload)<=12000)
);
CREATE INDEX IF NOT EXISTS bank_topic_grade ON bank_questions(subject,review_status,knowledge_id,grade,difficulty,id);
CREATE INDEX IF NOT EXISTS bank_grade ON bank_questions(subject,review_status,grade,difficulty,id);
CREATE TABLE IF NOT EXISTS bank_batches (
 id TEXT PRIMARY KEY,source_commit TEXT NOT NULL,item_count INTEGER NOT NULL,manifest_sha TEXT NOT NULL
);
