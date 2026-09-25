-- =====================================================================
-- Makes email verification safe to hit twice with the same link.
--
-- The live `email_verification_token` is still cleared the moment it's
-- redeemed (so it can't be reused for anything else). This new column
-- separately remembers which token verified the account, so if the exact
-- same verification request arrives again afterwards (e.g. a client-side
-- double-request, or an email security scanner pre-fetching the link
-- before the person clicks it), the endpoint can recognise it and return
-- success instead of "invalid or expired".
-- =====================================================================

ALTER TABLE users
  ADD COLUMN email_verification_last_token VARCHAR(255) DEFAULT NULL AFTER email_verification_expires;
