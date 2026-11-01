-- Up Migration
CREATE TABLE processing_runs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  input_rows integer NOT NULL CHECK (input_rows BETWEEN 1 AND 20000),
  output_rows integer NOT NULL CHECK (output_rows BETWEEN 0 AND input_rows),
  missing_before integer NOT NULL CHECK (missing_before BETWEEN 0 AND input_rows * 100),
  missing_after integer NOT NULL CHECK (missing_after BETWEEN 0 AND output_rows * 100 AND missing_after <= missing_before),
  duplicates_before integer NOT NULL CHECK (duplicates_before >= 0 AND duplicates_before < input_rows),
  duplicates_after integer NOT NULL CHECK (duplicates_after >= 0 AND duplicates_after <= GREATEST(0, output_rows - 1))
);
CREATE INDEX processing_runs_created_at_idx ON processing_runs (created_at DESC, id DESC);

-- Down Migration
DROP TABLE processing_runs;
