<script setup>
/**
 * 扩展配置动态表单（schema 驱动）。
 *
 *    可内联使用（渲染设置页）或嵌入 Dialog（扩展配置弹窗）。
 *    通过 `save` 事件提交校验后的 payload；`confirm_save` / `reset_draft`
 *    由父组件经 ref 调用（操作栏外置到对话框或卡片外部的场景）。
 *
 *    `show-actions` 为 true 时在表单顶部渲染「撤销 / 保存」操作栏；
 *    为 false 时父组件通过 `change` 事件拿到改动数量，自行渲染操作栏。
 */
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Switch from '@/components/ui/Switch.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const props = defineProps({
  schema: { type: Object, default: null },
  values: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  showActions: { type: Boolean, default: true },
})

const emit = defineEmits(['save', 'change'])

const { t } = useI18n()

const draft = reactive({})

// 仅在 schema 变化时重建草稿：values 引用会因父组件刷新而变化，
// 若跟随重建会把用户未保存的编辑覆盖掉（H7 草稿保护）
watch(
  () => props.schema,
  () => {
    if (!props.schema) return
    Object.keys(draft).forEach((key) => delete draft[key])
    rebuild_draft()
  },
  { immediate: true },
)

// values 首次就绪（从空到有）时填充草稿；已有编辑时不覆盖
watch(
  () => props.values,
  (values, previous) => {
    if (!props.schema) return
    const has_previous = previous && Object.keys(previous).length > 0
    if (has_previous && Object.keys(draft).length > 0) return
    rebuild_draft()
  },
)

/** 以当前 schema + values 重建草稿 */
function rebuild_draft() {
  Object.keys(draft).forEach((key) => delete draft[key])
  const properties = props.schema?.properties || {}
  for (const key of Object.keys(properties)) {
    const property = properties[key]
    const current = props.values[key] ?? property.default ?? ''
    if (is_object_array(property)) {
      // 对象数组：保留为对象列表，便于子字段编辑
      draft[key] = Array.isArray(current) ? current.map((item) => ({ ...item })) : []
    } else {
      draft[key] =
        field_type(property) === 'array'
          ? Array.isArray(current)
            ? current.join(', ')
            : ''
          : current
    }
  }
}

function field_type(property) {
  if (property.type === 'boolean') return 'boolean'
  if (property.type === 'integer' || property.type === 'number') return 'number'
  if (property.type === 'array') return 'array'
  if (property.type === 'object') return 'object'
  if (property.type === 'string' && property.enum) return 'select'
  if (property.type === 'string' && property.template_type === 'color') return 'color'
  return 'string'
}

