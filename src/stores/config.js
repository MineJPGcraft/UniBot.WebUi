/**
 * 配置 Store：Config.toml 配置值、Schema 与 .env 环境变量
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { http } from '@/utils/http'
import { get_nested, set_nested } from '@/utils/format'

export const useConfigStore = defineStore('config', () => {
  const config_data = ref(null)
  const schema = ref(null)
  const draft = ref(null) // 编辑中的副本
  const loading = ref(false)
  const saving = ref(false)

  // .env 环境变量
  const env_values = ref({})
  const env_schema = ref([])
  const env_groups = ref([])
  const env_draft = ref({})
  const env_loading = ref(false)
  const env_saving = ref(false)

  // 原始文件编辑（Config.toml / .env 源码）
  const raw_config = ref('')
  const raw_env = ref('')
  const raw_config_original = ref('')
  const raw_env_original = ref('')
  const raw_loading = ref(false)
  const raw_saving = ref(false)

  /** 草稿相对原配置的变更项：[{ key, label, old_value, new_value }] */
  const changes = computed(() => {
    if (!config_data.value || !draft.value || !schema.value) return []
    const result = []
    for (const field of schema.value.fields) {
      const old_value = get_nested(config_data.value, field.key)
      const new_value = get_nested(draft.value, field.key)
      if (JSON.stringify(old_value) !== JSON.stringify(new_value)) {
        result.push({ key: field.key, label: field.label, old_value, new_value })
      }
    }
    return result
  })

  const has_changes = computed(() => changes.value.length > 0)

  /** env 草稿变更项 */
  const env_changes = computed(() => {
    const result = []
    for (const field of env_schema.value) {
      const old_value = env_values.value[field.key]
      const new_value = env_draft.value[field.key]
      if (
        JSON.stringify(old_value ?? field.default) !== JSON.stringify(new_value ?? field.default)
      ) {
        result.push({ key: field.key, label: field.label, old_value, new_value })
      }
    }
    return result
  })

  const has_env_changes = computed(() => env_changes.value.length > 0)

  /** 原始文件是否有未保存的改动 */
  const has_raw_changes = computed(
    () =>
      raw_config.value !== raw_config_original.value || raw_env.value !== raw_env_original.value,
  )

  async function fetch_all() {
    loading.value = true
    try {
      const [data, schema_data] = await Promise.all([
        http.get('/api/config'),
        http.get('/api/config/schema'),
      ])
      config_data.value = data
      schema.value = schema_data
      draft.value = JSON.parse(JSON.stringify(data))
    } finally {
      loading.value = false
    }
  }

  async function fetch_env() {
    env_loading.value = true
    try {
      const data = await http.get('/api/config/env')
      env_values.value = data.values || {}
      env_schema.value = data.schema || []
      env_groups.value = data.groups || []
      env_draft.value = JSON.parse(JSON.stringify(data.values || {}))
    } finally {
      env_loading.value = false
    }
  }

  function update_field(key, value) {
    draft.value = set_nested(draft.value, key, value)
  }

  function update_env_field(key, value) {
    env_draft.value = { ...env_draft.value, [key]: value }
  }

  function reset_draft() {
    if (config_data.value) {
      draft.value = JSON.parse(JSON.stringify(config_data.value))
    }
  }

  function reset_env_draft() {
    env_draft.value = JSON.parse(JSON.stringify(env_values.value))
  }

  /** 仅提交变更字段（PATCH 深合并） */
  async function save_changes() {
    if (!has_changes.value) return
    saving.value = true
    try {
      const patch = {}
      for (const change of changes.value) {
        const keys = change.key.split('.')
        let current = patch
        for (let index = 0; index < keys.length - 1; index += 1) {
          current[keys[index]] = current[keys[index]] || {}
          current = current[keys[index]]
        }
        current[keys[keys.length - 1]] = change.new_value
      }
      await http.patch('/api/config', patch)
      await fetch_all()
    } finally {
      saving.value = false
    }
  }

  /** 保存 .env 变更 */
  async function save_env_changes() {
    if (!has_env_changes.value) return
    env_saving.value = true
    try {
      const patch = {}
      for (const change of env_changes.value) {
        patch[change.key] = change.new_value
      }
      await http.patch('/api/config/env', patch)
      await fetch_env()
    } finally {
      env_saving.value = false
    }
  }

  /** 获取 Config.toml 与 .env 的原始文本内容 */
  async function fetch_raw() {
    raw_loading.value = true
    try {
      const data = await http.get('/api/config/raw')
      raw_config.value = data.config_toml || ''
      raw_env.value = data.env || ''
      raw_config_original.value = raw_config.value
      raw_env_original.value = raw_env.value
    } finally {
      raw_loading.value = false
    }
  }

  /** 保存原始文件改动（仅提交有变更的文件），返回 { saved_toml, saved_env } */
  async function save_raw() {
    if (!has_raw_changes.value) return { saved_toml: false, saved_env: false }
    raw_saving.value = true
    try {
      const saved_toml = raw_config.value !== raw_config_original.value
      const saved_env = raw_env.value !== raw_env_original.value
      const patch = {}
      if (saved_toml) patch.config_toml = raw_config.value
      if (saved_env) patch.env = raw_env.value
      await http.patch('/api/config/raw', patch)
      raw_config_original.value = raw_config.value
      raw_env_original.value = raw_env.value
      return { saved_toml, saved_env }
    } finally {
      raw_saving.value = false
    }
  }

  return {
    config_data,
    schema,
    draft,
    loading,
    saving,
    changes,
    has_changes,
    fetch_all,
    update_field,
    reset_draft,
    save_changes,
    // env
    env_values,
    env_schema,
    env_groups,
    env_draft,
    env_loading,
    env_saving,
    env_changes,
    has_env_changes,
    fetch_env,
    update_env_field,
    reset_env_draft,
    save_env_changes,
    // 原始文件编辑
    raw_config,
    raw_env,
    raw_config_original,
    raw_env_original,
    raw_loading,
    raw_saving,
    has_raw_changes,
    fetch_raw,
    save_raw,
  }
})
