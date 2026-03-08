# Video Çeviri - Tam Başlatma Scripti
$APP_DIR    = "C:\Users\magis1\Desktop\app-deneme"
$BACKEND    = "$APP_DIR\translation-backend"
$RN_DIR     = "$APP_DIR\VideoTranslatorApp"
$ADB        = "C:\Users\magis1\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$POWERSHELL = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

# --- Yardımcı: port kullanan PID'i öldür ---
function Kill-Port($port) {
    $pids = (netstat -ano | Select-String ":$port\s") |
            ForEach-Object { ($_ -split '\s+')[-1] } |
            Select-Object -Unique
    foreach ($p in $pids) {
        if ($p -match '^\d+$' -and $p -ne '0') {
            try { Stop-Process -Id $p -Force -ErrorAction Stop
                  Write-Host "  Port $port -> PID $p durduruldu" -ForegroundColor Gray
            } catch {}
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Video Çeviri - Servisler Başlatılıyor" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Önceki servisleri temizle ---
Write-Host "[1/5] Eski servisler temizleniyor..." -ForegroundColor Yellow
Kill-Port 8000
Kill-Port 8081
# Eski python/uvicorn prosesleri
Get-Process -Name "python","python3" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "      Tamam." -ForegroundColor Green

# --- 2. ADB daemon - tek ADB kullan ---
Write-Host "[2/5] ADB daemon yeniden baslatiliyor..." -ForegroundColor Yellow
& $ADB kill-server 2>&1 | Out-Null
Start-Sleep -Milliseconds 800
& $ADB start-server 2>&1 | Out-Null
Start-Sleep -Milliseconds 500
$devices = & $ADB devices
Write-Host "      $devices" -ForegroundColor Gray

# --- 3. ADB reverse ---
Write-Host "[3/5] ADB reverse kurulyor..." -ForegroundColor Yellow
$r1 = & $ADB reverse tcp:8000 tcp:8000 2>&1
$r2 = & $ADB reverse tcp:8081 tcp:8081 2>&1
if ($r1 -match "error|failed" -or $r2 -match "error|failed") {
    Write-Host "      UYARI: ADB reverse basarisiz - telefon bagli mi?" -ForegroundColor Red
    Write-Host "      Hata: $r1 | $r2" -ForegroundColor DarkRed
} else {
    Write-Host "      ADB reverse OK (8000 + 8081)" -ForegroundColor Green
}

# --- 4. Windows Terminal var mi? ---
$wt = Get-Command wt.exe -ErrorAction SilentlyContinue

Write-Host "[4/5] Terminal sekmeleri aciliyor..." -ForegroundColor Yellow

if ($wt) {
    # Backend komutu
    $backendScript = @"
`$host.UI.RawUI.WindowTitle = 'PYTHON BACKEND'
Write-Host '============================================' -ForegroundColor Yellow
Write-Host '  PYTHON BACKEND - FastAPI :8000' -ForegroundColor Yellow
Write-Host '============================================' -ForegroundColor Yellow
Set-Location '$BACKEND'
.\venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
"@
    $backendFile = "$env:TEMP\backend_start.ps1"
    $backendScript | Out-File $backendFile -Encoding utf8

    # Metro komutu
    $metroScript = @"
`$host.UI.RawUI.WindowTitle = 'METRO BUNDLER'
Write-Host '============================================' -ForegroundColor Magenta
Write-Host '  METRO BUNDLER - React Native :8081' -ForegroundColor Magenta
Write-Host '============================================' -ForegroundColor Magenta
Set-Location '$RN_DIR'
npx react-native start --reset-cache
"@
    $metroFile = "$env:TEMP\metro_start.ps1"
    $metroScript | Out-File $metroFile -Encoding utf8

    # ADB Logcat komutu
    $logcatScript = @"
`$host.UI.RawUI.WindowTitle = 'ADB LOGCAT'
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  ADB LOGCAT - Telefon Loglari' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host 'Filtreler: ReactNative, SystemAudio, Overlay' -ForegroundColor Gray
Write-Host ''
& '$ADB' logcat -v time *:W ReactNative:V ReactNativeJS:V SystemAudio:V OverlayModule:V ForegroundService:V
"@
    $logcatFile = "$env:TEMP\logcat_start.ps1"
    $logcatScript | Out-File $logcatFile -Encoding utf8

    # ADB Durum komutu
    $adbStatusScript = @"
`$host.UI.RawUI.WindowTitle = 'ADB DURUM'
Write-Host '============================================' -ForegroundColor Red
Write-Host '  ADB DURUM - Cihaz ve Port Bilgisi' -ForegroundColor Red
Write-Host '============================================' -ForegroundColor Red
Write-Host ''
Write-Host 'Bagli cihazlar:' -ForegroundColor Cyan
& '$ADB' devices
Write-Host ''
Write-Host 'ADB reverse listesi:' -ForegroundColor Cyan
& '$ADB' reverse --list
Write-Host ''
Write-Host '--- Port durumu ---' -ForegroundColor Yellow
netstat -ano | Select-String ':8000|:8081'
Write-Host ''
Write-Host 'Yeniden ADB reverse icin R tusuna basin...' -ForegroundColor Gray
while (`$true) {
    `$key = `$host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    if (`$key.Character -eq 'r' -or `$key.Character -eq 'R') {
        Write-Host 'ADB reverse yenileniyor...' -ForegroundColor Yellow
        & '$ADB' reverse tcp:8000 tcp:8000
        & '$ADB' reverse tcp:8081 tcp:8081
        Write-Host 'Tamam!' -ForegroundColor Green
    }
}
"@
    $adbStatusFile = "$env:TEMP\adb_status.ps1"
    $adbStatusScript | Out-File $adbStatusFile -Encoding utf8

    # wt.exe ile 4 sekme aç
    # NOT: ';' tırnak içinde olmalı — PowerShell onu statement separator değil
    #      literal string olarak wt.exe'ye gönderir.
    & wt.exe `
        --title "Python Backend" $POWERSHELL -NoExit -ExecutionPolicy Bypass -File $backendFile `
        ';' new-tab --title "Metro Bundler" $POWERSHELL -NoExit -ExecutionPolicy Bypass -File $metroFile `
        ';' new-tab --title "ADB Logcat"    $POWERSHELL -NoExit -ExecutionPolicy Bypass -File $logcatFile `
        ';' new-tab --title "ADB Durum"     $POWERSHELL -NoExit -ExecutionPolicy Bypass -File $adbStatusFile

} else {
    Write-Host "      Windows Terminal yok, ayri pencereler aciliyor..." -ForegroundColor Gray

    $args1 = "-NoExit -ExecutionPolicy Bypass -Command `"`$host.UI.RawUI.WindowTitle='PYTHON BACKEND'; Set-Location '$BACKEND'; .\venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload`""
    $args2 = "-NoExit -ExecutionPolicy Bypass -Command `"`$host.UI.RawUI.WindowTitle='METRO BUNDLER'; Set-Location '$RN_DIR'; npx react-native start --reset-cache`""
    $args3 = "-NoExit -ExecutionPolicy Bypass -Command `"`$host.UI.RawUI.WindowTitle='ADB LOGCAT'; & '$ADB' logcat -v time *:W ReactNative:V ReactNativeJS:V`""
    $args4 = "-NoExit -ExecutionPolicy Bypass -Command `"`$host.UI.RawUI.WindowTitle='ADB DURUM'; & '$ADB' devices; & '$ADB' reverse --list; netstat -ano | Select-String ':8000|:8081'`""

    Start-Process $POWERSHELL -ArgumentList $args1
    Start-Sleep -Milliseconds 400
    Start-Process $POWERSHELL -ArgumentList $args2
    Start-Sleep -Milliseconds 400
    Start-Process $POWERSHELL -ArgumentList $args3
    Start-Sleep -Milliseconds 400
    Start-Process $POWERSHELL -ArgumentList $args4
}

Write-Host "[5/5] Hazir!" -ForegroundColor Green
Write-Host ""
Write-Host "  Sekmeler:" -ForegroundColor Cyan
Write-Host "  [Python Backend] FastAPI :8000" -ForegroundColor Yellow
Write-Host "  [Metro Bundler]  React Native :8081" -ForegroundColor Magenta
Write-Host "  [ADB Logcat]     Telefon loglari" -ForegroundColor Cyan
Write-Host "  [ADB Durum]      Port + cihaz + R=refresh" -ForegroundColor Red
Write-Host ""
Write-Host "  Telefonda uygulamayi acabilirsiniz." -ForegroundColor Green
Write-Host ""
