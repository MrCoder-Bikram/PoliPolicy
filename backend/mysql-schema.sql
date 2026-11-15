-- InsureCare Health Insurance Management System - MySQL Schema
-- Create the database and tables before connecting the app if your database user
-- does not have CREATE TABLE privileges. The app can create tables at startup.

CREATE DATABASE IF NOT EXISTS insurecare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE insurecare;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policies (
  policy_id INT AUTO_INCREMENT PRIMARY KEY,
  policy_name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  premium_amount DECIMAL(10,2) NOT NULL,
  coverage_amount DECIMAL(12,2) NOT NULL,
  term_months INT NOT NULL DEFAULT 12,
  highlights VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  application_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  policy_id INT NOT NULL,
  applicant_age INT NOT NULL,
  nominee_name VARCHAR(150) NOT NULL,
  medical_notes TEXT NOT NULL,
  application_date VARCHAR(20) NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  admin_notes TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (policy_id) REFERENCES policies(policy_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  claim_amount DECIMAL(10,2) NOT NULL,
  hospital_name VARCHAR(180) NOT NULL,
  incident_date VARCHAR(20) NOT NULL,
  claim_details TEXT NOT NULL,
  claim_date VARCHAR(20) NOT NULL,
  status ENUM('Pending', 'Under Review', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  reviewer_notes TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS claim_notes (
  note_id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  author_name VARCHAR(150) NOT NULL,
  author_role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  tags VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at VARCHAR(40) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lead_inquiries (
  inquiry_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  preferred_category VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  user_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('Card', 'Bank ACH', 'UPI') NOT NULL,
  account_mask VARCHAR(100) NOT NULL,
  transaction_ref VARCHAR(120) NOT NULL UNIQUE,
  payment_date VARCHAR(20) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Paid',
  FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  channel ENUM('In-App', 'Email', 'SMS') NOT NULL DEFAULT 'In-App',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT NULL,
  actor_name VARCHAR(150) NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(60) NOT NULL,
  target_id VARCHAR(60) NOT NULL,
  details TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_hospitals (
  hospital_id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_name VARCHAR(180) NOT NULL,
  city VARCHAR(100) NOT NULL,
  specialty VARCHAR(180) NOT NULL,
  cashless_desk TINYINT(1) NOT NULL DEFAULT 1,
  emergency_phone VARCHAR(40) NOT NULL
);

-- Useful queries to view stored records in MySQL:
-- SHOW TABLES;
-- SELECT user_id, full_name, email, role, created_at FROM users;
-- SELECT policy_id, policy_name, category, premium_amount, coverage_amount FROM policies;
-- SELECT application_id, user_id, policy_id, status, application_date FROM applications;
-- SELECT claim_id, hospital_name, claim_amount, status FROM claims;
-- SELECT note_id, claim_id, author_name, title, tags, created_at FROM claim_notes;
