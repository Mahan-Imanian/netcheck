# Contributing to Netcheck

Thanks for helping. Bug reports from real networks are the most valuable
contribution, because every ISP and route behaves differently.

## Reporting a bug

[Open a bug report](https://github.com/Mahan-Imanian/netcheck/issues/new?template=bug_report.yml).
A screenshot of the Verdict and Route screens helps most. Netcheck shows your
router's and the hops' IP addresses, so crop or blur them if you'd rather not
share them.

Security problems go through [private reporting](SECURITY.md) instead.

## Development setup

Netcheck is a Windows app. The core crate also builds and tests on Linux,
which is what CI uses for the fast checks.

You need:

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 22 or newer and [pnpm](https://pnpm.io) 10
- On Windows, a C toolchain for the bundled SQLite: either the MSVC build tools
  (recommended, the Tauri default) or the GNU toolchain
  (`rustup default stable-x86_64-pc-windows-gnu` plus a MinGW-w64 GCC on `PATH`).
  With GNU, keep Rust and MinGW in a path without spaces, because `ld` can't
  handle them.
- WebView2, which Windows 11 already includes.

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

### Working on the UI without Windows

The demo backend replays synthetic checks, so you can work on the interface in
any browser and on any OS:

```bash
pnpm dev:demo
```

Then open <http://localhost:1420/?scenario=unstable>. Scenarios are listed in
[`docs/how-it-works.md`](docs/how-it-works.md#demo-scenarios). Demo data is
never compiled into release builds, and CI checks that.

## Checks

Run these before opening a pull request. CI runs the same ones.

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
cargo fmt --all -- --check
```

```bash
cargo test -p netcheck-core
```

```bash
cargo clippy --workspace --all-targets -- -D warnings -W clippy::unwrap_used
```

`cargo test` also regenerates the TypeScript types in `src/bindings/` from the
Rust structs. Commit them if they change, because CI fails when they're out of
date.

## Project layout

| Path | What lives there |
|---|---|
| `crates/netcheck-core/` | Everything that measures: ICMP, traceroute, Valve's relay list, firewall reading, diagnosis, history. Platform logic stays behind traits so it's testable on Linux. |
| `src-tauri/` | The thin Tauri shell: commands, window lifecycle and shutdown. |
| `src/` | The React and TypeScript UI, with a single Zustand store. |
| `src/demo/` | The development-only demo backend. |
| `config/thresholds.json` | Default grade thresholds. |
| `scripts/` | Screenshot capture, the world-map generator, Windows verification. |
| `docs/` | Technical documentation and README images. |

## Pull requests

- Keep each pull request to one change, and say what you verified and how.
- Add or update tests for behavior changes. Measurement and diagnosis logic
  needs a test with a literal expected value.
- UI changes need before and after screenshots. `scripts/screenshots.ps1`
  regenerates the README images from the demo backend.
- Add a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) for anything
  user-visible.

## Ground rules

Netcheck only ever reads system state. Pull requests that change firewall
rules, routes or system settings, read or modify game files or memory, or add
network requests beyond the ones listed in the README won't be merged.

By contributing you agree that your work is released under the
[MIT License](LICENSE), and that you'll follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
