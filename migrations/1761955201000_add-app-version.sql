-- Up Migration
ALTER TABLE processing_runs ADD COLUMN app_version varchar(100) NOT NULL DEFAULT 'unknown';

-- Down Migration
-- Disposable demo only: counts/IDs survive, but version values in this column are discarded.
ALTER TABLE processing_runs DROP COLUMN app_version;
