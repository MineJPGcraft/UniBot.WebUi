/**
 * ANSI 彩色文本 → 安全 HTML 片段
 * 解析 loguru 输出的 ANSI 转义序列（前景色 30-37 / 90-97、背景 40-47 / 100-107、
 * 属性 1 加粗 / 2 暗淡 / 3 斜体 / 4 下划线 / 0 重置），文本内容始终先做 HTML 转义。
 */

const ANSI_COLORS = {
  30: '#3f3f46', // black
  31: '#dc2626', // red
  32: '#16a34a', // green
  33: '#ca8a04', // yellow
  34: '#2563eb', // blue
  35: '#c026d3', // magenta
  36: '#0891b2', // cyan
  37: '#18181b', // white（浅色主题下白色文字不可读，改用深色）
  90: '#71717a', // light-black
  91: '#ef4444', // light-red
  92: '#22c55e', // light-green
  93: '#eab308', // light-yellow
  94: '#60a5fa', // light-blue
  95: '#e879f9', // light-magenta
  96: '#06b6d4', // light-cyan
  97: '#18181b', // light-white
}

const ANSI_BG_COLORS = {
  40: '#3f3f46',
  41: '#dc2626',
  42: '#16a34a',
  43: '#ca8a04',
  44: '#2563eb',
  45: '#c026d3',
  46: '#0891b2',
  47: '#f4f4f5',
  100: '#71717a',
  101: '#ef4444',
  102: '#22c55e',
  103: '#eab308',
  104: '#60a5fa',
  105: '#e879f9',
  106: '#06b6d4',
  107: '#f4f4f5',
}

const ANSI_PATTERN = /\x1b\[([0-9;]*)m/g

function escape_html(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 将 ANSI 彩色文本转换为安全 HTML（文本已转义，可安全用于 v-html）。 */
export function ansi_to_html(raw) {
  if (!raw) return ''
  const escaped = escape_html(raw)
  const styles = new Set()
  let html = ''
  let index = 0
  let depth = 0
  let match
  ANSI_PATTERN.lastIndex = 0
  while ((match = ANSI_PATTERN.exec(escaped)) !== null) {
    html += escaped.slice(index, match.index)
    index = ANSI_PATTERN.lastIndex
    const codes = match[1] ? match[1].split(';').map(Number) : [0]
    for (const code of codes) {
      if (code === 0) {
        styles.clear()
      } else if (code === 1) {
        styles.add('font-weight:600')
      } else if (code === 2) {
        styles.add('opacity:0.7')
      } else if (code === 3) {
        styles.add('font-style:italic')
      } else if (code === 4) {
        styles.add('text-decoration:underline')
      } else if (code >= 30 && code <= 37) {
        styles.add(`color:${ANSI_COLORS[code]}`)
      } else if (code >= 90 && code <= 97) {
        styles.add(`color:${ANSI_COLORS[code]}`)
      } else if (code >= 40 && code <= 47) {
        styles.add(`background:${ANSI_BG_COLORS[code]}`)
      } else if (code >= 100 && code <= 107) {
        styles.add(`background:${ANSI_BG_COLORS[code]}`)
      }
    }
    if (styles.size > 0) {
      html += `<span style="${[...styles].join(';')}">`
      depth += 1
    } else if (depth > 0) {
      html += '</span>'.repeat(depth)
      depth = 0
    }
  }
  html += escaped.slice(index)
  if (depth > 0) html += '</span>'.repeat(depth)
  return html
}
