<script setup>
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Icon } from '@iconify/vue'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import { useAuthStore } from '@/stores/auth'
import { useStatusStore } from '@/stores/status'
import { use_toast } from '@/composables/use_toast'
import { use_async_action } from '@/composables/use_async_action'

const auth_store = useAuthStore()
const status_store = useStatusStore()
const toast = use_toast()
const { run } = use_async_action()
const { status } = storeToRefs(status_store)

const dialog_open = ref(false)
const updating = ref(false)

// 本次会话内用户关闭弹窗后不再重复弹出（状态推送会持续携带 has_update）
let dismissed_in_session = false

watch(
  () => status.value?.has_update,
  (has_update) => {
    if (has_update && !dismissed_in_session) dialog_open.value = true
  },
  { immediate: true },
)

function toggle_dialog(open) {
  dialog_open.value = open
  if (!open) dismissed_in_session = true
}

function view_details() {
  toggle_dialog(false)
  window.open(
    'https://github.com/MineJPGcraft/UniBot/releases/latest',
    '_blank',
    'noopener,noreferrer',
  )
}

async function update_bot() {
  const ok = await run(() => status_store.update_bot(), '更新失败', updating)
  if (!ok) return
  toggle_dialog(false)
  toast.success('更新成功，机器人正在重启')
}
</script>

<template>
  <Dialog
    :model-value="dialog_open"
    title="发现新版本"
    :description="`当前版本 ${status?.version || '—'}，最新版本 ${status?.latest_version || '—'}`"
    hide-footer
    width="min(420px, calc(100vw - 32px))"
    @update:model-value="toggle_dialog"
  >
    <p class="update-hint">
      <Icon icon="lucide:arrow-up-circle" width="15" />
      检测到新版本，建议及时更新以获取最新功能与修复。
    </p>
    <div class="update-actions">
      <Button variant="ghost" @click="toggle_dialog(false)">稍后再说</Button>
      <Button variant="secondary" @click="view_details">查看详情</Button>
      <Button v-if="auth_store.is_admin" variant="primary" :loading="updating" @click="update_bot">
        <Icon icon="lucide:download" width="15" />
        立即更新
      </Button>
    </div>
  </Dialog>
</template>

<style scoped>
.update-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: var(--text-sm);
}

.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
