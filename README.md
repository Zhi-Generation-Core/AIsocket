# Socket AI Designer Demo

> **pyz 分支扩展说明**：本仓库已包含完整 SocketAI 平台（后端、移动端、部署配置）。  
> **网页目录 `web/` 为旧版部署快照**，前端开发请以 **`app/src/`** 为准。详见 [PYz_BRANCH_NOTES.md](./PYz_BRANCH_NOTES.md) 与 [DEPLOY.md](./DEPLOY.md)。

面向假肢接受腔设计流程的 AI 辅助原型演示。项目将 3D 残肢模型导入、语义风险区标注、参数化接受腔生成、局部减压编辑、Gemini 复核和 STL 导出整合到一个可交互界面中，适合用于数字创意、临床设计流程展示和课堂 Demo。

> 注意：本项目仅用于教学和原型展示，不构成医疗诊断、处方或临床制造建议。真实接受腔设计必须由具备资质的专业人员结合患者情况完成评估。

## 功能特性

- 导入 `.stl` / `.obj` 残肢模型并在 3D 视图中查看。
- 使用示例残肢模型快速启动演示流程。
- 基于几何轮廓、活动等级、体重和软组织状态生成初始接受腔。
- 自动标注胫骨前缘、腓骨头、远端、后侧软组织等语义区域。
- 支持风险热图、线框、剖切预览和局部减压画笔。
- 可调用 Gemini 对当前参数、几何摘要和预览图进行结构化复核。
- 支持导出生成后的接受腔 STL 文件。

## 技术栈

- Electron
- Three.js
- Node.js / npm
- Python 本地启动器
- Google Gemini API，可选
- Git LFS，用于管理 3D 模型资产

## 项目结构

```text
.
├── app/                    # Electron + Three.js 设计台（前端源码，权威）
│   ├── package.json
│   └── src/
├── backend/                # Node.js API + PostgreSQL
├── web/                    # ⚠️ 旧版 Web 静态部署快照（非开发入口）
├── mobile/                 # Expo Android 患者端
├── deploy/                 # Nginx 等
├── 模型文件/
├── launcher.py
├── PYz_BRANCH_NOTES.md     # pyz 分支上传与 web 旧版说明
├── DEPLOY.md               # 线上部署与 API
├── SocketAI-Designer-Demo.spec
└── 残肢模型example.stl
```

## 环境要求

- Node.js 18 或更高版本
- npm
- Python 3.10 或更高版本
- Git LFS，用于拉取模型文件

克隆仓库后建议先安装或初始化 Git LFS：

```powershell
git lfs install
git lfs pull
```

## 安装依赖

```powershell
cd app
npm install
```

## 运行项目

推荐从 `app` 目录启动：

```powershell
cd app
npm start
```

该命令会调用根目录的 `launcher.py`，启动本地 HTTP 服务，并自动在浏览器中打开演示界面。

也可以直接运行 Electron 版本：

```powershell
cd app
npm run start:electron
```

## Gemini 配置

Gemini 复核是可选功能。若不配置 API Key，项目仍会使用本地规则兜底生成建议。

在项目根目录创建 `.env` 文件：

```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

如果网络环境需要代理，可额外设置：

```env
GEMINI_PROXY_SERVER=http://127.0.0.1:7890
```

`.env` 已被 `.gitignore` 排除，不会提交到仓库。

## 构建 Windows 可执行文件

Electron 打包：

```powershell
cd app
npm run dist
```

Python 启动器打包配置位于 `SocketAI-Designer-Demo.spec`，可配合 PyInstaller 使用：

```powershell
pyinstaller SocketAI-Designer-Demo.spec
```

## 使用流程

1. 启动应用。
2. 点击“使用示例残肢”或导入 `.stl` / `.obj` 模型。
3. 调整活动等级、体重、软组织状态和接受腔参数。
4. 点击算法生成初版接受腔。
5. 查看语义标签、风险热图和剖切预览。
6. 可选：调用 Gemini 进行复核优化。
7. 导出 STL 文件用于后续展示或制造流程讨论。

## 版本控制说明

本项目包含较大的 3D 模型文件，已通过 Git LFS 管理以下类型：

```text
*.obj
*.stl
```

提交新模型文件前，请确认 Git LFS 已启用，避免将大文件直接写入普通 Git 历史。

## License

当前项目在 `package.json` 中标记为 `UNLICENSED`。如需公开复用或二次开发，请先补充明确的开源许可证。
