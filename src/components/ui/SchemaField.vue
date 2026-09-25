<script setup>
/**
 * 通用 schema 字段控件（递归）。
 *
 * 按 `utils/schema_form.js` 判定的控件语义渲染**单个字段的控件部分**，
 * 不含标签 / 描述行布局（由 SchemaForm 负责）。Config.toml / .env / 扩展配置
 * 三处表单共用本组件，全部控件差异集中于此。
 *
 * `modelValue` 为该字段当前值，改动经 `update:modelValue` 上抛；
 * 值语义由 serialize_value 保证与 schema 同构（数字 null、列表数组等）。
 */
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { use_list_keys } from '@/composables/use_list_keys'
import {
  clone,
  color_value,
  default_value,
  dereference,
  effective_schema,
  field_kind,
  number_step,
  select_options,
  serialize_value,
} from '@/utils/schema_form'
import Input from './Input.vue'
import Textarea from './Textarea.vue'
import Switch from './Switch.vue'
import Select from './Select.vue'
import Button from './Button.vue'
import Collapsible from './Collapsible.vue'
import QrScanDialog from './QrScanDialog.vue'

const props = defineProps({
  /** 字段 schema（可为 $ref，会按 rootSchema 解引用） */
  schema: { type: Object, required: true },
  /** 字段名（用于密钥启发式与默认值） */
  fieldKey: { type: String, default: '' },
  /** 所属根 schema（解析 $ref 用） */
  rootSchema: { type: Object, default: null },
  modelValue: { type: [String, Number, Boolean, Array, Object], default: null },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

/** 解引用并解包 anyOf 后的字段定义 */
const resolved = computed(() => {
  const target = dereference(props.rootSchema, props.schema) || props.schema
  return effective_schema(target) || target
})

const kind = computed(() => field_kind(resolved.value, props.fieldKey))

const list_keys = use_list_keys()
const group_open = ref(false)
const qr_index = ref(null)

/** 卡片折叠状态：键为列表稳定 key，未记录时视为折叠 */
const collapsed_items = reactive({})

function update(value) {
  emit('update:modelValue', serialize_value(resolved.value, props.fieldKey, value))
}

// ===== 字符串列表 / 平台列表 =====

function list_items() {
  return Array.isArray(props.modelValue) ? props.modelValue : []
}

function update_list(index, value) {
  const items = clone(list_items())
  items[index] = value
  emit('update:modelValue', items)
}

function add_list_item() {
  emit('update:modelValue', [...list_items(), ''])
}

function remove_list_item(index) {
  const items = clone(list_items())
  items.splice(index, 1)
  list_keys.remove(index)
  emit('update:modelValue', items)
}

function platform_options() {
  return resolved.value['x-options'] || []
}

/** `平台:目标` 形式的单项拆分 */
function split_platform_item(item, fallback = '') {
  const separator = String(item || '').indexOf(':')
  if (separator < 0) return { platform: fallback, target: String(item || '') }
  return { platform: item.slice(0, separator), target: item.slice(separator + 1) }
}

function update_platform_item(index, property, value) {
  const items = clone(list_items())
  const fallback = platform_options()[0]?.value || ''
  const item = split_platform_item(items[index], fallback)
  item[property] = value
  items[index] = `${item.platform}:${item.target}`
  emit('update:modelValue', items)
}

function add_platform_item() {
  const platform = platform_options()[0]?.value || ''
  emit('update:modelValue', [...list_items(), `${platform}:`])
}

// ===== 对象数组 =====

function object_items() {
  return Array.isArray(props.modelValue) ? props.modelValue : []
}

/** 数组元素定义（`items.$ref` 经根 schema 解引用为 `$defs` 中的对象定义） */
const item_schema = computed(() => {
  const items = resolved.value.items
  if (!items) return null
  const target = dereference(props.rootSchema, items) || items
  return effective_schema(target) || target
})

function item_properties() {
  return item_schema.value?.properties || {}
}

/** 数组元素标题：`x-item-placeholder` 指定的字段值，缺失时回落 `x-item-title` + 序号 */
function item_title(item, index) {
  const placeholder = resolved.value['x-item-placeholder']
  const title = placeholder ? String(item?.[placeholder] ?? '') : ''
  const fallback = resolved.value['x-item-title'] || t('ui.form_editor_item_fallback')
  return title || `${fallback} ${index + 1}`
}

function add_object_item() {
  const template = {}
  for (const [name, child] of Object.entries(item_properties())) {
    template[name] = default_value(child, name)
  }
  emit('update:modelValue', [...object_items(), template])
  // 新卡片默认展开，便于直接填写
  set_collapsed(object_items().length, false)
}

function remove_object_item(index) {
  const items = clone(object_items())
  items.splice(index, 1)
  list_keys.remove(index)
  emit('update:modelValue', items)
}

function move_object_item(index, offset) {
  const target = index + offset
  const items = clone(object_items())
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target], items[index]]
  list_keys.move(index, target)
  emit('update:modelValue', items)
}

