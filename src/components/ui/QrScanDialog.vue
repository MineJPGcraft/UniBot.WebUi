<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import Dialog from './Dialog.vue'
import Button from './Button.vue'
import Spinner from './Spinner.vue'
import { use_qq_qr_connect, QR_LOGIN_STATE } from '@/composables/use_qq_qr_connect'

const { t } = useI18n()

const props = defineProps({
  /** 弹窗开关 */
  open: { type: Boolean, default: false },
  /** 接入平台标识 */
  source: { type: String, default: '' },
})

const emit = defineEmits(['update:open', 'success'])

const { creating, polling, login, start_login, poll_login, cancel_login } = use_qq_qr_connect()

const error_message = ref('')
let poll_task = null

/** 当前登录是否处于可展示二维码的状态 */
const show_qr = ref(false)

watch(
  () => props.open,
  async (is_open) => {
    if (is_open) {
      await start_scan()
    } else {
      await stop_scan()
    }
  },
)

onUnmounted(() => {
  stop_scan()
})

async function start_scan() {
  error_message.value = ''
  show_qr.value = false
  try {
    await start_login({ source: props.source })
    show_qr.value = true
    // 后台轮询，直到终态
    poll_task = poll_until_done()
  } catch (error) {
    error_message.value = error.message || t('ui.qr_start_failed')
  }
}

async function poll_until_done() {
  try {
    const result = await poll_login()
    if (result.state === QR_LOGIN_STATE.COMPLETED) {
      emit('success', {
        app_id: result.app_id,
        app_secret: result.app_secret,
        user_openid: result.user_openid,
      })
      emit('update:open', false)
    } else if (result.state === QR_LOGIN_STATE.FAILED) {
      error_message.value = result.error || t('ui.qr_login_failed')
    } else if (result.state === QR_LOGIN_STATE.CANCELLED) {
      // 用户主动取消，静默关闭
    }
  } catch (error) {
    error_message.value = error.message || t('ui.qr_poll_timeout')
  }
}

async function stop_scan() {
  if (poll_task) {
    // 轮询任务由 poll_login 内部循环，取消登录后轮询会因 404 结束
    poll_task = null
  }
  await cancel_login()
  login.value = null
  show_qr.value = false
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="open"
    :title="t('ui.qr_title')"
    :description="t('ui.qr_description')"
    :hide-footer="true"
    width="min(360px, calc(100vw - 32px))"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="qr-scan">
      <div v-if="creating" class="qr-scan__loading">
        <Spinner :size="20" />
        <span>{{ t('ui.qr_generating') }}</span>
      </div>

      <template v-else-if="show_qr && login?.qr_image">
        <img :src="login.qr_image" :alt="t('ui.qr_image_alt')" class="qr-scan__image" />
        <p class="qr-scan__hint">
          <Icon icon="lucide:smartphone" width="14" />
          {{ t('ui.qr_scan_hint') }}
        </p>
        <p v-if="polling" class="qr-scan__status">
          <Spinner :size="12" />
          {{ t('ui.qr_waiting_confirm') }}
        </p>
      </template>

      <div v-if="error_message" class="qr-scan__error">
        <Icon icon="lucide:alert-circle" width="16" />
        {{ error_message }}
      </div>

      <div class="qr-scan__footer">
        <Button variant="ghost" size="sm" @click="close">{{ t('common.close') }}</Button>
        <Button
          v-if="error_message"
          variant="secondary"
          size="sm"
          :loading="creating"
          @click="start_scan"
        >
          {{ t('ui.qr_regenerate') }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.qr-scan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.qr-scan__loading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.qr-scan__image {
  width: 220px;
  height: 220px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-2);
  background: #ffffff;
}

.qr-scan__hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.qr-scan__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.qr-scan__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.qr-scan__footer {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
}
</style>
