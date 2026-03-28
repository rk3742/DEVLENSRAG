-- DevLens AI — Database Schema
-- Run: mysql -u root -p devlens_ai < migrations/001_create_tables.sql

CREATE DATABASE IF NOT EXISTS devlens_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE devlens_ai;

-- ============================================================
-- repositories: tracks every connected GitHub repo
-- ============================================================
CREATE TABLE IF NOT EXISTS repositories (
  id            CHAR(36)      NOT NULL,
  user_id       CHAR(36)      NOT NULL DEFAULT 'default-user',
  github_url    VARCHAR(500)  NOT NULL,
  owner         VARCHAR(255)  NOT NULL,
  name          VARCHAR(255)  NOT NULL,
  default_branch VARCHAR(100) NOT NULL DEFAULT 'main',
  clone_path    VARCHAR(500)  DEFAULT NULL,
  status        ENUM('pending','cloning','parsing','chunking','ready','failed')
                              NOT NULL DEFAULT 'pending',
  total_files   INT           NOT NULL DEFAULT 0,
  total_size_bytes BIGINT     NOT NULL DEFAULT 0,
  error_message TEXT          DEFAULT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_repos_user (user_id),
  INDEX idx_repos_status (status),
  UNIQUE INDEX idx_repos_url_user (github_url, user_id)
) ENGINE=InnoDB;

-- ============================================================
-- repo_files: one row per parsed source file
-- ============================================================
CREATE TABLE IF NOT EXISTS repo_files (
  id            CHAR(36)      NOT NULL,
  repo_id       CHAR(36)      NOT NULL,
  file_path     VARCHAR(1000) NOT NULL,
  language      VARCHAR(50)   DEFAULT NULL,
  size_bytes    INT           NOT NULL DEFAULT 0,
  line_count    INT           NOT NULL DEFAULT 0,
  content_hash  CHAR(64)      DEFAULT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_files_repo (repo_id),
  INDEX idx_files_language (language),
  CONSTRAINT fk_files_repo FOREIGN KEY (repo_id)
    REFERENCES repositories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- file_chunks: token-sized segments of each file for AI processing
-- ============================================================
CREATE TABLE IF NOT EXISTS file_chunks (
  id            CHAR(36)      NOT NULL,
  file_id       CHAR(36)      NOT NULL,
  chunk_index   INT           NOT NULL DEFAULT 0,
  content       MEDIUMTEXT    NOT NULL,
  token_count   INT           NOT NULL DEFAULT 0,
  start_line    INT           NOT NULL DEFAULT 1,
  end_line      INT           NOT NULL DEFAULT 1,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_chunks_file (file_id),
  INDEX idx_chunks_order (file_id, chunk_index),
  CONSTRAINT fk_chunks_file FOREIGN KEY (file_id)
    REFERENCES repo_files(id) ON DELETE CASCADE
) ENGINE=InnoDB;
