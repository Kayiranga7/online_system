-- Link a user row to an Auth0 identity.
--
-- `auth0_id` stores the token's `sub` claim (e.g. "auth0|66f1..." or
-- "samlp|..." for enterprise connections), which is Auth0's stable identifier
-- for the person. It is NULL for the existing password/Google accounts, so the
-- column is nullable; MySQL allows many NULLs in a UNIQUE index, so only real
-- identities have to be unique.
--
-- Linking happens on first Auth0 sign-in and is verified in the application: an
-- existing row is only attached when Auth0 reports the email as verified.

ALTER TABLE users
  ADD COLUMN auth0_id VARCHAR(255) DEFAULT NULL UNIQUE AFTER google_id;
