# Changelog

All notable changes to Netcheck are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0, minor
versions may change behavior and settings.

## [Unreleased]

## [0.3.0] - 2026-11-04

### Added

- When a newer release is out, Netcheck shows its version and notes after the
  first check. Update now downloads the installer, checks it against the
  SHA-256 that GitHub publishes, runs it and reopens Netcheck. The portable
  build opens the release page instead. Turn the check off in Settings under
  Updates.
- A portable build, `Netcheck_<version>_x64-portable.exe`, that runs without
  installing.

### Changed

- Updated the windows and windows-core crates to 0.62, reqwest to 0.13,
  rusqlite to 0.41 and ts-rs to 12.

### Not tested yet

- Update now, end to end. 0.3.0 is the first version with it, so the first
  real test is the update to the next release.
- The portable build, Windows 10, and launching CS2 with "close Netcheck after
  launching". See [docs/manual-testing.md](docs/manual-testing.md).

## [0.2.1] - 2026-11-04

### Fixed

- The map placed Datapacket Frankfurt, Vienna and London in the wrong part of
  the world, because Valve's relay list has their latitude and longitude
  swapped. They now use their sister city's coordinates.

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

[Unreleased]: https://github.com/Mahan-Imanian/netcheck/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Mahan-Imanian/netcheck/releases/tag/v0.3.0
[0.2.1]: https://github.com/Mahan-Imanian/netcheck/releases/tag/v0.2.1
[0.2.0]: https://github.com/Mahan-Imanian/netcheck/releases/tag/v0.2.0
[0.1.0]: https://github.com/Mahan-Imanian/netcheck/releases/tag/v0.1.0
