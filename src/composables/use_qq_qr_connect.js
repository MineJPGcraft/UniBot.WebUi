/**
 * QQ 官方机器人扫码绑定 composable
 *
 * 基于 SSE（Server-Sent Events）消费后端扫码登录流：
 *   - start_login : 打开 SSE 连接即启动登录，实时接收状态推送
 *   - poll_login  : 等待登录进入终态（带超时与断连保护）
 *   - cancel_login: 关闭 SSE 连接（后端自动取消登录流程）
 *
 * 认证通过 HttpOnly cookie 自动携带，无需手动传 token。
 */
import { ref } from 'vue'
import { t_global } from '@/i18n'
import { api_url } from '@/utils/http'

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

/** 等待扫码确认的超时时间（毫秒），防止弹窗永久卡在等待态 */
const LOGIN_TIMEOUT_MS = 120000

export function use_qq_qr_connect() {
  const creating = ref(false)
  const polling = ref(false)
  const login = ref(null)
  let event_source = null
  // 等待终态的结算入口：{ resolve }；终态只会结算一次
  let terminal_settle = null
  let timeout_timer = null

  function close_source() {
    if (event_source) {
      event_source.close()
      event_source = null
    }
  }

  function clear_timeout() {
    if (timeout_timer) {
      clearTimeout(timeout_timer)
      timeout_timer = null
    }
  }

  /** 幂等结算等待中的终态 Promise */
  function settle_terminal(data) {
    clear_timeout()
    if (!terminal_settle) return
    const { resolve } = terminal_settle
    terminal_settle = null
    polling.value = false
    resolve(data)
  }

  /** 收到终态：记录状态、结算等待、关闭 SSE 流 */
  function handle_terminal(data) {
    login.value = data
    settle_terminal(data)
    close_source()
  }

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
      const url = `${api_url('/api/connectors/qq/qr/login/stream')}?${query}`
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
          handle_terminal(data)
        }
      })

      source.onerror = () => {
        if (!first_settled) {
          first_settled = true
          creating.value = false
          reject(new Error(t_global('ui.qq_connect_stream_failed')))
          close_source()
          return
        }
        // 流建立后断开：EventSource 默认会自动重连并重新发起新的登录流程，
        // 这里主动关闭并以失败终态收尾，避免等待 Promise 永久挂起
        handle_terminal({
          state: QR_LOGIN_STATE.FAILED,
          error: t_global('ui.qq_connect_stream_interrupted'),
        })
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
      terminal_settle = { resolve }
      // 超时保护：SSE 静默或用户长时间未扫码时结束等待
      timeout_timer = setTimeout(() => {
        settle_terminal({
          state: QR_LOGIN_STATE.FAILED,
          error: t_global('ui.qq_connect_wait_timeout'),
        })
      }, LOGIN_TIMEOUT_MS)
    })
  }

  /**
   * 取消当前扫码登录（关闭 SSE 连接，后端自动取消）。
   */
  function cancel_login() {
    close_source()
    settle_terminal({ state: QR_LOGIN_STATE.CANCELLED, error: t_global('ui.qq_connect_cancelled') })
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
