<script setup>
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import Button from './Button.vue'
import Input from './Input.vue'

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
})

const emit = defineEmits(['page-change'])

const total_pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

const jump_value = ref('')

function go_to(target_page) {
  if (target_page < 1 || target_page > total_pages.value) return
  emit('page-change', target_page)
}

function jump() {
  const target = Number(jump_value.value)
  jump_value.value = ''
  go_to(target)
}
</script>

<template>
  <div class="ui-pagination">
    <span class="ui-pagination-info">
      共 {{ total }} 条 · 第 {{ page }} / {{ total_pages }} 页
    </span>
    <Button variant="secondary" size="sm" icon-only :disabled="page <= 1" @click="go_to(page - 1)">
      <Icon icon="lucide:chevron-left" width="14" />
    </Button>
    <Button
      variant="secondary"
      size="sm"
      icon-only
      :disabled="page >= total_pages"
      @click="go_to(page + 1)"
    >
      <Icon icon="lucide:chevron-right" width="14" />
    </Button>
    <div class="ui-pagination-jump">
      <Input
        v-model="jump_value"
        type="number"
        min="1"
        :max="total_pages"
        placeholder="页码"
        class="ui-pagination-input"
        @keydown.enter="jump"
      />
      <Button variant="secondary" size="sm" @click="jump">跳转</Button>
    </div>
  </div>
</template>

<style scoped>
.ui-pagination {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.ui-pagination-info {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-right: var(--space-2);
}

.ui-pagination-jump {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: var(--space-1);
}

.ui-pagination-input {
  width: 64px;
}

/* 与 size="sm" 按钮（28px）保持高度一致，并隐藏数字输入框自带的步进箭头。
   注意：class 合并后 .ui-pagination-input 与 .ui-input 是同一元素，必须用直接选择器 */
input.ui-pagination-input {
  height: 28px;
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  appearance: textfield;
  -moz-appearance: textfield;
}

input.ui-pagination-input::-webkit-outer-spin-button,
input.ui-pagination-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