function update_object_field(index, name, value) {
  const items = clone(object_items())
  items[index][name] = value
  emit('update:modelValue', items)
}

function is_item_collapsed(index) {
  return collapsed_items[list_keys.key_for(index)] !== false
}

function set_collapsed(index, collapsed) {
  collapsed_items[list_keys.key_for(index)] = collapsed
}

function toggle_item(index) {
  set_collapsed(index, !is_item_collapsed(index))
}

// ===== 扫码绑定（QQ 机器人卡片）=====

function qr_connect() {
  return resolved.value['x-qr-connect'] || null
}

function open_qr(index) {
  qr_index.value = index
}

function close_qr() {
  qr_index.value = null
}

function apply_qr_result(index, credentials) {
  const config = qr_connect()
  if (!config) return
  const items = clone(object_items())
  const item = items[index] || {}
  if (config.id_key && credentials.app_id) item[config.id_key] = credentials.app_id
  if (config.secret_key && credentials.app_secret) item[config.secret_key] = credentials.app_secret
  items[index] = item
  emit('update:modelValue', items)
  // 扫码成功后展开卡片，方便补充其余字段
  set_collapsed(index, false)
}

// ===== 布尔组 / 对象组 =====

function group_entries() {
  return Object.entries(resolved.value.properties || {})
}

function group_opened_count() {
  return group_entries().filter(([name]) => Boolean((props.modelValue || {})[name])).length
}

function update_group_field(name, value) {
  emit('update:modelValue', { ...(props.modelValue || {}), [name]: value })
}

// ===== 键值对 =====

function map_entries() {
  const value = props.modelValue
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value)
}

function map_value_schema() {
  return resolved.value.additionalProperties || { type: 'string' }
}

function is_map_list_value() {
  return map_value_schema().type === 'array'
}

function commit_map(entries) {
  emit('update:modelValue', Object.fromEntries(entries))
}

function update_map_key(index, key) {
  const entries = clone(map_entries())
  entries[index][0] = key
  commit_map(entries)
}

function update_map_value(index, value) {
  const entries = clone(map_entries())
  entries[index][1] = value
  commit_map(entries)
}

function add_map_entry() {
  const entries = clone(map_entries())
  entries.push(['', is_map_list_value() ? [] : ''])
  commit_map(entries)
}

function remove_map_entry(index) {
  const entries = clone(map_entries())
  entries.splice(index, 1)
  commit_map(entries)
}

function update_map_list_item(index, list_index, value) {
  const entries = clone(map_entries())
  const list = Array.isArray(entries[index][1]) ? entries[index][1] : []
  list[list_index] = value
  entries[index][1] = list
  commit_map(entries)
}

function add_map_list_item(index) {
  const entries = clone(map_entries())
  const list = Array.isArray(entries[index][1]) ? entries[index][1] : []
  list.push('')
  entries[index][1] = list
  commit_map(entries)
}

function remove_map_list_item(index, list_index) {
  const entries = clone(map_entries())
  const list = Array.isArray(entries[index][1]) ? entries[index][1] : []
  list.splice(list_index, 1)
  entries[index][1] = list
  commit_map(entries)
}
</script>

