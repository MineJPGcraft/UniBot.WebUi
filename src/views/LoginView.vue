<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import { use_async_action } from '@/composables/use_async_action'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'

const router = useRouter()
const auth_store = useAuthStore()
const toast = use_toast()
const { run } = use_async_action()

// null 探测中 | 'login' | 'setup'
const mode = ref(null)
const submitting = ref(false)

const login_form = ref({ username: '', password: '' })
const setup_form = ref({ username: '', password: '', confirm_password: '', nickname: '管理员' })

onMounted(async () => {
  // 已有有效 token 则直接进入
  if (auth_store.is_logged_in) {
    try {
      await auth_store.fetch_me()
      router.replace('/')
      return
    } catch {
      // token 失效，继续走登录流程
    }
  }
  // 探测后端是否已存在账户：已初始化只允许登录，否则自动进入初始化向导
  try {
    const initialized = await auth_store.fetch_auth_status()
    mode.value = initialized ? 'login' : 'setup'
  } catch {
    // 探测失败时保守处理，仅展示登录表单
    mode.value = 'login'
  }
})

async function handle_login() {
  if (!login_form.value.username || !login_form.value.password) {
    toast.error('请输入用户名和密码')
    return
  }
  const ok = await run(
    () => auth_store.login(login_form.value.username, login_form.value.password),
    '登录失败',
    submitting,
  )
  if (ok) {
    toast.success('登录成功')
    router.push('/')
  }
}

async function handle_setup() {
  const { username, password, confirm_password, nickname } = setup_form.value
  if (!username || !password) {
    toast.error('请填写用户名和密码')
    return
  }
  if (password.length < 6) {
    toast.error('密码至少 6 位')
    return
  }
  if (password !== confirm_password) {
    toast.error('两次输入的密码不一致')
    return
  }
  const ok = await run(
    () => auth_store.setup(username, password, nickname || '管理员'),
    '初始化失败',
    submitting,
  )
  // 无论成败都回到登录表单：失败时后端可能检测到已有账户（如并发创建）
  mode.value = 'login'
  if (ok) {
    toast.success('初始化成功，请登录')
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-panel">
      <div class="login-brand">
        <div class="login-logo">
          <Icon icon="lucide:bot" width="26" />
        </div>
        <h1 class="login-title">UniBot</h1>
        <p class="login-subtitle">Minecraft 群管机器人 · 控制面板</p>
      </div>

      <!-- 探测中 -->
      <div v-if="mode === null" class="loading-block">
        <Spinner :size="16" />
        正在连接服务…
      </div>

      <!-- 登录 -->
      <form v-else-if="mode === 'login'" class="login-form" @submit.prevent="handle_login">
        <div class="form-row">
          <label class="form-label" for="login-username">用户名</label>
          <Input
            id="login-username"
            v-model="login_form.username"
            placeholder="请输入用户名"
            autocomplete="username"
          />
        </div>
        <div class="form-row">
          <label class="form-label" for="login-password">密码</label>
          <Input
            id="login-password"
            v-model="login_form.password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </div>
        <Button variant="primary" type="submit" :loading="submitting" class="login-submit">
          登 录
        </Button>
      </form>

      <!-- 首次初始化 -->
      <form v-else class="login-form" @submit.prevent="handle_setup">
        <div class="setup-notice">
          <Icon icon="lucide:sparkles" width="15" />
          尚未创建任何账户，请先初始化管理员
        </div>
        <div class="form-row">
          <label class="form-label" for="setup-username">用户名</label>
          <Input id="setup-username" v-model="setup_form.username" placeholder="如 admin" />
        </div>
        <div class="form-row">
          <label class="form-label" for="setup-nickname">昵称</label>
          <Input id="setup-nickname" v-model="setup_form.nickname" placeholder="管理员" />
        </div>
        <div class="form-row">
          <label class="form-label" for="setup-password">密码</label>
          <Input
            id="setup-password"
            v-model="setup_form.password"
            type="password"
            placeholder="至少 6 位"
          />
        </div>
        <div class="form-row">
          <label class="form-label" for="setup-confirm">确认密码</label>
          <Input
            id="setup-confirm"
            v-model="setup_form.confirm_password"
            type="password"
            placeholder="再次输入密码"
          />
        </div>
        <Button variant="primary" type="submit" :loading="submitting" class="login-submit">
          创建管理员
        </Button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--space-4);
  background:
    radial-gradient(circle at 20% 20%, var(--accent-soft) 0%, transparent 45%),
    radial-gradient(circle at 85% 80%, var(--success-soft) 0%, transparent 40%), var(--bg);
}

.login-panel {
  width: min(400px, 100%);
  padding: var(--space-8) var(--space-6);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--space-6);
}

.login-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-lg);
  background: var(--accent);
  color: #ffffff;
  margin-bottom: var(--space-3);
}

.login-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.login-subtitle {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.login-submit {
  margin-top: var(--space-2);
  height: 38px;
}

.setup-notice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: var(--radius);
  font-size: var(--text-sm);
}
</style>
