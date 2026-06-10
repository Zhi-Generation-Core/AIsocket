-- 以 postgres 超级用户执行，创建独立库与角色
-- 示例：psql -U postgres -f database/create_database.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'socketai_app') THEN
    CREATE ROLE socketai_app LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END
$$;

SELECT 'CREATE DATABASE socketai OWNER socketai_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'socketai')\gexec

GRANT ALL PRIVILEGES ON DATABASE socketai TO socketai_app;