<template>
  <Switch
    v-if="kind === 'boolean'"
    :model-value="Boolean(modelValue)"
    :disabled="disabled"
    @update:model-value="update"
  />
  <Select
    v-else-if="kind === 'select'"
    :model-value="modelValue ?? ''"
    :options="select_options(resolved)"
    :disabled="disabled"
    @update:model-value="update"
  />
  <div v-else-if="kind === 'color'" class="field-color">
    <input
      type="color"
      class="field-color-picker"
      :value="color_value(modelValue)"
      :disabled="disabled"
      @input="update($event.target.value)"
    />
    <Input
      :model-value="modelValue ?? ''"
      :placeholder="t('ui.form_color_placeholder')"
      :disabled="disabled"
      @update:model-value="update"
    />
  </div>
  <Input
    v-else-if="kind === 'number'"
    :model-value="modelValue ?? ''"
    type="number"
    :min="resolved.minimum"
    :max="resolved.maximum"
    :step="number_step(resolved)"
    :disabled="disabled"
    @update:model-value="update"
  />
  <Input
    v-else-if="kind === 'password'"
    :model-value="modelValue ?? ''"
    type="password"
    :placeholder="t('ui.form_secret_placeholder')"
    :disabled="disabled"
    @update:model-value="update"
  />
  <Textarea
    v-else-if="kind === 'textarea'"
    :model-value="modelValue ?? ''"
    :disabled="disabled"
    @update:model-value="update"
  />

  <!-- 普通单行文本（string 的默认形态） -->
  <Input
    v-else-if="kind === 'text'"
    :model-value="modelValue ?? ''"
    :disabled="disabled"
    @update:model-value="update"
  />

  <!-- 字符串列表 -->
  <div v-else-if="kind === 'string_list'" class="field-list-editor">
    <div
      v-for="(item, index) in list_items()"
      :key="list_keys.key_for(index)"
      class="field-list-row"
    >
      <Input
        :model-value="item"
        :disabled="disabled"
        @update:model-value="(value) => update_list(index, value)"
      />
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :disabled="disabled"
        @click="remove_list_item(index)"
      >
        <Icon icon="lucide:x" width="14" />
      </Button>
    </div>
    <Button
      variant="secondary"
      size="xs"
      class="field-add"
      :disabled="disabled"
      @click="add_list_item"
    >
      <Icon icon="lucide:plus" width="13" />
      {{ t('ui.form_add_item') }}
    </Button>
  </div>

  <!-- 平台列表 -->
  <div v-else-if="kind === 'platform_list'" class="field-list-editor">
    <div
      v-for="(item, index) in list_items()"
      :key="list_keys.key_for(index)"
      class="field-platform-row"
    >
      <Select
        :model-value="split_platform_item(item, platform_options()[0]?.value).platform"
        :options="platform_options()"
        :disabled="disabled"
        @update:model-value="(value) => update_platform_item(index, 'platform', value)"
      />
      <Input
        :model-value="split_platform_item(item).target"
        :placeholder="t('ui.form_platform_target_placeholder')"
        :disabled="disabled"
        @update:model-value="(value) => update_platform_item(index, 'target', value)"
      />
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :disabled="disabled"
        @click="remove_list_item(index)"
      >
        <Icon icon="lucide:x" width="14" />
      </Button>
    </div>
    <Button
      variant="secondary"
      size="xs"
      class="field-add"
      :disabled="disabled"
      @click="add_platform_item"
    >
      <Icon icon="lucide:plus" width="13" />
      {{ t('ui.form_add_item') }}
    </Button>
  </div>

  <!-- 对象数组（卡片列表） -->
  <div v-else-if="kind === 'object_list'" class="field-object-list">
    <div
      v-for="(item, index) in object_items()"
      :key="list_keys.key_for(index)"
      class="field-object-item"
    >
      <div
        class="field-object-head"
        :class="{ 'field-object-head--collapsed': is_item_collapsed(index) }"
      >
        <button class="field-object-title" type="button" @click="toggle_item(index)">
          <Icon
            :icon="is_item_collapsed(index) ? 'lucide:chevron-down' : 'lucide:chevron-up'"
            width="14"
            class="field-object-chevron"
          />
          {{ item_title(item, index) }}
        </button>
        <div class="field-object-actions">
          <Button
            v-if="qr_connect()"
            variant="ghost"
            size="sm"
            icon-only
            :disabled="disabled"
            :title="t('ui.form_editor_qr_bind_title')"
            @click="open_qr(index)"
          >
            <Icon icon="lucide:qr-code" width="14" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :disabled="disabled || index === 0"
            :title="t('ui.form_editor_move_up')"
            @click="move_object_item(index, -1)"
          >
            <Icon icon="lucide:arrow-up" width="14" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :disabled="disabled || index === object_items().length - 1"
            :title="t('ui.form_editor_move_down')"
            @click="move_object_item(index, 1)"
          >
            <Icon icon="lucide:arrow-down" width="14" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :disabled="disabled"
            :title="t('ui.form_item_remove')"
            @click="remove_object_item(index)"
          >
            <Icon icon="lucide:trash-2" width="14" />
          </Button>
        </div>
      </div>
      <div v-show="!is_item_collapsed(index)" class="field-object-body">
        <div v-for="(child, name) in item_properties()" :key="name" class="field-subfield">
          <div class="field-subfield-label">{{ child.title || name }}</div>
          <p v-if="child.description" class="field-subfield-desc">{{ child.description }}</p>
          <SchemaField
            :schema="child"
            :field-key="name"
            :root-schema="rootSchema"
            :model-value="item?.[name]"
            :disabled="disabled"
            @update:model-value="(value) => update_object_field(index, name, value)"
          />
        </div>
      </div>
      <QrScanDialog
        v-if="qr_connect()"
        :open="qr_index === index"
        :source="qr_connect().source || ''"
        @success="(credentials) => apply_qr_result(index, credentials)"
        @update:open="(value) => (value ? open_qr(index) : close_qr())"
      />
    </div>
    <Button
      variant="secondary"
      size="xs"
      class="field-add"
      :class="{ 'field-add--empty': object_items().length === 0 }"
      :disabled="disabled"
      @click="add_object_item"
    >
      <Icon icon="lucide:plus" width="13" />
      {{
        t('ui.form_add_named_item', {
          name: resolved['x-item-title'] || t('ui.form_editor_item_fallback'),
        })
      }}
    </Button>
  </div>

  <!-- 布尔组（折叠面板内的一组开关） -->
  <Collapsible v-else-if="kind === 'boolean_group'" v-model="group_open" :disabled="disabled">
    <template #trigger>
      <span class="field-collapse-title">{{ resolved.title || fieldKey }}</span>
      <span class="field-collapse-count">
        {{
          t('ui.form_editor_booleans_enabled_count', {
            opened: group_opened_count(),
            total: group_entries().length,
          })
        }}
      </span>
    </template>
    <template #content>
      <div class="field-collapse-list">
        <label
          v-for="[name, child] in group_entries()"
          :key="name"
          class="field-boolean"
          :title="child.description"
        >
          <Switch
            :model-value="Boolean((modelValue || {})[name])"
            :disabled="disabled"
            @update:model-value="(value) => update_group_field(name, value)"
          />
          <span class="field-boolean-text">{{ child.title || name }}</span>
        </label>
      </div>
    </template>
  </Collapsible>

  <!-- 对象组（多种子类型的对象，逐个子字段渲染） -->
  <div v-else-if="kind === 'object_group'" class="field-object-group">
    <div v-for="(child, name) in resolved.properties || {}" :key="name" class="field-subfield">
      <div class="field-subfield-label">{{ child.title || name }}</div>
      <p v-if="child.description" class="field-subfield-desc">{{ child.description }}</p>
      <SchemaField
        :schema="child"
        :field-key="name"
        :root-schema="rootSchema"
        :model-value="(modelValue || {})[name]"
        :disabled="disabled"
        @update:model-value="(value) => update_group_field(name, value)"
      />
    </div>
  </div>

  <!-- 键值对 -->
  <div v-else-if="kind === 'key_value'" class="field-map">
    <div v-for="(entry, index) in map_entries()" :key="index" class="field-map-row">
      <Input
        :model-value="entry[0]"
        :placeholder="resolved['x-key-label']"
        class="field-map-key"
        :disabled="disabled"
        @update:model-value="(value) => update_map_key(index, value)"
      />
      <span class="field-map-arrow">→</span>
      <div v-if="is_map_list_value()" class="field-map-list">
        <div
          v-for="(list_item, list_index) in entry[1] || []"
          :key="list_index"
          class="field-map-list-row"
        >
          <Input
            :model-value="list_item"
            :placeholder="resolved['x-value-placeholder']"
            :disabled="disabled"
            @update:model-value="(value) => update_map_list_item(index, list_index, value)"
          />
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :disabled="disabled"
            @click="remove_map_list_item(index, list_index)"
          >
            <Icon icon="lucide:x" width="14" />
          </Button>
        </div>
        <Button
          variant="secondary"
          size="xs"
          class="field-add"
          :disabled="disabled"
          @click="add_map_list_item(index)"
        >
          <Icon icon="lucide:plus" width="13" />
          {{ t('ui.form_editor_add_address') }}
        </Button>
      </div>
      <Input
        v-else
        :model-value="entry[1]"
        :placeholder="resolved['x-value-placeholder']"
        class="field-map-value"
        :disabled="disabled"
        @update:model-value="(value) => update_map_value(index, value)"
      />
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :disabled="disabled"
        @click="remove_map_entry(index)"
      >
        <Icon icon="lucide:x" width="14" />
      </Button>
    </div>
    <Button
      variant="secondary"
      size="xs"
      class="field-add"
      :disabled="disabled"
      @click="add_map_entry"
    >
      <Icon icon="lucide:plus" width="13" />
      {{ t('ui.form_editor_add_entry') }}
    </Button>
  </div>

  <div v-else class="field-unsupported">{{ t('ui.form_unsupported_type') }}</div>
