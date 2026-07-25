/**
 * 插件 Store：已安装插件与插件市场
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { http } from '@/utils/http'

export const usePluginStore = defineStore('plugin', () => {
  const installed_list = ref([])
  const registered_plugin_modules = ref([])
  const market_items = ref([])
  const market_total = ref(0)
  const loading = ref(false)
  const market_loading = ref(false)

  async function fetch_installed() {
    loading.value = true
    try {
      installed_list.value = (await http.get('/api/plugins')) || []
    } finally {
      loading.value = false
    }
  }

  async function set_enabled(name, enabled) {
    await http.post(
      `/api/plugins/${encodeURIComponent(name)}/${enabled ? 'enable' : 'disable'}`,
      {},
    )
    await fetch_installed()
  }

  async function remove_plugin(module_name) {
    await http.delete('/api/config/nonebot/plugins', {
      body: { name: module_name, module_name },
    })
    await Promise.all([fetch_installed(), fetch_registered_plugins()])
  }

  async function fetch_registered_plugins() {
    const data = await http.get('/api/config/nonebot')
    registered_plugin_modules.value = (data.plugins || []).map((plugin) => plugin.module_name)
  }

  async function fetch_market({ page = 1, page_size = 20, keyword = '', category = '' } = {}) {
    market_loading.value = true
    try {
      const data = await http.get('/api/plugins/market', {
        query: { page, page_size, keyword, category },
      })
      market_items.value = data.items
      market_total.value = data.total
    } finally {
      market_loading.value = false
    }
  }

  async function install_plugin(name, version) {
    return await http.post('/api/plugins/market/install', { name, version })
  }

  return {
    installed_list,
    registered_plugin_modules,
    market_items,
    market_total,
    loading,
    market_loading,
    fetch_installed,
    set_enabled,
    remove_plugin,
    fetch_registered_plugins,
    fetch_market,
    install_plugin,
  }
})
