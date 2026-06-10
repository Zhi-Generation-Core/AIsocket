# Run from C:\socketai-mobile: npm run build:apk

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $Root "android"
$ApkRelease = Join-Path $AndroidDir "app\build\outputs\apk\release\app-release.apk"
$DistDir = Join-Path $Root "dist"

function Fail($msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

if (-not $env:JAVA_HOME) {
    $found = Get-ChildItem "C:\Program Files\Microsoft" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "jdk*" } |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if ($found) { $env:JAVA_HOME = $found.FullName }
}

if ($env:JAVA_HOME) { $env:Path = "$env:JAVA_HOME\bin;$env:Path" }

$javaLine = cmd /c "java -version 2>&1" | Select-Object -First 1
if (-not $javaLine) { Fail "Java not found. Install JDK 17." }
Write-Host "Java: $javaLine"

if (-not $env:ANDROID_HOME) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) { $env:ANDROID_HOME = $defaultSdk }
}
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    Fail "Android SDK not found."
}

$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"

$sdkDir = $env:ANDROID_HOME -replace '\\', '/'
Set-Content -Path (Join-Path $AndroidDir "local.properties") -Value "sdk.dir=$sdkDir" -Encoding ASCII

if (-not (Test-Path $AndroidDir)) {
    Push-Location $Root
    npx expo prebuild --platform android --no-install
    Pop-Location
}

Write-Host "Building Release APK..." -ForegroundColor Cyan
Push-Location $AndroidDir
& .\gradlew.bat assembleRelease --no-daemon
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) { Fail "Gradle build failed with exit code $code" }
if (-not (Test-Path $ApkRelease)) { Fail "APK not found at $ApkRelease" }

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$outPath = Join-Path $DistDir "socketai-patient-1.0.0.apk"
Copy-Item -Path $ApkRelease -Destination $outPath -Force

Write-Host "Build OK:" -ForegroundColor Green
Write-Host $outPath
