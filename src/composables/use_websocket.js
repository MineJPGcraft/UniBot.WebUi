/**
 * WebSocket 实时事件连接（单例）
 * - 通过 HttpOnly cookie 自动携带 access_token 认证
 * - 30 秒心跳，断线自动重连
 * - 支持按事件类型订阅/取消订阅，事件通过回调分发
 */
import { ref } from 'vue'
import { is_authenticated } from '@/utils/http'

const connection_state = ref('disconnected') // disconnected | connecting | connected
const event_listeners = new Map() // event_type -> Set<callback>
const subscribed_events = new Set()

let socket = null
let heartbeat_timer = null
let reconnect_timer = null
let reconnect_delay = 1000
let manual_close = false

function build_url() {
  // 开发模式下直连后端（Vite 不代理 WebSocket），生产模式走同源
  // access_token 通过 HttpOnly cookie 自动随 WebSocket 握手发送
  const is_dev = import.meta.env.DEV
  const host = is_dev ? `${window.location.hostname}:8000` : window.location.host
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${host}/webui/ws`
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function start_heartbeat() {
  stop_heartbeat()
  heartbeat_timer = setInterval(() => send({ type: 'ping' }), 30000)
}

function stop_heartbeat() {
  if (heartbeat_timer) {
    clearInterval(heartbeat_timer)
    heartbeat_timer = null
  }
}

function schedule_reconnect() {
  if (manual_close || reconnect_timer) return
  reconnect_timer = setTimeout(() => {
    reconnect_timer = null
    connect()
  }, reconnect_delay)
  reconnect_delay = Math.min(reconnect_delay * 2, 15000)
}

function connect() {
  if (!is_authenticated()) return
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  )
    return

  manual_close = false
  connection_state.value = 'connecting'
  socket = new WebSocket(build_url())

  socket.onopen = () => {
    connection_state.value = 'connected'
    reconnect_delay = 1000
    start_heartbeat()
    // 重新订阅之前订阅的事件
    if (subscribed_events.size > 0) {
      send({ type: 'subscribe', events: [...subscribed_events] })
    }
  }

  socket.onmessage = (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    const listeners = event_listeners.get(message.type)
    if (listeners) {
      for (const callback of listeners) callback(message.data, message)
    }
  }

  socket.onclose = () => {
    connection_state.value = 'disconnected'
    stop_heartbeat()
    schedule_reconnect()
  }

  socket.onerror = () => {
    socket?.close()
  }
}

function disconnect() {
  manual_close = true
  stop_heartbeat()
  if (reconnect_timer) {
    clearTimeout(reconnect_timer)
    reconnect_timer = null
  }
  if (socket) {
    socket.close()
    socket = null
  }
  connection_state.value = 'disconnected'
}

/** 订阅事件，返回取消订阅函数 */
function on_event(event_type, callback, { subscribe = true } = {}) {
  if (!event_listeners.has(event_type)) {
    event_listeners.set(event_type, new Set())
  }
  event_listeners.get(event_type).add(callback)

  // subscribe=false 表示仅监听该类型消息，不向服务端注册订阅
  // （如 log_history 是订阅 log 后由服务端补发的缓存消息）
  if (subscribe && !subscribed_events.has(event_type)) {
    subscribed_events.add(event_type)
    send({ type: 'subscribe', events: [event_type] })
  }

  return () => off_event(event_type, callback)
}

function off_event(event_type, callback) {
  const listeners = event_listeners.get(event_type)
  if (!listeners) return
  listeners.delete(callback)
  if (listeners.size === 0) {
    event_listeners.delete(event_type)
    // 仅当该事件确实订阅过时才向服务端取消订阅
    if (subscribed_events.delete(event_type)) {
      send({ type: 'unsubscribe', events: [event_type] })
    }
  }
}

export function use_websocket() {
  return {
    connection_state,
    connect,
    disconnect,
    on_event,
    off_event,
  }
}
