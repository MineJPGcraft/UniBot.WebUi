<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '@/stores/config'
import { useExtensionStore } from '@/stores/extension'
import { use_toast } from '@/composables/use_toast'
import { use_restart } from '@/composables/use_restart'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import CodeEditor from '@/components/ui/CodeEditor.vue'
import JsonFormEditor from '@/components/ui/JsonFormEditor.vue'
import DiffPreviewDialog from '@/components/config/DiffPreviewDialog.vue'
import ExtensionConfigForm from '@/components/ExtensionConfigForm.vue'
import { get_nested } from '@/utils/format'

const config_store = useConfigStore()
const extension_store = useExtensionStore()
const toast = use_toast()
const { ask_restart } = use_restart()
const {
  schema,
  draft,
  loading,
  saving,
  changes,
  has_changes,
  env_schema,
  env_groups,
  env_draft,
  env_loading,
  env_saving,
  env_changes,
  has_env_changes,
  raw_config,
  raw_env,
  raw_config_original,
  raw_env_original,
  raw_loading,
  raw_saving,
  messages_toml,
  messages_original,
  messages_loading,
  messages_saving,
  has_messages_changes,
} = storeToRefs(config_store)

const { config_items, config_items_loading, saving_config_item } = storeToRefs(extension_store)

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const active_tab = ref(
  ['toml', 'env', 'messages', 'extensions'].includes(route.query.tab) ? route.query.tab : 'toml',
)
const active_group = ref('')
const active_env_group = ref('')
const active_extension_id = ref('')
/** 扩展配置是否已尝试加载（避免首帧误显示空状态） */
const extensions_loaded = ref(false)
const diff_open = ref(false)
const env_diff_open = ref(false)
const raw_editor_open = ref(false)
const raw_editor_target = ref('toml')
const raw_loaded = ref(false)
const json_errors = ref({})
const platform_item_ids = ref({})
let platform_item_sequence = 0

/** 扩展配置表单引用（操作栏外置到 tab-actions，经 ref 触发表单保存/撤销） */
const extension_form_ref = ref(null)
/** 当前扩展配置的改动字段数量（由表单 change 事件同步） */
const extension_config_changes = ref(0)

const tabs = computed(() => [
  { value: 'toml', label: 'Config.toml', icon: 'lucide:file-cog' },
  { value: 'env', label: t('config_view.tab_env'), icon: 'lucide:terminal' },
  { value: 'messages', label: t('config_view.tab_messages'), icon: 'lucide:message-square' },
  { value: 'extensions', label: t('config_view.tab_extensions'), icon: 'lucide:puzzle' },
])

const groups = computed(() => schema.value?.groups || [])

/** 当前分组对象（含 keys / gated_by 等元信息） */
const active_group_data = computed(
  () =>
    groups.value.find(
      (group) => group.id === active_group.value || group.name === active_group.value,
    ) || {
      keys: [],
    },
)

/** 当前环境变量分组对象 */
const active_env_group_data = computed(
  () =>
    env_groups.value.find(
      (group) => group.id === active_env_group.value || group.name === active_env_group.value,
    ) || {
      keys: [],
    },
)

/** 已变更字段 key 集合（Set 查找，避免模板里嵌套 some 的 O(n²) 比较） */
const changed_keys = computed(() => new Set(changes.value.map((change) => change.key)))
const env_changed_keys = computed(() => new Set(env_changes.value.map((change) => change.key)))

function has_any_change(group, changed) {
  return group.keys.some((key) => changed.has(key))
}

/** 分组是否被门控开关锁定（如「图片渲染」由 image.mode 门控，关闭时锁定） */
const active_group_locked = computed(() => {
  const gate_key = active_group_data.value.gated_by
  return Boolean(gate_key) && !draft_value(gate_key)
})

/** 门控开关的显示名，用于锁定遮罩提示 */
const active_group_gate_label = computed(() => {
  const gate_key = active_group_data.value.gated_by
  if (!gate_key) return ''
  return schema.value?.fields?.find((field) => field.key === gate_key)?.label || gate_key
})

/** 有配置项的扩展列表（代码扩展 + 无代码模板包） */
const extension_items = computed(() => config_items.value)

/** 当前选中的扩展配置项 */
const active_extension_item = computed(
  () => extension_items.value.find((item) => item.id === active_extension_id.value) || null,
)

/** 扩展类型显示名（复用扩展管理的语言键） */
const extension_type_labels = computed(() => ({
  api: t('extensions.type_api'),
  command: t('extensions.type_command'),
  renderer: t('extensions.type_renderer'),
  template: t('extensions.type_template'),
  resources: t('extensions.type_resources'),
}))

/** 扩展状态显示名（复用扩展管理的语言键） */
const extension_state_labels = computed(() => ({
  loaded: t('extensions.state_loaded'),
  enabled: t('extensions.state_enabled'),
  discovered: t('extensions.state_discovered'),
  validated: t('extensions.state_validated'),
  failed: t('extensions.state_failed'),
  disabled: t('extensions.state_disabled'),
  blocked: t('extensions.state_blocked'),
}))

const extension_state_variants = {
  loaded: 'success',
  enabled: 'success',
  discovered: 'neutral',
  validated: 'neutral',
  failed: 'danger',
  disabled: 'neutral',
  blocked: 'warning',
}

