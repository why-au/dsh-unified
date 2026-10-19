// Regression guard for "clicking anywhere in the scan-login dialog closes it"
// (2026-10-19).
//
// The dialog was rendered as a *sibling* of the full-screen scrim, so a click
// that landed on any gap (or on the scrim painted beside it) closed the whole
// dialog. It is now nested inside the scrim and stops propagation; it also sits
// above the channel-hub dialog's 9999 stacking layer.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/panel-client.js', import.meta.url), 'utf8')

test('scan dialog is nested inside the scrim, not a sibling', () => {
  // The scrim is the container that receives the dialog.
  assert.match(src, /react\.createElement\(\s*"div",\s*\{ style: S\.scrim, onClick: onClose \},\s*react\.createElement\(/)
  // The old sibling shape is gone.
  assert.ok(!/react\.createElement\(\s*react\.Fragment,\s*null,\s*react\.createElement\("div", \{ style: S\.scrim, onClick: onClose \}\)/.test(src))
})

test('dialog swallows clicks and sits above the hub layer', () => {
  assert.match(src, /onClick: \(event\) => event\.stopPropagation\(\)/)
  assert.match(src, /zIndex: 10000/)
})
