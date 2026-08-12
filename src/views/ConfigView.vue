<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
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
import CodeEditor from '@/components/ui/CodeEditor.vue'
import JsonFormEditor from '@/components/ui/JsonFormEditor.vue'
import { get_nested } from '@/utils/format'

const config_store = useConfigStore()
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

const route = useRoute()
const router = useRouter()

const active_tab = ref(
  ['toml', 'env', 'messages'].includes(route.query.tab) ? route.query.tab : 'toml',
)
const active_group = ref('')
const active_env_group = ref('')
const diff_open = ref(false)
const env_diff_open = ref(false)
const raw_editor_open = ref(false)
const raw_editor_target = ref('toml')
const raw_loaded = ref(false)
const json_errors = ref({})
const platform_item_ids = ref({})
let platform_item_sequence = 0

const tabs = [
  { value: 'toml', label: 'Config.toml', icon: 'lucide:file-cog' },
  { value: 'env', label: '环境变量', icon: 'lucide:terminal' },
  { value: 'messages', label: '消息文本', icon: 'lucide:message-square' },
]

const groups = computed(() => schema.value?.groups || [])

/** 当前分组对象（含 keys / gated_by 等元信息） */
const active_group_data = computed(
  () => groups.value.find((group) => group.name === active_group.value) || { keys: [] },
)

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

onMounted(async () => {
  try {
    await config_store.fetch_all()
    if (groups.value.length > 0) active_group.value = groups.value[0].name
  } catch (error) {
    toast.error(error.message || '获取配置失败')
  }
  try {
    await config_store.fetch_env()
    // 优先使用 URL query 中的 key / group 定位 group；否则取第一项
    const query_key = route.query.key
    const query_group = route.query.group
    let target_group = ''
    if (typeof query_group === 'string') {
      target_group = query_group
    } else if (typeof query_key === 'string') {
      const matched = env_groups.value.find((g) => g.keys.includes(query_key))
      if (matched) target_group = matched.name
    }
    if (target_group && env_groups.value.some((g) => g.name === target_group)) {
      active_env_group.value = target_group
    } else if (env_groups.value.length > 0) {
      active_env_group.value = env_groups.value[0].name
    }
  } catch {
    // 环境变量加载失败不阻塞页面
  }
  if (active_tab.value === 'messages') ensure_messages()
})

// 切换 tab / group 时同步到 URL query，便于分享与刷新保持
watch(active_tab, (val) => {
  sync_query({ tab: val })
  if (val === 'messages') ensure_messages()
})
watch(active_env_group, (val) => {
  if (active_tab.value === 'env') sync_query({ group: val })
})

function sync_query(patch) {
  const query = { ...route.query, ...patch }
  // 非当前 tab 的 group 信息不保留
  if (patch.tab && patch.tab !== 'env') delete query.group
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
  const item_ids = platform_item_ids.value[key] || []
  item_ids.splice(index, 1)
  platform_item_ids.value[key] = item_ids
  remove_list_item(key, index)
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
    json_errors.value = { ...json_errors.value, [key]: '请输入有效的 JSON' }
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
  handle_env_update(key, current)
}

function display_value(value) {
  if (value === undefined || value === null || value === '') return '（空）'
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '（空列表）'
  return String(value)
}

const RESTART_DEPENDENT_KEYS = ['webui.enabled', 'image.mode']

async function confirm_save() {
  try {
    const changed_keys = changes.value.map((change) => change.key)
    await config_store.save_changes()
    toast.success('配置已保存并热更新')
    diff_open.value = false
    if (changed_keys.some((key) => RESTART_DEPENDENT_KEYS.includes(key))) {
      ask_restart('WebUI / 图片渲染 / AI 的启停需要重启机器人生效，是否立即重启？')
    }
  } catch (error) {
    toast.error(error.message || '保存失败')
  }
}

async function confirm_env_save() {
  try {
    await config_store.save_env_changes()
    toast.success('环境变量已保存，重启后生效')
    env_diff_open.value = false
  } catch (error) {
    toast.error(error.message || '保存失败')
  }
}

