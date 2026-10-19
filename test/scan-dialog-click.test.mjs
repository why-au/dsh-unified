// Regression guards for the scan-login dialog (2026-10-19).
//
// Two reported failures, both about layering:
//  1. clicking anywhere inside closed it — it used to be a *sibling* of the
//     full-screen scrim, and the scrim swallowed the clicks that hit a gap.
//     Fixed by nesting the dialog inside the scrim and stopping propagation.
//  2. the dialog appeared BEHIND the host's own overlays, so it was visible but
//     unclickable. The host's highest layer is 9999; the dialog now uses a
//     near-maximum z-index with its own scrim (kept separate from the hub
//     dialog's so the hub's stacking is unchanged).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/panel-client.js', import.meta.url), 'utf8')

test('scan dialog is nested inside its scrim, not a sibling', () => {
  assert.match(src, /createElement\(\s*"div",[\s\S]{0,240}\{ id: "dsh-unified-scan", style: S\.scrimTop \},\s*react\.createElement\(/)
  assert.ok(!/react\.createElement\(\s*react\.Fragment,\s*null,\s*react\.createElement\("div", \{ style: S\.scrim, onClick: onClose \}\)/.test(src))
})

// Root cause of "it still disappears": the channel hub listens for mousedown on
// the document and closes the whole panel for any click that is not inside the
// sidebar button or #dsh-unified-panel. The scan dialog is portaled to <body>,
// so every click inside it counted as "outside" and unmounted the panel.
test('the hub outside-click handler ignores the portaled scan dialog', () => {
  assert.match(src, /const scanNode = document\.getElementById\("dsh-unified-scan"\)/)
  assert.match(src, /if \(scanNode !== null && scanNode\.contains\(event\.target\)\) return;/)
  // Same for Escape: the hub's document keydown must not close the panel while
  // the dialog is up, so the dialog claims Escape in the capture phase.
  assert.match(src, /document\.addEventListener\("keydown", onKey, true\)/)
  assert.match(src, /event\.stopPropagation\(\);/)
})

// Reported: "clicking anything at all closes the window". The scan scrim must
// NOT close the dialog — a stray click while waiting for the scan would lose the
// session. Closing stays on the explicit Cancel button.
test('the scan scrim does not close the dialog', () => {
  assert.ok(!/style: S\.scrimTop, onClick: onClose/.test(src), 'scan scrim must not bind onClose')
  assert.match(src, /onClick: onClose \}, t\("authCancel"\)/)
})

test('dialog swallows clicks', () => {
  assert.match(src, /onClick: \(event\) => event\.stopPropagation\(\)/)
})

test('dialog and its scrim sit above every host overlay', () => {
  // Host overlays top out at 9999 (measured in the app.asar bundles).
  assert.match(src, /scrimTop: \{[^}]*zIndex: 2147482000/)
  assert.match(src, /maxHeight: "min\(70vh, 560px\)",[\s\S]{0,400}zIndex: 2147483000/)
  // The hub dialog keeps its own, much lower scrim: do not raise it.
  assert.match(src, /scrim: \{ position: "fixed", inset: 0, zIndex: 9998, background: "transparent" \}/)
})

// Reported as "the dialog's contents cannot be clicked, there is no navigation":
// the Electron main window has no window.open handler, so opening the auth URL
// was silently swallowed. The button now falls back to copying the URL, and the
// URL itself is a real anchor so it can be opened via right-click / middle-click.
test('opening the auth URL falls back to copying when the popup is blocked', () => {
  assert.match(src, /const openUrl = async \(\) => \{/)
  assert.match(src, /const win = window\.open\(url, "_blank", "noopener,noreferrer"\)/)
  assert.match(src, /opened = win !== null && win !== undefined/)
  assert.match(src, /if \(opened\) return;/)
  assert.match(src, /await navigator\.clipboard\.writeText\(url\)/)
})

test('the auth URL renders as an anchor, not plain text', () => {
  assert.match(src, /react\.createElement\(\s*"a",\s*\{\s*href: authUrl,\s*target: "_blank",\s*rel: "noopener noreferrer"/)
})
