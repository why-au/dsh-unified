// dsh-unified zen 冒烟测试：真实调用 OpenCode Zen 匿名通道
import { getVendor } from '../lib/vendors/index.js'

const zen = getVendor('zen')
const model = zen.defaults().models[0]

console.log(`测试模型: ${model} @ ${zen.defaults().apiBase}`)

const opts = {
  model,
  messages: [{ role: 'user', content: '回复 OK 两个字母即可' }],
  maxTokens: 64,
  temperature: 0,
}

let text = ''
let reasoning = ''
let usage = null
try {
  for await (const chunk of zen.streamOnce({ blob: {}, options: opts, fetchImpl: fetch, headers: {}, config: {}, signal: null })) {
    if (chunk.type === 'text-delta' && chunk.text) text += chunk.text
    if (chunk.type === 'reasoning-delta' && chunk.text) reasoning += chunk.text
    if (chunk.type === 'usage') usage = chunk.usage
  }
  const ok = text.trim().length > 0
  console.log(`✓ 文本回复 (${text.length} 字): ${JSON.stringify(text.slice(0, 100))}`)
  if (reasoning) console.log(`✓ 推理 (${reasoning.length} 字)`)
  if (usage) console.log(`✓ tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} cached=${usage.prompt_tokens_details?.cached_tokens}`)
  console.log(ok ? '✅ Zen 匿名通道端到端通过！' : '⚠️ 无文本（但连接/流式/闸门全通过）')
} catch (e) {
  console.log(`✗ 失败: ${e.message}`)
  console.log('  code:', e.code || e.status || '?')
  process.exit(1)
}
