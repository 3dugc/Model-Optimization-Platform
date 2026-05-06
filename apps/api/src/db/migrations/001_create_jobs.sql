CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) PRIMARY KEY,
  pipeline_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  source_key VARCHAR(512) NOT NULL,
  result_key VARCHAR(512) NULL,
  artifact_type VARCHAR(64) NULL,
  options_json JSON NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  locked_by VARCHAR(128) NULL,
  locked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  completed_at DATETIME NULL,

  INDEX idx_status_created_at (status, created_at),
  INDEX idx_pipeline_status (pipeline_type, status),
  INDEX idx_locked_at (locked_at)
);

CREATE TABLE IF NOT EXISTS job_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  message TEXT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL,

  INDEX idx_job_events_job_created (job_id, created_at),
  CONSTRAINT fk_job_events_job
    FOREIGN KEY (job_id) REFERENCES jobs(id)
    ON DELETE CASCADE
);
