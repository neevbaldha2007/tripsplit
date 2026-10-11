-- ==============================================================================
-- TripSplit Database Schema & Sample Data
-- Database: tripsplit_db
-- Compatibility: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.3+ (XAMPP phpMyAdmin)
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `tripsplit_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `tripsplit_db`;

-- Drop existing tables in reverse dependency order to prevent foreign key errors during clean re-import
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `settlements`;
DROP TABLE IF EXISTS `expense_shares`;
DROP TABLE IF EXISTS `expenses`;
DROP TABLE IF EXISTS `members`;
DROP TABLE IF EXISTS `trips`;
SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------------------------
-- Table: trips
-- Stores high-level information for each group trip
-- ------------------------------------------------------------------------------
CREATE TABLE `trips` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `destination` VARCHAR(100) NOT NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: members
-- Stores participant names associated with a trip
-- ------------------------------------------------------------------------------
CREATE TABLE `members` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `trip_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_members_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_members_trip_id` (`trip_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: expenses
-- Stores each expense record in integer paise
-- ------------------------------------------------------------------------------
CREATE TABLE `expenses` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `trip_id` INT UNSIGNED NOT NULL,
  `description` VARCHAR(150) NOT NULL,
  `amount_paise` BIGINT UNSIGNED NOT NULL,
  `category` ENUM('Food', 'Hotel', 'Transport', 'Shopping', 'Activities', 'Other') NOT NULL DEFAULT 'Other',
  `payer_member_id` INT UNSIGNED NOT NULL,
  `expense_date` DATE NOT NULL,
  `split_type` ENUM('equal', 'custom') NOT NULL DEFAULT 'equal',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_expenses_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_expenses_payer` FOREIGN KEY (`payer_member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE,
  INDEX `idx_expenses_trip_id` (`trip_id`),
  INDEX `idx_expenses_payer` (`payer_member_id`),
  INDEX `idx_expenses_category` (`category`),
  INDEX `idx_expenses_date` (`expense_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: expense_shares
-- Stores individual breakdown for each participating member in integer paise
-- ------------------------------------------------------------------------------
CREATE TABLE `expense_shares` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `expense_id` INT UNSIGNED NOT NULL,
  `member_id` INT UNSIGNED NOT NULL,
  `share_paise` BIGINT UNSIGNED NOT NULL,
  CONSTRAINT `fk_shares_expense` FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_shares_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE,
  INDEX `idx_shares_expense_id` (`expense_id`),
  INDEX `idx_shares_member_id` (`member_id`),
  UNIQUE KEY `uniq_expense_member` (`expense_id`, `member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: settlements
-- Records debt repayments made between members in integer paise
-- ------------------------------------------------------------------------------
CREATE TABLE `settlements` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `trip_id` INT UNSIGNED NOT NULL,
  `sender_member_id` INT UNSIGNED NOT NULL,
  `receiver_member_id` INT UNSIGNED NOT NULL,
  `amount_paise` BIGINT UNSIGNED NOT NULL,
  `payment_date` DATE NOT NULL,
  `status` ENUM('completed', 'reversed') NOT NULL DEFAULT 'completed',
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_settlements_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_settlements_sender` FOREIGN KEY (`sender_member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_settlements_receiver` FOREIGN KEY (`receiver_member_id`) REFERENCES `members` (`id`) ON UPDATE CASCADE,
  INDEX `idx_settlements_trip_id` (`trip_id`),
  INDEX `idx_settlements_sender` (`sender_member_id`),
  INDEX `idx_settlements_receiver` (`receiver_member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Sample Data: "Goa Trip"
-- Neev, Rahul, and Jeel
-- 1. Neev pays ₹3,000 for Hotel (300,000 paise) - split equally
-- 2. Rahul pays ₹1,500 for Food (150,000 paise) - split equally
-- 3. Jeel pays ₹1,500 for Transport (150,000 paise) - split equally
--
-- Expected Results:
-- Total Cost: ₹6,000.00
-- Each Member's Share: ₹2,000.00
-- Neev Balance: +₹1,000.00 (Creditor)
-- Rahul Balance: -₹500.00 (Debtor)
-- Jeel Balance: -₹500.00 (Debtor)
-- Suggested Settlement: Rahul -> Neev ₹500.00, Jeel -> Neev ₹500.00
-- ==============================================================================

INSERT INTO `trips` (`id`, `name`, `destination`, `start_date`, `end_date`, `created_at`) VALUES
(1, 'Goa Trip', 'Goa, India', '2026-11-01', '2026-11-05', NOW());

INSERT INTO `members` (`id`, `trip_id`, `name`, `created_at`) VALUES
(1, 1, 'Neev', NOW()),
(2, 1, 'Rahul', NOW()),
(3, 1, 'Jeel', NOW());

-- Expense 1: Hotel (₹3,000 = 300,000 paise) paid by Neev (member 1)
INSERT INTO `expenses` (`id`, `trip_id`, `description`, `amount_paise`, `category`, `payer_member_id`, `expense_date`, `split_type`, `created_at`) VALUES
(1, 1, 'Beachside Resort Hotel', 300000, 'Hotel', 1, '2026-11-01', 'equal', NOW());

INSERT INTO `expense_shares` (`expense_id`, `member_id`, `share_paise`) VALUES
(1, 1, 100000),
(1, 2, 100000),
(1, 3, 100000);

-- Expense 2: Food (₹1,500 = 150,000 paise) paid by Rahul (member 2)
INSERT INTO `expenses` (`id`, `trip_id`, `description`, `amount_paise`, `category`, `payer_member_id`, `expense_date`, `split_type`, `created_at`) VALUES
(2, 1, 'Seafood Dinner at Shack', 150000, 'Food', 2, '2026-11-02', 'equal', NOW());

INSERT INTO `expense_shares` (`expense_id`, `member_id`, `share_paise`) VALUES
(2, 1, 50000),
(2, 2, 50000),
(2, 3, 50000);

-- Expense 3: Transport (₹1,500 = 150,000 paise) paid by Jeel (member 3)
INSERT INTO `expenses` (`id`, `trip_id`, `description`, `amount_paise`, `category`, `payer_member_id`, `expense_date`, `split_type`, `created_at`) VALUES
(3, 1, 'Scooter Rental & Fuel', 150000, 'Transport', 3, '2026-11-02', 'equal', NOW());

INSERT INTO `expense_shares` (`expense_id`, `member_id`, `share_paise`) VALUES
(3, 1, 50000),
(3, 2, 50000),
(3, 3, 50000);
