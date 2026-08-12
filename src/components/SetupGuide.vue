<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useAdapterStore } from '@/stores/adapter'
import { useStatusStore } from '@/stores/status'
import { use_toast } from '@/composables/use_toast'
import Badge from '@/components/ui/Badge.vue'
import Progress from '@/components/ui/Progress.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'

const router = useRouter()
const config_store = useConfigStore()
const adapter_store = useAdapterStore()
const status_store = useStatusStore()
const toast = use_toast()
const { status } = storeToRefs(status_store)
const { env_values } = storeToRefs(config_store)

/** 引导数据加载中，避免初次渲染时步骤状态闪烁 */
const ready = ref(false)

/** 令牌授权提示框状态 */
const token_dialog_open = ref(false)
const token_loading = ref(false)
const token_value = ref('')

async function open_token_dialog() {
  token_dialog_open.value = true
  token_value.value = ''
  token_loading.value = true
  try {
    token_value.value = await status_store.fetch_token()
  } catch (error) {
    toast.error(error.message || '获取认证令牌失败')
  } finally {
    token_loading.value = false
  }
}

async function copy_token() {
  if (!token_value.value) return
  try {
    await navigator.clipboard.writeText(token_value.value)
    toast.success('认证令牌已复制')
  } catch {
    toast.error('复制失败，请手动选择复制')
  }
}

/** 已加载的聊天平台适配器（排除 Minecraft 适配器） */
const chat_ready = computed(() => {
  const adapters = status.value?.adapters || []
  return adapters.some((name) => name !== 'nonebot.adapters.minecraft')
})

/** 已接入 Minecraft 服务器（有在线服务器，或已配置 WS 地址） */
const server_ready = computed(() => {
  if (Number(status.value?.servers_online || 0) > 0) return true
  const value = env_values.value?.MINECRAFT_WS_URLS
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
})

/** 引导折叠状态，持久化到 localStorage */
const collapsed_key = 'unibot_setup_guide_collapsed'
const collapsed = ref(localStorage.getItem(collapsed_key) === '1')

function toggle_collapsed() {
  collapsed.value = !collapsed.value
  localStorage.setItem(collapsed_key, collapsed.value ? '1' : '0')
}

/** 已配置超级用户（SUPERUSERS 非空） */
const superuser_ready = computed(() => {
  const value = env_values.value?.SUPERUSERS
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
})

const steps = computed(() => [
  {
    key: 'chat',
    title: '连接聊天平台',
    description: '安装并启用 QQ / Telegram 等平台适配器',
    icon: 'lucide:message-circle',
    done: chat_ready.value,
    target: { path: '/adapters' },
  },
  {
    key: 'server',
    title: '接入 Minecraft 服务器',
    description: '安装鹊桥插件接入服务器，双方任一方主动连接均可',
    icon: 'lucide:server',
    action_label: '查看文档',
    done: server_ready.value,
    target: 'https://bot.mcjpg.dev/queqiao/',
  },
  {
    key: 'superuser',
    title: '添加超级用户',
    description: '设置管理员，获得管理命令权限',
    icon: 'lucide:shield',
    action_label: '令牌授权',
    done: superuser_ready.value,
    target: { name: 'ConfigView', query: { tab: 'env', group: '框架' } },
  },
])

const done_count = computed(() => steps.value.filter((step) => step.done).length)
const all_done = computed(() => steps.value.length > 0 && done_count.value === steps.value.length)

function go(step) {
  if (step.key === 'superuser') {
    open_token_dialog()
    return
  }
  if (typeof step.target === 'string') {
    window.open(step.target, '_blank', 'noopener')
    return
  }
  router.push(step.target)
}

onMounted(async () => {
  await Promise.allSettled([
    config_store.fetch_env(),
    adapter_store.fetch_all(),
    status_store.fetch_status(),
  ])
  ready.value = true
})
</script>