/** 选中首个扩展（优先 URL query 指定的 extension，无效则回退第一项） */
function select_default_extension() {
  const query_extension = route.query.extension
  const matched =
    typeof query_extension === 'string' &&
    extension_items.value.some((item) => item.id === query_extension)
  active_extension_id.value = matched ? query_extension : extension_items.value[0].id
}

async function ensure_extensions() {
  if (extension_items.value.length > 0) {
    extensions_loaded.value = true
    if (!active_extension_item.value) select_default_extension()
    return
  }
  try {
    await extension_store.fetch_config_items()
    if (extension_items.value.length > 0) select_default_extension()
  } catch (error) {
    toast.error(error.message || t('config_view.toast_load_extensions_failed'))
  } finally {
    extensions_loaded.value = true
  }
}

async function save_extension_item(item, values) {
  try {
    await extension_store.save_config_item(item.id, values)
    toast.success(t('extensions.config_save_success', { name: item.name }))
    // store 刷新后 values 已是新值，等一次渲染再重建草稿清除改动计数
    await nextTick()
    extension_form_ref.value?.reset_draft()
  } catch (error) {
    toast.error(error.message || t('extensions.config_save_failed'))
  }
}

onMounted(async () => {
  try {
    await config_store.fetch_all()
    if (groups.value.length > 0) active_group.value = groups.value[0].id
  } catch (error) {
    toast.error(error.message || t('config_view.toast_fetch_failed'))
  }
  try {
    await config_store.fetch_env()
    // 优先使用 URL query 中的 key / group 定位 group；否则取第一项
    const query_key = route.query.key
    const query_group = route.query.group
    let target_group = ''
    if (typeof query_group === 'string') {
      // 深链携带分组 id（历史链接可能传旧版中文分组名，同样兼容匹配）
      target_group = query_group
    } else if (typeof query_key === 'string') {
      const matched = env_groups.value.find((g) => g.keys.includes(query_key))
      if (matched) target_group = matched.id
    }
    const group_matches = (group) => group.id === target_group || group.name === target_group
    if (target_group && env_groups.value.some(group_matches)) {
      active_env_group.value = target_group
    } else if (env_groups.value.length > 0) {
      active_env_group.value = env_groups.value[0].id
    }
  } catch {
    // 环境变量加载失败不阻塞页面
  }
  if (active_tab.value === 'messages') ensure_messages()
  if (active_tab.value === 'extensions') ensure_extensions()
})

// 切换 tab / group 时同步到 URL query，便于分享与刷新保持
watch(active_tab, (val) => {
  sync_query({ tab: val })
  if (val === 'messages') ensure_messages()
  if (val === 'extensions') ensure_extensions()
})
watch(active_env_group, (val) => {
  if (active_tab.value === 'env') sync_query({ group: val })
})
watch(active_extension_id, (val) => {
  if (active_tab.value === 'extensions') sync_query({ extension: val })
  // 切换扩展时表单会重建，先清零计数避免操作栏闪出上一项的改动数
  extension_config_changes.value = 0
})

function sync_query(patch) {
  const query = { ...route.query, ...patch }
  // 非当前 tab 的 group / extension 信息不保留
  if (patch.tab && patch.tab !== 'env') delete query.group
  if (patch.tab && patch.tab !== 'extensions') delete query.extension
  router.replace({ query })
}

function fields_of(group) {
  return (schema.value?.fields || []).filter((field) => group.keys.includes(field.key))
}

function env_fields_of(group) {
  return env_schema.value.filter((field) => group.keys.includes(field.key))
}

function draft_value(key) {
  return get_nested(draft.value, key)
}

function env_draft_value(key) {
  return env_draft.value[key]
}

function handle_update(key, value) {
  config_store.update_field(key, value)
}

function handle_env_update(key, value) {
  config_store.update_env_field(key, value)
}

// 列表编辑器（Config.toml）
function add_list_item(key) {
  const current = draft_value(key)
  handle_update(key, [...(current || []), ''])
}

function update_list_item(key, index, value) {
  const current = [...(draft_value(key) || [])]
  current[index] = value
  handle_update(key, current)
}

function remove_list_item(key, index) {
  const current = [...(draft_value(key) || [])]
  current.splice(index, 1)
  remove_item_id(key, index)
  handle_update(key, current)
}

function platform_item_key(key, index) {
  const item_ids = platform_item_ids.value[key] || []
  while (item_ids.length <= index) {
    platform_item_sequence += 1
    item_ids.push(`${key}-${platform_item_sequence}`)
  }
  platform_item_ids.value[key] = item_ids
  return item_ids[index]
}

/** 普通列表项的稳定 key（与平台列表共用同一 id 簿记，删除中间项时输入不串位） */
const list_item_key = platform_item_key

function split_platform_item(item, fallback = '') {
  const separator = String(item || '').indexOf(':')
  if (separator < 0) return { platform: fallback, target: String(item || '') }
  return { platform: item.slice(0, separator), target: item.slice(separator + 1) }
}

function add_platform_item(field) {
  const platform = field.options?.[0]?.value || ''
  handle_update(field.key, [...(draft_value(field.key) || []), `${platform}:`])
}

