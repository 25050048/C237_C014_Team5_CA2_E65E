-- Run this once against your database before using Category Management.
-- Adds a standalone `categories` table. `ingredients.category` stays as a
-- plain text column (unchanged, so nothing else in the app breaks) - the
-- new table just gives Tara's feature a real place to manage category
-- names (add / edit / delete), and the search/filter dropdown now reads
-- from this table instead of guessing from existing ingredient rows.

USE kitchen_inventory;

CREATE TABLE IF NOT EXISTS categories (
    categoryId INT PRIMARY KEY AUTO_INCREMENT,
    categoryName VARCHAR(50) NOT NULL UNIQUE,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed it with the categories already in use, so nothing looks empty
-- the first time you open Category Management.
INSERT IGNORE INTO categories (categoryName)
SELECT DISTINCT category FROM ingredients
WHERE category IS NOT NULL AND category <> '';
