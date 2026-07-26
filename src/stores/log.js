/**
 * 日志 Store：文件列表 + 内容分页过滤
 * 正则解析 loguru 格式：2026-07-23 13:51:27.725 | SUCCESS  | module:line - message
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { http } from '@/utils/http'

const LOG_LINE_PATTERN =
  /^(?<date>\d{4}-\d{2}-\d{2})\s+(?<time>\d{2}:\d{2}:\d{2}\.\d+)\s*\|\s*(?<level>\w+)\s*\|\s*(?<module>[^-]+?)\s*-\s*(?<message>.*)$/

function parse_line(raw) {
  const match = raw.text.match(LOG_LINE_PATTERN)
  if (match) {
    return {
      line: raw.line,
      date: match.groups.date,
      time: match.groups.time,
      level: match.groups.level,
      module: match.groups.module.trim(),
      message: match.groups.message,
    }
  }
  return { line: raw.line, date: '', time: '', level: '', module: '', message: raw.text }
}

export const useLogStore = defineStore('log', () => {
  const file_list = ref([])
  const current_file = ref('')
  const raw_lines = ref([])
  const level_filter = ref('all')
  const keyword_filter = ref('')
  const page = ref(1)
  const page_size = ref(500)
  const loading = ref(false)

  const parsed_lines = computed(() => raw_lines.value.map(parse_line))

  const filtered_lines = computed(() => {
    let items = parsed_lines.value
    if (level_filter.value && level_filter.value !== 'all') {
      items = items.filter((item) => item.level === level_filter.value)
    }
    if (keyword_filter.value) {
      items = items.filter((item) => item.message.includes(keyword_filter.value))
    }
    return items
  })

  const total = computed(() => filtered_lines.value.length)

  const log_items = computed(() => {
    const start = (page.value - 1) * page_size.value
    return filtered_lines.value.slice(start, start + page_size.value)
  })

  async function fetch_file_list() {
    file_list.value = (await http.get('/api/logs')) || []
    return file_list.value
  }

  async function fetch_content() {
    if (!current_file.value) return
    loading.value = true
    try {
      raw_lines.value =
        (await http.get(`/api/logs/${encodeURIComponent(current_file.value)}`)) || []
    } finally {
      loading.value = false
    }
  }

  function select_file(name) {
    current_file.value = name
    page.value = 1
  }

  function set_level_filter(level) {
    level_filter.value = level
    page.value = 1
  }

  function set_keyword_filter(keyword) {
    keyword_filter.value = keyword
    page.value = 1
  }

  function set_page(value) {
    page.value = value
  }

  return {
    file_list,
    current_file,
    log_items,
    total,
    page,
    page_size,
    level_filter,
    keyword_filter,
    loading,
    fetch_file_list,
    fetch_content,
    select_file,
    set_level_filter,
    set_keyword_filter,
    set_page,
  }
})
