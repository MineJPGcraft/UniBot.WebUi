<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Dialog from './Dialog.vue'
import Button from './Button.vue'
import Spinner from './Spinner.vue'
import { use_qq_qr_connect, QR_LOGIN_STATE } from '@/composables/use_qq_qr_connect'

const props = defineProps({
  /** 弹窗开关 */
  open: { type: Boolean, default: false },
  /** 扫码成功后的回调：接收 { app_id, app_secret, user_openid } */
  on_success: { type: Function, default: null },
  /** 接入平台标识 */
  source: { type: String, default: '' },
})

const emit = defineEmits(['update:open'])

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
    error_message.value = error.message || '启动扫码登录失败'
  }
}

async function poll_until_done() {
  try {
    const result = await poll_login()
    if (result.state === QR_LOGIN_STATE.COMPLETED) {
      if (props.on_success) {
        props.on_success({
          app_id: result.app_id,
          app_secret: result.app_secret,
          user_openid: result.user_openid,
        })
      }
      emit('update:open', false)
    } else if (result.state === QR_LOGIN_STATE.FAILED) {
      error_message.value = result.error || '扫码失败'
    } else if (result.state === QR_LOGIN_STATE.CANCELLED) {
      // 用户主动取消，静默关闭
    }
  } catch (error) {
    error_message.value = error.message || '扫码等待超时'
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
    title="QQ 扫码绑定"
    description="使用手机 QQ 扫描下方二维码，确认后自动填充 AppID 与 Secret"
    :hide-footer="true"
    width="min(360px, calc(100vw - 32px))"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="qr-scan">
      <div v-if="creating" class="qr-scan__loading">
        <Spinner :size="20" />
        <span>正在生成二维码…</span>
      </div>

      <template v-else-if="show_qr && login?.qr_image">
        <img :src="login.qr_image" alt="QQ 扫码二维码" class="qr-scan__image" />
        <p class="qr-scan__hint">
          <Icon icon="lucide:smartphone" width="14" />
          打开手机 QQ，使用「扫一扫」扫描二维码
        </p>
        <p v-if="polling" class="qr-scan__status">
          <Spinner :size="12" />
          等待扫码确认…
        </p>
      </template>

      <div v-if="error_message" class="qr-scan__error">
        <Icon icon="lucide:alert-circle" width="16" />
        {{ error_message }}
      </div>

      <div class="qr-scan__footer">
        <Button variant="ghost" size="sm" @click="close">关闭</Button>
        <Button
          v-if="error_message"
          variant="secondary"
          size="sm"
          :loading="creating"
          @click="start_scan"
        >
          重新生成
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
