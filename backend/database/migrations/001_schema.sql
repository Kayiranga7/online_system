-- =====================================================================
-- IMIZI Garden Plants Platform - Database Schema
-- Covers: User & Auth, E-Commerce, Institution & Workforce, Operations
-- Engine: MySQL 8+
-- =====================================================================

CREATE DATABASE IF NOT EXISTS imizi_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE imizi_db;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- MODULE 1: USER & AUTHENTICATION
-- ---------------------------------------------------------------------

CREATE TABLE districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  province VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone_number VARCHAR(30),
  date_of_birth DATE,
  password_hash VARCHAR(255), -- NULL allowed for Google OAuth-only accounts
  role ENUM('admin','manager','employee','customer') NOT NULL,
  institution_type ENUM('personal','business') DEFAULT NULL, -- customer only
  district_id INT DEFAULT NULL, -- mandatory for all except admin (enforced in app layer)
  google_id VARCHAR(255) DEFAULT NULL UNIQUE,
  avatar_url VARCHAR(500),

  -- Verification & security
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  email_verification_expires DATETIME,
  password_reset_token VARCHAR(255),
  password_reset_expires DATETIME,

  -- 2FA
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret VARCHAR(255),
  two_factor_backup_codes TEXT, -- JSON array, hashed

  -- Approval workflow (employees/managers added by admin/manager)
  status ENUM('pending','active','suspended','rejected') DEFAULT 'active',
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,

  -- Refresh token tracking (rotated)
  refresh_token_hash VARCHAR(255),
  refresh_token_expires DATETIME,

  -- Rate limiting / brute force protection
  failed_login_attempts INT DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  last_login_at DATETIME,
  last_login_ip VARCHAR(45),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL, -- soft delete

  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email),
  INDEX idx_users_district (district_id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,         -- e.g. 'LOGIN', 'ORDER_CREATED', 'EMPLOYEE_APPROVED'
  entity_type VARCHAR(50),              -- e.g. 'order', 'user', 'task'
  entity_id INT,
  details JSON,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MODULE 2: E-COMMERCE (Plants & Designs)
-- ---------------------------------------------------------------------

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('plant','design','equipment') NOT NULL,
  parent_id INT DEFAULT NULL,
  description TEXT,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
  UNIQUE KEY uq_category_name_type (name, type)
) ENGINE=InnoDB;

CREATE TABLE plants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  scientific_name VARCHAR(150),
  category_id INT,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INT DEFAULT 0,
  sunlight_needs ENUM('full_sun','partial_shade','full_shade') DEFAULT 'full_sun',
  water_needs ENUM('low','medium','high') DEFAULT 'medium',
  climate_suitability VARCHAR(255), -- e.g. "tropical, highland" - used by recommendation engine
  mature_height_cm INT,
  care_difficulty ENUM('easy','moderate','advanced') DEFAULT 'easy',
  is_active BOOLEAN DEFAULT TRUE,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  review_count INT DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FULLTEXT KEY ft_plant_search (name, scientific_name, description),
  INDEX idx_plants_category (category_id),
  INDEX idx_plants_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE plant_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plant_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  ar_model_url VARCHAR(500), -- optional 3D/AR asset for AR preview feature
  sort_order INT DEFAULT 0,
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE designs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category_id INT,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  style ENUM('modern','tropical','minimalist','cottage','japanese','xeriscape','other') DEFAULT 'other',
  min_area_sqm DECIMAL(8,2),
  estimated_install_days INT,
  is_active BOOLEAN DEFAULT TRUE,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  review_count INT DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FULLTEXT KEY ft_design_search (name, description),
  INDEX idx_designs_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE design_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  design_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  ar_model_url VARCHAR(500),
  sort_order INT DEFAULT 0,
  FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE design_plants (
  -- which plants are included/recommended within a design package
  design_id INT NOT NULL,
  plant_id INT NOT NULL,
  quantity INT DEFAULT 1,
  PRIMARY KEY (design_id, plant_id),
  FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE,
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  item_type ENUM('plant','design') NOT NULL,
  item_id INT NOT NULL, -- references plants.id or designs.id depending on item_type
  quantity INT NOT NULL DEFAULT 1,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_cart_item (cart_id, item_type, item_id)
) ENGINE=InnoDB;

