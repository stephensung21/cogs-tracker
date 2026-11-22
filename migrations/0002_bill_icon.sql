-- Optional icon for each bill (power, wifi, rent, ...). NULL = guess from the name.
ALTER TABLE bills ADD COLUMN icon TEXT;
