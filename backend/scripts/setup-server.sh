#!/bin/bash
set -euo pipefail

DB_PASS='SocketAI_db_2026_x7k2'
JWT_SECRET=$(openssl rand -hex 32)

sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'socketai_app') THEN
    CREATE ROLE socketai_app LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE socketai_app WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='socketai'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE socketai OWNER socketai_app"
fi

cat > /opt/socketai/backend/.env <<ENV
PORT=3010
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
DB_HOST=localhost
DB_PORT=5432
DB_NAME=socketai
DB_USER=socketai_app
DB_PASSWORD=${DB_PASS}
CORS_ORIGIN=https://mugzju.top,http://localhost:5500
SOCKETAI_UPLOAD_DIR=/opt/socketai/backend/uploads
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite-preview
ADMIN_EMAIL=admin@socketai.local
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD:?请在运行脚本前 export ADMIN_PASSWORD}
ALLOW_PUBLIC_REGISTER=false
ENV

cd /opt/socketai/backend
npm install --omit=dev
npm run init-db
npm run create-admin

if pm2 describe socketai-api >/dev/null 2>&1; then
  pm2 restart socketai-api
else
  pm2 start server.js --name socketai-api --cwd /opt/socketai/backend
fi
pm2 save

curl -s http://127.0.0.1:3010/api/health
echo
