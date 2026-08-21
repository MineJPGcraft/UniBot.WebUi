/**
 * QQ 官方机器人扫码绑定 composable
 *
 * 基于 SSE（Server-Sent Events）消费后端扫码登录流：
 *   - start_login : 打开 SSE 连接即启动登录，实时接收状态推送
 *   - cancel_login: 关闭 SSE 连接（后端自动取消登录流程）
 *
 * 认证通过 HttpOnly cookie 自动携带，无需手动传 token。
 */
import { ref } from 'vue'

/** 登录状态枚举（与后端 QrLoginState 对应） */
export const QR_LOGIN_STATE = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

/** 终态：收到此状态即结束登录流程 */
const TERMINAL_STATES = new Set([
  QR_LOGIN_STATE.COMPLETED,
  QR_LOGIN_STATE.FAILED,
  QR_LOGIN_STATE.CANCELLED,
])

const API_BASE = '/webui'

export function use_qq_qr_connect() {
  const creating = ref(false)
  const polling = ref(false)
  const login = ref(null)
  let event_source = null
  let terminal_resolve = null

  /**
   * 启动扫码登录并建立 SSE 流。
   * @param {Object} options - { source, env }
   * @returns {Promise<Object>} 首个状态对象（含 qr_image data URL）
   */
  function start_login(options = {}) {
    creating.value = true
    return new Promise((resolve, reject) => {
      const query = new URLSearchParams({
        source: options.source || '',
        env: options.env || 'production',
      })
      const url = `${API_BASE}/api/connectors/qq/qr/login/stream?${query}`
      const source = new EventSource(url, { withCredentials: true })

      let first_settled = false

      source.addEventListener('qr', (event) => {
        const data = JSON.parse(event.data)
        login.value = data
        if (!first_settled) {
          first_settled = true
          creating.value = false
          resolve(data)
        }
        if (TERMINAL_STATES.has(data.state)) {
          polling.value = false
          if (terminal_resolve) {
            terminal_resolve(data)
            terminal_resolve = null
          }
          source.close()
          event_source = null
        }
      })

      source.onerror = () => {
        if (!first_settled) {
          first_settled = true
          creating.value = false
          reject(new Error('扫码连接失败'))
        }
        if (event_source === source) {
          event_source = null
        }
      }

      event_source = source
    })
  }

  /**
   * 等待登录进入终态（SSE 流已建立，实时推送状态）。
   * @returns {Promise<Object>} 最终登录状态对象
   */
  function poll_login() {
    polling.value = true
    return new Promise((resolve) => {
      const data = login.value
      if (data && TERMINAL_STATES.has(data.state)) {
        polling.value = false
        resolve(data)
        return
      }
      terminal_resolve = (final_data) => {
        polling.value = false
        resolve(final_data)
      }
    })
  }

  /**
   * 取消当前扫码登录（关闭 SSE 连接，后端自动取消）。
   */
  function cancel_login() {
    if (event_source) {
      event_source.close()
      event_source = null
    }
    if (terminal_resolve) {
      terminal_resolve({ state: QR_LOGIN_STATE.CANCELLED, error: '用户取消' })
      terminal_resolve = null
    }
    polling.value = false
  }

  return {
    creating,
    polling,
    login,
    start_login,
    poll_login,
    cancel_login,
  }
}