function remove_platform_item(key, index) {
  // remove_list_item 内部已同步清理稳定 key 簿记
  remove_list_item(key, index)
}

/** 删除列表项时同步移除其稳定 key，保持 id 簿记与列表对齐 */
function remove_item_id(key, index) {
  const item_ids = platform_item_ids.value[key] || []
  item_ids.splice(index, 1)
  platform_item_ids.value[key] = item_ids
}

function update_platform_item(field, index, property, value) {
  const current = [...(draft_value(field.key) || [])]
  const item = split_platform_item(current[index], field.options?.[0]?.value || '')
  item[property] = value
  current[index] = `${item.platform}:${item.target}`
  handle_update(field.key, current)
}

function json_value(key) {
  return JSON.stringify(env_draft_value(key) ?? [], null, 2)
}

function handle_json_update(key, value) {
  try {
    handle_env_update(key, JSON.parse(value))
    json_errors.value = { ...json_errors.value, [key]: '' }
  } catch {
    json_errors.value = { ...json_errors.value, [key]: t('config_view.toast_invalid_json') }
  }
}

// 列表编辑器（.env）
function add_env_list_item(key) {
  const current = env_draft_value(key)
  handle_env_update(key, [...(current || []), ''])
}

function update_env_list_item(key, index, value) {
  const current = [...(env_draft_value(key) || [])]
  current[index] = value
  handle_env_update(key, current)
}

function remove_env_list_item(key, index) {
  const current = [...(env_draft_value(key) || [])]
  current.splice(index, 1)
  remove_item_id(key, index)
  handle_env_update(key, current)
}

const RESTART_DEPENDENT_KEYS = ['webui.enabled', 'image.mode']

// 图片模式依赖扩展（Html2Pic / Default）自动下载引导
const image_deps_dialog_open = ref(false)
const image_deps_missing = ref([])
const image_deps_not_in_market = ref([])
const image_deps_installing = ref(false)

const image_deps_confirm_text = computed(() =>
  image_deps_missing.value.length > 0
    ? t('config_view.image_deps_confirm_install')
    : t('config_view.image_deps_confirm_ok'),
)

/** 检查图片模式依赖扩展，缺失时弹窗询问是否自动下载，返回是否弹出了对话框 */
async function prompt_image_deps() {
  try {
    const req = await extension_store.fetch_image_requirements()
    const missing_items = (req?.required || []).filter((item) => !item.installed)
    if (missing_items.length === 0) return false
    image_deps_missing.value = missing_items.filter((item) => item.in_market)
    image_deps_not_in_market.value = missing_items.filter((item) => !item.in_market)
    image_deps_dialog_open.value = true
    return true
  } catch (error) {
    toast.error(error.message || t('config_view.toast_check_image_deps_failed'))
    return false
  }
}

/** 从市场自动下载缺失的图片模式依赖扩展 */
async function install_image_deps() {
  image_deps_installing.value = true
  try {
    for (const item of image_deps_missing.value) {
      await extension_store.install_market(item.id)
    }
    image_deps_dialog_open.value = false
    toast.success(t('config_view.toast_image_deps_downloaded'))
    ask_restart(t('config_view.restart_image_deps'))
  } catch (error) {
    toast.error(error.message || t('config_view.toast_download_extension_failed'))
  } finally {
    image_deps_installing.value = false
  }
}

/** 依赖弹窗确认：无可自动下载项时仅关闭 */
async function confirm_image_deps() {
  if (image_deps_missing.value.length === 0) {
    image_deps_dialog_open.value = false
    return
  }
  await install_image_deps()
}

async function confirm_save() {
  try {
    const changed_keys = changes.value.map((change) => change.key)
    // 图片模式由关闭切到开启时，检查依赖扩展是否已下载
    const image_mode_turned_on = changes.value.some(
      (change) => change.key === 'image.mode' && change.new_value === true,
    )
    await config_store.save_changes()
    toast.success(t('config_view.toast_saved_hot_reload'))
    diff_open.value = false
    if (image_mode_turned_on) {
      const prompted = await prompt_image_deps()
      if (prompted) return // 依赖下载流程内部处理重启提示
    }
    if (changed_keys.some((key) => RESTART_DEPENDENT_KEYS.includes(key))) {
      ask_restart(t('config_view.restart_webui_image_ai'))
    }
  } catch (error) {
    toast.error(error.message || t('config_view.save_failed'))
  }
}

async function confirm_env_save() {
  try {
    await config_store.save_env_changes()
    toast.success(t('config_view.toast_env_saved_needs_restart'))
    env_diff_open.value = false
  } catch (error) {
    toast.error(error.message || t('config_view.save_failed'))
  }
}

async function confirm_raw_save() {
  try {
    const { saved_toml, saved_env } = await config_store.save_raw()
    if (raw_editor_target.value === 'env') {
      if (saved_env) {
        toast.success(t('config_view.toast_raw_env_saved'))
        ask_restart(t('config_view.restart_env_changed'))
      } else {
        toast.success(t('config_view.no_changes_detected'))
      }
    } else {
      toast.success(
        saved_toml ? t('config_view.toast_raw_toml_saved') : t('config_view.no_changes_detected'),
      )
    }
    raw_editor_open.value = false
  } catch (error) {
    toast.error(error.message || t('config_view.save_failed'))
  }
}

