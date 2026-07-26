<script setup>
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useAdapterStore } from '@/stores/adapter'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'

const adapter_store = useAdapterStore()
const auth_store = useAuthStore()
const toast = use_toast()
const { registered_list, catalog, loading } = storeToRefs(adapter_store)

const installing_adapter = ref('')
const toggling_adapter = ref('')
const uninstalling_adapter = ref('')
const uninstall_dialog_open = ref(false)
const pending_uninstall = ref(null)

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

async function toggle_adapter(adapter, enabled) {
  toggling_adapter.value = adapter.id
  try {
    await adapter_store.toggle_register(adapter.name, adapter.module_name, enabled)
    toast.success(enabled ? `${adapter.name} 已启用（重启后生效）` : `${adapter.name} 已禁用（重启后生效）`)
  } catch (error) {
    toast.error(error.message || '操作失败')
  } finally {
    toggling_adapter.value = ''
  }
}

function confirm_uninstall(adapter) {
  pending_uninstall.value = adapter
  uninstall_dialog_open.value = true
}

async function do_uninstall() {
  const adapter = pending_uninstall.value
  if (!adapter) return
  uninstalling_adapter.value = adapter.module_name
  try {
    await adapter_store.uninstall(adapter.name, adapter.module_name)
    toast.success(`${adapter.name} 及其依赖已彻底删除（重启后生效）`)
    uninstall_dialog_open.value = false
    pending_uninstall.value = null
  } catch (error) {
    toast.error(error.message || '卸载失败')
  } finally {
    uninstalling_adapter.value = ''
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">适配器管理</h1>
        <p class="page-desc">安装、启用或卸载 NoneBot 平台适配器</p>
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
              <Badge :variant="adapter.registered ? 'success' : adapter.installed ? 'warning' : 'neutral'">
                {{ adapter.registered ? '已启用' : adapter.installed ? '已禁用' : '未安装' }}
              </Badge>
            </div>
            <span class="adapter-package mono">{{ adapter.package || adapter.module_name }}</span>
            <p class="adapter-description">{{ adapter.description }}</p>
          </div>
          <div class="adapter-platforms">
            <span v-for="platform in adapter.platforms || []" :key="platform">{{ platform }}</span>
          </div>
          <div class="adapter-actions">
            <template v-if="adapter.removable === false">
              <span class="protected-adapter" title="核心适配器，禁止操作">
                <Icon icon="lucide:lock-keyhole" width="15" />
                内置
              </span>
            </template>
            <template v-else-if="adapter.installed">
              <Switch
                :model-value="adapter.registered"
                :disabled="!auth_store.is_admin || toggling_adapter === adapter.id"
                @update:model-value="(val) => toggle_adapter(adapter, val)"
                :title="adapter.registered ? '禁用后将取消注册（依赖不删除）' : '启用后将重新注册'"
              />
              <Button
                variant="ghost"
                size="sm"
                icon-only
                title="彻底删除（取消注册并删除依赖）"
                :disabled="!auth_store.is_admin || Boolean(uninstalling_adapter)"
                :loading="uninstalling_adapter === adapter.module_name"
                @click="confirm_uninstall(adapter)"
              >
                <Icon icon="lucide:trash-2" width="15" />
              </Button>
            </template>
            <template v-else>
              <Button
                variant="secondary"
                size="sm"
                :disabled="!auth_store.is_admin || Boolean(installing_adapter)"
                :loading="installing_adapter === adapter.id"
                @click="install_adapter(adapter)"
              >
                <Icon icon="lucide:download" width="14" />
                安装
              </Button>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <Dialog
      v-model="uninstall_dialog_open"
      title="彻底删除适配器"
      :description="`确定彻底删除 ${pending_uninstall?.name || ''} 吗？这将取消注册并删除依赖包，不可恢复。`"
      confirm-text="彻底删除"
      confirm-variant="danger"
      :loading="Boolean(uninstalling_adapter)"
      @confirm="do_uninstall"
    >
      <p class="uninstall-warning">
        <Icon icon="lucide:alert-triangle" width="16" />
        此操作将同时从 pyproject.toml 中移除注册信息和依赖，如需再次使用需重新安装。
      </p>
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
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.protected-adapter {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.uninstall-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}
</style>
