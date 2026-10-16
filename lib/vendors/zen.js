/**
 * zen —— OpenCode Zen 匿名免费通道 vendor（移植自 opencode2dsh）。
 *
 * 要点（移植自 opencode2dsh 技术解析 + 源码验证）：
 *  - 端点：POST https://opencode.ai/zen/v1/chat/completions（OpenAI 兼容流）
 *  - 认证：`Bearer public`（匿名，无 key）
 *  - 闸门三件套（缺一 403 FreeTierError）：
 *      1. 规范 ses_ 会话头（x-opencode-session 等 5 个头）
 *      2. body stream:true
 *      3. bash + read 两个 gate tools 注入
 *  - ses_ id：真实时钟毫秒 ×0x1000 + counter(1)，bitwise 取反，12 hex + 14 Base62；
 *    每个会话固定复用（重试不得新造），否则破坏上游会话配额/缓存
 *  - 免费模型判定：models.dev 元数据 + 2026-10-13 实测静态表
 */

import { openaiChatStream, httpError } from '../wire.js'
import { openaiMessages, openaiTools } from '../messages.js'

export const id = 'zen'
export const anonymous = true

const ZEN_API_BASE = 'https://opencode.ai/zen/v1'
const ZEN_USER_AGENT = 'opencode/1.18.31 (https://opencode.ai)'
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** 2026-10-13 实测可匿名 chat 的免费模型（新模型走 live 目录自动补）。 */
const ZEN_FREE_MODELS = [
  {
    id: 'big-pickle',
    name: 'Big Pickle',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'mimo-v2.6-flash-free',
    name: 'MiMo v2.6 Flash (Free)',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'nemotron-3.5-lightning-free',
    name: 'Nemotron 3.5 Lightning (Free)',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
]

/** 12 hex：时钟毫秒×0x1000 + counter(1)，bitwise 取反。 */
export function invertedTimestampHex(now = Date.now()) {
  const current = BigInt(now) * 0x1000n + 1n
  const inverted = ~current & 0xffffffffffffn
  return inverted.toString(16).padStart(12, '0')
}

/** 14 Base62：随机后缀（一次生成，会话内固定）。 */
function randomBase62(width = 14) {
  let out = ''
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(width * 2))
  for (let i = 0; i < width; i++) {
    out += BASE62_ALPHABET.charAt(bytes[i] % 62)
  }
  return out
}

/** 会话记忆：conversation signal → { session, request, project }（每个会话固定）。 */
const sessionCache = new Map()
export function sessionIdsFor(conversationSignal) {
  const key = String(conversationSignal || 'default')
  let ids = sessionCache.get(key)
  if (!ids) {
    const ses = `ses_${invertedTimestampHex()}${randomBase62()}`
    ids = {
      session: ses,
      project: `proj_${invertedTimestampHex()}${randomBase62()}`,
      request: `req_${invertedTimestampHex()}${randomBase62()}`,
    }
    sessionCache.set(key, ids)
    // 上限 1024 条会话记忆，防内存增长
    if (sessionCache.size > 1024) {
      sessionCache.delete(sessionCache.keys().next().value)
    }
  }
  return ids
}

/** 闸门工具：bash + read（必带，否则 FreeTierError 403）。 */
function gateTool(name) {
  return {
    type: 'function',
    function: {
      name,
      description: 'Reserved for the host runtime; do not call it.',
      parameters: { type: 'object', properties: {} },
    },
  }
}

export function providerInfo() {
  return { id, name: 'OpenCode Zen (Free)' }
}

export function defaults() {
  return {
    apiBase: ZEN_API_BASE,
    models: ZEN_FREE_MODELS.map((m) => m.id),
  }
}

export function authorizeUrl() {
  // 匿名通道，无需登录
  return null
}

export async function listModels() {
  return ZEN_FREE_MODELS
}

export async function usage() {
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  // 匿名通道无凭据要求；blob 可以是空
  // Never derive upstream affinity from prompt content (collides across users
  // and retains user text in module state). Reuse only an explicit host ID;
  // without one, keep affinity local to this request.
  const conversationSignal = options.sessionId || options.session_id || options.conversationId || `request_${randomBase62()}`
  const ids = sessionIdsFor(conversationSignal)

  /** @type {Record<string, any>} */
  const body = {
    model: options.model || 'big-pickle',
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }

  // Preserve the host's real tool schemas. Only fill missing gate names; never
  // replace a real bash/read tool with an unusable placeholder.
  const tools = openaiTools(options) || []
  const names = new Set(tools.map((tool) => tool.function.name))
  const missingGates = ['bash', 'read'].filter((name) => !names.has(name))
  body.tools = [...tools, ...missingGates.map(gateTool)]
  // With no host tools this is plain chat, not a fake bash/read agent.
  if (!tools.length) body.tool_choice = 'none'

  const base = ((config && config.apiBase) || ZEN_API_BASE).replace(/\/+$/, '')
  const url = `${base}/chat/completions`

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': 'Bearer public',
      'Content-Type': 'application/json',
      'User-Agent': ZEN_USER_AGENT,
      'x-opencode-client': 'cli',
      'x-opencode-session': ids.session,
      'x-session-affinity': ids.session,
      'x-opencode-request': ids.request,
      'x-opencode-project': ids.project,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text()
    // 429 归类为 RATE_LIMIT（可被轮换池捕获）
    throw httpError(res.status, text)
  }
  yield* openaiChatStream(res.body)
}