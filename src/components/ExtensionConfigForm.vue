<script setup>
/**
 * 扩展配置动态表单（schema 驱动）。
 *
 *    可内联使用（渲染设置页）或嵌入 Dialog（扩展配置弹窗）。
 *    通过 `save` 事件提交校验后的 payload；`confirm_save` 由父组件
 *    经 ref 调用（Dialog 确认按钮场景）。
 */
import { reactive, watch } from 'vue'
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
  show_actions: { type: Boolean, default: true },
})

const emit = defineEmits(['save'])

const draft = reactive({})

// schema/values 就绪后按当前值初始化草稿（数据更新时重建，避免先展示再异步拉取导致空表单）
watch(
  () => [props.schema, props.values],
  () => {
    if (!props.schema) return
    Object.keys(draft).forEach((key) => delete draft[key])
    const properties = props.schema?.properties || {}
    for (const key of Object.keys(properties)) {
      const property = properties[key]
      const current = props.values[key] ?? property.default ?? ''
      draft[key] =
        field_type(property) === 'array'
          ? Array.isArray(current)
            ? current.join(', ')
            : ''
          : current
    }
  },
  { immediate: true },
)

function field_type(property) {
  if (property.type === 'boolean') return 'boolean'
  if (property.type === 'integer' || property.type === 'number') return 'number'
  if (property.type === 'array') return 'array'
  if (property.type === 'object') return 'object'
  if (property.type === 'string' && property.enum) return 'select'
  if (property.type === 'string' && property.template_type === 'color') return 'color'
  return 'string'
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
    if (field_type(property) === 'array') {
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

defineExpose({ confirm_save })
</script>

<template>
  <div v-if="loading" class="loading-block"><Spinner :size="16" /> 加载配置中…</div>
  <div v-else-if="!schema || !Object.keys(schema.properties || {}).length" class="config-empty">
    该扩展未声明配置项
  </div>
  <div v-else class="config-form">
    <div v-for="(property, key) in schema.properties || {}" :key="key" class="config-row">
      <div class="config-meta">
        <label class="config-label">
          {{ field_label(property, key) }}
          <span class="mono config-key">{{ key }}</span>
        </label>
        <p v-if="property.description" class="config-desc">{{ property.description }}</p>
      </div>
      <div class="config-control">
        <Switch v-if="field_type(property) === 'boolean'" v-model="draft[key]" :disabled="disabled" />
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
          <Input v-model="draft[key]" placeholder="#RRGGBB 或 #RRGGBBAA" :disabled="disabled" />
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
          placeholder="留空则不修改"
          :disabled="disabled"
        />
        <Input v-else-if="field_type(property) === 'array'" v-model="draft[key]" :disabled="disabled" />
        <Textarea v-else-if="is_long_text(property)" v-model="draft[key]" :disabled="disabled" />
        <Input v-else-if="field_type(property) === 'string'" v-model="draft[key]" :disabled="disabled" />
        <div v-else class="config-unsupported">暂不支持该类型</div>
      </div>
    </div>
    <div v-if="show_actions" class="config-actions">
      <Button size="sm" :loading="saving" :disabled="disabled" @click="confirm_save">
        保存配置
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
}

.config-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

.config-row:last-child {
  border-bottom: none;
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
  background: rgb(0 0 0 / 0.05);
  color: var(--text-muted);
}

.config-desc {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.config-control {
  flex-shrink: 0;
  width: 220px;
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
</style>
