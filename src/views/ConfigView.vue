<script setup>
import { ref, computed, onMounted } from 'vue'
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
} = storeToRefs(config_store)

const active_tab = ref('toml')
const active_group = ref('')
const active_env_group = ref('')
const diff_open = ref(false)
const env_diff_open = ref(false)
const json_errors = ref({})
const platform_item_ids = ref({})
let platform_item_sequence = 0

const tabs = [
  { value: 'toml', label: 'Config.toml', icon: 'lucide:file-cog' },
  { value: 'env', label: '环境变量', icon: 'lucide:terminal' },
]

const groups = computed(() => schema.value?.groups || [])

onMounted(async () => {
  try {
    await config_store.fetch_all()
    if (groups.value.length > 0) active_group.value = groups.value[0].name
  } catch (error) {
    toast.error(error.message || '获取配置失败')
  }
  try {
    await config_store.fetch_env()
    if (env_groups.value.length > 0) active_env_group.value = env_groups.value[0].name
  } catch {
    // 环境变量加载失败不阻塞页面
  }
})

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

function keyword_entries(key) {
  return Object.entries(draft_value(key) || {}).map(([reply, keywords]) => ({ reply, keywords }))
}

function update_keyword_entry(key, entry_index, property, value) {
  const entries = keyword_entries(key)
  entries[entry_index][property] = value
  handle_update(key, Object.fromEntries(entries.map((entry) => [entry.reply, entry.keywords])))
}

function add_keyword_entry(key) {
  const entries = keyword_entries(key)
  entries.push({ reply: '', keywords: [] })
  handle_update(key, Object.fromEntries(entries.map((entry) => [entry.reply, entry.keywords])))
}

function remove_keyword_entry(key, entry_index) {
  const entries = keyword_entries(key)
  entries.splice(entry_index, 1)
  handle_update(key, Object.fromEntries(entries.map((entry) => [entry.reply, entry.keywords])))
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

const RESTART_DEPENDENT_KEYS = ['webui.enabled', 'image.mode', 'ai.enabled']

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
            <div class="field-list">
              <div
                v-for="field in fields_of(
                  groups.find((g) => g.name === active_group) || { keys: [] },
                )"
                :key="field.key"
                class="field-row"
                :class="{ 'field-row--changed': changes.some((c) => c.key === field.key) }"
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
                  <div v-else-if="field.type === 'keyword_map'" class="keyword-editor">
                    <div
                      v-for="(entry, entry_index) in keyword_entries(field.key)"
                      :key="entry_index"
                      class="keyword-entry"
                    >
                      <Input
                        :model-value="entry.reply"
                        placeholder="回复内容"
                        @update:model-value="
                          (value) => update_keyword_entry(field.key, entry_index, 'reply', value)
                        "
                      />
                      <Input
                        :model-value="entry.keywords.join(', ')"
                        placeholder="关键词，用逗号分隔"
                        @update:model-value="
                          (value) =>
                            update_keyword_entry(
                              field.key,
                              entry_index,
                              'keywords',
                              value
                                .split(',')
                                .map((item) => item.trim())
                                .filter(Boolean),
                            )
                        "
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon-only
                        @click="remove_keyword_entry(field.key, entry_index)"
                      >
                        <Icon icon="lucide:x" width="14" />
                      </Button>
                    </div>
                    <Button variant="secondary" size="sm" @click="add_keyword_entry(field.key)">
                      <Icon icon="lucide:plus" width="13" />
                      添加一条规则
                    </Button>
                  </div>
                  <Input
                    v-else
                    :model-value="draft_value(field.key) ?? ''"
                    @update:model-value="(value) => handle_update(field.key, value)"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>

      <!-- 环境变量 -->
      <template #env>
        <div class="tab-actions">
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
                  <Input
                    v-if="field.type === 'secret'"
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
                    <Textarea
                      :model-value="json_value(field.key)"
                      :rows="6"
                      @update:model-value="(value) => handle_json_update(field.key, value)"
                    />
                    <span v-if="json_errors[field.key]" class="json-error">{{
                      json_errors[field.key]
                    }}</span>
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
    </Tabs>

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
  width: 320px;
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

.keyword-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.keyword-entry {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--space-1);
  width: 100%;
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

  .keyword-entry {
    grid-template-columns: 1fr;
  }
}

/* 标签页操作栏 */
.tab-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin: var(--space-4) 0;
}

@media (max-width: 700px) {
  .platform-list-item {
    grid-template-columns: 1fr;
  }
}
</style>
