<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useServerStore } from '@/stores/server'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import { use_websocket } from '@/composables/use_websocket'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { server_type_icon, server_type_label } from '@/utils/server'
import { format_mb } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const server_store = useServerStore()
const auth_store = useAuthStore()
const toast = use_toast()
const { on_event } = use_websocket()

const server_name = computed(() => route.params.name)

const detail = ref(null)
const player_list = ref([])
const loading = ref(true)
const executing = ref(false)

// 终端：[{ kind: 'command' | 'response' | 'error', text, time }]
const terminal_lines = ref([])
const command_input = ref('')
const command_history = ref([])
const history_index = ref(-1)
const terminal_ref = ref(null)

let unsubscribe_player = null

const player_percent = computed(() => {
  if (!detail.value?.max_players) return 0
  return (detail.value.players / detail.value.max_players) * 100
})

const now_time = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

function push_line(kind, text) {
  terminal_lines.value.push({ kind, text, time: now_time() })
  nextTick(() => {
    if (terminal_ref.value) {
      terminal_ref.value.scrollTop = terminal_ref.value.scrollHeight
    }
  })
}

onMounted(async () => {
  await refresh()
  unsubscribe_player = on_event('player', (data) => {
    if (data.server !== server_name.value) return
    if (data.event === 'join') {
      if (!player_list.value.includes(data.player)) player_list.value.push(data.player)
      push_line('response', `玩家 ${data.player} 加入了服务器`)
    } else if (data.event === 'leave') {
      player_list.value = player_list.value.filter((name) => name !== data.player)
      push_line('response', `玩家 ${data.player} 离开了服务器`)
    }
  })
})

onUnmounted(() => {
  unsubscribe_player?.()
})

async function refresh() {
  loading.value = true
  try {
    const [detail_data, players_data] = await Promise.all([
      server_store.fetch_server_detail(server_name.value),
      server_store.fetch_server_players(server_name.value),
    ])
    detail.value = detail_data
    player_list.value = players_data.players || []
  } catch (error) {
    toast.error(error.message || '获取服务器信息失败')
  } finally {
    loading.value = false
  }
}

async function run_command() {
  const command = command_input.value.trim()
  if (!command || executing.value) return

  push_line('command', command)
  command_history.value.unshift(command)
  history_index.value = -1
  command_input.value = ''
  executing.value = true

  try {
    const data = await server_store.execute_command(server_name.value, command)
    push_line('response', data?.response || '(无响应)')
  } catch (error) {
    push_line('error', error.message || '指令执行失败')
  } finally {
    executing.value = false
  }
}

