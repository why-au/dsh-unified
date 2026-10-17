// Public quota projections: never spread account descriptions or vendor payloads.
const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const text = (value) => typeof value === 'string' ? value : ''
const STATUSES = new Set(['ok', 'verify', 'cooldown', 'quarantine', 'error', 'unknown'])

export function buildQuotaAccount({ provider, name, index, info, label }) {
  info = info && typeof info === 'object' ? info : {}
  const windows = []
  for (const window of Array.isArray(info.usage) ? info.usage : []) {
    if (!window || typeof window !== 'object') continue
    const usedPercent = finite(window.usedPercent)
    if (usedPercent == null) continue
    const id = text(window.id) || text(window.en) || text(window.ru)
    const projected = {
      id,
      label: text(window.en) || text(window.ru) || text(window.label) || id,
      usedPercent,
      resetAt: finite(window.resetAt),
    }
    for (const key of ['zh', 'en', 'ru']) {
      if (typeof window[key] === 'string') projected[key] = window[key]
    }
    if (typeof window.isModelBucket === 'boolean') projected.isModelBucket = window.isModelBucket
    windows.push(projected)
  }
  const percent = finite(info.usagePercent)
  const account = {
    provider: text(provider),
    name: text(name),
    index: finite(index),
    // The caller supplies the privacy-masked label; never fall back to info.label/email.
    label: text(label),
    windows,
    usagePercent: percent ?? (windows.length ? Math.max(...windows.map((w) => w.usedPercent)) : null),
    status: STATUSES.has(info.status) ? info.status : (info.validationUrl ? 'verify' : (info.configured ? 'ok' : 'unknown')),
  }
  const usageAt = finite(info.usageAt)
  if (usageAt != null) account.usageAt = usageAt
  return account
}
