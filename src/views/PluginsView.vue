<script setup>
import { onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { usePluginStore } from '@/stores/plugin'
import { useAuthStore } from '@/stores/auth'
import { use_toast } from '@/composables/use_toast'
import { use_restart } from '@/composables/use_restart'
import Tabs from '@/components/ui/Tabs.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Pagination from '@/components/ui/Pagination.vue'

const plugin_store = usePluginStore()
const auth_store = useAuthStore()
const toast = use_toast()
const { ask_restart } = use_restart()
const {
  installed_list,
  registered_plugin_modules,
  market_items,
  market_total,
  market_page,
  market_page_size,
  loading,
  market_loading,
} = storeToRefs(plugin_store)

const active_tab = ref('installed')
const market_keyword = ref('')
const toggling = ref('')
const removing_item = ref('')
const market_action = ref('')
const market_action_type = ref('')

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
    ask_restart(
      `插件 ${plugin.display_name || plugin.name} 的启停需要重启机器人生效，是否立即重启？`,
    )
  } catch (error) {
    toast.error(error.message || '操作失败')
  } finally {
    toggling.value = ''
  }
}

function can_remove_plugin(plugin) {
  return plugin.type !== 'builtin' && registered_plugin_modules.value.includes(plugin.module_name)
}

async function remove_plugin(plugin) {
  removing_item.value = plugin.module_name
  try {
    await plugin_store.remove_plugin(plugin.module_name)
    toast.success(`${plugin.display_name || plugin.name} 已删除，重启后生效`)
    ask_restart(
      `插件 ${plugin.display_name || plugin.name} 已删除，需要重启机器人生效，是否立即重启？`,
    )
  } catch (error) {
    toast.error(error.message || '删除插件失败')
  } finally {
    removing_item.value = ''
  }
}

async function search_market() {
  try {
    await plugin_store.fetch_market({ page: 1, keyword: market_keyword.value.trim() })
  } catch (error) {
    toast.error(error.message || '获取市场列表失败')
  }
}

async function go_market_page(page) {
  try {
    await plugin_store.go_market_page(page)
  } catch (error) {
    toast.error(error.message || '加载失败')
  }
}

function market_action_busy(module_name, type) {
  return market_action.value === module_name && market_action_type.value === type
}

async function install_market_plugin(item) {
  market_action.value = item.module_name
  market_action_type.value = 'install'
  try {
    await plugin_store.install_plugin(item.project_link)
    toast.success(`插件 ${item.name} 安装成功，重启后生效`)
    await refresh_after_market_action()
    ask_restart(`插件 ${item.name} 安装成功，需要重启机器人生效，是否立即重启？`)
  } catch (error) {
    toast.error(error.message || '安装失败')
  } finally {
    market_action.value = ''
    market_action_type.value = ''
  }
}

async function upgrade_market_plugin(item) {
  market_action.value = item.module_name
  market_action_type.value = 'upgrade'
  try {
    await plugin_store.upgrade_plugin(item.project_link)
    toast.success(`插件 ${item.name} 升级成功，重启后生效`)
    await refresh_after_market_action()
    ask_restart(`插件 ${item.name} 升级成功，需要重启机器人生效，是否立即重启？`)
  } catch (error) {
    toast.error(error.message || '升级失败')
  } finally {
    market_action.value = ''
    market_action_type.value = ''
  }
}

async function refresh_after_market_action() {
  await Promise.all([plugin_store.fetch_installed(), plugin_store.fetch_registered_plugins()])
  await plugin_store.fetch_market({ keyword: market_keyword.value.trim() })
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
            <p class="market-hint">
              插件均来自 NoneBot2 官方插件商店，安装后请参考插件 Github 说明，前往 .env 自行配置参数。
            </p>
          </form>

          <div v-if="market_loading" class="loading-block"><Spinner :size="18" /> 加载中…</div>
          <EmptyState
            v-else-if="market_items.length === 0"
            icon="lucide:store"
            title="未找到相关插件"
            description="换个关键词试试，或检查网络连接后重新搜索"
          />
          <div v-else class="plugin-grid market-grid">
            <article
              v-for="item in market_items"
              :key="item.module_name || item.project_link"
              class="plugin-card card"
            >
              <div class="plugin-head">
                <div class="plugin-icon"><Icon icon="lucide:puzzle" width="18" /></div>
                <div class="plugin-title">
                  <h3 class="market-item-title">
                    {{ item.name }}
                    <Badge v-if="item.is_official" variant="success">官方</Badge>
                  </h3>
                  <span class="plugin-name mono">{{ item.module_name }}</span>
                </div>
                <Badge v-if="item.installed" variant="neutral">已安装</Badge>
                <Badge v-else-if="item.registered" variant="warning">已登记</Badge>
              </div>

              <p class="plugin-desc">{{ item.desc || '暂无描述' }}</p>

              <div class="market-tags">
                <span
                  v-for="tag in item.tags.slice(0, 3)"
                  :key="tag.label"
                  class="market-tag"
                  :style="tag.color ? { '--tag-color': tag.color } : {}"
                >
                  {{ tag.label }}
                </span>
              </div>

              <div class="plugin-foot">
                <div class="plugin-meta">
                  <span class="mono">v{{ item.version }}</span>
                  <span v-if="item.author" class="text-muted">· {{ item.author }}</span>
                </div>
                <div class="plugin-actions">
                  <a
                    v-if="item.homepage"
                    :href="item.homepage"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="market-homepage"
                    title="项目主页"
                  >
                    <Icon icon="lucide:github" width="15" />
                  </a>
                  <template v-if="auth_store.is_admin">
                    <Button
                      v-if="item.installed && item.registered"
                      variant="secondary"
                      size="sm"
                      :loading="market_action_busy(item.module_name, 'upgrade')"
                      :disabled="Boolean(market_action)"
                      @click="upgrade_market_plugin(item)"
                    >
                      <Icon icon="lucide:refresh-cw" width="13" />
                      升级
                    </Button>
                    <Button
                      v-else
                      size="sm"
                      :loading="market_action_busy(item.module_name, 'install')"
                      :disabled="Boolean(market_action)"
                      @click="install_market_plugin(item)"
                    >
                      <Icon icon="lucide:download" width="13" />
                      安装
                    </Button>
                  </template>
                </div>
              </div>
            </article>
          </div>

          <div v-if="market_total > market_page_size" class="market-pagination">
            <Pagination
              :page="market_page"
              :page-size="market_page_size"
              :total="market_total"
              @page-change="go_market_page"
            />
          </div>
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
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.market-toolbar .market-search {
  width: 300px;
}

/* 工具栏右侧提示文案 */
.market-hint {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.market-grid {
  padding: var(--space-4);
  margin-top: 0;
}

.market-item-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.market-homepage {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius);
  color: var(--text-muted);
  transition:
    background-color var(--transition),
    color var(--transition);
}

.market-homepage:hover {
  background: var(--surface-sunken);
  color: var(--text);
}

.market-pagination {
  display: flex;
  justify-content: center;
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border);
}

.market-tags {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.market-tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  background: color-mix(in srgb, var(--tag-color, #999) 14%, transparent);
  color: var(--tag-color, var(--text-muted));
}
</style>