function handle_command_keydown(event) {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (command_history.value.length > 0) {
      history_index.value = Math.min(history_index.value + 1, command_history.value.length - 1)
      command_input.value = command_history.value[history_index.value]
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (history_index.value > 0) {
      history_index.value -= 1
      command_input.value = command_history.value[history_index.value]
    } else {
      history_index.value = -1
      command_input.value = ''
    }
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <button class="back-link" @click="router.push('/servers')">
          <Icon icon="lucide:arrow-left" width="14" />
          返回服务器列表
        </button>
        <h1 class="page-title server-title">
          <Icon
            class="server-type-icon"
            :icon="server_type_icon(detail?.server_type)"
            width="18"
            :title="server_type_label(detail?.server_type)"
          />
          <span class="server-dot" :class="detail?.online ? 'server-dot--on' : 'server-dot--off'" />
          {{ server_name }}
        </h1>
        <p class="page-desc">{{ detail?.motd || '—' }}</p>
      </div>
      <div class="page-actions">
        <Badge v-if="detail" :variant="detail.online ? 'success' : 'neutral'">
          {{ detail.online ? '在线' : '离线' }}
        </Badge>
        <Button variant="secondary" icon-only @click="refresh">
          <Icon icon="lucide:refresh-cw" width="15" />
        </Button>
      </div>
    </div>

    <div v-if="loading && !detail" class="card">
      <div class="loading-block"><Spinner :size="18" /> 加载中…</div>
    </div>

    <template v-else>
      <!-- 信息条 -->
      <section class="info-strip card">
        <div class="info-cell">
          <span class="info-label">类型</span>
          <span class="info-value">
            <Icon :icon="server_type_icon(detail?.server_type)" width="14" />
            {{ server_type_label(detail?.server_type) }}
          </span>
        </div>
        <div class="info-cell">
          <span class="info-label">版本</span>
          <span class="info-value mono">{{ detail?.version || '—' }}</span>
        </div>
        <div class="info-cell">
          <span class="info-label">CPU 负载</span>
          <span class="info-value mono">{{ detail?.cpu_load ?? '—' }}%</span>
        </div>
        <div class="info-cell">
          <span class="info-label">系统内存</span>
          <span class="info-value mono">{{ detail?.memory_percent ?? '—' }}%</span>
        </div>
        <div class="info-cell">
          <span class="info-label">JVM 内存</span>
          <span class="info-value mono"
            >{{ format_mb(detail?.jvm_memory_used) }} /
            {{ format_mb(detail?.jvm_memory_max) }}</span
          >
        </div>
        <div class="info-cell info-cell--grow">
          <span class="info-label"
            >玩家 {{ detail?.players ?? 0 }} / {{ detail?.max_players ?? 0 }}</span
          >
          <Progress :value="player_percent" />
        </div>
      </section>

      <div class="detail-grid">
        <!-- 在线玩家 -->
        <section class="card">
          <div class="card-header">
            <h3 class="card-title">在线玩家</h3>
            <Badge variant="accent">{{ player_list.length }}</Badge>
          </div>
          <div class="player-panel">
            <EmptyState v-if="player_list.length === 0" icon="lucide:user-x" title="暂无在线玩家" />
            <ul v-else class="player-list">
              <li v-for="player in player_list" :key="player" class="player-item">
                <img
                  class="player-head"
                  :src="`https://mc-heads.net/avatar/${encodeURIComponent(player)}/24`"
                  alt=""
                  loading="lazy"
                  referrerpolicy="no-referrer"
                />
                <span class="player-name mono">{{ player }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- RCON 终端 -->
        <section class="card">
          <div class="card-header">
            <h3 class="card-title">指令终端</h3>
            <span class="text-xs text-muted">↑ / ↓ 切换历史指令</span>
          </div>
          <div ref="terminal_ref" class="terminal">
            <div v-if="terminal_lines.length === 0" class="terminal-empty">
              在下方输入指令并回车执行
            </div>
            <div
              v-for="(line, index) in terminal_lines"
              :key="index"
              class="terminal-line"
              :class="`terminal-line--${line.kind}`"
            >
              <span class="terminal-time">{{ line.time }}</span>
              <span class="terminal-prefix">{{ line.kind === 'command' ? '>' : '·' }}</span>
              <span class="terminal-text">{{ line.text }}</span>
            </div>
          </div>
          <form class="terminal-input" @submit.prevent="run_command">
            <span class="terminal-prompt mono">&gt;</span>
            <input
              v-model="command_input"
              class="mono"
              placeholder="如：list、say hello"
              :disabled="!auth_store.is_operator"
              @keydown="handle_command_keydown"
            />
            <Button
              variant="primary"
              size="sm"
              type="submit"
              :loading="executing"
              :disabled="!auth_store.is_operator"
            >
              执行
            </Button>
          </form>
          <p v-if="!auth_store.is_operator" class="terminal-tip">
            当前角色无执行权限，需操作员及以上角色
          </p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
  transition: color var(--transition);
}

.back-link:hover {
  color: var(--accent);
}

.server-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.server-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.server-type-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.info-value {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-md);
  font-weight: 600;
}

.server-dot--on {
  background: var(--success);
}

.server-dot--off {
  background: var(--border-strong);
}

/* 信息条 */
.info-strip {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-5);
}

.info-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.info-cell--grow {
  flex: 1;
}

.info-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.detail-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-5);
  align-items: start;
}

/* 玩家列表 */
.player-panel {
  max-height: 420px;
  overflow-y: auto;
}

.player-list {
  padding: var(--space-2);
}

.player-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  transition: background-color var(--transition);
}

.player-item:hover {
  background: var(--surface-sunken);
}

.player-head {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  image-rendering: pixelated;
  background: var(--surface-sunken);
}

.player-name {
  font-size: var(--text-sm);
}

/* 终端 */
.terminal {
  height: 340px;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
  background: #18181b;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.8;
}

.terminal-empty {
  color: #71717a;
  text-align: center;
  padding: var(--space-6);
}

.terminal-line {
  display: flex;
  gap: var(--space-2);
}

.terminal-time {
  color: #52525b;
  flex-shrink: 0;
}

.terminal-prefix {
  flex-shrink: 0;
}

.terminal-line--command .terminal-prefix,
.terminal-line--command .terminal-text {
  color: #a1c4ff;
}

.terminal-line--response .terminal-prefix,
.terminal-line--response .terminal-text {
  color: #d4d4d8;
}

.terminal-line--error .terminal-prefix,
.terminal-line--error .terminal-text {
  color: #f87171;
}

.terminal-input {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border);
  background: var(--surface-sunken);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}

.terminal-prompt {
  color: var(--accent);
  font-weight: 700;
}

.terminal-input input {
  flex: 1;
  height: 30px;
  border: none;
  background: transparent;
  font-size: var(--text-sm);
  outline: none;
}

.terminal-input input:disabled {
  cursor: not-allowed;
}

.terminal-tip {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
