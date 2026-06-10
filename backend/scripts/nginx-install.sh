#!/bin/bash
# 在服务器上追加 SocketAI 到 nginx（若尚未配置）
set -e
CONF=/etc/nginx/nginx.conf
if grep -q 'socketai/api' "$CONF"; then
  echo 'nginx socketai already configured'
  exit 0
fi

python3 <<'PY'
from pathlib import Path
conf = Path('/etc/nginx/nginx.conf')
text = conf.read_text()
block = """
    location = /socketai {
        return 301 https://$host/socketai/index.html;
    }

    location ^~ /socketai/api/ {
        proxy_pass http://127.0.0.1:3010/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 80m;
    }

    location ^~ /socketai/ {
        alias /var/www/socketai/;
        index index.html;
        add_header Cache-Control "no-cache";
    }

"""
marker = '    location ^~ /airentmvp/'
if marker not in text:
    raise SystemExit('marker not found')
text = text.replace(marker, block + marker, 1)
text = text.replace('(?!dwello-api/)', '(?!dwello-api/)(?!socketai/)')
conf.write_text(text)
print('nginx updated')
PY
nginx -t
systemctl reload nginx
echo 'nginx reloaded'
