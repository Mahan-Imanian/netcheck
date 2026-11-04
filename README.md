<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/wordmark-dark.png">
  <img alt="Netcheck" src="docs/assets/wordmark-light.png" width="380">
</picture>

Netcheck is a Windows app for Counter-Strike 2 players. It pings every Valve
server region, measures jitter and packet loss, and traces the route to the
fastest one. Run it before you queue.

[![CI](https://github.com/Mahan-Imanian/netcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/Mahan-Imanian/netcheck/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Mahan-Imanian/netcheck?include_prereleases&label=release&color=33d6a3)](https://github.com/Mahan-Imanian/netcheck/releases)
[![License: MIT](https://img.shields.io/github/license/Mahan-Imanian/netcheck?color=ece8e1)](LICENSE)
![Windows 11](https://img.shields.io/badge/platform-Windows%2011-1a1f25)

[**Download**](https://github.com/Mahan-Imanian/netcheck/releases/latest) ·
[How it works](docs/how-it-works.md) ·
[Contributing](CONTRIBUTING.md) ·
[Changelog](CHANGELOG.md)

<img src="docs/assets/demo.gif" alt="Netcheck running a check: the gauge fills, regions appear on the map, and the result shows" width="900">

</div>

## What it does

Ping to a CS2 region changes during the day. Wi-Fi, your ISP and the
international links on your route all add to it. Netcheck shows the numbers
before a match starts. It doesn't block servers or change settings.

- Pings each Valve region 20 times, using the relay list from Valve's API.
  For each region it shows average, worst 5%, jitter and packet loss. A full
  check takes about 10 seconds.
- Puts the fastest region in the big gauge. You can pin a region instead
  in Settings.
- Grades each region Excellent, Good, Playable or Bad. You can change the
  thresholds.
- Traces the route to that region and groups the hops into router, ISP,
  international link and Valve. If the region is slow, it names the first hop
  where latency or loss jumps.
- Reads your Windows Firewall rules. Regions you've blocked show as blocked,
  with an estimated ping.
- Keeps 14 days of history and shows your best and worst hours.
- Launches CS2 through Steam.

It only runs while its window is open. There's no tray icon, service or
updater, and it never needs admin rights.

## Screenshots

| Route diagnosis | Every region |
|---|---|
| ![The route screen pinpointing a congested international link](docs/screenshots/route.png) | ![The regions table sorted by average ping](docs/screenshots/regions.png) |
| **History** | **Light theme** |
| ![The history heatmap of ping by hour](docs/screenshots/history.png) | ![The verdict screen in the light theme](docs/screenshots/light.png) |

<sub>The animation above is the real app on a live connection. These four come
from the built-in demo backend, which replays synthetic results and marks every
screen <b>DEV DEMO DATA</b>. Real IPs never appear in them.</sub>

## Install

1. Download the latest installer from
   [**Releases**](https://github.com/Mahan-Imanian/netcheck/releases/latest):
   - `Netcheck_<version>_x64-setup.exe` installs for your user, with no admin
     rights needed. Most people want this one.
   - `Netcheck_<version>_x64_en-US.msi` installs for all users and asks for
     admin rights.
2. Optionally, check that the download is intact. In PowerShell, in the folder
   you downloaded to:

   ```powershell
   Get-FileHash .\Netcheck_*_x64-setup.exe -Algorithm SHA256
   ```

   The hash should match the line for that file in `SHA256SUMS.txt` on the
   release page.
3. Run the installer, then open Netcheck from the Start menu before you play.

Requirements: Windows 11, 64-bit, with Microsoft Edge WebView2 (built into
Windows 11). Windows 10 should work, because the app and its WebView2 runtime
both support it, but it hasn't been tested yet. If you try it, please
[report how it went](https://github.com/Mahan-Imanian/netcheck/issues/new?template=bug_report.yml).

### About the "Windows protected your PC" warning

The installers aren't code-signed yet. Code signing needs a paid certificate
that ties a file to a verified publisher, and this project doesn't have one
yet. Because of that, Windows SmartScreen will probably show **"Windows
protected your PC"** the first time you run the installer. To continue,
choose **More info**, then **Run anyway**.

What this means for you:

- Windows can't confirm who published the file. Only download Netcheck from
  this repository's [Releases page](https://github.com/Mahan-Imanian/netcheck/releases).
  Copies elsewhere could be modified.
- The installers are built by
  [GitHub Actions](https://github.com/Mahan-Imanian/netcheck/actions/workflows/release.yml)
  from the tagged source in this repository, not on someone's PC, and the
  checksums are generated in the same run.
- Antivirus software is sometimes more suspicious of unsigned programs. If
  yours flags Netcheck, please
  [open an issue](https://github.com/Mahan-Imanian/netcheck/issues) with the
  detection name.
- Once a signing certificate is in place, releases will be signed
  automatically and the warning will go away.

Netcheck itself never asks for administrator rights. The per-user installer
doesn't need them either.

### Known limitations

- Tested on Windows 11 only. Windows 10 should work but hasn't been tested.
- Launch CS2 opens `steam://rungameid/730`, the same link a desktop
  shortcut uses, so Steam needs to be installed. Launching the game, and the
  "close Netcheck after launching" option, haven't been tested end to end yet.
- Some VPNs and firewalls drop ICMP. Regions then show "no reply", even
  though the game itself may connect fine.
- IPv4 only, like the relay addresses Valve publishes.

## Using it

1. Open Netcheck. The check starts on its own and takes about 10 seconds.
2. The big number is your fastest region, or the one you pinned in Settings.
   The line under the gauge says whether it's good to play, and names a
   cleaner region if there is one.
3. If it's bad, open Route to see which part of the path is slow. A slow
   router or Wi-Fi is on your side. A slow international link is usually your
   ISP at peak hours.
4. Press Launch CS2.

Press <kbd>R</kbd> to check again. History shows your best and worst hours
after a few checks.

### Settings

| Setting | What it does |
|---|---|
| Your region | Fastest region (the default), or a region you pick. The gauge, route trace and history follow it. |
| Pings per region | 10 to 100, sent 100 ms apart. More pings give steadier numbers and take longer. |
| Grade thresholds | Average, jitter and loss limits for each grade. Defaults live in [`config/thresholds.json`](config/thresholds.json). |
| After launching CS2 | Close Netcheck, keep it open, or ask each time. |
| Theme | System, dark or light. |
| Map origin | Where the map's arcs start. Auto uses the location of your lowest-ping region. Custom lets you set it. |

## How it works

```mermaid
flowchart LR
    A[Valve relay list<br/>GetSDRConfig] --> B[Ping every region<br/>20 echoes each]
    B --> C[Grade<br/>avg, jitter, loss]
    D[Traceroute to<br/>your region] --> E[First hop where<br/>latency or loss jumps]
    F[Windows Firewall<br/>read-only] --> C
    C --> G((Verdict))
    E --> G
```

Netcheck sends ICMP echoes through the Windows `IcmpSendEcho2` API, the same
path `ping.exe` uses. On Windows 11 its averages were within 3 ms of
`ping -n 20` against the same Valve relays. A hop is only blamed when your
region is slow, the slowdown carries on to every later hop, and it's above that
hop's usual latency.

Netcheck downloads Valve's public relay list and sends ICMP echoes to the
relays, your router, 1.1.1.1 and the hops on your route. It makes no other
network requests: no telemetry, accounts or update checks.

The exact rules, the files it writes and the architecture are in
[docs/how-it-works.md](docs/how-it-works.md).

## FAQ

<details>
<summary><b>Can this get me VAC banned?</b></summary>

Netcheck doesn't read, inject into or modify CS2, Steam or any game file, and
it doesn't run while you play unless you leave it open. It pings Valve's
public relay servers the same way `ping.exe` does, and launches the game
through a `steam://` link. Netcheck isn't affiliated with or endorsed by Valve.
</details>

<details>
<summary><b>Does it block or pick servers for me?</b></summary>

No. Netcheck only measures. If you already block regions with Windows Firewall,
Netcheck reads those rules and labels the blocked regions. It never changes
firewall rules, routes or system settings.
</details>

<details>
<summary><b>Why does it say a hop is fine when it shows a big number?</b></summary>

Long links add latency because of distance alone. Netcheck learns each hop's
usual latency from your history and only reports rises above that, and only
when your region is slow.
</details>

<details>
<summary><b>Does it work with a VPN?</b></summary>

Netcheck measures the path your traffic takes. With a VPN on, that's the path
through the VPN. Some VPNs drop ICMP, and then regions show no reply.
</details>

## Build from source

You need Rust (stable), Node.js 22+, pnpm 10 and a Windows C toolchain. See
[CONTRIBUTING.md](CONTRIBUTING.md#development-setup) for details.

```bash
git clone https://github.com/Mahan-Imanian/netcheck.git
```

```bash
cd netcheck
```

```bash
pnpm install
```

```bash
pnpm tauri dev
```

`pnpm tauri build` produces both installers in `target/release/bundle/`. To
work on the UI on any OS, run `pnpm dev:demo` and open
<http://localhost:1420/?scenario=unstable>.

## Roadmap

Planned, in no particular order. Ideas and pull requests are welcome in
[issues](https://github.com/Mahan-Imanian/netcheck/issues).

- [ ] Signed installers, so SmartScreen stops warning
- [ ] Tested Windows 10 support
- [ ] Install with `winget` and Scoop
- [ ] Other Steam Datagram Relay games that use the same relay list, such as Dota 2 and Deadlock
- [ ] Translations
- [ ] A portable build that doesn't need installing

## Contributing

Bug reports from real networks are the most useful contribution, because every
ISP behaves differently. Read [CONTRIBUTING.md](CONTRIBUTING.md) to set up the
project, run the checks and open a pull request. Everyone taking part follows
the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/Mahan-Imanian/netcheck/security/advisories/new),
not as public issues. See [SECURITY.md](SECURITY.md).

## License and acknowledgements

Netcheck is released under the [MIT License](LICENSE).

It's built with [Tauri](https://tauri.app), [React](https://react.dev),
[Motion](https://motion.dev) and [Tailwind CSS](https://tailwindcss.com). The
world map is drawn from [Natural Earth](https://www.naturalearthdata.com) data
via [world-atlas](https://github.com/topojson/world-atlas). Flags come from
[country-flag-icons](https://www.npmjs.com/package/country-flag-icons) and
icons from [Lucide](https://lucide.dev). Type is set in
[Geist](https://vercel.com/font) and
[Barlow Condensed](https://github.com/jpt/barlow). Relay data comes from Valve's
public Steam Web API.

Counter-Strike, Counter-Strike 2 and Steam are trademarks of Valve Corporation.
Netcheck is an independent project, not affiliated with or endorsed by Valve.
