-- DevLens AI — Analysis Results Schema
-- Run after 001_create_tables.sql

USE devlens_ai;

-- ============================================================
-- analysis_results: stores AI-generated insights per repo
-- ============================================================
CREATE TABLE IF NOT EXISTS analysis_results (
  id                    CHAR(36)      NOT NULL,
  repo_id               CHAR(36)      NOT NULL,
  architecture_overview MEDIUMTEXT    DEFAULT NULL,
  start_here_guide      MEDIUMTEXT    DEFAULT NULL,
  data_flow_analysis    MEDIUMTEXT    DEFAULT NULL,
  status                ENUM('pending','processing','ready','failed')
                                      NOT NULL DEFAULT 'pending',
  error_message         TEXT          DEFAULT NULL,
  total_files_analyzed  INT           NOT NULL DEFAULT 0,
  processing_time_ms    INT           DEFAULT NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_analysis_repo (repo_id),
  CONSTRAINT fk_analysis_repo FOREIGN KEY (repo_id)
    REFERENCES repositories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- file_summaries: AI-generated summary per file
-- ============================================================
CREATE TABLE IF NOT EXISTS file_summaries (
  id            CHAR(36)      NOT NULL,
  file_id       CHAR(36)      NOT NULL,
  repo_id       CHAR(36)      NOT NULL,
  summary       TEXT          NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE INDEX idx_summary_file (file_id),
  INDEX idx_summary_repo (repo_id),
  CONSTRAINT fk_summary_file FOREIGN KEY (file_id)
    REFERENCES repo_files(id) ON DELETE CASCADE,
  CONSTRAINT fk_summary_repo FOREIGN KEY (repo_id)
    REFERENCES repositories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- code_issues: AI-detected code quality issues
-- ============================================================
CREATE TABLE IF NOT EXISTS code_issues (
  id                CHAR(36)      NOT NULL,
  file_id           CHAR(36)      NOT NULL,
  repo_id           CHAR(36)      NOT NULL,
  issue_type        ENUM('complexity','dead_code','security','suggestion')
                                  NOT NULL,
  severity          ENUM('high','medium','low','info')
                                  NOT NULL DEFAULT 'info',
  line_number       INT           DEFAULT NULL,
  description       TEXT          NOT NULL,
  code_snippet      TEXT          DEFAULT NULL,
  fix_suggestion    TEXT          DEFAULT NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_issues_repo (repo_id),
  INDEX idx_issues_file (file_id),
  INDEX idx_issues_type (issue_type),
  INDEX idx_issues_severity (severity),
  CONSTRAINT fk_issues_file FOREIGN KEY (file_id)
    REFERENCES repo_files(id) ON DELETE CASCADE,
  CONSTRAINT fk_issues_repo FOREIGN KEY (repo_id)
    REFERENCES repositories(id) ON DELETE CASCADE
) ENGINE=InnoDB;