CREATE TABLE wishlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_type ENUM('plant','design') NOT NULL,
  item_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_wishlist (user_id, item_type, item_id)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(30) NOT NULL UNIQUE, -- e.g. IMZ-2026-000123
  customer_id INT NOT NULL,
  district_id INT NOT NULL, -- drives manager/district routing
  institution_id INT DEFAULT NULL, -- if order is for a business institution
  status ENUM(
    'pending_payment','paid','processing','assigned',
    'in_progress','delivered','installed','completed',
    'cancelled','refunded'
  ) DEFAULT 'pending_payment',
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RWF',
  delivery_address TEXT NOT NULL,
  delivery_latitude DECIMAL(10,7),
  delivery_longitude DECIMAL(10,7),
  requires_installation BOOLEAN DEFAULT FALSE,
  notes TEXT,
  cancelled_at DATETIME,
  cancellation_reason VARCHAR(255),
  -- cancellation rule: customers may self-cancel only while status = pending_payment or paid (app-enforced)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
  INDEX idx_orders_customer (customer_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_district (district_id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  item_type ENUM('plant','design') NOT NULL,
  item_id INT NOT NULL,
  item_name_snapshot VARCHAR(150) NOT NULL, -- preserve name at time of purchase
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  provider ENUM('mtn_mobile_money') NOT NULL DEFAULT 'mtn_mobile_money',
  provider_payment_id VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RWF',
  status ENUM('pending','succeeded','failed','refunded','disputed') DEFAULT 'pending',
  raw_response JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_payments_status (status)
) ENGINE=InnoDB;

CREATE TABLE delivery_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status ENUM('preparing','out_for_delivery','delivered','installation_scheduled','installation_complete') NOT NULL,
  assigned_employee_id INT,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_employee_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  item_type ENUM('plant','design') NOT NULL,
  item_id INT NOT NULL,
  order_id INT, -- verified purchase link
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_verified_purchase BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  UNIQUE KEY uq_review_per_order_item (customer_id, item_type, item_id, order_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MODULE 3: INSTITUTION & WORKFORCE
-- ---------------------------------------------------------------------

CREATE TABLE institutions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('personal','business') NOT NULL,
  owner_customer_id INT NOT NULL, -- the customer who "owns" this institution/garden
  district_id INT NOT NULL,
  address TEXT,
  size_sqm DECIMAL(10,2),
  status ENUM('pending_approval','active','suspended') DEFAULT 'pending_approval',
  approved_by INT,
  approved_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_institutions_district (district_id)
) ENGINE=InnoDB;

-- now that institutions exists, add the FK we deferred on orders
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_institution
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;

CREATE TABLE employee_profiles (
  user_id INT PRIMARY KEY,
  manager_id INT, -- the manager who added/approves this employee
  specialty VARCHAR(150), -- e.g. "landscaping", "irrigation", "tree care"
  hire_date DATE,
  rating DECIMAL(3,2) DEFAULT 0.00,
  tasks_completed INT DEFAULT 0,
  is_available BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE equipment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category_id INT,
  serial_number VARCHAR(100) UNIQUE,
  status ENUM('available','in_use','maintenance','retired') DEFAULT 'available',
  district_id INT,
  condition_notes TEXT,
  purchase_date DATE,
  purchase_cost DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE equipment_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  equipment_id INT NOT NULL,
  employee_id INT NOT NULL,
  task_id INT,
  checked_out_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checked_in_at TIMESTAMP NULL,
  condition_on_return TEXT,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  task_type ENUM('delivery','installation','maintenance','consultation','other') DEFAULT 'other',
  order_id INT,
  institution_id INT,
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  status ENUM('unassigned','assigned','in_progress','completed','cancelled') DEFAULT 'unassigned',
  due_date DATETIME,
  created_by INT NOT NULL, -- manager
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_tasks_status (status)
) ENGINE=InnoDB;

CREATE TABLE task_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  employee_id INT NOT NULL,
  assigned_by INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  completion_notes TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE work_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  employee_id INT NOT NULL,
  report_text TEXT,
  hours_spent DECIMAL(5,2),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE work_report_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_report_id INT NOT NULL,
  photo_url VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_report_id) REFERENCES work_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE transfer_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  request_type ENUM('district','institution') NOT NULL,
  current_district_id INT,
  requested_district_id INT,
  current_institution_id INT,
  requested_institution_id INT,
  reason TEXT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  reviewed_by INT,
  reviewed_at DATETIME,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (current_district_id) REFERENCES districts(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_district_id) REFERENCES districts(id) ON DELETE SET NULL,
  FOREIGN KEY (current_institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE shift_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_shift (employee_id, shift_date, start_time)
) ENGINE=InnoDB;

CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  shift_id INT,
  check_in_at TIMESTAMP,
  check_out_at TIMESTAMP,
  check_in_lat DECIMAL(10,7),
  check_in_lng DECIMAL(10,7),
  status ENUM('present','late','absent','excused') DEFAULT 'present',
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shift_schedules(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MODULE 4: OPERATIONS & NOTIFICATIONS
-- ---------------------------------------------------------------------

CREATE TABLE notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category ENUM(
    'order_update','task_assignment','transfer_request','system_alert',
    'payment','review','escalation','shift_reminder','general'
  ) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(50),
  related_entity_id INT,
  channel ENUM('in_app','email','both') DEFAULT 'in_app',
  is_read BOOLEAN DEFAULT FALSE,
  read_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_unread (user_id, is_read),
  INDEX idx_notif_category (category)
) ENGINE=InnoDB;

CREATE TABLE email_queue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  to_email VARCHAR(150) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  template VARCHAR(100) NOT NULL,
  payload JSON,
  status ENUM('queued','sent','failed') DEFAULT 'queued',
  attempts INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME
) ENGINE=InnoDB;

CREATE TABLE escalations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raised_by INT NOT NULL,
  related_entity_type VARCHAR(50),
  related_entity_id INT,
  subject VARCHAR(200) NOT NULL,
  description TEXT,
  status ENUM('open','in_review','resolved','dismissed') DEFAULT 'open',
  resolved_by INT,
  resolved_at DATETIME,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raised_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- AI plant recommendation inputs (lightweight, rule-based v1)
CREATE TABLE customer_preferences (
  user_id INT PRIMARY KEY,
  preferred_styles JSON,         -- e.g. ["tropical","minimalist"]
  preferred_sunlight VARCHAR(30),
  preferred_water_needs VARCHAR(30),
  budget_max DECIMAL(10,2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
