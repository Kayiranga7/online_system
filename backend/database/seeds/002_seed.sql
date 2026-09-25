-- =====================================================================
-- IMIZI Seed Data
-- Run AFTER 001_schema.sql
-- Demo password for ALL seeded users: Passw0rd!23
-- (bcrypt hash generated with cost factor 12 - see backend/database/seeds/generate-hash.js)
-- =====================================================================

USE imizi_db;

-- ---------------------------------------------------------------------
-- Districts (Rwanda districts as locally-grounded examples)
-- ---------------------------------------------------------------------
INSERT INTO districts (name, province) VALUES
('Gasabo', 'Kigali City'),
('Kicukiro', 'Kigali City'),
('Nyarugenge', 'Kigali City'),
('Musanze', 'Northern Province'),
('Huye', 'Southern Province'),
('Rubavu', 'Western Province'),
('Rwamagana', 'Eastern Province');

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
INSERT INTO categories (name, type, description) VALUES
('Indoor Plants', 'plant', 'Plants suited for indoor environments'),
('Outdoor Plants', 'plant', 'Plants suited for gardens and outdoor landscaping'),
('Succulents', 'plant', 'Low-maintenance, drought-tolerant plants'),
('Flowering Plants', 'plant', 'Plants grown primarily for their blooms'),
('Trees & Shrubs', 'plant', 'Larger woody plants for landscaping'),
('Modern Gardens', 'design', 'Clean-lined, minimalist garden layouts'),
('Tropical Gardens', 'design', 'Lush, dense planting style suited to tropical climates'),
('Xeriscape Gardens', 'design', 'Water-efficient, drought-resistant garden designs'),
('Hand Tools', 'equipment', 'Manual gardening tools'),
('Power Equipment', 'equipment', 'Motorized landscaping equipment'),
('Irrigation Gear', 'equipment', 'Watering and irrigation equipment');

-- ---------------------------------------------------------------------
-- Demo Users
-- Password hash below corresponds to plaintext: Passw0rd!23
-- ---------------------------------------------------------------------
INSERT INTO users (full_name, email, phone_number, date_of_birth, password_hash, role, institution_type, district_id, email_verified, status) VALUES
('Ange Admin', 'admin@imizi.rw', '+250788000001', '1990-01-15', '$2b$12$Rr8gvlAxGui9FEgLRpwUzevm0GHk3wbTnHinACfBO3DR./nXiiITK', 'admin', NULL, NULL, TRUE, 'active'),
('Marie Manager', 'manager@imizi.rw', '+250788000002', '1988-05-20', '$2b$12$Rr8gvlAxGui9FEgLRpwUzevm0GHk3wbTnHinACfBO3DR./nXiiITK', 'manager', NULL, 1, TRUE, 'active'),
('Eric Employee', 'employee@imizi.rw', '+250788000003', '1995-09-10', '$2b$12$Rr8gvlAxGui9FEgLRpwUzevm0GHk3wbTnHinACfBO3DR./nXiiITK', 'employee', NULL, 1, TRUE, 'active'),
('Claudine Customer', 'customer@imizi.rw', '+250788000004', '1998-03-25', '$2b$12$Rr8gvlAxGui9FEgLRpwUzevm0GHk3wbTnHinACfBO3DR./nXiiITK', 'customer', 'personal', 1, TRUE, 'active'),
('Kigali Greens Ltd', 'business@imizi.rw', '+250788000005', '1985-11-02', '$2b$12$Rr8gvlAxGui9FEgLRpwUzevm0GHk3wbTnHinACfBO3DR./nXiiITK', 'customer', 'business', 2, TRUE, 'active');

UPDATE users SET approved_by = 1, approved_at = NOW() WHERE role IN ('manager','employee');

INSERT INTO employee_profiles (user_id, manager_id, specialty, hire_date, is_available) VALUES
(3, 2, 'Landscaping & Installation', '2024-02-01', TRUE);

