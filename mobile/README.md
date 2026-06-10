# SocketAI 患者端（Android / Expo）

源码目录。API 默认：`https://mugzju.top/socketai/api/mobile`

## Windows 打包注意

Gradle/CMake 在深层路径下可能触发 **260 字符路径限制**。若 `npm run build:apk` 失败，请将本目录复制到短路径后再编译，例如：

```powershell
robocopy . C:\socketai-mobile /E /XD node_modules android\.cxx dist .expo
cd C:\socketai-mobile
npm install
npm run build:apk
```

## 命令

```powershell
npm start                 # Expo 开发
npm run prebuild:android  # 重新生成 android/
npm run build:apk         # 产出 dist\socketai-patient-1.0.0.apk
```

包名：`top.mugzju.socketai.patient`，版本见 `app.json`。

APK 不提交 Git；请通过 Release 或服务器分发。
