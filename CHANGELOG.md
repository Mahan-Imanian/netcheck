# Changelog

All notable changes to Netcheck are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0, minor
versions may change behavior and settings.

## [Unreleased]

## [0.2.0] - 2026-11-04

### Changed

- The gauge now shows your fastest region by default, ranked by ping, jitter
  and loss, and the route is traced to it. Pick a region in Settings to pin it
  instead. If you saved settings in 0.1.0, your region stays pinned to what it
  was; choose "Fastest region (automatic)" to switch.
- Rewrote the README in plainer language.

## [0.1.0] - 2026-11-04

The first public release.

### Added

- A pre-match check of every Counter-Strike 2 region, using Valve's live relay
  list: average, worst-5%, min, max, jitter and packet loss from 20 ICMP echoes
  per region. It finishes in about 10 seconds.
- A verdict for your preferred region, graded Excellent, Good, Playable or Bad
  with thresholds you can change, plus a cleaner alternative when one exists.
- Route diagnosis: a parallel traceroute groups hops into router, ISP,
  international link and Valve, and names the first hop where latency or loss
  really breaks. Per-hop normal latency is learned from history, so distance
  isn't reported as congestion.
- Windows Firewall awareness (read-only): regions blocked by rules show as
  blocked, with an estimated ping, and Netcheck warns when a block rule does
  nothing because the firewall is off.
- A world map, a sortable table of every region, and a 14-day, hour-by-hour
  history heatmap with your best and worst hours.
- Launch CS2 through Steam, with an option to close Netcheck afterwards.
- Dark and light themes.
- Per-user (NSIS) and per-machine (MSI) installers for 64-bit Windows.

### Notes

- Installers are unsigned, so Windows SmartScreen may warn on first run.
- Tested on Windows 11. Windows 10 is expected to work but hasn't been tested.
- Launching CS2 from Netcheck, and the option to close Netcheck afterwards,
  haven't been tested end to end yet.
- Netcheck never needs administrator rights, never changes system settings, and
  never reads or touches game files.

[Unreleased]: https://github.com/Mahan-Imanian/netcheck/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Mahan-Imanian/netcheck/releases/tag/v0.2.0
[0.1.0]: https://github.com/Mahan-Imanian/netcheck/releases/tag/v0.1.0
