/**
 * 适配器 Store：适配器目录、注册状态与安装管理
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { http } from '@/utils/http'

export const useAdapterStore = defineStore('adapter', () => {
  const registered_list = ref([])
  const catalog = ref([])
  const loading = ref(false)

  async function fetch_all() {
    loading.value = true
    try {
      const data = await http.get('/api/config/nonebot')
      registered_list.value = data.adapters || []
      catalog.value = data.adapter_catalog || []
    } finally {
      loading.value = false
    }
  }

  async function install(adapter_id) {
    const result = await http.post('/api/config/nonebot/adapters/install', { adapter_id })
    await fetch_all()
    return result
  }

  async function remove(name, module_name, remove_dependency = false) {
    await http.delete('/api/config/nonebot/adapters', {
      body: { name, module_name, remove_dependency },
    })
    await fetch_all()
  }

  return {
    registered_list,
    catalog,
    loading,
    fetch_all,
    install,
    remove,
  }
})
