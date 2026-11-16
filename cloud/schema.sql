-- Run once on the dedicated D1 database. No credentials or notebook data here.
CREATE TABLE IF NOT EXISTS clock (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
INSERT OR IGNORE INTO clock VALUES(1,0);
CREATE TABLE IF NOT EXISTS records (
 kind TEXT NOT NULL CHECK(kind IN ('question','practice','profile')),
 id TEXT NOT NULL, payload TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1, seq INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(kind,id)
);
CREATE INDEX IF NOT EXISTS records_seq ON records(seq);
CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS storage (id INTEGER PRIMARY KEY, bytes INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO storage VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS image_capacity BEFORE INSERT ON images
WHEN NOT EXISTS(SELECT 1 FROM images WHERE id=NEW.id)
BEGIN
 SELECT CASE WHEN (SELECT bytes FROM storage WHERE id=1)+length(NEW.bytes)>209715200
 THEN RAISE(ABORT,'storage_limit') END;
END;
CREATE TRIGGER IF NOT EXISTS image_size AFTER INSERT ON images BEGIN
 UPDATE storage SET bytes=bytes+length(NEW.bytes) WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS record_insert AFTER INSERT ON records BEGIN
 UPDATE clock SET value=value+1 WHERE id=1;
 UPDATE records SET seq=(SELECT value FROM clock WHERE id=1) WHERE kind=NEW.kind AND id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS record_update AFTER UPDATE OF payload,deleted ON records BEGIN
 UPDATE clock SET value=value+1 WHERE id=1;
 UPDATE records SET seq=(SELECT value FROM clock WHERE id=1) WHERE kind=NEW.kind AND id=NEW.id;
END;
CREATE TABLE IF NOT EXISTS quotas (day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, writes INTEGER NOT NULL DEFAULT 0);
