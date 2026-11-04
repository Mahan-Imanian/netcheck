<#
  Manual acceptance checks that need a real Windows machine.
  Run from the repo root in a normal (non-admin) PowerShell:
    pwsh scripts/verify-windows.ps1 -Relay <relay-ip-from-the-app>
#>
param(
  [Parameter(Mandatory)] [string] $Relay,
  [string] $Exe = "$env:LOCALAPPDATA\Netcheck\netcheck.exe"
)
$ErrorActionPreference = "Stop"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Running as admin: $admin (should be False)"

Write-Host "`n[1] Netcheck ICMP path vs ping.exe, 20 echoes each, run back to back"
cargo build --release -p netcheck-core --example probe | Out-Null
$ours = (& target\release\examples\probe.exe $Relay 20 1000) | ConvertFrom-Json
$ping = ping -n 20 $Relay
$pingAvg = [int](($ping | Select-String 'Average = (\d+)ms').Matches[0].Groups[1].Value)
$diff = [math]::Abs($ours.avg - $pingAvg)
Write-Host ("Netcheck avg {0:N1} ms, loss {1}% | ping.exe avg {2} ms | diff {3:N1} ms -> {4}" -f $ours.avg, $ours.lossPct, $pingAvg, $diff, $(if ($diff -le 3) { "PASS" } else { "FAIL" }))

Write-Host "`n[2] Closing the window ends the process (during a check and after one)"
foreach ($wait in 2, 12) {
  $p = Start-Process -FilePath $Exe -PassThru
  Start-Sleep -Seconds $wait
  $null = $p.CloseMainWindow()
  Start-Sleep -Seconds 2
  $left = Get-Process -Name netcheck -ErrorAction SilentlyContinue
  Write-Host ("closed after {0}s: {1}" -f $wait, $(if ($left) { "FAIL - still running (PID $($left.Id -join ','))" } else { "PASS - no netcheck process" }))
  $left | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host "`n[3] Firewall state as Netcheck reads it (read-only)"
Get-NetFirewallProfile | Select-Object Name, Enabled | Format-Table
Get-NetFirewallRule -Group "CS2 Vienna Only" -ErrorAction SilentlyContinue | Select-Object DisplayName, Enabled, Direction, Action | Format-Table
