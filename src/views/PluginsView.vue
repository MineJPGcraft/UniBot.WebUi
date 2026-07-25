<script setup>
import { onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { usePluginStore } from '@/stores/plugin'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import Tabs from '@/components/ui/Tabs.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'

const plugin_store = usePluginStore()
const auth_store = useAuthStore()
const toast = use_toast()
const { installed_list, registered_plugin_modules, market_items, loading, market_loading } =
  storeToRefs(plugin_store)

const active_tab = ref('installed')
const market_keyword = ref('')
const toggling = ref('')
const removing_item = ref('')

const tabs = [
  { value: 'installed', label: '已安装', icon: 'lucide:puzzle' },
  { value: 'market', label: '插件市场', icon: 'lucide:store' },
]

const type_labels = { builtin: '内置插件', dependency: '依赖插件', external: '外部插件' }

onMounted(() => {
  refresh_installed()
  plugin_store.fetch_registered_plugins().catch(() => {})
  search_market()
})

async function refresh_installed() {
  try {
    await plugin_store.fetch_installed()
  } catch (error) {
    toast.error(error.message || '获取插件列表失败')
  }
}

async function toggle_plugin(plugin, enabled) {
  toggling.value = plugin.name
  try {
    await plugin_store.set_enabled(plugin.name, enabled)
    toast.success(
      enabled
        ? `已启用 ${plugin.display_name || plugin.name}`
        : `已禁用 ${plugin.display_name || plugin.name}`,
    )
  } catch (error) {
    toast.error(error.message || '操作失败')
  } finally {
    toggling.value = ''
  }
}

function can_remove_plugin(plugin) {
  return registered_plugin_modules.value.includes(plugin.module_name)
}

async function remove_plugin(plugin) {
  removing_item.value = plugin.module_name
  try {
    await plugin_store.remove_plugin(plugin.module_name)
    toast.success(`${plugin.display_name || plugin.name} 已删除，重启后生效`)
  } catch (error) {
    toast.error(error.message || '删除插件失败')
  } finally {
    removing_item.value = ''
  }
}

async function search_market() {
  try {
    await plugin_store.fetch_market({ keyword: market_keyword.value.trim() })
  } catch (error) {
    toast.error(error.message || '获取市场列表失败')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">插件管理</h1>
        <p class="page-desc">管理已安装插件，或从市场发现新插件</p>
      </div>
    </div>

    <Tabs v-model="active_tab" :tabs="tabs">
      <template #installed>
        <div v-if="loading" class="card">
          <div class="loading-block"><Spinner :size="18" /> 加载中…</div>
        </div>
        <p v-else-if="installed_list.length === 0" class="plugin-empty-hint">未发现有加载的插件</p>
        <div v-else class="plugin-grid">
          <article v-for="plugin in installed_list" :key="plugin.name" class="plugin-card card">
            <div class="plugin-head">
              <div class="plugin-icon"><Icon icon="lucide:puzzle" width="18" /></div>
              <div class="plugin-title">
                <h3>{{ plugin.display_name || plugin.name }}</h3>
                <span class="plugin-name mono">{{ plugin.name }}</span>
              </div>
              <Badge variant="neutral">{{ type_labels[plugin.type] || plugin.type }}</Badge>
            </div>

            <p class="plugin-desc">{{ plugin.description || '暂无描述' }}</p>

            <div class="plugin-foot">
              <div class="plugin-meta">
                <span class="mono">{{ plugin.version }}</span>
                <span class="text-muted">· {{ plugin.author || '未知作者' }}</span>
              </div>
              <div class="plugin-actions">
                <Switch
                  :model-value="plugin.enabled"
                  :disabled="
                    !plugin.can_disable || !auth_store.is_admin || toggling === plugin.name
                  "
                  @update:model-value="(value) => toggle_plugin(plugin, value)"
                />
                <Button
                  v-if="can_remove_plugin(plugin)"
                  variant="ghost"
                  size="sm"
                  icon-only
                  title="删除插件"
                  :disabled="!auth_store.is_admin || Boolean(removing_item)"
                  :loading="removing_item === plugin.module_name"
                  @click="remove_plugin(plugin)"
                >
                  <Icon icon="lucide:trash-2" width="15" />
                </Button>
              </div>
            </div>
          </article>
        </div>
      </template>

      <template #market>
        <div class="card market-panel">
          <form class="market-toolbar" @submit.prevent="search_market">
            <Input
              v-model="market_keyword"
              class="market-search"
              placeholder="搜索插件…"
              @keydown.enter="search_market"
            />
            <Button variant="secondary" type="submit" :loading="market_loading">
              <Icon icon="lucide:search" width="14" />
              搜索
            </Button>
          </form>

          <div v-if="market_loading" class="loading-block"><Spinner :size="18" /> 加载中…</div>
          <EmptyState
            v-else-if="market_items.length === 0"
            icon="lucide:store"
            title="插件市场暂未开放"
            description="市场接口为预留功能，敬请期待"
          />
          <ul v-else class="market-list">
            <li v-for="item in market_items" :key="item.name" class="market-item">
              <div class="plugin-title">
                <h3>{{ item.display_name || item.name }}</h3>
                <span class="plugin-name mono">{{ item.name }}</span>
              </div>
              <p class="plugin-desc">{{ item.description }}</p>
              <div class="plugin-meta">
                <span class="mono">{{ item.version }}</span>
                <span class="text-muted">· {{ item.downloads }} 次下载</span>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<style scoped>
.plugin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.plugin-empty-hint {
  margin-top: var(--space-4);
  padding: var(--space-6) 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.plugin-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  gap: var(--space-3);
}

.plugin-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.plugin-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.plugin-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.plugin-title h3 {
  font-size: var(--text-sm);
  font-weight: 600;
}

.plugin-name {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plugin-desc {
  font-size: var(--text-sm);
  color: var(--text-muted);
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.plugin-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.plugin-meta,
.plugin-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
}

.market-panel {
  margin-top: var(--space-4);
}

.market-toolbar {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.market-toolbar .market-search {
  width: 300px;
}

.market-list {
  padding: var(--space-2);
}

.market-item {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  transition: background-color var(--transition);
}

.market-item:hover {
  background: var(--surface-sunken);
}
</style>
