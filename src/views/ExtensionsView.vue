<script setup>
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useExtensionStore } from '@/stores/extension'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { use_toast } from '@/composables/use_toast'
import { use_restart } from '@/composables/use_restart'
import Tabs from '@/components/ui/Tabs.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import MarketPanel from '@/components/MarketPanel.vue'
import ExtensionConfigDialog from '@/components/ExtensionConfigDialog.vue'
import ExtensionConfigForm from '@/components/ExtensionConfigForm.vue'

const extension_store = useExtensionStore()
const auth_store = useAuthStore()
const config_store = useConfigStore()
const toast = use_toast()
const { ask_restart } = use_restart()
const {
  installed_list,
  loading,
  detail,
  detail_loading,
  config_values,
  config_loading,
  saving_config,
  renderers,
  renderer_loading,
  templates,
  template_loading,
  render_configs,
  render_config_loading,
  saving_render_config,
  market_items,
  market_loading,
} = storeToRefs(extension_store)

const active_tab = ref('installed')
const toggling = ref('')
const config_open = ref(false)
const active_extension = ref(null)
const market_keyword = ref('')
/** 已应用的市场搜索关键词（点击搜索后生效） */
const market_filter = ref('')
/** 市场安装 / 升级操作中的扩展 id */
const market_action = ref('')

const tabs = [
  { value: 'installed', label: '已安装扩展', icon: 'lucide:puzzle' },
  { value: 'market', label: '扩展市场', icon: 'lucide:store' },
  { value: 'render', label: '渲染设置', icon: 'lucide:image' },
]

const current_renderer = computed(() => {
  const matched = renderers.value.find((item) => item.current)
  return (matched || {}).name || ''
})

/** 引擎下拉只列当前可用的渲染插件 */
const renderer_options = computed(() =>
  renderers.value
    .filter((item) => item.available)
    .map((item) => ({ value: item.name, label: item.name })),
)

const current_template = computed(
  () => (templates.value.find((item) => item.current) || templates.value[0] || {}).name || '',
)

const template_options = computed(() =>
  templates.value.map((item) => ({ value: item.name, label: item.name || '默认' })),
)

/** 只展示带配置项的渲染插件 */
const visible_render_configs = computed(() =>
  render_configs.value.filter((item) => {
    const properties = item.schema?.properties || {}
    return Object.keys(properties).length > 0
  }),
)

const type_labels = {
  api: 'API',
  command: '指令',
  renderer: '渲染引擎',
  template: '模板',
  resources: '资源',
}

const state_labels = {
  loaded: '已加载',
  enabled: '已启用',
  discovered: '已发现',
  validated: '已校验',
  failed: '失败',
  disabled: '已禁用',
  blocked: '阻塞',
}

const state_variants = {
  loaded: 'success',
  enabled: 'success',
  discovered: 'neutral',
  validated: 'neutral',
  failed: 'danger',
  disabled: 'neutral',
  blocked: 'warning',
}

/** 图片模式是否开启；关闭时「渲染设置」整体锁定 */
const image_mode_enabled = computed(() => Boolean(config_store.config_data?.image?.mode))

onMounted(() => {
  if (!config_store.config_data) config_store.fetch_all().catch(() => {})
  refresh_installed()
  extension_store.fetch_renderers().catch(() => {})
  extension_store.fetch_templates().catch(() => {})
  extension_store.fetch_render_configs().catch(() => {})
  search_market()
})

async function refresh_installed() {
  try {
    await extension_store.fetch_installed()
  } catch (error) {
    toast.error(error.message || '获取扩展列表失败')
  }
}

async function search_market() {
  market_filter.value = market_keyword.value
  try {
    await extension_store.fetch_market()
  } catch (error) {
    toast.error(error.message || '获取扩展市场失败')
  }
}