function reset_raw() {
  if (raw_editor_target.value === 'env') {
    raw_env.value = raw_env_original.value
  } else {
    raw_config.value = raw_config_original.value
  }
}

const current_raw_changed = computed(() =>
  raw_editor_target.value === 'env'
    ? raw_env.value !== raw_env_original.value
    : raw_config.value !== raw_config_original.value,
)

/** 消息文本行数（空文本按 0 计） */
const messages_line_count = computed(() =>
  messages_toml.value ? messages_toml.value.split('\n').length : 0,
)

/** 消息文本字符数（不含换行） */
const messages_char_count = computed(() => messages_toml.value.replace(/\n/g, '').length)

async function open_raw_editor(target) {
  raw_editor_target.value = target
  raw_editor_open.value = true
  if (!raw_loaded.value) {
    raw_loaded.value = true
    try {
      await config_store.fetch_raw()
    } catch (error) {
      raw_loaded.value = false
      toast.error(error.message || t('config_view.toast_load_raw_failed'))
    }
  }
}

const messages_loaded = ref(false)

/** 进入消息 tab 时按需加载 Messages.toml */
async function ensure_messages() {
  if (messages_loaded.value) return
  messages_loaded.value = true
  try {
    await config_store.fetch_messages()
  } catch (error) {
    messages_loaded.value = false
    toast.error(error.message || t('config_view.toast_load_messages_failed'))
  }
}

function reset_messages() {
  messages_toml.value = messages_original.value
}

