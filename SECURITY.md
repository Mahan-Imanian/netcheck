# Security policy

## Supported versions

Netcheck is pre-1.0. Only the latest release gets security fixes.

| Version | Supported |
|---|---|
| Latest 0.x release | Yes |
| Older releases | No |

## Reporting a vulnerability

Please don't open a public issue for a security problem.

Report it privately through GitHub instead:
[**Report a vulnerability**](https://github.com/Mahan-Imanian/netcheck/security/advisories/new).
Only the maintainer can see the report.

Include what you can:

- The Netcheck version and your Windows version.
- What an attacker could do, and what they need first (local access,
  a malicious network, a crafted relay list).
- Steps or a proof of concept to reproduce it.

You'll get an acknowledgement within 7 days. Once the problem is confirmed,
it'll be fixed in a release, and you'll be credited in the advisory unless you'd
rather not be.

## What Netcheck touches

These are the areas where a vulnerability would matter most:

- **Network input.** Netcheck downloads Valve's relay list from
  `api.steampowered.com` and parses it. It also reads ICMP replies and
  traceroute hops from the network.
- **Local files.** It writes a relay-list cache and a SQLite history database
  under `%APPDATA%\app.netcheck.desktop\`.
- **Windows APIs.** It calls `IcmpSendEcho2`, `GetIpForwardTable2` and the
  Windows Firewall COM API, read-only, and never asks for administrator rights.
- **The webview.** The UI runs in WebView2 with a Content Security Policy that
  allows no remote origins.

Netcheck doesn't read, inject into, or modify Counter-Strike 2, Steam, or any
game files. The Launch CS2 button only opens a `steam://` link.
