-- Create roles script for PostgreSQL setup (runs in docker-entrypoint-initdb.d or production setup)
-- Creates migration role (owner) and application role (least privilege: SELECT, INSERT, UPDATE, DELETE only)

DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'temple_app') THEN
      CREATE ROLE temple_app WITH LOGIN PASSWORD 'app_pass';
   END IF;
END
$do$;

GRANT CONNECT ON DATABASE temple_platform TO temple_app;
GRANT USAGE ON SCHEMA public TO temple_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO temple_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO temple_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO temple_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO temple_app;
