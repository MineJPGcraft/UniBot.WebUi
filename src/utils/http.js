/**
 * HTTP 请求封装
 * - JWT 通过 HttpOnly cookie 自动携带（无需手动管理 token）
 * - access_token 过期（401）时自动用 refresh_token 刷新并重试
 * - 统一解析 { code, data, message } 响应格式
 */

const API_BASE = '/webui'

/** 标记 cookie key（非 HttpOnly，仅用于前端快速判断登录态） */
const AUTH_FLAG_KEY = 'unibot_authenticated'

/** 检查是否存在登录标记 cookie */
export function is_authenticated() {
  return document.cookie.split('; ').some((row) => row.startsWith(AUTH_FLAG_KEY + '='))
}

/** 业务错误：code !== 0 时抛出，携带 code 与 message */
export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

let refresh_promise = null

async function refresh_access_token() {
  // refresh_token 在 HttpOnly cookie 中，由后端自动读取
  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: '{}',
  })
  const result = await response.json()
  if (result.code !== 0) throw new ApiError(result.code, result.message || '刷新失败')
}

async function request(method, path, { body, query, auth = true } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    }
  }

  const do_fetch = async () => {
    const headers = { 'Content-Type': 'application/json' }
    // JWT 通过 HttpOnly cookie 自动携带，无需手动添加 Authorization header
    return fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  let response = await do_fetch()

  // access_token 过期：尝试刷新一次后重试（登录/刷新接口除外）
  if (response.status === 401 && auth && !path.startsWith('/api/auth/')) {
    try {
      refresh_promise = refresh_promise || refresh_access_token()
      await refresh_promise
      refresh_promise = null
      response = await do_fetch()
    } catch (error) {
      refresh_promise = null
      window.dispatchEvent(new CustomEvent('unibot:unauthorized'))
      throw error
    }
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('unibot:unauthorized'))
    throw new ApiError(401, '登录已过期')
  }

  let result
  try {
    result = await response.json()
  } catch {
    throw new ApiError(response.status, `请求失败：${response.status}`)
  }

  if (result.code !== 0) {
    throw new ApiError(result.code, result.message || '请求失败')
  }
  return result.data
}

export const http = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
}
