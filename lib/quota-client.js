// Subscription quota in the composer's stats row. No upstream requests here:
// the status route projects the account store's last observed quota snapshots.
window.__ModuleLoader__.load({
  id: '@dsh-unified/dsh-plugin/quota',
  factory: (require) => {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const finite = (v) => typeof v === 'number' && Number.isFinite(v)
    const percent = (v) => finite(v) ? Math.round(Math.max(0, Math.min(100, v))) : null

    function countdown(resetAt, now = Date.now()) {
      if (!finite(resetAt) || resetAt <= 0) return ''
      if (resetAt <= now) return '↻'
      const minutes = Math.max(1, Math.floor((resetAt - now) / 60000))
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)
      return days ? `${days}d ${hours % 24}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
    }

    function visibleWindows(account, model) {
      return (Array.isArray(account.windows) ? account.windows : []).filter((w) =>
        percent(w.usedPercent) !== null && (!w.isModelBucket || (model && (w.id === model || w.scope === model))))
    }

    function accountText(account, model, now, unknown) {
      const windows = visibleWindows(account, model)
      if (windows.length) return windows.slice(0, 2).map((w) =>
        `${countdown(w.resetAt, now) || w.label || w.id || 'Quota'} ${percent(w.usedPercent)}%`).join(' · ')
        + (windows.length > 2 ? ` · +${windows.length - 2}` : '')
      // A model-specific pool must not leak into the selected model's usage.
      if ((account.windows || []).some((w) => w.isModelBucket)) return unknown
      const used = percent(account.usagePercent)
      return used === null ? unknown : `${used}%`
    }

    function selectAccounts(accounts, selection, scope) {
      if (scope === 'all') return accounts
      // Unknown/unavailable model service is not permission to show the most
      // recently used subscription from a different session.
      if (!selection || typeof selection.provider !== 'string') return []
      return accounts.filter((a) => a.provider === selection.provider)
    }

    function statsScope(seat) {
      let node = seat && seat.parentElement
      for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
        if (node.querySelector('[data-composer-stats]')) return node
      }
      return seat && seat.parentElement
    }

    const styles = {
      row: { display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', maxWidth: '100%', minWidth: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      button: { appearance: 'none', background: 'transparent', color: 'inherit', border: 0, padding: '2px 0', font: 'inherit', cursor: 'pointer', textAlign: 'left', fontVariantNumeric: 'tabular-nums', borderRadius: 4 },
      panel: { flexBasis: '100%', padding: '8px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)' },
    }

    function QuotaDock({ readSelection }) {
      const [data, setData] = React.useState(null)
      const [selection, setSelection] = React.useState(null)
      const [error, setError] = React.useState(false)
      const [now, setNow] = React.useState(Date.now())
      const [expanded, setExpanded] = React.useState(false)
      const [statsRow, setStatsRow] = React.useState(null)
      const seat = React.useRef(null)
      const lastGoodAt = React.useRef(null)
      React.useEffect(() => {
        let alive = true, busy = false
        let abort
        const pull = async () => {
          if (busy) return
          busy = true
          abort = new AbortController()
          const timeout = setTimeout(() => abort.abort(), 15000)
          try {
            const res = await fetch('/dsh-subscriptions/status', { cache: 'no-store', signal: abort.signal })
            if (!res.ok) throw new Error('Quota status unavailable')
            const next = await res.json()
            if (!Array.isArray(next.subscriptions)) throw new Error('Invalid quota status')
            if (alive) { setData(next); setError(false); lastGoodAt.current = Date.now() }
          } catch { if (alive) setError(true) }
          finally { clearTimeout(timeout); busy = false }
        }
        pull()
        const timer = setInterval(pull, 60000)
        return () => { alive = false; clearInterval(timer); abort?.abort() }
      }, [])
      React.useEffect(() => {
        let alive = true, busy = false
        const pull = async () => {
          if (busy) return
          busy = true
          try { const next = await readSelection(); if (alive) setSelection(next || null) }
          catch { if (alive) setSelection(null) }
          finally { busy = false }
        }
        pull()
        const timer = setInterval(pull, 2000)
        return () => { alive = false; clearInterval(timer) }
      }, [readSelection])
      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 10000)
        return () => clearInterval(timer)
      }, [])
      React.useEffect(() => {
        const scope = statsScope(seat.current)
        if (!scope) return
        const find = () => setStatsRow(scope.querySelector('[data-composer-stats]'))
        find()
        const observer = new MutationObserver(find)
        observer.observe(scope, { childList: true, subtree: true })
        return () => observer.disconnect()
      }, [])
      const anchor = h('span', { ref: seat, 'aria-hidden': true, style: { display: 'none' } })
      // Old compact percent/bar/forecast modes keep their old toolbar component.
      if (!data || !['windows', 'all'].includes(data.composerQuota)) return anchor
      const zh = data.quotaLanguage === 'zh' || (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language))
      const unknown = zh ? '额度未知' : 'Quota unknown'
      const rows = selectAccounts(data.subscriptions, selection, data.composerQuota)
      if (!rows.length) return anchor
      const model = selection && (typeof selection.model === 'string' ? selection.model : selection.model?.id)
      const oldSnapshot = rows.some((a) => finite(a.usageAt) && now - a.usageAt > 15 * 60000)
      const stale = error ? (zh ? '（更新失败，显示上次数据）' : ' (update failed; last snapshot)')
        : oldSnapshot ? (zh ? '（额度采样较早）' : ' (older quota snapshot)') : ''
      const detail = (a) => {
        // Expanded rows label every pool explicitly, including other models.
        const wins = (a.windows || []).filter((w) => percent(w.usedPercent) !== null)
        if (!wins.length) return accountText(a, a.provider === selection?.provider ? model : null, now, unknown)
        return wins.map((w) => `${w.label || w.id}: ${percent(w.usedPercent)}% · ${countdown(w.resetAt, now) || (zh ? '重置时间未知' : 'Reset unknown')}`).join(' · ')
      }
      const badge = h('span', { style: styles.row, 'data-unified-quota': true },
        h('button', {
          type: 'button', style: styles.button, 'aria-expanded': expanded,
          title: (zh ? '已用额度；时间为距重置时间。点击展开全部订阅。' : 'Used quota; countdown until reset. Expand all subscriptions.') + stale,
          onClick: () => setExpanded((v) => !v),
          onKeyDown: (e) => { if (e.key === 'Escape') setExpanded(false) },
        }, rows.map((a) => `${a.name || a.provider}${rows.filter((r) => r.provider === a.provider).length > 1 ? ` #${a.index}` : ''} ${accountText(a, a.provider === selection?.provider ? model : null, now, unknown)}`).join('  ·  ') + stale),
        expanded ? h('span', { style: styles.panel, role: 'region', 'aria-label': zh ? '订阅额度详情' : 'Subscription quotas' },
          h('span', null, zh ? '已用额度（非剩余额度）' : 'Used quota (not remaining)'),
          ...data.subscriptions.map((a, i) => h('div', { key: `${a.provider}:${a.index}:${i}`, style: { marginTop: 6 } },
            `${a.name || a.provider} #${a.index}${a.label ? ' · ' + a.label : ''}: ${detail(a)}`,
            a.status && a.status !== 'ok' ? ` · ${a.status}` : '',
            a.usageAt ? ` · ${zh ? '采样' : 'Sampled'} ${new Date(a.usageAt).toLocaleString()}` : ` · ${zh ? '采样时间未知' : 'Sample time unknown'}`)),
          error && lastGoodAt.current ? h('div', { role: 'status' }, stale) : null) : null)
      return h(React.Fragment, null, anchor, statsRow && statsRow.isConnected ? createPortal(badge, statsRow) : badge)
    }

    return {
      inject: ['slots'],
      // Pure helpers are exported for deterministic tests, not as window globals.
      quotaHelpers: { countdown, percent, visibleWindows, accountText, selectAccounts, statsScope },
      apply(ctx) {
        ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'dsh-unified-subscription-usage', order: 10,
          inject: (sessionId) => ({ readSelection: async () => {
            const models = ctx.get('modelDirectories')
            if (!models) return null
            const loaded = await models.directoryFor(sessionId).load()
            return loaded.current || null
          } }),
        }, QuotaDock)))
      },
    }
  },
})
