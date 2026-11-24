-- ==============================================================================
-- Cloudflare D1 Migration: 0003_secure_pbkdf2_passwords.sql
-- Description: Upgrades initial seeded accounts to NIST SP 800-63B / OWASP-compliant
--              PBKDF2-HMAC-SHA256 (100,000 iterations). Eliminates 57ms pure-JS
--              Argon2 CPU timeouts while enforcing 100% cryptographic verification.
-- ==============================================================================

-- 1. Super Admin (password: SuperAdmin#2026!)
UPDATE "users"
SET "password_hash" = '$pbkdf2$v=1$i=100000$ff67b51504f89e74e6fe26cc77512031$55a8d50b2c525cbdefce8003cfbf731c44985199fe385edee95e1d827f047d8a'
WHERE "email" = 'admin@templeplatform.org';

-- 2. Devotee Demo (password: Devotee#2026!)
UPDATE "users"
SET "password_hash" = '$pbkdf2$v=1$i=100000$a8e98a42b485ad4ae0d5f7e2d50e7420$2c6a0aa190fd88db81347239dcd7e073fbc3ade7166676a827c9bbacedc07f17'
WHERE "email" = 'devotee@templeplatform.org';

-- 3. Temple Admins (password: TempleAdmin#2026!)
UPDATE "users"
SET "password_hash" = '$pbkdf2$v=1$i=100000$22eb54dc0b483d7e77506355e38e565b$62afe2da1ccf01a9c34995210deed319dd2d9c8942d07b73a1dec6b85114391e'
WHERE "email" LIKE 'admin.%@templeplatform.org';

