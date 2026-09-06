<script setup>
/**
 * 扩展配置动态表单（schema 驱动）。
 *
 *    可内联使用（渲染设置页）或嵌入 Dialog（扩展配置弹窗）。
 *    通过 `save` 事件提交校验后的 payload；`confirm_save` 由父组件
 *    经 ref 调用（Dialog 确认按钮场景）。
 */
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Switch from '@/components/ui/Switch.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'

const props = defineProps({
  schema: { type: Object, default: null },
  values: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  showActions: { type: Boolean, default: true },
})

const emit = defineEmits(['save'])

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
  return Boolean(item && item.type === 'object' && item.properties && Object.keys(item.properties).length > 0)
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
      payload[key] = (value || []).map((item) => normalize_object_item(item, object_item_properties(property)))
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
      normalized[name] = raw === '' || raw == null ? def.default ?? null : Number(raw)
    } else if (kind === 'boolean') {
      normalized[name] = Boolean(raw)
    } else {
      normalized[name] = raw
    }
  }
  return normalized
}

defineExpose({ confirm_save })
</script>

<template>
  <div v-if="loading" class="loading-block">
    <Spinner :size="16" /> {{ t('extensions.form_loading') }}
  </div>
  <div v-else-if="!schema || !Object.keys(schema.properties || {}).length" class="config-empty">
    {{ t('extensions.form_empty') }}
  </div>
  <div v-else class="config-form">
    <div
      v-for="(property, key) in schema.properties || {}"
      :key="key"
      class="config-row"
      :class="{ 'config-row--wide': is_object_array(property) }"
    >
      <div class="config-meta">
        <label class="config-label">
          {{ field_label(property, key) }}
          <span class="mono config-key">{{ key }}</span>
        </label>
        <p v-if="property.description" class="config-desc">{{ property.description }}</p>
      </div>
      <div class="config-control">
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
        <div v-else-if="is_object_array(property)" class="object-array">
          <div v-for="(item, item_index) in draft[key] || []" :key="item_index" class="object-item">
            <div class="object-item-head">
              <span class="object-item-title">
                {{ field_label(property, key) }} {{ item_index + 1 }}
              </span>
              <Button
                variant="ghost"
                size="sm"
                :disabled="disabled"
                @click="remove_object_item(key, item_index)"
              >
                {{ t('extensions.form_item_remove') }}
              </Button>
            </div>
            <div class="object-item-grid">
              <div
                v-for="(sub_property, sub_key) in object_item_properties(property)"
                :key="sub_key"
                class="object-field"
              >
                <div class="object-field-head">
                  <label class="object-field-label">
                    {{ field_label(sub_property, sub_key) }}
                  </label>
                  <span v-if="sub_property.description" class="object-field-key">
                    {{ sub_key }}
                  </span>
                </div>
                <p v-if="sub_property.description" class="object-field-desc">
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
          <Button variant="secondary" size="sm" class="object-add" :disabled="disabled" @click="add_object_item(key)">
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
        <div v-else class="config-unsupported">{{ t('extensions.form_unsupported_type') }}</div>
      </div>
    </div>
    <div v-if="showActions" class="config-actions">
      <Button size="sm" :loading="saving" :disabled="disabled" @click="confirm_save">
        {{ t('extensions.form_save') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.loading-block,
.config-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6) 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.config-form {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

/* 对象数组等通栏大区块：整行纵向排布，顶部对齐，避免居中挤压 */
.config-row--wide {
  flex-direction: column;
  align-items: stretch;
}

.config-row:last-child {
  border-bottom: none;
}

.config-row--wide .config-control {
  width: 100%;
  flex-direction: column;
  align-items: stretch;
}

/* 通栏行的填写控件（如对象数组卡片）恢复整行排布，不限制宽度 */
.config-row--wide .config-control > .ui-input,
.config-row--wide .config-control > :deep(.ui-input),
.config-row--wide .config-control > :deep(.ui-select-trigger) {
  max-width: none;
}

.config-meta {
  flex: 1;
  min-width: 0;
}

.config-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.config-key {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 5%, transparent);
  color: var(--text-muted);
}

.config-desc {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.config-control {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

/* 右侧填写控件在区域内居中且保持合适宽度，不顶满也不贴边 */
.config-control > .ui-input,
.config-control > :deep(.ui-input),
.config-control > :deep(.ui-select-trigger) {
  flex: 0 1 auto;
  width: 100%;
  max-width: 240px;
}

.color-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.color-picker:hover {
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

.config-unsupported {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding-top: var(--space-2);
}

.config-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-3);
}

.object-array {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.object-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.object-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.object-item-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
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

.object-field-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.object-field-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

.object-field-key {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 5%, transparent);
  color: var(--text-muted);
}

.object-field-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.object-field :deep(.ui-input),
.object-field :deep(.ui-select-trigger) {
  width: 100%;
}

.object-field :deep(.ui-select-trigger) {
  justify-content: space-between;
}

.object-add {
  align-self: flex-start;
}
</style>