<template>
  <div>
    <section v-if="ready && !all_done" class="setup-guide card">
      <div class="setup-head">
        <div class="setup-title">
          <span class="setup-icon"><Icon icon="lucide:rocket" width="16" /></span>
          <div>
            <h3 class="card-title">快速开始</h3>
            <p class="setup-desc">完成以下步骤即可让机器人跑起来</p>
          </div>
        </div>
        <div class="setup-actions">
          <div class="setup-progress">
            <span class="setup-count mono">{{ done_count }} / {{ steps.length }}</span>
            <Progress v-if="!collapsed" :value="done_count" :max="steps.length" class="setup-bar" />
          </div>
          <button
            class="setup-collapse"
            type="button"
            :title="collapsed ? '展开引导' : '收起引导'"
            @click="toggle_collapsed"
          >
            <Icon :icon="collapsed ? 'lucide:chevron-down' : 'lucide:chevron-up'" width="16" />
          </button>
        </div>
      </div>

      <ol v-if="!collapsed" class="setup-steps">
        <li
          v-for="step in steps"
          :key="step.key"
          class="setup-step"
          :class="{ 'setup-step--done': step.done }"
          @click="go(step)"
        >
          <span class="setup-step-index">
            <Icon v-if="step.done" icon="lucide:check" width="13" />
            <Icon v-else :icon="step.icon" width="15" />
          </span>
          <div class="setup-step-body">
            <span class="setup-step-title">{{ step.title }}</span>
            <span class="setup-step-desc">{{ step.description }}</span>
          </div>
          <Badge :variant="step.done ? 'success' : 'neutral'">
            {{ step.done ? '已完成' : step.action_label || '去配置' }}
          </Badge>
          <Icon icon="lucide:chevron-right" width="14" class="setup-arrow" />
        </li>
      </ol>
    </section>

    <Dialog
      v-model="token_dialog_open"
      title="令牌快速授权"
      description="在任意平台的群聊中发送下方认证令牌，即可自动完成初始化：本群加入消息群与指令群，发送者成为超级用户。"
      :hide-footer="true"
      width="min(520px, calc(100vw - 32px))"
    >
      <div class="token-guide">
        <ol class="token-steps">
          <li>复制下方认证令牌；</li>
          <li>在需要授权的平台群聊中发送该令牌；</li>
          <li>机器人自动把本群加入消息群 / 指令群，并把发送者设为超级用户。</li>
        </ol>

        <div class="token-box">
          <div v-if="token_loading" class="token-loading"><Spinner :size="16" /> 获取令牌中…</div>
          <template v-else>
            <code class="token-value mono">{{ token_value || '暂未生成令牌' }}</code>
            <Button variant="secondary" size="sm" :disabled="!token_value" @click="copy_token">
              <Icon icon="lucide:copy" width="14" />
              复制
            </Button>
          </template>
        </div>

        <p class="token-tip">
          令牌即用即刷：使用一次后立即刷新，旧令牌自动作废；机器人启动时也会在控制台打印。
        </p>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.setup-guide {
  padding: var(--space-5);
  margin-bottom: var(--space-5);
}

.setup-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.setup-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.setup-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.setup-desc {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.setup-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.setup-progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.setup-count {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.setup-bar {
  width: 120px;
}

.setup-collapse {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    border-color var(--transition),
    color var(--transition);
}

.setup-collapse:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* 步骤列表 */
.setup-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin-top: var(--space-4);
  list-style: none;
  padding: 0;
}

.setup-step {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  cursor: pointer;
  transition:
    border-color var(--transition),
    background-color var(--transition);
}

.setup-step:hover {
  border-color: var(--accent);
  background: var(--surface);
}

.setup-step--done {
  background: var(--success-soft);
  border-color: color-mix(in srgb, var(--success) 35%, transparent);
}

.setup-step--done:hover {
  border-color: var(--success);
}

.setup-step-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--border);
  color: var(--text-muted);
  flex-shrink: 0;
}

.setup-step--done .setup-step-index {
  background: var(--success);
  color: #fff;
}

.setup-step-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setup-step-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.setup-step-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.setup-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 令牌授权提示框 */
.token-guide {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.token-steps {
  margin: 0;
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.token-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

.token-loading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.token-value {
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--accent);
  word-break: break-all;
}

.token-tip {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.6;
}
</style>
