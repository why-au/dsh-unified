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
- node --test test/*.test.mjs: PASS, 25 tests, 0 failures.
- node scripts/check.mjs: PASS, 108 JavaScript files.
- Package entry dynamic import: PASS, exported name and apply function.
- pnpm pack: PASS, dsh-unified-dsh-plugin-0.1.1.tgz.

## Host compatibility and isolated deployment (DSH 0.2.0-rc.2)

Found only by installing into a real host, not by the offline suite:

- `dsh.bundle` was missing and `cordis.patch.yml` used a legacy `version/services/entry` shape, so the plugin installed as a plain dependency and never activated. Fixed to a modern `- insert:` overlay plus `dsh.bundle.patch`.
- `dsh.client.inject` listed Cordis service names where the host expects package names for graph preloading. Fixed to the renderer/locale/session-controller package IDs; the client's own `exports.inject` keeps the service names.
- `antigravityClientSecret` was the only non-volatile Config field, and the full config object is written through `settings.update()`, which rejects non-volatile paths. Saving settings would have failed. Field is now volatile.
- peerDependencies moved from 0.1.7-rc.2 to 0.2.0-rc.2 to match the installed host.
- The channel panel's configuration card was registered only on `settings.plugin.item`. DSH 0.2.0-rc.2 removed that seat entirely (0 registrations and 0 render sites in the shipped host packages), so the card could never appear. It now registers on the list-typed `plugins.detail.section` and filters by the page subject, so it shows on this plugin's own pages and returns null elsewhere.
- Deliberately did NOT use `plugins.bundle.config` for that card: it is a keyed seat keyed by package name, the subscriptions card already owns this package's key, and a later registrant replaces the earlier one — using it would have hidden the subscriptions UI.
- Also verified the subscription card's own seats do exist and are rendered by the host: `plugins.item` (the Plugins page renders it as a card and dispatches by entry id), `plugins.bundle.config`, `plugins.row.config`, plus `conversation.session.header.actions`, `conversation.input.right` and `sidebar.footer.action`.
- Reinstalling a tarball with an unchanged version number made the installer report "Already up to date" without replacing files; the test profile needed an explicit remove first. Relevant when validating local builds.

Isolated acceptance (`DSH_HOME` and profile kept outside the real harness home; no real credentials):

- Installer auto-registered the package into the test profile's `dsh.profile.bundles`.
- Page HTTP 200 with the plugin present in the boot graph; its `client.js` bundle 200 and contains both the subscriptions and channel-hub factories.
- `/plugins/dsh-unified/status|settings` and `/dsh-subscriptions/health|config|status` all 200; Zen reported signed in without credentials.
- Config GET/PUT with revision succeeded, sensitive values echo masked, and the write survived a restart.
- A deprecated-format `cordis.patch.yml` in the host's own profile (from an earlier unrelated plugin) was left untouched.
- Verified against the installed 0.2.0-rc.2 host packages, not just documentation: which seats this plugin registers, which of them the host actually renders, and the `plugins.detail.section` subject filter behaviour.

Tests cover the actual AccountStore -> adapter manager -> registered adapter path, model discovery, text/usage streaming, real tool schemas, streamed tool arguments, tool-result continuation, 429 cooldown/recovery, zero anonymous credential calls, client factory/seat disposal, settings/updater contracts and entry dependency resolution. Test homes are temporary, and upstream responses are mocked.

## UI refinement

- Theme-aware account cards, responsive spacing, explicit button hierarchy, keyboard focus, reduced-motion rules and hidden manual token input.
- Channel hub adds local search and separate loading/unconfigured/no-match states, text status, semantic progress bars and responsive card layout.
- Discovered that panel-client.js was previously not applied by the published client entry. Added a deterministic build step and committed package bundle that applies both factories, and fixed hub slot disposal.
- UI tests execute real factories/components with Node VM host/React stubs and preserve endpoint/callback contracts. These are not browser screenshots or visual acceptance tests.

## Not verified

- No real upstream model request, login or account refresh was executed.
- Browser rendering and visual acceptance remain unverified: this session has no browser automation/DOM tool. HTTP and resource checks do not prove layout or React mount success.
- Listing a vendor does not establish that its upstream protocol, subscription rights or current model list work. In particular Cursor and other private IDE protocols require separate live validation.
- Gate placeholders remain necessary for the existing Zen request shape. If a model ignores their description when other real tools are present, the host must reject unsupported calls; no fake execution is provided.
- The isolated run used the default `web` profile bundles. It was deliberately not installed into the harness home's real `desktop` profile: that profile already carries `dsh-unified-channels`, an installation bundle that aggregates the same four upstream projects (`dsh-connect`, `dsh-plugin-subscriptions`, `@goodandready/dsh-subscriptions`, `@opencode2dsh/dsh-plugin`). Installing both would very likely collide on provider ids, the `dsh-subscriptions` settings namespace and the `/dsh-subscriptions/*` HTTP routes. A correction to an earlier note in this file: the desktop profile's own `cordis.patch.yml` is already a modern top-level array (its `version: 1` is a field inside one entry's config, not a legacy top-level key), so nothing there needed fixing.

Use an isolated profile and follow README acceptance steps before replacing existing plugins. Do not install this aggregate together with overlapping upstream plugins without checking provider/service collisions. The local package version is 0.1.1 and is not a published release.
