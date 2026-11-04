param([string] $Base = "http://127.0.0.1:1420")
Add-Type -AssemblyName System.Drawing
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$out = Join-Path $PSScriptRoot "..\docs\screenshots"
$shots = @(
  @("unstable", "scenario=unstable", 1200, 760),
  @("verdict-done", "scenario=normal", 1200, 760),
  @("light", "scenario=normal&theme=light", 1200, 760),
  @("small-verdict", "scenario=normal", 960, 620),
  @("big-verdict", "scenario=unstable", 1920, 1080),
  @("regions", "scenario=unstable&tab=regions", 1200, 760),
  @("map-sweep", "scenario=unstable&tab=map", 1200, 760),
  @("route", "scenario=unstable&tab=route", 1200, 760),
  @("history", "scenario=normal&tab=history", 1200, 760),
  @("blocked", "scenario=blocked", 1200, 760),
  @("firewalloff", "scenario=firewalloff", 1200, 760),
  @("offline", "scenario=offline", 1200, 760)
)
foreach ($s in $shots) {
  $file = Join-Path $out "$($s[0]).png"
  $tmp = Join-Path $env:TEMP "nc-shot-$($s[0]).png"
  $budget = if ($s[0] -eq "map-sweep") { 2500 } else { 12000 }
  & $edge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 "--window-size=$($s[2] + 25),$($s[3] + 95)" "--virtual-time-budget=$budget" "--screenshot=$tmp" "$Base/?$($s[1])" 2>$null | Out-Null
  $img = [Drawing.Bitmap]::FromFile($tmp)
  $crop = $img.Clone([Drawing.Rectangle]::new(0, 0, $s[2], $s[3]), $img.PixelFormat)
  $img.Dispose()
  $crop.Save($file, [Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose()
  Remove-Item $tmp
  Write-Host "$($s[0]) -> $file"
}
