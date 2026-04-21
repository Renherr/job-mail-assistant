CREATE DATABASE IF NOT EXISTS job_mail_assistant
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_general_ci;

USE job_mail_assistant;

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_name VARCHAR(255) NOT NULL,
  role_name VARCHAR(255) NOT NULL,
  current_stage VARCHAR(64) NOT NULL,
  summary TEXT NULL,
  last_activity_at DATETIME NOT NULL,
  latest_email_id BIGINT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_manually_edited TINYINT(1) NOT NULL DEFAULT 0,
  manual_updated_at DATETIME NULL,
  important_link VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_company_role (company_name, role_name)
);

CREATE TABLE IF NOT EXISTS emails (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  message_id VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  from_name VARCHAR(255) NULL,
  from_address VARCHAR(255) NOT NULL,
  received_at DATETIME NOT NULL,
  snippet TEXT NULL,
  body_text MEDIUMTEXT NULL,
  is_job_related TINYINT(1) NOT NULL DEFAULT 0,
  company_name VARCHAR(255) NULL,
  role_name VARCHAR(255) NULL,
  mail_type VARCHAR(64) NULL,
  needs_action TINYINT(1) NOT NULL DEFAULT 0,
  action_deadline DATETIME NULL,
  suggested_action VARCHAR(255) NULL,
  application_id BIGINT NULL,
  raw_ai_result JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_message_id (message_id),
  KEY idx_received_at (received_at),
  KEY idx_application_id (application_id),
  CONSTRAINT fk_emails_application
    FOREIGN KEY (application_id) REFERENCES applications(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT NOT NULL,
  email_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  due_at DATETIME NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'medium',
  status VARCHAR(16) NOT NULL DEFAULT 'todo',
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_due_at (due_at),
  KEY idx_status (status),
  CONSTRAINT fk_tasks_application
    FOREIGN KEY (application_id) REFERENCES applications(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tasks_email
    FOREIGN KEY (email_id) REFERENCES emails(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_state (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sync_key VARCHAR(128) NOT NULL UNIQUE,
  last_synced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
