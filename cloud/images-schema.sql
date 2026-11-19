-- Apply on shiti-images, the dedicated D1 database for image bytes.
CREATE TABLE IF NOT EXISTS images (
 id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS storage (id INTEGER PRIMARY KEY, bytes INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO storage SELECT 1, COALESCE(SUM(length(bytes)), 0) FROM images;

CREATE TRIGGER IF NOT EXISTS image_capacity BEFORE INSERT ON images
WHEN NOT EXISTS(SELECT 1 FROM images WHERE id=NEW.id)
BEGIN
 SELECT CASE WHEN (SELECT bytes FROM storage WHERE id=1)+length(NEW.bytes)>209715200
 THEN RAISE(ABORT,'storage_limit') END;
END;
CREATE TRIGGER IF NOT EXISTS image_size AFTER INSERT ON images BEGIN
 UPDATE storage SET bytes=bytes+length(NEW.bytes) WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS image_size_after_delete AFTER DELETE ON images BEGIN
 UPDATE storage SET bytes=bytes-length(OLD.bytes) WHERE id=1;
END;
