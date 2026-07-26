/**
 * 全局重启控制
 * 复用 Sidebar 的重启逻辑，并提供「操作后询问是否重启」的能力。
 * 模块级共享状态，任意组件通过 use_restart() 触发。
 */
import { ref } from 'vue'
import { use_toast } from '@/composables/use_toast'
import { http } from '@/utils/http'

const prompt_open = ref(false)
const prompt_title = ref('')
const prompt_message = ref('')
const restarting = ref(false)

async function wait_for_restart(previous_started_at) {
  const toast = use_toast()
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 500))
    try {
      const health = await http.get('/api/status/health', { auth: false })
      if (health.started_at !== previous_started_at) {
        window.location.reload()
        return
      }
    } catch {
      // 服务重启期间健康检查暂时不可用。
    }
  }
  restarting.value = false
  toast.error('机器人重启超时，请稍后刷新页面')
}

async function restart_bot() {
  const toast = use_toast()
  restarting.value = true
  try {
    const previous_instance = await http.post('/api/status/restart', {})
    prompt_open.value = false
    toast.success('机器人正在重启')
    await wait_for_restart(previous_instance.started_at)
  } catch (error) {
    restarting.value = false
    toast.error(error.message || '重启失败')
  }
}

export function use_restart() {
  /** 弹出「是否立即重启」询问框，message 用于说明触发原因 */
  function ask_restart(
    message = '该更改需要重启机器人生效，是否立即重启？',
    title = '需要重启机器人',
  ) {
    if (restarting.value) return
    prompt_title.value = title
    prompt_message.value = message
    prompt_open.value = true
  }

  function close_prompt() {
    prompt_open.value = false
  }

  return {
    prompt_open,
    prompt_title,
    prompt_message,
    restarting,
    restart_bot,
    ask_restart,
    close_prompt,
  }
}