</template>

<script>
// 递归自引用：字段控件需渲染嵌套对象
export default { name: 'SchemaField' }
</script>

<style scoped>
/* 颜色选择器 */
.field-color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.field-color :deep(.ui-input) {
  flex: 1;
}

.field-color-picker {
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

.field-color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.field-color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.field-color-picker:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.field-color-picker:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 列表与映射容器 */
.field-list-editor,
.field-object-list,
.field-map,
.field-object-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.field-list-row,
.field-map-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
}

.field-list-row :deep(.ui-input) {
  flex: 1;
}

.field-platform-row {
  display: grid;
  grid-template-columns: 132px 1fr auto;
  gap: var(--space-1);
  width: 100%;
}

.field-platform-row :deep(.ui-select-trigger) {
  width: 100%;
  min-width: 0;
}

/* 对象数组卡片 */
.field-object-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

.field-object-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
  transition: border-color var(--transition);
}

/* 折叠态：标题与操作栏紧贴，去掉分隔线 */
.field-object-head--collapsed {
  padding-bottom: 0;
  border-bottom: none;
}

.field-object-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: 2px 4px;
  margin-left: -4px;
  border: none;
  border-radius: var(--radius);
  background: none;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--transition);
}

.field-object-title:hover {
  background: var(--surface);
}