async function confirm_raw_save() {
  try {
    const { saved_toml, saved_env } = await config_store.save_raw()
    if (raw_editor_target.value === 'env') {
      if (saved_env) {
        toast.success('保存成功，.env 改动需重启机器人生效')
        ask_restart('.env 与框架相关配置的改动需要重启机器人生效，是否立即重启？')
      } else {
        toast.success('未检测到改动')
      }
    } else {
      toast.success(saved_toml ? '保存成功，Config.toml 已热更新' : '未检测到改动')
    }
    raw_editor_open.value = false
  } catch (error) {
    toast.error(error.message || '保存失败')
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
      toast.error(error.message || '加载配置文件失败')
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
    toast.error(error.message || '加载消息文本失败')
  }
}

function reset_messages() {
  messages_toml.value = messages_original.value
}

async function confirm_messages_save() {
  try {
    const saved = await config_store.save_messages()
    toast.success(saved ? '消息文本已保存并生效' : '未检测到改动')
  } catch (error) {
    toast.error(error.message || '保存失败')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">配置中心</h1>
        <p class="page-desc">管理 Config.toml 与环境变量</p>
      </div>
    </div>

    <Tabs v-model="active_tab" :tabs="tabs">
      <!-- Config.toml 配置 -->
      <template #toml>
        <div class="tab-actions">
          <Button class="tab-action-left" variant="secondary" @click="open_raw_editor('toml')">
            <Icon icon="lucide:file-code" width="15" />
            编辑源代码
          </Button>
          <Button variant="ghost" :disabled="!has_changes" @click="config_store.reset_draft()">
            撤销修改
          </Button>
          <Button variant="primary" :disabled="!has_changes" @click="diff_open = true">
            <Icon icon="lucide:save" width="15" />
            保存修改
            <span v-if="has_changes" class="change-count">{{ changes.length }}</span>
          </Button>
        </div>

        <div v-if="loading && !draft" class="card">
          <div class="loading-block"><Spinner :size="18" /> 加载配置中…</div>
        </div>

        <div v-else class="config-layout">
          <nav class="group-nav card">
            <button
              v-for="group in groups"
              :key="group.name"
              class="group-item"
              :class="{ 'group-item--active': active_group === group.name }"
              @click="active_group = group.name"
            >
              {{ group.name }}
              <span
                v-if="group.keys.some((key) => changes.some((c) => c.key === key))"
                class="group-dot"
              />
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
                  'field-row--changed': changes.some((c) => c.key === field.key),
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
                    placeholder="留空则不修改"
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
                      :key="index"
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
                      添加一项
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
                        placeholder="群组 / 频道 ID"
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
                      添加群组
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
                <p class="field-lock-text">请先开启「{{ active_group_gate_label }}」</p>
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
            编辑源代码
          </Button>
          <Button
            variant="ghost"
            :disabled="!has_env_changes"
            @click="config_store.reset_env_draft()"
          >
            撤销修改
          </Button>
          <Button variant="primary" :disabled="!has_env_changes" @click="env_diff_open = true">
            <Icon icon="lucide:save" width="15" />
            保存修改
            <span v-if="has_env_changes" class="change-count">{{ env_changes.length }}</span>
          </Button>
        </div>

        <div v-if="env_loading" class="card">
          <div class="loading-block"><Spinner :size="18" /> 加载环境变量…</div>
        </div>

        <div v-else class="config-layout">
          <nav class="group-nav card">
            <button
              v-for="group in env_groups"
              :key="group.name"
              class="group-item"
              :class="{ 'group-item--active': active_env_group === group.name }"
              @click="active_env_group = group.name"
            >
              {{ group.name }}
              <span
                v-if="group.keys.some((key) => env_changes.some((c) => c.key === key))"
                class="group-dot"
              />
            </button>
          </nav>

          <section class="card config-panel">
            <div class="card-header">
              <h3 class="card-title">{{ active_env_group }}</h3>
              <span class="text-xs text-muted">修改后需重启机器人生效</span>
            </div>
            <div class="field-list">
              <div
                v-for="field in env_fields_of(
                  env_groups.find((g) => g.name === active_env_group) || { keys: [] },
                )"
                :key="field.key"
                class="field-row"
                :class="{ 'field-row--changed': env_changes.some((c) => c.key === field.key) }"
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
                    placeholder="留空则不修改"
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
                      :key="index"
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
                      添加一项
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
            撤销修改
          </Button>
          <Button
            variant="primary"
            :disabled="!has_messages_changes"
            @click="confirm_messages_save"
          >
            <Icon icon="lucide:save" width="15" />
            保存修改
          </Button>
        </div>

        <div v-if="messages_loading" class="card">
          <div class="loading-block"><Spinner :size="18" /> 加载消息文本…</div>
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
                    编辑机器人回复文本，支持
                    <code class="mono message-code">{占位符}</code>，保存后立即生效
                  </p>
                </div>
              </div>
            </div>
            <span v-if="!messages_loading" class="message-editor-meta">
              {{ messages_line_count }} 行 · {{ messages_char_count }} 字符
            </span>
          </div>
          <div class="message-editor-body">
            <div v-if="messages_toml === ''" class="raw-loading">
              <Spinner />
              <span>正在加载消息配置…</span>
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
              使用
              <code class="mono message-code">{name}</code>
              形式的占位符引用玩家名 / 数值等动态内容
            </div>
            <span v-if="has_messages_changes" class="raw-changed">
              <Icon icon="lucide:circle-alert" width="13" />
              有未保存的修改
            </span>
            <span v-else class="raw-saved-tip">
              <Icon icon="lucide:check-circle" width="13" />
              已是最新内容
            </span>
          </div>
        </section>
      </template>
    </Tabs>

    <!-- 源码编辑弹窗：按当前 tab 编辑对应文件的原始文本 -->
    <Dialog
      v-model="raw_editor_open"
      :title="raw_editor_target === 'env' ? '编辑 .env 源代码' : '编辑 Config.toml 源代码'"
      :description="
        raw_editor_target === 'env'
          ? '直接编辑 .env 源码，改动需重启机器人生效；请谨慎修改，错误的语法会导致配置无法加载。'
          : '直接编辑 Config.toml 源码，保存后立即热更新；请谨慎修改，错误的语法会导致配置无法加载。'
      "
      confirm-text="保存修改"
      :loading="raw_saving"
      width="70vw"
      @confirm="confirm_raw_save"
    >
      <div v-if="raw_loading" class="raw-loading">
        <Spinner />
        <span>正在加载配置文件…</span>
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
          有未保存的修改
        </span>
        <span v-else class="raw-saved-tip">
          <Icon icon="lucide:check" width="13" />
          已是最新内容
        </span>
        <div class="raw-actions-right">
          <Button
            variant="secondary"
            size="sm"
            :disabled="raw_loading || !current_raw_changed"
            @click="reset_raw"
          >
            <Icon icon="lucide:rotate-ccw" width="14" />
            恢复原内容
          </Button>
        </div>
      </div>
    </Dialog>

    <!-- Config.toml 保存前 diff 预览 -->
    <Dialog
      v-model="diff_open"
      title="确认修改"
      :description="`共 ${changes.length} 项配置将被更新`"
      confirm-text="确认保存"
      :loading="saving"
      @confirm="confirm_save"
    >
      <ul class="diff-list">
        <li v-for="change in changes" :key="change.key" class="diff-item">
          <div class="diff-label">{{ change.label }}</div>
          <div class="diff-values mono">
            <span class="diff-old">{{ display_value(change.old_value) }}</span>
            <Icon icon="lucide:arrow-right" width="13" class="text-muted" />
            <span class="diff-new">{{ display_value(change.new_value) }}</span>
          </div>
        </li>
      </ul>
    </Dialog>

    <!-- .env 保存前 diff 预览 -->
    <Dialog
      v-model="env_diff_open"
      title="确认修改环境变量"
      :description="`共 ${env_changes.length} 项环境变量将被更新，保存后需重启机器人`"
      confirm-text="确认保存"
      :loading="env_saving"
      @confirm="confirm_env_save"
    >
      <ul class="diff-list">
        <li v-for="change in env_changes" :key="change.key" class="diff-item">
          <div class="diff-label">{{ change.label }}</div>
          <div class="diff-values mono">
            <span class="diff-old">{{ display_value(change.old_value) }}</span>
            <Icon icon="lucide:arrow-right" width="13" class="text-muted" />
            <span class="diff-new">{{ display_value(change.new_value) }}</span>
          </div>
        </li>
      </ul>
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
  background: rgb(0 0 0 / 0.04);
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

/* diff 预览 */
.diff-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: 320px;
  overflow-y: auto;
}

.diff-item {
  padding: var(--space-3);
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.diff-label {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: var(--space-1);
}

.diff-values {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  flex-wrap: wrap;
}

.diff-old {
  color: var(--danger);
  text-decoration: line-through;
}

.diff-new {
  color: var(--success);
  font-weight: 600;
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
