/**
 * 系统状态 Store：运行概览 + 定时轮询
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { http } from '@/utils/http'

export const useStatusStore = defineStore('status', () => {
  const status = ref(null)
  const loading = ref(false)
  let poll_timer = null

  async function fetch_status() {
    loading.value = true
    try {
      status.value = await http.get('/api/status')
    } finally {
      loading.value = false
    }
    return status.value
  }

  async function check_update() {
    const data = await http.post('/api/status/check-update', {})
    status.value = { ...status.value, ...data }
    return data
  }

  function start_polling(interval_ms = 10000) {
    stop_polling()
    poll_timer = setInterval(() => fetch_status().catch(() => {}), interval_ms)
  }

  function stop_polling() {
    if (poll_timer) {
      clearInterval(poll_timer)
      poll_timer = null
    }
  }

  return { status, loading, fetch_status, check_update, start_polling, stop_polling }
})
