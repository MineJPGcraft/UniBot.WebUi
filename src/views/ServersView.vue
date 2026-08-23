<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useServerStore } from '@/stores/server'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import { use_async_action } from '@/composables/use_async_action'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Textarea from '@/components/ui/Textarea.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { server_type_icon, server_type_label } from '@/utils/server'

const router = useRouter()
const server_store = useServerStore()
const auth_store = useAuthStore()
const toast = use_toast()
const { run } = use_async_action()
const { server_list, loading } = storeToRefs(server_store)

const online_count = computed(() => server_list.value.filter((server) => server.online).length)

const broadcast_open = ref(false)
const broadcast_message = ref('')
const broadcasting = ref(false)

onMounted(() => {
  refresh()
})

async function refresh() {
  await run(() => server_store.fetch_server_list(), '获取服务器列表失败')
}

async function submit_broadcast() {
  if (!broadcast_message.value.trim()) {
    toast.error('请输入广播消息')
    return
  }
  const ok = await run(
    () => server_store.broadcast_message(broadcast_message.value.trim()),
    '广播失败',
    broadcasting,
  )
  if (ok) {
    toast.success('广播已发送')
    broadcast_message.value = ''
    broadcast_open.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">服务器管理</h1>
        <p class="page-desc">共 {{ server_list.length }} 台服务器 · {{ online_count }} 台在线</p>
      </div>
      <div class="page-actions">
        <Button v-if="auth_store.is_operator" variant="secondary" @click="broadcast_open = true">
          <Icon icon="lucide:megaphone" width="15" />
          广播消息
        </Button>
        <Button variant="secondary" icon-only @click="refresh">
          <Icon icon="lucide:refresh-cw" width="15" />
        </Button>
      </div>
    </div>

    <div v-if="loading && server_list.length === 0" class="card">
      <div class="loading-block"><Spinner :size="18" /> 加载中…</div>
    </div>

    <div v-else-if="server_list.length === 0" class="card">
      <EmptyState
        icon="lucide:server-off"
        title="暂无服务器"
        description="尚未有 Minecraft 服务器连接到机器人，请在后端配置 MINECRAFT_WS_URLS"
      />
    </div>

    <div v-else class="server-grid">
      <article
        v-for="server in server_list"
        :key="server.name"
        class="server-card card"
        @click="router.push(`/servers/${server.name}`)"
      >
        <div class="server-card-head">
          <div class="server-card-name">
            <Icon
              class="server-type-icon"
              :icon="server_type_icon(server.server_type)"
              width="16"
              :title="server_type_label(server.server_type)"
            />
            <span
              class="server-dot"
              :class="server.online ? 'server-dot--on' : 'server-dot--off'"
            />
            <h3>{{ server.name }}</h3>
          </div>
          <Badge :variant="server.online ? 'success' : 'neutral'">
            {{ server.online ? '在线' : '离线' }}
          </Badge>
        </div>

        <p class="server-card-motd">{{ server.motd || '暂无 MOTD' }}</p>

        <div class="server-card-stats">
          <div class="server-stat">
            <Icon icon="lucide:users" width="14" />
            <span>{{ server.players }} / {{ server.max_players }}</span>
          </div>
          <div class="server-stat">
            <Icon icon="lucide:gamepad-2" width="14" />
            <span>{{ server.version || '—' }}</span>
          </div>
          <div class="server-stat">
            <Icon icon="lucide:cpu" width="14" />
            <span>CPU {{ server.cpu_load ?? '—' }}%</span>
          </div>
          <div class="server-stat">
            <Icon icon="lucide:hard-drive" width="14" />
            <span>内存 {{ server.memory_percent ?? '—' }}%</span>
          </div>
        </div>
      </article>
    </div>

    <Dialog
      v-model="broadcast_open"
      title="广播消息"
      description="向所有在线服务器发送一条广播消息"
      confirm-text="发送"
      :loading="broadcasting"
      @confirm="submit_broadcast"
    >
      <div class="form-row">
        <label class="form-label">消息内容</label>
        <Textarea
          v-model="broadcast_message"
          placeholder="如：服务器将于 10 分钟后重启"
          :rows="4"
        />
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.server-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

.server-card {
  padding: var(--space-5);
  cursor: pointer;
  transition:
    border-color var(--transition),
    box-shadow var(--transition),
    transform var(--transition);
}

.server-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.server-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.server-card-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.server-card-name h3 {
  font-size: var(--text-md);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.server-type-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.server-dot--on {
  background: var(--success);
}

.server-dot--off {
  background: var(--border-strong);
}

.server-card-motd {
  margin: var(--space-3) 0 var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-muted);
  min-height: 20px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.server-card-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.server-stat {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.server-stat .text-muted,
.server-stat svg {
  color: var(--text-muted);
}
</style>