async function confirm_messages_save() {
  try {
    const saved = await config_store.save_messages()
    toast.success(
      saved ? t('config_view.toast_messages_saved') : t('config_view.no_changes_detected'),
    )
  } catch (error) {
    toast.error(error.message || t('config_view.save_failed'))
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('config_view.page_title') }}</h1>
        <p class="page-desc">{{ t('config_view.page_desc') }}</p>
      </div>
    </div>

    <Tabs v-model="active_tab" :tabs="tabs">
      <!-- Config.toml 配置 -->
      <template #toml>
        <div class="tab-actions">
          <Button class="tab-action-left" variant="secondary" @click="open_raw_editor('toml')">
            <Icon icon="lucide:file-code" width="15" />
            {{ t('config_view.edit_source') }}
          </Button>
          <Button variant="ghost" :disabled="!has_changes" @click="config_store.reset_draft()">
            {{ t('config_view.revert_changes') }}
          </Button>
          <Button variant="primary" :disabled="!has_changes" @click="diff_open = true">
            <Icon icon="lucide:save" width="15" />
            {{ t('config_view.save_changes') }}
            <span v-if="has_changes" class="change-count">{{ changes.length }}</span>
          </Button>
        </div>

        <div v-if="loading && !draft" class="card">
          <div class="loading-block">
            <Spinner :size="18" /> {{ t('config_view.tab_basic_loading') }}
          </div>
        </div>

        <div v-else class="config-layout">
          <nav class="group-nav card">
            <button
              v-for="group in groups"
              :key="group.id || group.name"
              class="group-item"
              :class="{ 'group-item--active': active_group === group.id }"
              @click="active_group = group.id"
            >
              {{ group.name }}
              <span v-if="has_any_change(group, changed_keys)" class="group-dot" />
            </button>
          </nav>

          <section class="card config-panel">
            <div class="card-header">
              <h3 class="card-title">{{ active_group }}</h3>
            </div>
            <div class="field-list" :class="{ 'field-list--locked': active_group_locked }">
              <div
                v-for="field in fields_of(active_group_data)"
                :key="field.key"
                class="field-row"
                :class="{
                  'field-row--changed': changed_keys.has(field.key),
                  'field-row--gate':
                    active_group_locked && field.key === active_group_data.gated_by,
                }"
              >
                <div class="field-meta">
                  <label class="field-label">
                    {{ field.label }}
                    <span class="mono field-key">{{ field.key }}</span>
                  </label>
                  <p class="field-desc">{{ field.description }}</p>
                </div>

                <div class="field-control">
                  <Switch
                    v-if="field.type === 'boolean'"
                    :model-value="Boolean(draft_value(field.key))"
                    @update:model-value="(value) => handle_update(field.key, value)"
                  />
                  <Input
                    v-else-if="field.type === 'secret'"
                    type="password"
                    :model-value="draft_value(field.key) ?? ''"
                    :placeholder="t('config_view.leave_empty_hint')"
                    @update:model-value="(value) => handle_update(field.key, value)"
                  />
                  <Input
                    v-else-if="field.type === 'number'"
                    type="number"
                    :model-value="draft_value(field.key) ?? 0"
                    @update:model-value="(value) => handle_update(field.key, Number(value))"
                  />
                  <Textarea
                    v-else-if="field.type === 'text'"
                    :model-value="draft_value(field.key) ?? ''"
                    @update:model-value="(value) => handle_update(field.key, value)"
                  />
                  <div v-else-if="field.type === 'list'" class="list-editor">
                    <div
                      v-for="(item, index) in draft_value(field.key) || []"
                      :key="list_item_key(field.key, index)"
                      class="list-item"
                    >
                      <Input
                        :model-value="item"
                        @update:model-value="(value) => update_list_item(field.key, index, value)"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon-only
                        @click="remove_list_item(field.key, index)"
                      >
                        <Icon icon="lucide:x" width="14" />
                      </Button>
                    </div>
                    <Button variant="secondary" size="sm" @click="add_list_item(field.key)">
                      <Icon icon="lucide:plus" width="13" />
                      {{ t('config_view.add_item') }}
                    </Button>
                  </div>
                  <div v-else-if="field.type === 'platform_list'" class="list-editor">
                    <div
                      v-for="(item, index) in draft_value(field.key) || []"
                      :key="platform_item_key(field.key, index)"
                      class="platform-list-item"
                    >
                      <Select
                        :model-value="split_platform_item(item, field.options?.[0]?.value).platform"
                        :options="field.options || []"
                        @update:model-value="
                          (value) => update_platform_item(field, index, 'platform', value)
                        "
                      />
                      <Input
                        :model-value="split_platform_item(item).target"
                        :placeholder="t('config_view.tab_basic_platform_target_placeholder')"
                        @update:model-value="
                          (value) => update_platform_item(field, index, 'target', value)
                        "
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon-only
                        @click="remove_platform_item(field.key, index)"
                      >
                        <Icon icon="lucide:x" width="14" />
                      </Button>
                    </div>
                    <Button variant="secondary" size="sm" @click="add_platform_item(field)">
                      <Icon icon="lucide:plus" width="13" />
                      {{ t('config_view.tab_basic_platform_add_group') }}
                    </Button>
                  </div>
                  <Input
                    v-else
                    :model-value="draft_value(field.key) ?? ''"
                    @update:model-value="(value) => handle_update(field.key, value)"
                  />
                </div>
              </div>
              <div v-if="active_group_locked" class="field-lock-overlay" role="presentation">
                <Icon icon="lucide:lock" width="18" />
                <p class="field-lock-text">
                  {{ t('config_view.tab_basic_lock_hint', { name: active_group_gate_label }) }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </template>

      <!-- 环境变量 -->
      <template #env>
        <div class="tab-actions">
          <Button class="tab-action-left" variant="secondary" @click="open_raw_editor('env')">
            <Icon icon="lucide:file-code" width="15" />
            {{ t('config_view.edit_source') }}
          </Button>
          <Button
            variant="ghost"
            :disabled="!has_env_changes"
            @click="config_store.reset_env_draft()"
          >
            {{ t('config_view.revert_changes') }}
          </Button>
          <Button variant="primary" :disabled="!has_env_changes" @click="env_diff_open = true">
            <Icon icon="lucide:save" width="15" />
            {{ t('config_view.save_changes') }}
            <span v-if="has_env_changes" class="change-count">{{ env_changes.length }}</span>
          </Button>
        </div>

        <div v-if="env_loading" class="card">
          <div class="loading-block">
            <Spinner :size="18" /> {{ t('config_view.tab_env_loading') }}
          </div>
        </div>

        <div v-else class="config-layout">
          <nav class="group-nav card">
            <button
              v-for="group in env_groups"
              :key="group.id || group.name"
              class="group-item"
              :class="{ 'group-item--active': active_env_group === group.id }"
              @click="active_env_group = group.id"
            >
              {{ group.name }}
              <span v-if="has_any_change(group, env_changed_keys)" class="group-dot" />
            </button>
          </nav>

          <section class="card config-panel">
            <div class="card-header">
              <h3 class="card-title">{{ active_env_group }}</h3>
              <span class="text-xs text-muted">{{ t('config_view.tab_env_restart_hint') }}</span>
            </div>
            <div class="field-list">
              <div
                v-for="field in env_fields_of(active_env_group_data)"
                :key="field.key"
                class="field-row"
                :class="{ 'field-row--changed': env_changed_keys.has(field.key) }"
              >
                <div class="field-meta">
                  <label class="field-label">
                    {{ field.label }}
                    <span class="mono field-key">{{ field.key }}</span>
                  </label>
                  <p class="field-desc">{{ field.description }}</p>
                </div>

                <div class="field-control">
                  <Switch
                    v-if="field.type === 'boolean'"
                    :model-value="Boolean(env_draft_value(field.key))"
                    @update:model-value="(value) => handle_env_update(field.key, value)"
                  />
                  <Input
                    v-else-if="field.type === 'secret'"
                    type="password"
                    :model-value="env_draft_value(field.key) ?? ''"
                    :placeholder="t('config_view.leave_empty_hint')"
                    @update:model-value="(value) => handle_env_update(field.key, value)"
                  />
                  <Input
                    v-else-if="field.type === 'number'"
                    type="number"
                    :model-value="env_draft_value(field.key) ?? 0"
                    @update:model-value="(value) => handle_env_update(field.key, Number(value))"
                  />
                  <div v-else-if="field.type === 'list'" class="list-editor">
                    <div
                      v-for="(item, index) in env_draft_value(field.key) || []"
                      :key="list_item_key(field.key, index)"
                      class="list-item"
                    >
                      <Input
                        :model-value="item"
                        @update:model-value="
                          (value) => update_env_list_item(field.key, index, value)
                        "
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon-only
                        @click="remove_env_list_item(field.key, index)"
                      >
                        <Icon icon="lucide:x" width="14" />
                      </Button>
                    </div>
                    <Button variant="secondary" size="sm" @click="add_env_list_item(field.key)">
                      <Icon icon="lucide:plus" width="13" />
                      {{ t('config_view.add_item') }}
                    </Button>
                  </div>
                  <div v-else-if="field.type === 'json'" class="json-editor">
                    <JsonFormEditor
                      v-if="field.form"
                      :form="field.form"
                      :model-value="env_draft_value(field.key)"
                      @update:model-value="(value) => handle_env_update(field.key, value)"
                    />
                    <template v-else>
                      <Textarea
                        :model-value="json_value(field.key)"
                        :rows="6"
                        @update:model-value="(value) => handle_json_update(field.key, value)"
                      />
                      <span v-if="json_errors[field.key]" class="json-error">{{
                        json_errors[field.key]
                      }}</span>
                    </template>
                  </div>
                  <Input
                    v-else
                    :model-value="env_draft_value(field.key) ?? ''"
                    @update:model-value="(value) => handle_env_update(field.key, value)"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>

      <!-- 消息文本 -->
      <template #messages>
        <div class="tab-actions">
          <Button variant="ghost" :disabled="!has_messages_changes" @click="reset_messages">
            {{ t('config_view.revert_changes') }}
          </Button>
          <Button
            variant="primary"
            :disabled="!has_messages_changes"
            @click="confirm_messages_save"
          >
            <Icon icon="lucide:save" width="15" />
            {{ t('config_view.save_changes') }}
          </Button>
        </div>

        <div v-if="messages_loading" class="card">
          <div class="loading-block">
            <Spinner :size="18" /> {{ t('config_view.tab_messages_loading') }}
          </div>
        </div>

        <section v-else class="card message-editor">
          <div class="card-header message-editor-header">
            <div class="message-editor-heading">
              <div class="message-editor-title">
                <span class="message-editor-badge">
                  <Icon icon="lucide:message-square-text" width="16" />
                </span>
                <div>
                  <h3 class="card-title">Messages.toml</h3>
                  <p class="message-editor-sub">
                    {{ t('config_view.tab_messages_sub_prefix') }}
                    <code class="mono message-code">{{
                      t('config_view.tab_messages_placeholder_example')
                    }}</code>
                    {{ t('config_view.tab_messages_sub_suffix') }}
                  </p>
                </div>
              </div>
            </div>
            <span v-if="!messages_loading" class="message-editor-meta">
              {{
                t('config_view.tab_messages_stats', {
                  line_count: messages_line_count,
                  char_count: messages_char_count,
                })
              }}
            </span>
          </div>
          <div class="message-editor-body">
            <div v-if="messages_toml === ''" class="raw-loading">
              <Spinner />
              <span>{{ t('config_view.tab_messages_loading_body') }}</span>
            </div>
            <CodeEditor
              v-else
              v-model="messages_toml"
              language="toml"
              class="raw-code-editor raw-code-editor--messages"
            />
          </div>
          <div class="message-editor-footer">
            <div class="message-editor-hint">
              <Icon icon="lucide:info" width="13" />
              {{ t('config_view.tab_messages_hint_prefix') }}
              <code class="mono message-code">{name}</code>
              {{ t('config_view.tab_messages_hint_suffix') }}
            </div>
            <span v-if="has_messages_changes" class="raw-changed">
              <Icon icon="lucide:circle-alert" width="13" />
              {{ t('config_view.changed_tip') }}
            </span>
            <span v-else class="raw-saved-tip">
              <Icon icon="lucide:check-circle" width="13" />
              {{ t('config_view.unchanged_tip') }}
            </span>
          </div>
        </section>
      </template>

      <!-- 扩展配置 -->
      <template #extensions>
        <div class="tab-actions">
          <span class="text-xs text-muted tab-action-left">
            {{ t('config_view.tab_extensions_hint') }}
          </span>
          <Button
            variant="ghost"
            :disabled="!extension_config_changes"
            @click="extension_form_ref?.reset_draft()"
          >
            {{ t('config_view.revert_changes') }}
          </Button>
          <Button
            variant="primary"
            :disabled="!extension_config_changes"
            :loading="saving_config_item === active_extension_id"
            @click="extension_form_ref?.confirm_save()"
          >
            <Icon icon="lucide:save" width="15" />
            {{ t('config_view.save_changes') }}
            <span v-if="extension_config_changes" class="change-count">
              {{ extension_config_changes }}
            </span>
          </Button>
        </div>

        <div v-if="config_items_loading || !extensions_loaded" class="card">
          <div class="loading-block">
            <Spinner :size="18" /> {{ t('config_view.tab_extensions_loading') }}
          </div>
        </div>

        <EmptyState
          v-else-if="extension_items.length === 0"
          icon="lucide:puzzle"
          :title="t('config_view.tab_extensions_empty_title')"
          :description="t('config_view.tab_extensions_empty_description')"
        />

        <div v-else class="config-layout">
          <nav class="group-nav card">
            <button
              v-for="item in extension_items"
              :key="item.id"
              class="group-item"
              :class="{ 'group-item--active': active_extension_id === item.id }"
              @click="active_extension_id = item.id"
            >
              <span class="group-item-name">{{ item.name }}</span>
              <span
                v-if="item.id === active_extension_id && extension_config_changes"
                class="group-dot"
              />
            </button>
          </nav>

          <section v-if="active_extension_item" class="card config-panel">
            <div class="card-header extension-panel-header">
              <div class="extension-panel-title">
                <h3 class="card-title">{{ active_extension_item.name }}</h3>
                <span class="mono text-muted">{{ active_extension_item.id }}</span>
              </div>
              <div class="extension-panel-badges">
                <Badge
                  v-for="type in active_extension_item.types || []"
                  :key="type"
                  variant="accent"
                >
                  {{ extension_type_labels[type] || type }}
                </Badge>
                <Badge
                  :variant="extension_state_variants[active_extension_item.state] || 'neutral'"
                >
                  {{
                    extension_state_labels[active_extension_item.state] ||
                    active_extension_item.state
                  }}
                </Badge>
              </div>
            </div>
            <p v-if="active_extension_item.description" class="field-desc extension-panel-desc">
              {{ active_extension_item.description }}
            </p>
            <div class="extension-panel-form">
              <ExtensionConfigForm
                ref="extension_form_ref"
                :key="active_extension_item.id"
                :schema="active_extension_item.schema"
                :values="active_extension_item.values"
                :saving="saving_config_item === active_extension_item.id"
                :show-actions="false"
                @change="(count) => (extension_config_changes = count)"
                @save="(values) => save_extension_item(active_extension_item, values)"
              />
            </div>
          </section>
        </div>
      </template>
    </Tabs>

    <!-- 源码编辑弹窗：按当前 tab 编辑对应文件的原始文本 -->
    <Dialog
      v-model="raw_editor_open"
      :title="
        raw_editor_target === 'env'
          ? t('config_view.tab_raw_title_env')
          : t('config_view.tab_raw_title_toml')
      "
      :description="
        raw_editor_target === 'env'
          ? t('config_view.tab_raw_desc_env')
          : t('config_view.tab_raw_desc_toml')
      "
      :confirm-text="t('config_view.save_changes')"
      :loading="raw_saving"
      width="70vw"
      @confirm="confirm_raw_save"
    >
      <div v-if="raw_loading" class="raw-loading">
        <Spinner />
        <span>{{ t('config_view.tab_raw_loading') }}</span>
      </div>
      <template v-else>
        <div class="raw-field">
          <label class="raw-label">
            <Icon
              :icon="raw_editor_target === 'env' ? 'lucide:terminal' : 'lucide:file-cog'"
              width="14"
            />
            {{ raw_editor_target === 'env' ? '.env' : 'Config.toml' }}
          </label>
          <CodeEditor
            v-if="raw_editor_target === 'env'"
            v-model="raw_env"
            language="properties"
            class="raw-code-editor raw-code-editor--env"
          />
          <CodeEditor v-else v-model="raw_config" language="toml" class="raw-code-editor" />
        </div>
      </template>
      <div class="raw-actions">
        <span v-if="current_raw_changed" class="raw-changed">
          <Icon icon="lucide:circle-alert" width="13" />
          {{ t('config_view.changed_tip') }}
        </span>
        <span v-else class="raw-saved-tip">
          <Icon icon="lucide:check" width="13" />
          {{ t('config_view.unchanged_tip') }}
        </span>
        <div class="raw-actions-right">
          <Button
            variant="secondary"
            size="sm"
            :disabled="raw_loading || !current_raw_changed"
            @click="reset_raw"
          >
            <Icon icon="lucide:rotate-ccw" width="14" />
            {{ t('config_view.tab_raw_restore') }}
          </Button>
        </div>
      </div>
    </Dialog>

    <!-- Config.toml 保存前 diff 预览 -->
    <DiffPreviewDialog
      :open="diff_open"
      :title="t('config_view.diff_toml_title')"
      :description="t('config_view.diff_toml_desc', { count: changes.length })"
      :changes="changes"
      :loading="saving"
      @update:open="(value) => (diff_open = value)"
      @confirm="confirm_save"
    />

    <!-- .env 保存前 diff 预览 -->
    <DiffPreviewDialog
      :open="env_diff_open"
      :title="t('config_view.diff_env_title')"
      :description="t('config_view.diff_env_desc', { count: env_changes.length })"
      :changes="env_changes"
      :loading="env_saving"
      @update:open="(value) => (env_diff_open = value)"
      @confirm="confirm_env_save"
    />

    <!-- 图片模式依赖扩展自动下载引导 -->
    <Dialog
      v-model="image_deps_dialog_open"
      :title="t('config_view.image_deps_title')"
      :description="t('config_view.image_deps_desc')"
      :confirm-text="image_deps_confirm_text"
      :cancel-text="t('config_view.image_deps_cancel_later')"
      :loading="image_deps_installing"
      @confirm="confirm_image_deps"
    >
      <div class="image-deps-list">
        <div v-for="item in image_deps_missing" :key="item.id" class="image-dep-item">
          <Icon icon="lucide:download" width="15" class="text-muted" />
          <span>{{ item.name }}</span>
          <span class="mono text-muted">{{ item.id }}</span>
        </div>
        <div v-if="image_deps_not_in_market.length > 0" class="image-dep-warning">
          <Icon icon="lucide:triangle-alert" width="15" />
          <span>
            {{ t('config_view.image_deps_not_in_market_warning') }}
            <span
              v-for="item in image_deps_not_in_market"
              :key="item.id"
              class="mono image-dep-inline"
            >
              {{ t('config_view.image_deps_item_with_id', { name: item.name, id: item.id }) }}
            </span>
          </span>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.change-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.25);
  font-size: var(--text-xs);
}

