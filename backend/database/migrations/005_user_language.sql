-- Store each user's UI language (ISO 639-1 code) so the preference
-- follows them across devices instead of living only in localStorage.
ALTER TABLE users ADD COLUMN language VARCHAR(5) NOT NULL DEFAULT 'en';
