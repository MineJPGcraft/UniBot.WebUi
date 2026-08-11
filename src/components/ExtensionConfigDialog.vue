<script setup>
/**
 * 扩展配置弹窗：复用 ExtensionConfigForm 动态表单，确认按钮触发表单保存。
 */
import { ref } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import ExtensionConfigForm from '@/components/ExtensionConfigForm.vue'

const props = defineProps({
  extension: { type: Object, default: null },
  schema: { type: Object, default: null },
  values: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['save'])

const open = defineModel({ type: Boolean, default: false })

const form_ref = ref(null)

function on_confirm() {
  form_ref.value?.confirm_save()
}
</script>

<template>
  <Dialog
    v-model="open"
    :title="`${extension?.name || '扩展'} 配置`"
    :description="extension?.description || ''"
    confirm-text="保存"
    :loading="saving"
    @confirm="on_confirm"
  >
    <ExtensionConfigForm
      ref="form_ref"
      :schema="schema"
      :values="values"
      :loading="loading"
      :saving="saving"
      :show_actions="false"
      @save="(payload) => emit('save', payload)"
    />
  </Dialog>
</template>