/** 扩展市场本地搜索过滤（后端接口无搜索参数） */
const filtered_market_items = computed(() => {
  const keyword = market_filter.value.trim().toLowerCase()
  if (!keyword) return market_items.value
  return market_items.value.filter(
    (item) =>
      (item.name || '').toLowerCase().includes(keyword) ||
      (item.id || '').toLowerCase().includes(keyword) ||
      (item.description || '').toLowerCase().includes(keyword),
  )
})

async function install_market_extension(item) {
  market_action.value = item.id
  try {
    await extension_store.install_market(item.id)
    toast.success(`扩展 ${item.name} 安装成功，重启后生效`)
    await search_market()
    ask_restart(`扩展 ${item.name} 安装成功，需要重启机器人生效，是否立即重启？`)
  } catch (error) {
    toast.error(error.message || '安装失败')
  } finally {
    market_action.value = ''
  }
}

async function uninstall_extension(extension) {
  try {
    await extension_store.uninstall_extension(extension.id)
    toast.success(`扩展 ${extension.name} 已卸载，重启后生效`)
    await search_market()
    ask_restart(`扩展 ${extension.name} 已卸载，需要重启机器人生效，是否立即重启？`)
  } catch (error) {
    toast.error(error.message || '卸载失败')
  }
}

function type_badges(extension) {
  return (extension.types || []).map((type) => ({
    value: type,
    label: type_labels[type] || type,
  }))
}

function has_config(extension) {
  const properties = extension.config_schema?.properties || {}
  return Object.keys(properties).length > 0
}

async function toggle_extension(extension, enabled) {
  toggling.value = extension.id
  try {
    await extension_store.set_enabled(extension.id, enabled)
    toast.success(enabled ? `已启用 ${extension.name}` : `已禁用 ${extension.name}`)
    ask_restart(`扩展 ${extension.name} 的启停需要重启机器人生效，是否立即重启？`)
  } catch (error) {
    toast.error(error.message || '操作失败')
  } finally {
    toggling.value = ''
  }
}

async function open_config(extension) {
  active_extension.value = extension
  config_open.value = true
  try {
    await Promise.all([
      extension_store.fetch_detail(extension.id),
      extension_store.fetch_config(extension.id),
    ])
  } catch (error) {
    toast.error(error.message || '获取扩展配置失败')
  }
}

async function save_extension_config(values) {
  try {
    await extension_store.save_config(active_extension.value.id, values)
    toast.success(`配置已保存：${active_extension.value.name}`)
    config_open.value = false
  } catch (error) {
    toast.error(error.message || '保存配置失败')
  }
}

async function save_render_plugin_config(item, values) {
  try {
    await extension_store.save_render_config(item.id, values)
    toast.success(`配置已保存：${item.name}`)
  } catch (error) {
    toast.error(error.message || '保存配置失败')
  }
}

async function change_renderer(name) {
  try {
    await extension_store.switch_renderer(name)
    toast.success('渲染引擎已切换，重启后生效')
    ask_restart('渲染引擎的切换需要重启机器人生效，是否立即重启？')
  } catch (error) {
    toast.error(error.message || '切换渲染引擎失败')
  }
}

