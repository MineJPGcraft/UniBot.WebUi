/**
 * 扩展 Store：已安装扩展、配置动态表单、渲染引擎与主题
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { http } from '@/utils/http'

export const useExtensionStore = defineStore('extension', () => {
  const installed_list = ref([])
  const loading = ref(false)

  // 扩展详情 + 配置 schema
  const detail = ref(null)
  const detail_loading = ref(false)
  const config_values = ref({})
  const config_loading = ref(false)
  const saving_config = ref(false)

  // 渲染引擎与模板
  const renderers = ref([])
  const renderer_loading = ref(false)
  const templates = ref([])
  const template_loading = ref(false)

  // 渲染插件（渲染器 + 模板）配置，供渲染设置页内联编辑
  const render_configs = ref([])
  const render_config_loading = ref(false)
  const saving_render_config = ref('')

  // 扩展市场
  const market_items = ref([])
  const market_loading = ref(false)

  // 图片模式依赖扩展（渲染引擎 + 默认模板包）的下载情况
  const image_requirements = ref(null)
  const image_requirements_loading = ref(false)

  // Extension Studio（AI 扩展开发平台）
  const studio_status = ref(null)
  const studio_loading = ref(false)
  const studio_launching = ref(false)
  const studio_stopping = ref(false)
  const studio_log = ref('')
  const studio_log_loading = ref(false)

  async function fetch_installed() {
    loading.value = true
    try {
      installed_list.value = (await http.get('/api/extensions')) || []
    } finally {
      loading.value = false
    }
  }

  async function fetch_detail(extension_id) {
    detail_loading.value = true
    try {
      detail.value = await http.get(`/api/extensions/items/${encodeURIComponent(extension_id)}`)
    } finally {
      detail_loading.value = false
    }
  }

  async function fetch_config(extension_id) {
    config_loading.value = true
    try {
      config_values.value =
        (await http.get(`/api/extensions/${encodeURIComponent(extension_id)}/config`)) || {}
    } finally {
      config_loading.value = false
    }
  }

  async function set_enabled(extension_id, enabled) {
    await http.post(
      `/api/extensions/${encodeURIComponent(extension_id)}/${enabled ? 'enable' : 'disable'}`,
      {},
    )
    await fetch_installed()
  }

  async function save_config(extension_id, values) {
    saving_config.value = true
    try {
      await http.patch(`/api/extensions/${encodeURIComponent(extension_id)}/config`, values)
      await fetch_config(extension_id)
    } finally {
      saving_config.value = false
    }
  }

  async function fetch_renderers() {
    renderer_loading.value = true
    try {
      renderers.value = (await http.get('/api/extensions/renderers')) || []
    } finally {
      renderer_loading.value = false
    }
  }

  async function switch_renderer(name) {
    await http.post('/api/extensions/renderers/switch', { name })
    await fetch_renderers()
  }

  async function fetch_templates() {
    template_loading.value = true
    try {
      templates.value = (await http.get('/api/extensions/templates')) || []
    } finally {
      template_loading.value = false
    }
  }

  async function switch_template(name) {
    await http.post('/api/extensions/templates/switch', { name })
    await fetch_templates()
  }

  async function fetch_render_configs() {
    render_config_loading.value = true
    try {
      render_configs.value = (await http.get('/api/extensions/render-configs')) || []
    } finally {
      render_config_loading.value = false
    }
  }

  async function save_render_config(extension_id, values) {
    saving_render_config.value = extension_id
    try {
      await http.patch(`/api/extensions/${encodeURIComponent(extension_id)}/config`, values)
      await fetch_render_configs()
    } finally {
      saving_render_config.value = ''
    }
  }

  async function fetch_market(force = false) {
    market_loading.value = true
    try {
      market_items.value = (await http.get('/api/extensions/market', { query: { force } })) || []
    } finally {
      market_loading.value = false
    }
  }

  async function install_market(extension_id, version = '') {
    await http.post('/api/extensions/market/install', { id: extension_id, version })
    await fetch_market()
    await fetch_installed()
  }

  async function uninstall_extension(extension_id) {
    await http.delete(`/api/extensions/${encodeURIComponent(extension_id)}`)
    await fetch_installed()
  }

  /** 获取图片模式依赖扩展（Html2Pic / Default）的下载情况 */
  async function fetch_image_requirements() {
    image_requirements_loading.value = true
    try {
      image_requirements.value = await http.get('/api/extensions/image-requirements')
      return image_requirements.value
    } finally {
      image_requirements_loading.value = false
    }
  }

  /** 获取 Extension Studio 的下载与运行状态 */
  async function fetch_studio_status() {
    studio_loading.value = true
    try {
      studio_status.value = await http.get('/api/extensions/studio')
      return studio_status.value
    } finally {
      studio_loading.value = false
    }
  }

  /** 下载（如缺失）并启动 Extension Studio，返回访问地址（含 token） */
  async function launch_studio() {
    studio_launching.value = true
    try {
      const data = await http.post('/api/extensions/studio/launch', {})
      await fetch_studio_status()
      return data?.url || ''
    } finally {
      studio_launching.value = false
    }
  }

  /** 停止 Extension Studio */
  async function stop_studio() {
    studio_stopping.value = true
    try {
      await http.post('/api/extensions/studio/stop', {})
      await fetch_studio_status()
    } finally {
      studio_stopping.value = false
    }
  }

  /** 获取 Extension Studio 进程日志 */
  async function fetch_studio_log(tail = 200) {
    studio_log_loading.value = true
    try {
      const data = await http.get('/api/extensions/studio/log', { query: { tail } })
      studio_log.value = data?.content || ''
      return studio_log.value
    } finally {
      studio_log_loading.value = false
    }
  }

  return {
    installed_list,
    loading,
    detail,
    detail_loading,
    config_values,
    config_loading,
    saving_config,
    renderers,
    renderer_loading,
    templates,
    template_loading,
    render_configs,
    render_config_loading,
    saving_render_config,
    market_items,
    market_loading,
    image_requirements,
    image_requirements_loading,
    studio_status,
    studio_loading,
    studio_launching,
    studio_stopping,
    studio_log,
    studio_log_loading,
    fetch_installed,
    fetch_detail,
    fetch_config,
    set_enabled,
    save_config,
    fetch_renderers,
    switch_renderer,
    fetch_templates,
    switch_template,
    fetch_render_configs,
    save_render_config,
    fetch_market,
    install_market,
    uninstall_extension,
    fetch_image_requirements,
    fetch_studio_status,
    launch_studio,
    stop_studio,
    fetch_studio_log,
  }
})