-- ---------------------------------------------------------------------
-- Plants (locally relevant examples)
-- ---------------------------------------------------------------------
INSERT INTO plants (name, scientific_name, category_id, description, price, stock_quantity, sunlight_needs, water_needs, climate_suitability, mature_height_cm, care_difficulty, created_by) VALUES
('Snake Plant', 'Dracaena trifasciata', 1, 'Hardy indoor plant, tolerates low light and irregular watering. Great for offices.', 12.00, 50, 'partial_shade', 'low', 'tropical, highland', 90, 'easy', 1),
('Aloe Vera', 'Aloe barbadensis miller', 3, 'Succulent with medicinal sap, thrives in sunny windows or dry gardens.', 8.50, 80, 'full_sun', 'low', 'tropical, semi-arid', 60, 'easy', 1),
('Bird of Paradise', 'Strelitzia reginae', 2, 'Bold tropical foliage plant, statement piece for gardens and patios.', 35.00, 20, 'full_sun', 'medium', 'tropical', 200, 'moderate', 1),
('Hibiscus', 'Hibiscus rosa-sinensis', 4, 'Vibrant flowering shrub, blooms year-round in warm climates like Kigali.', 15.00, 40, 'full_sun', 'medium', 'tropical, highland', 150, 'easy', 1),
('Jacaranda Tree', 'Jacaranda mimosifolia', 5, 'Ornamental tree with striking purple blooms, popular in Kigali avenues.', 60.00, 10, 'full_sun', 'medium', 'highland, tropical', 800, 'moderate', 1),
('Bougainvillea', 'Bougainvillea glabra', 4, 'Vigorous flowering climber, excellent for fences and walls.', 18.00, 35, 'full_sun', 'low', 'tropical, semi-arid', 300, 'easy', 1),
('Peace Lily', 'Spathiphyllum wallisii', 1, 'Elegant indoor plant that signals thirst by drooping leaves.', 14.00, 45, 'partial_shade', 'medium', 'tropical, highland', 65, 'easy', 1),
('Lavender', 'Lavandula angustifolia', 4, 'Fragrant flowering herb, attracts pollinators, suits highland climates.', 10.00, 30, 'full_sun', 'low', 'highland', 60, 'moderate', 1),
('Banana Plant (Ornamental)', 'Musa ornata', 2, 'Fast-growing tropical foliage plant for lush garden borders.', 22.00, 25, 'full_sun', 'high', 'tropical', 250, 'easy', 1),
('Echeveria Succulent', 'Echeveria elegans', 3, 'Rosette-shaped succulent, ideal for rock gardens and pots.', 6.00, 100, 'full_sun', 'low', 'semi-arid, highland', 15, 'easy', 1);

INSERT INTO plant_images (plant_id, image_url, is_primary) VALUES
(1, '/uploads/plants/snake-plant.jpg', TRUE),
(2, '/uploads/plants/aloe-vera.jpg', TRUE),
(3, '/uploads/plants/bird-of-paradise.jpg', TRUE),
(4, '/uploads/plants/hibiscus.jpg', TRUE),
(5, '/uploads/plants/jacaranda.jpg', TRUE),
(6, '/uploads/plants/bougainvillea.jpg', TRUE),
(7, '/uploads/plants/peace-lily.jpg', TRUE),
(8, '/uploads/plants/lavender.jpg', TRUE),
(9, '/uploads/plants/banana-plant.jpg', TRUE),
(10, '/uploads/plants/echeveria.jpg', TRUE);

-- ---------------------------------------------------------------------
-- Designs
-- ---------------------------------------------------------------------
INSERT INTO designs (name, category_id, description, price, style, min_area_sqm, estimated_install_days, created_by) VALUES
('Kigali Modern Courtyard', 6, 'Clean geometric beds with Echeveria and ornamental grasses, low maintenance.', 450.00, 'modern', 20.00, 3, 1),
('Tropical Backyard Oasis', 7, 'Lush layered planting with Bird of Paradise, banana plants, and Bougainvillea.', 680.00, 'tropical', 35.00, 5, 1),
('Drought-Smart Front Yard', 8, 'Water-wise design using Aloe, succulents, and mulch beds for dry seasons.', 320.00, 'xeriscape', 15.00, 2, 1);

INSERT INTO design_images (design_id, image_url, is_primary) VALUES
(1, '/uploads/designs/modern-courtyard.jpg', TRUE),
(2, '/uploads/designs/tropical-oasis.jpg', TRUE),
(3, '/uploads/designs/drought-smart.jpg', TRUE);

INSERT INTO design_plants (design_id, plant_id, quantity) VALUES
(1, 10, 12), (1, 8, 4),
(2, 3, 2), (2, 9, 3), (2, 6, 4),
(3, 2, 10), (3, 10, 8);

-- ---------------------------------------------------------------------
-- Equipment
-- ---------------------------------------------------------------------
INSERT INTO equipment (name, category_id, serial_number, status, district_id, purchase_date, purchase_cost) VALUES
('Pruning Shears Set', 9, 'EQ-HT-001', 'available', 1, '2025-01-10', 25.00),
('Lawn Mower (Petrol)', 10, 'EQ-PW-001', 'available', 1, '2024-11-05', 350.00),
('Drip Irrigation Kit', 11, 'EQ-IR-001', 'available', 1, '2025-02-20', 120.00),
('Hedge Trimmer', 10, 'EQ-PW-002', 'maintenance', 2, '2024-08-15', 180.00);
