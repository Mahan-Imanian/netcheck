## What this changes

<!-- One change per pull request. Link the issue if there is one. -->

## How I verified it

<!-- Commands you ran, what you checked by hand, screenshots for UI changes. -->

## Checklist

- [ ] `pnpm typecheck` and `pnpm test` pass
- [ ] `cargo fmt --all -- --check`, `cargo test -p netcheck-core` and clippy pass
- [ ] Regenerated `src/bindings/` is committed, if Rust types changed
- [ ] `CHANGELOG.md` has a line under `Unreleased`, if this is user-visible