/** 解析 $ref 指向的 $defs 定义，无法解析返回 null */
function resolve_def(ref) {
  const segments = String(ref || '')
    .replace(/^#\//, '')
    .split('/')
  let node = props.schema
  for (const segment of segments) {
    if (node == null) return null
    node = node[decodeURIComponent(segment)]
  }
  return node
}

/** 数组字段的元素 schema（解析 $ref），无元素则返回 null */
function array_item_schema(property) {
  const items = property.items
  if (!items) return null
  return items.$ref ? resolve_def(items.$ref) : items
}

/** 是否为「对象数组」字段（元素为对象、含可编辑子属性） */
function is_object_array(property) {
  if (property.type !== 'array') return false
  const item = array_item_schema(property)
  return Boolean(
    item && item.type === 'object' && item.properties && Object.keys(item.properties).length > 0,
  )
}

/** 对象数组元素的子字段列表 */
function object_item_properties(property) {
  const item = array_item_schema(property)
  return (item && item.properties) || {}
}

/** 新增一个对象数组元素：以默认值填充 */
function add_object_item(key) {
  const template = {}
  for (const [name, def] of Object.entries(object_item_properties(props.schema.properties[key]))) {
    template[name] = def.default ?? ''
  }
  draft[key] = draft[key] || []
  draft[key].push(template)
}

/** 移除对象数组中的指定元素 */
function remove_object_item(key, index) {
  draft[key].splice(index, 1)
}

function field_label(property, key) {
  return property.title || key
}

/** 字段原始值（按控件语义归一化，用于与草稿比对是否已改动） */
function original_value(key, property) {
  const current = props.values[key] ?? property.default ?? ''
  if (is_object_array(property) || field_type(property) === 'array') {
    return Array.isArray(current) ? current : []
  }
  return current
}

/** 字段草稿值（数组归一化为数组，便于与原始值同构比较） */
function draft_value(key, property) {
  const value = draft[key]
  if (is_object_array(property)) return value || []
  if (field_type(property) === 'array') {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return value
}

/** 依据字段类型归一化单个值（用于比对，避免 '1' 与 1 被误判为改动） */
function normalize_for_compare(value, property) {
  if (!property) return value ?? null
  const kind = field_type(property)
  if (kind === 'number') return value === '' || value == null ? null : Number(value)
  if (kind === 'boolean') return Boolean(value)
  if (kind === 'array') return Array.isArray(value) ? value : []
  return value ?? ''
}

/** 已改动字段 key 集合（Set 查找，供模板与计数复用） */
const changed_keys = computed(() => {
  const properties = props.schema?.properties || {}
  const changed = new Set()
  for (const key of Object.keys(properties)) {
    const property = properties[key]
    const draft_current = draft_value(key, property)
    const original = original_value(key, property)
    if (is_object_array(property)) {
      const item_properties = object_item_properties(property)
      const items_differ =
        draft_current.length !== original.length ||
        draft_current.some((item, index) => {
          const origin_item = original[index] || {}
          return Object.keys(item_properties).some(
            (name) =>
              JSON.stringify(normalize_for_compare(item?.[name], item_properties[name])) !==
              JSON.stringify(normalize_for_compare(origin_item?.[name], item_properties[name])),
          )
        })
      if (items_differ) changed.add(key)
    } else if (
      JSON.stringify(normalize_for_compare(draft_current, property)) !==
      JSON.stringify(normalize_for_compare(original, property))
    ) {
      changed.add(key)
    }
  }
  return changed
})

const has_changes = computed(() => changed_keys.value.size > 0)

// 改动数量变化时向父组件通报（外置操作栏需要展示计数 / 禁用态）
watch(
  () => changed_keys.value.size,
  (count) => emit('change', count),
  { immediate: true },
)

/** 丢弃当前草稿改动，回到原始值 */
function reset_draft() {
  rebuild_draft()
}

function is_secret(key) {
  return /key|secret|token|password/i.test(key)
}

function select_options(property) {
  return (property.enum || []).map((value) => ({ value, label: value }))
}

function is_long_text(property) {
  const value = String(property.default ?? '')
  return value.length > 40 || value.includes('\n')
}

function number_step(property) {
  return property.type === 'number' ? 'any' : 1
}

// color input 只接受合法 hex，非法值回退黑色预览
function hex_value(value) {
  return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(String(value || '')) ? value : '#000000'
}

function confirm_save() {
  const properties = props.schema?.properties || {}
  const payload = {}
  for (const [key, value] of Object.entries(draft)) {
    const property = properties[key]
    if (is_object_array(property)) {
      // 对象数组：直接提交对象列表（含数值字段归一化）
      payload[key] = (value || []).map((item) =>
        normalize_object_item(item, object_item_properties(property)),
      )
    } else if (field_type(property) === 'array') {
      // 数组以逗号分隔文本编辑，保存时拆分为数组
      payload[key] = String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    } else if (field_type(property) === 'number') {
      payload[key] = value === '' ? null : Number(value)
    } else {
      payload[key] = value
    }
  }
  emit('save', payload)
}

/** 依据元素 schema 将对象内数值/布尔字段转换为正确类型 */
function normalize_object_item(item, item_properties) {
  const normalized = {}
  for (const [name, raw] of Object.entries(item || {})) {
    const def = item_properties[name]
    const kind = def ? field_type(def) : ''
    if (kind === 'number') {
      normalized[name] = raw === '' || raw == null ? (def.default ?? null) : Number(raw)
    } else if (kind === 'boolean') {
      normalized[name] = Boolean(raw)
    } else {
      normalized[name] = raw
    }
  }
  return normalized
}

defineExpose({ confirm_save, reset_draft, has_changes })
</script>

<template>
  <div v-if="loading" class="loading-block">
    <Spinner :size="18" /> {{ t('extensions.form_loading') }}
  </div>
  <EmptyState
    v-else-if="!schema || !Object.keys(schema.properties || {}).length"
    icon="lucide:file-cog"
    :title="t('extensions.form_empty')"
  />
  <div v-else class="extension-config-form">
    <div v-if="showActions" class="form-actions">
      <div class="form-actions-left">
        <slot name="actions-left" />
      </div>
      <Button variant="ghost" :disabled="!has_changes" @click="reset_draft">
        {{ t('extensions.form_revert') }}
      </Button>
      <Button
        variant="primary"
        :loading="saving"
        :disabled="disabled || !has_changes"
        @click="confirm_save"
      >
        <Icon icon="lucide:save" width="15" />
        {{ t('extensions.form_save') }}
        <span v-if="has_changes" class="change-count">{{ changed_keys.size }}</span>
      </Button>
    </div>
    <div
      v-for="(property, key) in schema.properties || {}"
      :key="key"
      class="field-row"
      :class="{
        'field-row--changed': changed_keys.has(key),
        'field-row--wide': is_object_array(property),
      }"
    >
      <div class="field-meta">
        <label class="field-label">
          {{ field_label(property, key) }}
          <span class="mono field-key">{{ key }}</span>
        </label>
        <p v-if="property.description" class="field-desc">{{ property.description }}</p>
      </div>
      <div class="field-control">
        <Switch
          v-if="field_type(property) === 'boolean'"
          v-model="draft[key]"
          :disabled="disabled"
        />
        <Select
          v-else-if="field_type(property) === 'select'"
          v-model="draft[key]"
          :options="select_options(property)"
          :disabled="disabled"
        />
        <div v-else-if="field_type(property) === 'color'" class="color-control">
          <input
            type="color"
            class="color-picker"
            :value="hex_value(draft[key])"
            :disabled="disabled"
            @input="draft[key] = $event.target.value"
          />
          <Input
            v-model="draft[key]"
            :placeholder="t('extensions.form_color_placeholder')"
            :disabled="disabled"
          />
        </div>
        <Input
          v-else-if="field_type(property) === 'number'"
          v-model="draft[key]"
          type="number"
          :min="property.minimum"
          :max="property.maximum"
          :step="number_step(property)"
          :disabled="disabled"
        />
        <Input
          v-else-if="is_secret(key)"
          v-model="draft[key]"
          type="password"
          :placeholder="t('extensions.form_secret_placeholder')"
          :disabled="disabled"
        />
        <div v-else-if="is_object_array(property)" class="object-list">
          <div v-for="(item, item_index) in draft[key] || []" :key="item_index" class="object-item">
            <div class="object-item-head">
              <span class="object-item-title">
                {{ field_label(property, key) }} {{ item_index + 1 }}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon-only
                :disabled="disabled"
                :title="t('extensions.form_item_remove')"
                @click="remove_object_item(key, item_index)"
              >
                <Icon icon="lucide:x" width="14" />
              </Button>
            </div>
            <div class="object-item-grid">
              <div
                v-for="(sub_property, sub_key) in object_item_properties(property)"
                :key="sub_key"
                class="object-field"
              >
                <label class="object-field-label">
                  {{ field_label(sub_property, sub_key) }}
                  <span class="mono field-key">{{ sub_key }}</span>
                </label>
                <p v-if="sub_property.description" class="field-desc">
                  {{ sub_property.description }}
                </p>
                <Switch
                  v-if="field_type(sub_property) === 'boolean'"
                  v-model="item[sub_key]"
                  :disabled="disabled"
                />
                <Select
                  v-else-if="field_type(sub_property) === 'select'"
                  v-model="item[sub_key]"
                  :options="select_options(sub_property)"
                  :disabled="disabled"
                />
                <Input
                  v-else-if="field_type(sub_property) === 'number'"
                  v-model="item[sub_key]"
                  type="number"
                  :min="sub_property.minimum"
                  :max="sub_property.maximum"
                  :step="number_step(sub_property)"
                  :disabled="disabled"
                />
                <Input
                  v-else
                  v-model="item[sub_key]"
                  :placeholder="sub_property.default ?? ''"
                  :disabled="disabled"
                />
              </div>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            class="object-add"
            :disabled="disabled"
            @click="add_object_item(key)"
          >
            <Icon icon="lucide:plus" width="13" />
            {{ t('extensions.form_item_add') }}
          </Button>
        </div>
        <Input
          v-else-if="field_type(property) === 'array'"
          v-model="draft[key]"
          :disabled="disabled"
        />
        <Textarea v-else-if="is_long_text(property)" v-model="draft[key]" :disabled="disabled" />
        <Input
          v-else-if="field_type(property) === 'string'"
          v-model="draft[key]"
          :disabled="disabled"
        />
        <div v-else class="field-unsupported">{{ t('extensions.form_unsupported_type') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.extension-config-form {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

/* 操作栏：置于表单右上角，与配置中心 tab-actions 一致 */
.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

/* 操作栏左侧扩展位（如弹窗的「在配置中心打开」） */
.form-actions-left {
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

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

/* 字段行：与 ConfigView 配置项保持一致（左描述 / 右控件） */
.field-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-4) 0;
}

.field-row + .field-row {
  border-top: 1px solid var(--border);
}

/* 已改动字段行：警示底色高亮（与配置中心同一处理） */
.field-row--changed {
  background: linear-gradient(to right, var(--warning-soft), transparent 60%);
  margin: 0 calc(-1 * var(--space-4));
  padding-left: var(--space-4);
  padding-right: var(--space-4);
  border-radius: var(--radius);
}

/* 对象数组等通栏区块：整行纵向排布，避免右侧被压窄 */
.field-row--wide {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-3);
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
  line-height: 1.5;
}

.field-control {
  flex: 0 0 40%;
  width: 40%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.field-row--wide .field-control {
  flex: 1 1 auto;
  width: 100%;
  justify-content: flex-start;
}

/* 单选控件填满右侧栏；开关等内联控件保持自身宽度。
   Select / Color 等控件内部元素需 :deep() 才可命中（同 ConfigView 先例） */
.field-control > :deep(.ui-input),
.field-control > :deep(.ui-textarea),
.field-control > :deep(.ui-select-trigger),
.field-control > .color-control {
  width: 100%;
}

.field-control > :deep(.ui-select-trigger) {
  justify-content: space-between;
}

.field-unsupported {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.color-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.color-control .ui-input {
  flex: 1;
}

.color-picker {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color var(--transition);
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.color-picker:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.color-picker:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.color-picker:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 对象数组：与 JsonFormEditor 的卡片列表保持同一视觉语言 */
.object-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

.object-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

.object-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.object-item-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.object-item-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.object-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.object-field-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

.object-field :deep(.ui-input),
.object-field :deep(.ui-textarea),
.object-field :deep(.ui-select-trigger) {
  width: 100%;
}

.object-add {
  align-self: flex-start;
}

@media (max-width: 900px) {
  .field-row {
    flex-direction: column;
    gap: var(--space-3);
  }

  .field-control {
    flex: 1 1 auto;
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
