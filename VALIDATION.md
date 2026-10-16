# Local validation — 2026-10-16

## Source and scope

Initially downloaded https://github.com/why-au/dsh-unified main as a source ZIP. After installing Git, cloned the repository at baseline 18fa2be91707ebedbf9cae96052645319d0d519d and migrated the fixes to branch fix/unified-integration. Re-ran installation, tests and syntax checks in this real Git worktree before the local commit. No push, publication or changes to the running DSH installation were performed.

## Changes

- Anonymous Zen provider is registered without user slots or vault tokens. A single virtual identity participates in cooldown/quarantine; duplicate slots cannot bypass rate limits.
- Zen preserves real host tool schemas and tool-result continuation; only missing gate names receive placeholders. Plain chat disables tool calls. Session affinity no longer retains prompt text as a cache key.
- Normalized apiBase/baseUrl configuration and added Zen configuration fields.
- Added DSH web client declaration; unified browser module and settings IDs. Fixed leaked UI slot disposers and updater package target.
- Replaced absolute security claims with explicit credential storage boundaries and manual acceptance steps.
- Pinned undici to 8.10.1 and regenerated the lockfile under the existing release-age policy. Explicitly disabled optional third-party lifecycle scripts in pnpm-workspace.yaml; no supply-chain policy was relaxed.
- Replaced the broken typecheck command (missing TypeScript config/compiler) with an explicitly named dependency-free recursive syntax check. This does NOT constitute type checking.
- Vendor smoke test now has a timeout and fails on empty text or streamed errors instead of reporting false success.
- Pre-commit review fixed removed custom-vendor IDs breaking provider scans and anonymous requests bypassing configured slot proxies. Anonymous proxy selection uses the first non-empty proxy in slot order.
- Added Windows/Linux GitHub Actions checks. Remote CI has not run locally and requires a push.

## Executed results

- pnpm install --frozen-lockfile: PASS (pnpm 11.7.0).
- node scripts/build-client.mjs: PASS, one package factory composes subscriptions and channel hub contributions.
- node --test test/*.test.mjs: PASS, 23 tests, 0 failures.
- node scripts/check.mjs: PASS, 107 JavaScript files.
- Package entry dynamic import: PASS, exported name and apply function.
- pnpm pack --pack-destination ..: PASS, dsh-unified-dsh-plugin-0.1.0.tgz.

Tests cover the actual AccountStore -> adapter manager -> registered adapter path, model discovery, text/usage streaming, real tool schemas, streamed tool arguments, tool-result continuation, 429 cooldown/recovery, zero anonymous credential calls, client factory/seat disposal, settings/updater contracts and entry dependency resolution. Test homes are temporary, and upstream responses are mocked.

## UI refinement

- Theme-aware account cards, responsive spacing, explicit button hierarchy, keyboard focus, reduced-motion rules and hidden manual token input.
- Channel hub adds local search and separate loading/unconfigured/no-match states, text status, semantic progress bars and responsive card layout.
- Discovered that panel-client.js was previously not applied by the published client entry. Added a deterministic build step and committed package bundle that applies both factories, and fixed hub slot disposal.
- UI tests execute real factories/components with Node VM host/React stubs and preserve endpoint/callback contracts. These are not browser screenshots or visual acceptance tests.

## Not verified

- No real upstream model request, login or account refresh was executed.
- No plugin installation into a real DSH profile, browser render, or live GUI acceptance was performed.
- Listing a vendor does not establish that its upstream protocol, subscription rights or current model list work. In particular Cursor and other private IDE protocols require separate live validation.
- Gate placeholders remain necessary for the existing Zen request shape. If a model ignores their description when other real tools are present, the host must reject unsupported calls; no fake execution is provided.

Use an isolated profile and follow README acceptance steps before replacing existing plugins. Do not install this aggregate together with overlapping upstream plugins without checking provider/service collisions. The local package retains upstream version 0.1.0 and is not a published release.
