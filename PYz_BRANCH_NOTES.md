# pyz 分支上传说明（2026-06-10）

本分支由 mugzju.top 线上 SocketAI 全栈应用同步而来，在原有 **Socket AI Designer Demo** 基础上扩展了后端、Web 部署快照、Android 患者端等模块。

## 重要：网页端 `web/` 仍是旧版

| 目录 | 状态 | 说明 |
|------|------|------|
| **`app/src/`** | ✅ 当前前端源码（权威） | Electron 与浏览器共用；含登录、病例工作台、3D 设计台、云端 API 对接 |
| **`web/`** | ⚠️ **旧版部署快照** | 仅用于同步到服务器 `/var/www/socketai/` 的静态文件；**未与最新工作流完全对齐**，请勿当作开发入口 |
| **线上** https://mugzju.top/socketai/ | 可能仍对应 `web/` 旧快照 | 更新生产环境时，应从 `app/src/` 重新拷贝并部署，而不是只改 `web/` |

### 更新线上 Web 的正确方式

```powershell
# 从 app/src 同步到 web（本地维护快照时）
robocopy app\src web /E

# 部署到服务器（示例）
scp web/* root@<server>:/var/www/socketai/
scp -r app/node_modules/three root@<server>:/var/www/socketai/node_modules/
```

桌面 Electron 本地 `file://` 模式仍可跳过登录直接进入设计台；浏览器访问需走后端认证。

---

## 本分支新增目录

```
backend/     Node.js API（PostgreSQL、JWT、病例/扫描/Gemini/移动端）
web/         静态 Web 部署快照（旧版，见上）
mobile/      Expo Android 患者端（邀请码绑定、疼痛地图、反馈时间线等）
deploy/      Nginx 片段等运维配置
```

原有 Demo 资产保留：`launcher.py`、`模型文件/`、`残肢模型example.stl`、`SocketAI-Designer-Demo.spec`。

---

## 移动端打包（Windows）

仓库内 `mobile/` 为完整源码。因 Windows 260 字符路径限制，**本地打 APK 建议使用短路径**：

```powershell
# 可选：克隆或复制到 C:\socketai-mobile 后再打包
cd C:\socketai-mobile   # 或本仓库 mobile/
npm install
npm run build:apk
```

产出：`dist/socketai-patient-1.0.0.apk`（包名 `top.mugzju.socketai.patient`）。

---

## 后端与线上

- API 基址：`https://mugzju.top/socketai/api/`
- 健康检查：`GET /api/health`
- 详细部署与 API 列表见 [DEPLOY.md](./DEPLOY.md)

---

## 未纳入版本库的内容

- `node_modules/`、`.env`、密钥
- `mobile/android/app/.cxx/`、`mobile/dist/`、`.expo/`
- 大体积 APK（请通过 Release 或服务器分发）
