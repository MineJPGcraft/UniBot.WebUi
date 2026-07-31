<script setup>
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Pagination from '@/components/ui/Pagination.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'

const player_store = usePlayerStore()
const auth_store = useAuthStore()
const toast = use_toast()
const { binding_list, total, page, page_size, keyword, loading } = storeToRefs(player_store)

const search_text = ref('')

// 新增绑定
const bind_open = ref(false)
const bind_form = ref({ user: '', player: '' })
const binding = ref(false)

// 解绑确认
const unbind_target = ref(null) // { user, player }
const unbinding = ref(false)

onMounted(() => {
  refresh()
})

async function refresh() {
  try {
    await player_store.fetch_bindings()
  } catch (error) {
    toast.error(error.message || '获取绑定列表失败')
  }
}

function handle_search() {
  player_store.set_keyword(search_text.value.trim())
  refresh()
}

function handle_page_change(target_page) {
  player_store.set_page(target_page)
  refresh()
}

async function submit_bind() {
  const { user, player } = bind_form.value
  if (!user.trim() || !player.trim()) {
    toast.error('请填写 QQ 号和游戏 ID')
    return
  }
  binding.value = true
  try {
    await player_store.bind_player(user.trim(), player.trim())
    toast.success('绑定成功')
    bind_form.value = { user: '', player: '' }
    bind_open.value = false
  } catch (error) {
    toast.error(error.message || '绑定失败')
  } finally {
    binding.value = false
  }
}

function confirm_unbind(user, player) {
  unbind_target.value = { user, player }
}

async function submit_unbind() {
  if (!unbind_target.value) return
  unbinding.value = true
  try {
    await player_store.unbind_player(unbind_target.value.user, unbind_target.value.player)
    toast.success('已解除绑定')
    unbind_target.value = null
  } catch (error) {
    toast.error(error.message || '解绑失败')
  } finally {
    unbinding.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">玩家绑定</h1>
        <p class="page-desc">管理 QQ 用户与游戏 ID 的绑定关系</p>
      </div>
      <div class="page-actions">
        <Button v-if="auth_store.is_operator" variant="primary" @click="bind_open = true">
          <Icon icon="lucide:link" width="15" />
          新增绑定
        </Button>
      </div>
    </div>

    <section class="card">
      <div class="table-toolbar">
        <form class="search-box" @submit.prevent="handle_search">
          <Icon icon="lucide:search" width="15" class="search-icon" />
          <Input
            v-model="search_text"
            placeholder="搜索 QQ 号或游戏 ID…"
            @keydown.enter="handle_search"
          />
        </form>
        <Button variant="secondary" icon-only @click="refresh">
          <Icon icon="lucide:refresh-cw" width="15" />
        </Button>
      </div>

      <div v-if="loading && binding_list.length === 0" class="loading-block">
        <Spinner :size="18" /> 加载中…
      </div>

      <EmptyState
        v-else-if="binding_list.length === 0"
        icon="lucide:users"
        title="暂无绑定记录"
        :description="keyword ? `没有匹配 “${keyword}” 的记录` : '还没有用户绑定游戏 ID'"
      />

      <table v-else class="ui-table">
        <thead>
          <tr>
            <th>QQ 用户</th>
            <th>绑定的游戏 ID</th>
            <th>绑定时间</th>
            <th v-if="auth_store.is_operator" class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="binding in binding_list" :key="binding.user">
            <td>
              <span class="mono">{{ binding.user }}</span>
            </td>
            <td>
              <div class="player-tags">
                <span v-for="player in binding.players" :key="player" class="player-tag">
                  <span class="player-head-wrap">
                    <img
                      class="player-head"
                      :src="`/webui/api/players/${encodeURIComponent(player)}/avatar`"
                      alt=""
                      loading="lazy"
                      @error="(e) => (e.target.style.display = 'none')"
                    />
                    <span class="player-head-fallback">{{ player.slice(0, 1).toUpperCase() }}</span>
                  </span>
                  {{ player }}
                  <button
                    v-if="auth_store.is_operator"
                    class="tag-remove"
                    title="解除绑定"
                    @click="confirm_unbind(binding.user, player)"
                  >
                    <Icon icon="lucide:x" width="11" />
                  </button>
                </span>
              </div>
            </td>
            <td class="text-muted">{{ binding.bound_at || '—' }}</td>
            <td v-if="auth_store.is_operator" class="col-actions">
              <Button
                variant="ghost"
                size="sm"
                class="text-danger"
                @click="confirm_unbind(binding.user, binding.players[0])"
              >
                解绑
              </Button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="total > 0" class="table-footer">
        <Pagination
          :page="page"
          :page-size="page_size"
          :total="total"
          @page-change="handle_page_change"
        />
      </div>
    </section>

    <!-- 新增绑定 -->
    <Dialog
      v-model="bind_open"
      title="新增绑定"
      description="将 QQ 用户与游戏 ID 关联起来"
      confirm-text="绑定"
      :loading="binding"
      @confirm="submit_bind"
    >
      <div class="form-row">
        <label class="form-label">QQ 号</label>
        <Input v-model="bind_form.user" placeholder="如 123456789" />
      </div>
      <div class="form-row">
        <label class="form-label">游戏 ID</label>
        <Input v-model="bind_form.player" placeholder="如 Steve" />
      </div>
    </Dialog>

    <!-- 解绑确认 -->
    <Dialog
      :model-value="Boolean(unbind_target)"
      title="解除绑定"
      :description="`确定要解除 ${unbind_target?.user} 与 ${unbind_target?.player} 的绑定吗？`"
      confirm-text="解除"
      confirm-variant="danger"
      :loading="unbinding"
      @update:model-value="(open) => !open && (unbind_target = null)"
      @confirm="submit_unbind"
    />
  </div>
</template>

<style scoped>
.table-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.search-box {
  position: relative;
  width: 280px;
}

.search-box .search-icon {
  position: absolute;
  left: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-box :deep(.ui-input) {
  padding-left: var(--space-8);
}

.col-actions {
  text-align: right;
  width: 100px;
}

.player-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.player-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2) 2px 4px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}

.player-head-wrap {
  position: relative;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.player-head {
  position: relative;
  z-index: 1;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  image-rendering: pixelated;
  background: var(--surface-sunken);
}

.player-head-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-sunken);
  border-radius: 3px;
}

.tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  color: var(--text-muted);
  transition:
    background-color var(--transition),
    color var(--transition);
}

.tag-remove:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border);
}
</style>
