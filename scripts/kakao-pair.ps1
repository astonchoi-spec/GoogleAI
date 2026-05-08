# 카카오톡 채널 페어링 헬퍼 (PowerShell)
# 사용: PowerShell 창에서 .\scripts\kakao-pair.ps1 실행

$ErrorActionPreference = "Stop"

Write-Host "=== Aston × OpenClaw 카카오톡 페어링 ===" -ForegroundColor Cyan

# 1. .env에서 GEMINI_API_KEY 로드
$envPath = "D:\구글연동AI\.env"
if (Test-Path $envPath) {
    $line = (Get-Content $envPath | Select-String "^GEMINI_API_KEY=").Line
    if ($line) {
        $env:GEMINI_API_KEY = $line -replace "^GEMINI_API_KEY=", ""
        Write-Host "[OK] GEMINI_API_KEY 로드됨 (length: $($env:GEMINI_API_KEY.Length))" -ForegroundColor Green
    } else {
        Write-Host "[WARN] .env에 GEMINI_API_KEY 없음" -ForegroundColor Yellow
    }
}

# 2. 게이트웨이 상태
Write-Host "`n--- 게이트웨이 상태 ---" -ForegroundColor Cyan
openclaw gateway status

# 3. 카카오 플러그인 로드 확인
Write-Host "`n--- 카톡 플러그인 ---" -ForegroundColor Cyan
openclaw plugins list | Select-String "Kakao"

# 4. 채널 상태
Write-Host "`n--- 채널 ---" -ForegroundColor Cyan
openclaw channels list

# 5. 대시보드 열기
Write-Host "`n--- 대시보드 ---" -ForegroundColor Cyan
Write-Host "브라우저가 자동으로 열립니다. 채팅창에 다음을 입력하세요:" -ForegroundColor Yellow
Write-Host "    카카오톡 연결해줘" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "`n페어링 코드(예: ABCD-1234)를 받으면:" -ForegroundColor Yellow
Write-Host "  1. 카카오톡 → @OpenClaw 채널 친구 추가 (http://pf.kakao.com/_scexbC)" -ForegroundColor White
Write-Host "  2. 채팅창에 입력: /pair {받은코드}" -ForegroundColor White
Write-Host "  3. 봇 응답 확인" -ForegroundColor White
Write-Host ""
Read-Host "Enter 키 누르면 대시보드 열림"
openclaw dashboard