.config-layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--space-5);
  align-items: start;
}

/* 分组导航 */
.group-nav {
  padding: var(--space-2);
  position: sticky;
  top: var(--space-4);
}

.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
  text-align: left;
  transition:
    background-color var(--transition),
    color var(--transition);
}

.group-item:hover {
  background: color-mix(in srgb, var(--text) 4%, transparent);
  color: var(--text);
}

.group-item--active {
  background: var(--accent-soft);
  color: var(--accent);
}

.group-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
}

.group-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 扩展配置面板头部 */
.extension-panel-header {
  align-items: flex-start;
  gap: var(--space-3);
}

.extension-panel-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.extension-panel-title .card-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extension-panel-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1);
}

.extension-panel-desc {
  padding: 0 var(--space-5);
}

.extension-panel-form {
  padding: var(--space-2) var(--space-5) var(--space-5);
}

/* 字段行 */
.field-list {
  padding: var(--space-2) var(--space-5);
  position: relative;
}

.field-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
}

.field-row:last-child {
  border-bottom: none;
}

.field-row--changed {
  background: linear-gradient(to right, var(--warning-soft), transparent 60%);
  margin: 0 calc(-1 * var(--space-5));
  padding-left: var(--space-5);
  padding-right: var(--space-5);
  border-radius: var(--radius);
}