.field-object-chevron {
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: color var(--transition);
}

.field-object-title:hover .field-object-chevron {
  color: var(--text);
}

.field-object-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.field-object-body,
.field-object-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.field-subfield {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.field-subfield-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

.field-subfield-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.field-subfield :deep(.ui-input),
.field-subfield :deep(.ui-textarea),
.field-subfield :deep(.ui-select-trigger) {
  width: 100%;
}

.field-add {
  align-self: flex-end;
}

.field-add--empty {
  align-self: flex-end;
  margin: var(--space-1) 0;
}

/* 布尔组 */
.field-collapse-title {
  flex: 1;
  font-weight: 500;
}

.field-collapse-count {
  flex: 0 0 auto;
  padding: 1px var(--space-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--text-muted);
}

.field-collapse-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 220px;
  overflow-y: auto;
  padding: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.field-boolean {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color var(--transition);
}

.field-boolean:hover {
  background: var(--surface-soft);
}

.field-boolean-text {
  font-size: var(--text-sm);
  color: var(--text);
}

/* 键值对 */
.field-map-key {
  flex: 1;
}

.field-map-arrow {
  flex: 0 0 auto;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.field-map-value {
  flex: 2;
}

.field-map-list {
  display: flex;
  flex: 2;
  flex-direction: column;
  gap: var(--space-1);
}

.field-map-list-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.field-map-list-row :deep(.ui-input) {
  flex: 1;
}

.field-unsupported {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