async function change_template(name) {
  try {
    await extension_store.switch_template(name)
    toast.success('模板已切换，将立即生效')
  } catch (error) {
    toast.error(error.message || '切换模板失败')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">扩展管理</h1>
        <p class="page-desc">管理已安装扩展、从市场发现新扩展，或调整渲染引擎与模板</p>
      </div>
    </div>

    <Tabs v-model="active_tab" :tabs="tabs">
      <template #installed>
        <div v-if="loading" class="card">
          <div class="loading-block"><Spinner :size="18" /> 加载中…</div>
        </div>
        <EmptyState
          v-else-if="installed_list.length === 0"
          icon="lucide:puzzle"
          title="暂无扩展"
          description="尚未发现任何已安装的扩展"
        />
        <div v-else class="extension-grid">
          <article
            v-for="extension in installed_list"
            :key="extension.id"
            class="extension-card card"
          >
            <div class="extension-head">
              <div class="extension-icon"><Icon icon="lucide:package" width="18" /></div>
              <div class="extension-title">
                <h3>{{ extension.name }}</h3>
                <span class="extension-id mono">{{ extension.id }}</span>
              </div>
              <div class="extension-badges">
                <Badge v-if="extension.builtin" variant="neutral">内置</Badge>
                <Badge v-for="badge in type_badges(extension)" :key="badge.value" variant="accent">
                  {{ badge.label }}
                </Badge>
                <Badge :variant="state_variants[extension.state] || 'neutral'">
                  {{ state_labels[extension.state] || extension.state }}
                </Badge>
              </div>
            </div>

            <div class="extension-desc">
              <p>{{ extension.description || '暂无描述' }}</p>
              <p v-if="extension.failure_reason" class="extension-reason">
                {{ extension.failure_reason }}
              </p>
            </div>

            <div class="extension-foot">
              <div class="extension-meta">
                <span class="mono">v{{ extension.version }}</span>
                <span v-if="extension.author" class="text-muted">· {{ extension.author }}</span>
              </div>
              <div class="extension-actions">
                <Button
                  v-if="has_config(extension)"
                  variant="ghost"
                  size="sm"
                  title="配置"
                  :disabled="!auth_store.is_admin"
                  @click="open_config(extension)"
                >
                  <Icon icon="lucide:settings-2" width="14" />
                  配置
                </Button>
                <Button
                  v-if="!extension.builtin"
                  variant="ghost"
                  size="sm"
                  class="danger"
                  title="卸载"
                  :disabled="!auth_store.is_admin"
                  @click="uninstall_extension(extension)"
                >
                  <Icon icon="lucide:trash-2" width="14" />
                </Button>
                <Switch
                  :model-value="extension.state === 'enabled' || extension.state === 'loaded'"
                  :disabled="!auth_store.is_admin || toggling === extension.id"
                  @update:model-value="(value) => toggle_extension(extension, value)"
                />
              </div>
            </div>
          </article>
        </div>
      </template>

      <template #market>
        <MarketPanel
          :model-value="market_keyword"
          :items="filtered_market_items"
          :loading="market_loading"
          placeholder="搜索扩展…"
          empty-title="扩展市场为空"
          empty-description="暂无可用扩展，或网络连接异常"
          item-icon="lucide:package"
          :busy="market_action"
          :show-actions="auth_store.is_admin"
          @update:model-value="(value) => (market_keyword = value)"
          @search="search_market"
          @install="install_market_extension"
          @upgrade="install_market_extension"
        />
      </template>

      <template #render>
        <div class="render-panel card">
          <div v-if="!image_mode_enabled" class="render-lock-banner">
            <Icon icon="lucide:lock" width="14" />
            图片模式未开启，渲染器扩展已自动禁用；可在「配置中心 → 图片渲染」中启用
          </div>

          <div class="render-row">
            <div class="render-meta">
              <h3 class="card-title">渲染引擎</h3>
              <p class="render-desc">选择用于 HTML→图片的渲染实现，切换后需重启生效</p>
            </div>
            <div v-if="renderer_loading" class="render-loading"><Spinner :size="16" /></div>
            <Select
              v-else
              :model-value="current_renderer"
              :options="renderer_options"
              :disabled="!auth_store.is_admin || !image_mode_enabled"
              @update:model-value="change_renderer"
            />
          </div>

          <div class="render-row">
            <div class="render-meta">
              <h3 class="card-title">模板</h3>
              <p class="render-desc">选择图片渲染模板包，切换后立即生效</p>
            </div>
            <div v-if="template_loading" class="render-loading"><Spinner :size="16" /></div>
            <Select
              v-else
              :model-value="current_template"
              :options="template_options"
              :disabled="!auth_store.is_admin || !image_mode_enabled"
              @update:model-value="change_template"
            />
          </div>

          <div class="render-row render-row--list">
            <div class="render-meta">
              <h3 class="card-title">渲染插件配置</h3>
              <p class="render-desc">渲染器与模板扩展的配置项；图片模式未开启时渲染器自动禁用</p>
            </div>
          </div>
          <div v-if="render_config_loading" class="render-config-loading">
            <Spinner :size="16" /> 加载配置中…
          </div>
          <div v-else class="render-configs">
            <div
              v-for="item in visible_render_configs"
              :key="item.id"
              class="render-config-card"
              :class="{ 'render-config-card--unavailable': !item.available }"
            >
              <div class="render-config-head">
                <div class="render-config-title">
                  <span class="render-config-kind" :class="`render-config-kind--${item.kind}`">
                    <Icon
                      :icon="item.kind === 'renderer' ? 'lucide:image' : 'lucide:layout-template'"
                      width="14"
                    />
                  </span>
                  <span class="render-config-name">{{ item.name }}</span>
                  <Badge variant="neutral">
                    <Icon icon="lucide:boxes" width="11" />
                    {{ item.kind === 'renderer' ? '渲染器' : '模板' }}
                  </Badge>
                  <Badge :variant="item.available ? 'success' : 'neutral'">
                    <Icon
                      :icon="item.available ? 'lucide:circle-check' : 'lucide:circle-off'"
                      width="11"
                    />
                    {{ item.available ? '可用' : '已禁用' }}
                  </Badge>
                  <Badge v-if="item.current" variant="accent">
                    <Icon icon="lucide:star" width="11" />
                    当前
                  </Badge>
                </div>
                <span v-if="!item.available && item.reason" class="renderer-item-reason">
                  {{ item.reason }}
                </span>
              </div>
              <ExtensionConfigForm
                :schema="item.schema"
                :values="item.values"
                :saving="saving_render_config === item.id"
                :disabled="!item.available"
                @save="(values) => save_render_plugin_config(item, values)"
              />
            </div>
            <div v-if="!visible_render_configs.length" class="render-config-empty">
              暂无渲染插件
            </div>
          </div>
        </div>
      </template>
    </Tabs>

    <ExtensionConfigDialog
      v-model="config_open"
      :extension="active_extension"
      :schema="detail?.config_schema"
      :values="config_values"
      :loading="detail_loading || config_loading"
      :saving="saving_config"
      @save="save_extension_config"
    />
  </div>
</template>

<style scoped>
.extension-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
}

.extension-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  gap: var(--space-3);
}

