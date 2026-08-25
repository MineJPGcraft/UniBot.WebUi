/**
 * i18n 键交叉校验：
 * 1. missing —— 源码中使用的 t() / $t() / t_global() / *_key 字面量键在语言包中不存在
 * 2. unused  —— 语言包中定义但源码未引用的键（仅警告，动态拼接的键属正常）
 * 用法：bun run check:i18n
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MESSAGES_DIR = join(import.meta.dir, '../src/i18n/messages')
const SRC_DIR = join(import.meta.dir, '../src')

// ===== 收集语言包全量键 =====
const packs = {}
for (const file of readdirSync(MESSAGES_DIR).filter((name) => name.endsWith('.json'))) {
  const name = file.replace('.json', '')
  const flat = {}
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'object') walk(value, `${prefix}${key}.`)
      else flat[`${prefix}${key}`] = value
    }
  }
  walk(JSON.parse(readFileSync(join(MESSAGES_DIR, file), 'utf8'))['zh'] ?? {}, `${name}.`)
  packs[name] = Object.keys(flat)
}
const all_keys = new Set(Object.values(packs).flat())

// ===== 扫描源码中的静态键引用 =====
function collect_files(dir, suffixes, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect_files(full, suffixes, out)
    else if (suffixes.some((s) => entry.name.endsWith(s))) out.push(full)
  }
  return out
}

const source_files = collect_files(SRC_DIR, ['.vue', '.js', '.mjs']).filter(
  (file) => !file.includes(`${MESSAGES_DIR.split('/').pop()}`),
)
const used = new Set()
const usage_pattern = /\b(?:t|\$t|t_global)\(\s*'([^']+)'/g
const prop_key_pattern = /(?:label_key|title_key|description_key|text_key|name_key)\s*:\s*'([^']+)'/g

for (const file of source_files) {
  const text = readFileSync(file, 'utf8')
  for (const pattern of [usage_pattern, prop_key_pattern]) {
    for (const match of text.matchAll(pattern)) used.add(match[1])
  }
}

// ===== 比对 =====
let missing = 0
for (const key of [...used].sort()) {
  // 带命名空间前缀的完整键必须存在；无点号的裸键视为跨命名空间引用，按后缀匹配任一包
  const exists =
    all_keys.has(key) ||
    (!key.includes('.') && Object.values(packs).some((keys) => keys.some((k) => k.endsWith(`.${key}`))))
  if (!exists) {
    console.log(`✗ missing: ${key}`)
    missing++
  }
}

const used_suffixes = new Set([...used].map((key) => key.split('.').pop()))
const unused = []
for (const keys of Object.values(packs)) {
  for (const key of keys) {
    // 键已含命名空间前缀；后缀匹配用于容忍跨包裸键引用
    if (!used.has(key) && !used_suffixes.has(key.split('.').pop())) {
      unused.push(key)
    }
  }
}
console.log(`checked ${used.size} used keys / ${all_keys.size} defined keys`)
if (missing > 0) {
  console.log(`${missing} missing keys`)
  process.exit(1)
}
if (unused.length > 0) console.log(`⚠ unused (warning only): ${unused.join(', ')}`)
