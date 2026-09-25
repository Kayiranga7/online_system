-- =====================================================================
-- KYC (Know Your Customer) for business-type customers
-- =====================================================================

USE imizi_db;

-- Track KYC verification status on the users table
ALTER TABLE users
  ADD COLUMN kyc_status ENUM('none','pending','submitted','approved','rejected') DEFAULT 'none'
    AFTER institution_type;

-- Individual document submissions
CREATE TABLE kyc_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  document_type ENUM('national_id','business_license','tax_certificate','utility_bill','other') NOT NULL,
  document_url VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  reviewed_by INT DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_kyc_user (user_id),
  INDEX idx_kyc_status (status)
) ENGINE=InnoDB;
