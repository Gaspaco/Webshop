-- Owner accounts use email/password only. Keep customers' optional 2FA intact
-- and retain existing encrypted authenticator data rather than deleting it.
UPDATE "user" SET "two_factor_enabled" = false WHERE "role" = 'admin';
