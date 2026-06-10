# Register the daily Task Scheduler job (re-run anytime to update; no admin needed).
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads BOM-less UTF-8.
$root = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $root 'run-daily.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Daily -At '19:30'
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 45)

Register-ScheduledTask -TaskName 'ig-auto-reels-daily' `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Make a UI-component reel and post to Instagram (dry-run until IG_ACCESS_TOKEN is set in .env)' `
  -Force | Out-Null

Write-Output "OK: task 'ig-auto-reels-daily' runs daily at 19:30 (wakes from sleep; catches up after a missed start)"
Write-Output "Test now:  Start-ScheduledTask -TaskName 'ig-auto-reels-daily'   then check the logs\ folder"
