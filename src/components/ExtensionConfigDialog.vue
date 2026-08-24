<script setup>
/**
 * 扩展配置弹窗：复用 ExtensionConfigForm 动态表单，确认按钮触发表单保存。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

const open = defineModel({ type: Boolean, default: false })

const form_ref = ref(null)

function on_confirm() {
  form_ref.value?.confirm_save()
}
</script>

<template>
  <Dialog
    v-model="open"
    :title="
      t('extensions.config_dialog_title', {
        name: extension?.name || t('extensions.config_dialog_default_name'),
      })
    "
    :description="extension?.description || ''"
    :confirm-text="t('extensions.config_dialog_confirm')"
    :loading="saving"
    @confirm="on_confirm"
  >
    <ExtensionConfigForm
      ref="form_ref"
      :schema="schema"
      :values="values"
      :loading="loading"
      :saving="saving"
      :show-actions="false"
      @save="(payload) => emit('save', payload)"
    />
  </Dialog>
</template>