.extension-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.extension-icon {
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

.extension-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.extension-title h3 {
  font-size: var(--text-sm);
  font-weight: 600;
}

.extension-id {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extension-badges {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.extension-desc {
  font-size: var(--text-sm);
  color: var(--text-muted);
  flex: 1;
}

.extension-desc p {
  margin: 0;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.extension-reason {
  margin-top: var(--space-1);
  color: var(--warning);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.extension-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.extension-meta,
.extension-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
}

.extension-actions {
  gap: var(--space-2);
}

.render-panel {
  padding: 0 var(--space-5);
}

/* 图片模式未开启时的提示横幅 */
.render-lock-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  color: var(--warning);
  font-size: var(--text-xs);
}

.render-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
}

.render-row:last-child {
  border-bottom: none;
}

.render-meta {
  flex: 1;
  min-width: 0;
}

.render-desc {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.render-loading {
  display: flex;
  align-items: center;
}

.render-row--list {
  align-items: flex-start;
}

.render-config-loading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: center;
  padding: var(--space-6) 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.render-configs {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) 0;
}

.render-config-card {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.render-config-card--unavailable {
  background: var(--bg-base);
}

.render-config-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-3);
}

.render-config-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.render-config-kind {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.render-config-kind--template {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.render-config-kind--renderer {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.render-config-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}

.renderer-item-reason {
  font-size: var(--text-xs);
  color: var(--warning);
  line-height: 1.4;
}

.render-config-empty {
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.render-panel :deep(.ui-select-trigger) {
  width: 220px;
}

.extension-actions .danger {
  color: var(--danger);
}

.extension-actions .danger:hover {
  background: var(--danger-soft);
}
</style>
