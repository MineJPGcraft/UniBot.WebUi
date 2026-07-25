<script setup>
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useAdapterStore } from '@/stores/adapter'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Spinner from '@/components/ui/Spinner.vue'

const adapter_store = useAdapterStore()
const auth_store = useAuthStore()
const toast = use_toast()
const { registered_list, catalog, loading } = storeToRefs(adapter_store)

const installing_adapter = ref('')
const removing_adapter = ref('')
const remove_dialog_open = ref(false)
const pending_removal = ref(null)
const remove_dependency = ref(false)

const adapter_items = computed(() => {
  const catalog_modules = new Set(catalog.value.map((adapter) => adapter.module_name))
  const custom_adapters = registered_list.value
    .filter((adapter) => !catalog_modules.has(adapter.module_name))
    .map((adapter) => ({
      id: adapter.module_name,
      name: adapter.name,
      module_name: adapter.module_name,
      description: '手动注册的适配器',
      platforms: [],
      registered: true,
      removable: adapter.removable !== false,
    }))
  return [...catalog.value, ...custom_adapters]
})

onMounted(async () => {
  try {
    await adapter_store.fetch_all()
  } catch (error) {
    toast.error(error.message || '获取适配器列表失败')
  }
})

async function install_adapter(adapter) {
  installing_adapter.value = adapter.id
  try {
    await adapter_store.install(adapter.id)
    toast.success(`${adapter.name} 已安装并注册，重启后生效`)
  } catch (error) {
    toast.error(error.message || '安装适配器失败')
  } finally {
    installing_adapter.value = ''
  }
}

function confirm_remove(adapter) {
  pending_removal.value = adapter
  remove_dependency.value = false
  remove_dialog_open.value = true
}

async function remove_adapter() {
  const adapter = pending_removal.value
  if (!adapter) return
  removing_adapter.value = adapter.module_name
  try {
    await adapter_store.remove(adapter.name, adapter.module_name, remove_dependency.value)
    toast.success(
      remove_dependency.value
        ? `${adapter.name} 及其依赖已删除，重启后生效`
        : `${adapter.name} 已取消注册，重启后生效`,
    )
    remove_dialog_open.value = false
    pending_removal.value = null
  } catch (error) {
    toast.error(error.message || '删除适配器失败')
  } finally {
    removing_adapter.value = ''
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">适配器管理</h1>
        <p class="page-desc">安装或移除 NoneBot 平台适配器</p>
      </div>
    </div>

    <section class="adapter-panel card">
      <div v-if="loading" class="loading-block"><Spinner :size="18" /> 加载中…</div>
      <p v-else-if="adapter_items.length === 0" class="adapter-empty">暂无适配器</p>
      <ul v-else class="adapter-list">
        <li v-for="adapter in adapter_items" :key="adapter.id" class="adapter-row">
          <div class="adapter-icon"><Icon icon="lucide:unplug" width="18" /></div>
          <div class="adapter-main">
            <div class="adapter-title">
              <h3>{{ adapter.name }}</h3>
              <Badge :variant="adapter.registered ? 'success' : 'neutral'">
                {{ adapter.registered ? '已注册' : '未安装' }}
              </Badge>
            </div>
            <span class="adapter-package mono">{{ adapter.package || adapter.module_name }}</span>
            <p class="adapter-description">{{ adapter.description }}</p>
          </div>
          <div class="adapter-platforms">
            <span v-for="platform in adapter.platforms || []" :key="platform">{{ platform }}</span>
          </div>
          <div class="adapter-actions">
            <span
              v-if="adapter.registered && adapter.removable === false"
              class="protected-adapter"
              title="核心适配器，禁止卸载"
            >
              <Icon icon="lucide:lock-keyhole" width="15" />
              内置
            </span>
            <Button
              v-else-if="adapter.registered"
              variant="ghost"
              size="sm"
              icon-only
              title="删除适配器"
              :disabled="!auth_store.is_admin || Boolean(removing_adapter)"
              :loading="removing_adapter === adapter.module_name"
              @click="confirm_remove(adapter)"
            >
              <Icon icon="lucide:trash-2" width="15" />
            </Button>
            <Button
              v-else
              variant="secondary"
              size="sm"
              :disabled="!auth_store.is_admin || Boolean(installing_adapter)"
              :loading="installing_adapter === adapter.id"
              @click="install_adapter(adapter)"
            >
              <Icon icon="lucide:download" width="14" />
              安装
            </Button>
          </div>
        </li>
      </ul>
    </section>

    <Dialog
      v-model="remove_dialog_open"
      title="删除适配器"
      :description="`确定删除 ${pending_removal?.name || ''} 吗？`"
      confirm-text="删除"
      confirm-variant="danger"
      :loading="Boolean(removing_adapter)"
      @confirm="remove_adapter"
    >
      <label v-if="pending_removal?.package" class="dependency-option">
        <Checkbox v-model="remove_dependency" :disabled="Boolean(removing_adapter)" />
        <span>
          <strong>同时删除依赖库</strong>
          <small class="mono">{{ pending_removal.package }}</small>
        </span>
      </label>
      <p v-else class="dependency-unavailable">该适配器不是从内置目录安装，只会取消注册。</p>
    </Dialog>
  </div>
</template>

<style scoped>
.adapter-panel {
  margin-top: var(--space-4);
  overflow: hidden;
}

.adapter-empty {
  padding: var(--space-6);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.adapter-list {
  padding: 0 var(--space-5);
}

.adapter-row {
  display: grid;
  grid-template-columns: 38px minmax(280px, 1fr) minmax(120px, auto) 84px;
  align-items: center;
  gap: var(--space-3);
  min-height: 92px;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

.adapter-row:last-child {
  border-bottom: none;
}

.adapter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
}

.adapter-main {
  min-width: 0;
}

.adapter-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.adapter-title h3 {
  font-size: var(--text-sm);
  font-weight: 600;
}

.adapter-package {
  display: block;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adapter-description {
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.adapter-platforms {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.adapter-actions {
  display: flex;
  justify-content: flex-end;
}

.protected-adapter {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.dependency-option {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  cursor: pointer;
  transition:
    border-color var(--transition),
    background-color var(--transition);
}

.dependency-option:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
}

.dependency-option > :first-child {
  margin-top: 2px;
}

.dependency-option span {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: var(--space-1);
}

.dependency-option strong {
  line-height: 20px;
  font-size: var(--text-sm);
  font-weight: 500;
}

.dependency-option small,
.dependency-unavailable {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.dependency-option small {
  overflow: hidden;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
