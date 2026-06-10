# SocketAI 部署与 API 说明

与无名战主站共用域名与服务器，**独立**静态目录、PostgreSQL 库与后端进程。

## UI 工作流

1. **登录** → `/api/auth/login`
2. **注册** → 服务端 `ALLOW_PUBLIC_REGISTER=true` 时可用
3. **病例工作台** → 列表、新建、进入设计台
4. **3D 设计台** → 导入扫描 → 生成 → 精修 → 导出

桌面 Electron：`cd app && npm start`（`file://` 可跳过登录）。

## 线上

- 设计台：https://mugzju.top/socketai/
- API：https://mugzju.top/socketai/api/health

## 路径约定

| 用途 | 路径 |
|------|------|
| 前端源码 | `app/src/` |
| Web 部署快照（旧） | `web/` |
| 后端 | `backend/` |
| 患者端 | `mobile/` |
| 服务器静态 | `/var/www/socketai/` |
| 服务器后端 | `/opt/socketai/backend/` |

## 后端初始化（服务器）

```bash
psql -U postgres -f /opt/socketai/backend/database/create_database.sql
cp /opt/socketai/backend/env.example /opt/socketai/backend/.env
cd /opt/socketai/backend && npm install && npm run init-db && npm run create-admin
pm2 start server.js --name socketai-api --cwd /opt/socketai/backend
```

Nginx 片段：`deploy/nginx-socketai-snippet.conf`

## 移动端 API（`/api/mobile`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/bind` | 邀请码绑定 |
| GET | `/cases/:id` | 患者病例（Header: `X-Binding-Id`） |
| POST | `/pain-map` | 疼痛反馈 |
| POST | `/feedback` | 使用日志 / 文字反馈 |
| GET | `/timeline` | 时间线 |
| GET | `/summary` | 摘要 |
| POST | `/unbind` | 解绑 |