/* 门控开关行：提升到锁定遮罩之上，保持可交互 */
.field-row--gate {
  position: relative;
  z-index: 2;
}

/* 锁定遮罩：门控开关关闭时盖住不可编辑的字段 */
.field-lock-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  backdrop-filter: blur(2px);
  border-radius: var(--radius);
  text-align: center;
}

.field-lock-text {
  font-size: var(--text-sm);
  font-weight: 500;
}

.field-meta {
  flex: 1;
  min-width: 0;
}

.field-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.field-key {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 var(--space-1);
}

.field-desc {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.field-control {
  width: 40%;
  flex: 0 0 40%;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.field-control > :not(.list-editor):not(.ui-switch) {
  width: 100%;
}

.list-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.list-item {
  display: flex;
  gap: var(--space-1);
  width: 100%;
}

.platform-list-item {
  display: grid;
  grid-template-columns: 132px 1fr auto;
  gap: var(--space-1);
  width: 100%;
}

.platform-list-item :deep(.ui-select-trigger) {
  width: 100%;
  min-width: 0;
}

.json-editor {
  width: 100%;
}

.json-error {
  display: block;
  margin-top: var(--space-1);
  color: var(--danger);
  font-size: var(--text-xs);
}

/* 图片模式依赖扩展引导 */
.image-deps-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.image-dep-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: var(--text-sm);
}

.image-dep-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--warning-soft, rgb(250 204 21 / 0.1));
  border: 1px solid var(--warning, #ca8a04);
  border-radius: var(--radius);
  color: var(--warning, #ca8a04);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.image-dep-inline {
  margin-left: var(--space-1);
}

@media (max-width: 900px) {
  .config-layout {
    grid-template-columns: 1fr;
  }

  .field-row {
    flex-direction: column;
    gap: var(--space-3);
  }

  .field-control {
    width: 100%;
  }
}

/* 标签页操作栏：编辑源代码靠左，撤销/保存靠右 */
.tab-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.tab-actions .tab-action-left {
  margin-right: auto;
}

@media (max-width: 700px) {
  .platform-list-item {
    grid-template-columns: 1fr;
  }
}

/* 源码编辑弹窗 */
.raw-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-10) 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.raw-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.raw-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.raw-code-editor {
  height: 480px;
}

.raw-code-editor--env {
  height: 360px;
}

/* 消息文本编辑器 */
.message-editor {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.message-editor-header {
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.message-editor-heading {
  display: flex;
  align-items: center;
}

.message-editor-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.message-editor-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  flex-shrink: 0;
}

.message-editor-sub {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.message-editor-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  white-space: nowrap;
}

.message-editor-body {
  padding: var(--space-4) var(--space-5) 0;
}

.message-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-5) var(--space-4);
}

.message-editor-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.raw-code-editor--messages {
  height: 460px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
}

.message-code {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text) 8%, transparent);
  font-weight: 600;
}

@media (max-width: 700px) {
  .message-editor-meta {
    display: none;
  }

  .message-editor-footer {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
  }

  .message-editor-footer .raw-changed,
  .message-editor-footer .raw-saved-tip {
    justify-content: flex-start;
  }

  .raw-code-editor--messages {
    height: 380px;
  }
}

.raw-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.raw-changed {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--warning);
}

.raw-saved-tip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.raw-actions-right {
  display: flex;
  gap: var(--space-2);
}

@media (max-width: 700px) {
  .raw-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .raw-actions-right {
    justify-content: flex-end;
  }
}
</style>
