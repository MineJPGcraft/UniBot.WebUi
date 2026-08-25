<script setup>
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useExtensionStore } from '@/stores/extension'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { use_toast } from '@/composables/use_toast'
import { use_async_action } from '@/composables/use_async_action'
import { use_restart } from '@/composables/use_restart'
import Tabs from '@/components/ui/Tabs.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Dialog from '@/components/ui/Dialog.vue'
import MarketPanel from '@/components/MarketPanel.vue'
import ExtensionConfigDialog from '@/components/ExtensionConfigDialog.vue'
import ExtensionConfigForm from '@/components/ExtensionConfigForm.vue'

const { t } = useI18n()
const extension_store = useExtensionStore()
const auth_store = useAuthStore()
const config_store = useConfigStore()
const toast = use_toast()
const { run } = use_async_action()
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
  studio_status,
  studio_loading,
  studio_launching,
  studio_stopping,
  studio_log,
  studio_log_loading,
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
/** Extension Studio 日志弹窗开关 */
const studio_log_open = ref(false)
/** 创意工坊首次下载说明弹窗开关 */
const studio_intro_open = ref(false)

const tabs = computed(() => [
  { value: 'installed', label: t('extensions.tab_installed'), icon: 'lucide:puzzle' },
  { value: 'market', label: t('extensions.tab_market'), icon: 'lucide:store' },
  { value: 'render', label: t('extensions.tab_render'), icon: 'lucide:image' },
])

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
  templates.value.map((item) => ({
    value: item.name,
    label: item.name || t('extensions.template_default_option'),
  })),
)

/** 只展示带配置项的渲染插件 */
const visible_render_configs = computed(() =>
  render_configs.value.filter((item) => {
    const properties = item.schema?.properties || {}
    return Object.keys(properties).length > 0
  }),
)

const type_labels = computed(() => ({
  api: t('extensions.type_api'),
  command: t('extensions.type_command'),
  renderer: t('extensions.type_renderer'),
  template: t('extensions.type_template'),
  resources: t('extensions.type_resources'),
}))

const state_labels = computed(() => ({
  loaded: t('extensions.state_loaded'),
  enabled: t('extensions.state_enabled'),
  discovered: t('extensions.state_discovered'),
  validated: t('extensions.state_validated'),
  failed: t('extensions.state_failed'),
  disabled: t('extensions.state_disabled'),
  blocked: t('extensions.state_blocked'),
}))

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

onMounted(async () => {
  const load_tasks = [
    config_store.config_data ? Promise.resolve() : config_store.fetch_all(),
    extension_store.fetch_renderers(),
    extension_store.fetch_templates(),
    extension_store.fetch_render_configs(),
    extension_store.fetch_studio_status(),
  ]
  refresh_installed()
  search_market()
  const results = await Promise.allSettled(load_tasks)
  if (results.some((result) => result.status === 'rejected')) {
    toast.error(t('extensions.load_partial_failed'))
  }
})

async function refresh_installed() {
  await run(() => extension_store.fetch_installed(), t('extensions.installed_fetch_list_failed'))
}

async function search_market() {
  market_filter.value = market_keyword.value
  await run(() => extension_store.fetch_market(), t('extensions.market_fetch_failed'))
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
    // 先热重载让扩展进入注册表，再刷新市场列表（「已安装」状态实时计算自注册表）
    const reloaded = await run(
      () => extension_store.reload(),
      t('extensions.installed_install_reload_failed', { name: item.name }),
    )
    await search_market()
    if (reloaded) {
      toast.success(t('extensions.installed_install_success', { name: item.name }))
    }
  } catch (error) {
    toast.error(error.message || t('extensions.installed_install_failed'))
  } finally {
    market_action.value = ''
  }
}

async function uninstall_extension(extension) {
  try {
    await extension_store.uninstall_extension(extension.id)
    // 先热重载让扩展从注册表移除，再刷新市场列表（「已安装」状态实时计算自注册表）
    const reloaded = await run(
      () => extension_store.reload(),
      t('extensions.installed_uninstall_reload_failed', { name: extension.name }),
    )
    await search_market()
    if (reloaded) {
      toast.success(t('extensions.installed_uninstall_success', { name: extension.name }))
    }
  } catch (error) {
    toast.error(error.message || t('extensions.installed_uninstall_failed'))
  }
}

function type_badges(extension) {
  return (extension.types || []).map((type) => ({
    value: type,
    label: type_labels.value[type] || type,
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
    toast.success(
      enabled
        ? t('extensions.installed_enable_success', { name: extension.name })
        : t('extensions.installed_disable_success', { name: extension.name }),
    )
    ask_restart(t('extensions.installed_toggle_restart_prompt', { name: extension.name }))
  } catch (error) {
    toast.error(error.message || t('extensions.installed_toggle_failed'))
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
    toast.error(error.message || t('extensions.config_fetch_failed'))
  }
}

async function save_extension_config(values) {
  try {
    await extension_store.save_config(active_extension.value.id, values)
    toast.success(t('extensions.config_save_success', { name: active_extension.value.name }))
    config_open.value = false
  } catch (error) {
    toast.error(error.message || t('extensions.config_save_failed'))
  }
}

async function save_render_plugin_config(item, values) {
  try {
    await extension_store.save_render_config(item.id, values)
    toast.success(t('extensions.config_save_success', { name: item.name }))
  } catch (error) {
    toast.error(error.message || t('extensions.config_save_failed'))
  }
}

async function change_renderer(name) {
  try {
    await extension_store.switch_renderer(name)
    toast.success(t('extensions.renderer_switch_success'))
    ask_restart(t('extensions.renderer_switch_restart_prompt'))
  } catch (error) {
    toast.error(error.message || t('extensions.renderer_switch_failed'))
  }
}

async function change_template(name) {
  try {
    await extension_store.switch_template(name)
    toast.success(t('extensions.template_switch_success'))
  } catch (error) {
    toast.error(error.message || t('extensions.template_switch_failed'))
  }
}

/** 启动创意工坊；首次使用（尚未下载）时先弹窗说明功能，由用户确认后再下载 */
async function launch_studio() {
  if (!studio_status.value?.installed) {
    studio_intro_open.value = true
    return
  }
  await start_studio(false)
}

/** 用户在说明弹窗中确认后开始下载并启动 */
async function confirm_studio_launch() {
  studio_intro_open.value = false
  await start_studio(true)
}

/** 下载（如缺失）并启动 Extension Studio，随后弹出独立窗口打开访问地址（含登录 token） */
async function start_studio(will_download) {
  if (will_download) {
    toast.info(t('extensions.studio_download_started'))
  }
  let url = ''
  const ok = await run(
    () => extension_store.launch_studio().then((value) => (url = value)),
    t('extensions.studio_launch_failed'),
  )
  if (!ok) return
  if (url) {
    open_studio_window(url)
    toast.success(t('extensions.studio_launch_window_success'))
  } else {
    toast.success(t('extensions.studio_launch_success'))
  }
}

/** 弹出独立窗口打开 Studio（复用同名窗口，避免重复弹窗） */
function open_studio_window(url) {
  const width = Math.min(1280, window.screen.availWidth - 80)
  const height = Math.min(860, window.screen.availHeight - 80)
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2))
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2))
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
    'status=no',
  ].join(',')
  window.open(url, 'unibot-studio', features)
}

/** 停止 Extension Studio */
async function stop_studio() {
  try {
    await extension_store.stop_studio()
    toast.success(t('extensions.studio_stop_success'))
  } catch (error) {
    toast.error(error.message || t('extensions.studio_stop_failed'))
  }
}

/** 打开 Extension Studio 日志弹窗 */
async function open_studio_log() {
  studio_log_open.value = true
  try {
    await extension_store.fetch_studio_log()
  } catch (error) {
    toast.error(error.message || t('extensions.studio_fetch_log_failed'))
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('extensions.page_title') }}</h1>
        <p class="page-desc">{{ t('extensions.page_description') }}</p>
      </div>
      <div class="page-actions">
        <Button
          v-if="studio_status?.running"
          variant="ghost"
          :loading="studio_stopping"
          :disabled="!auth_store.is_admin"
          :title="t('extensions.studio_stop_button_title')"
          @click="stop_studio"
        >
          <Icon icon="lucide:square" width="16" />
          {{ t('extensions.studio_stop_button') }}
        </Button>
        <Button
          variant="ghost"
          :disabled="!studio_status?.installed"
          :title="t('extensions.studio_log_button_title')"
          @click="open_studio_log"
        >
          <Icon icon="lucide:terminal" width="16" />
          {{ t('extensions.studio_log_button') }}
        </Button>
        <Button
          variant="primary"
          :loading="studio_launching"
          :disabled="!auth_store.is_admin"
          :title="t('extensions.studio_launch_button_title')"
          @click="launch_studio"
        >
          <Icon icon="lucide:code-2" width="16" />
          {{
            studio_status?.running
              ? t('extensions.studio_open_button')
              : t('extensions.studio_launch_button')
          }}
        </Button>
      </div>
    </div>

    <Tabs v-model="active_tab" :tabs="tabs">
      <template #installed>
        <div v-if="loading" class="card">
          <div class="loading-block">
            <Spinner :size="18" /> {{ t('extensions.installed_loading') }}
          </div>
        </div>
        <EmptyState
          v-else-if="installed_list.length === 0"
          icon="lucide:puzzle"
          :title="t('extensions.installed_empty_title')"
          :description="t('extensions.installed_empty_description')"
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
                <Badge v-if="extension.builtin" variant="neutral">
                  {{ t('extensions.installed_builtin_badge') }}
                </Badge>
                <Badge v-for="badge in type_badges(extension)" :key="badge.value" variant="accent">
                  {{ badge.label }}
                </Badge>
                <Badge :variant="state_variants[extension.state] || 'neutral'">
                  {{ state_labels[extension.state] || extension.state }}
                </Badge>
              </div>
            </div>

            <div class="extension-desc">
              <p>{{ extension.description || t('extensions.installed_no_description') }}</p>
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
                  :title="t('extensions.installed_config_action')"
                  :disabled="!auth_store.is_admin"
                  @click="open_config(extension)"
                >
                  <Icon icon="lucide:settings-2" width="14" />
                  {{ t('extensions.installed_config_action') }}
                </Button>
                <Button
                  v-if="!extension.builtin"
                  variant="ghost"
                  size="sm"
                  class="danger"
                  :title="t('extensions.installed_uninstall_action')"
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
          :placeholder="t('extensions.market_view_search_placeholder')"
          :empty-title="t('extensions.market_view_empty_title')"
          :empty-description="t('extensions.market_view_empty_description')"
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
            {{ t('extensions.render_lock_banner') }}
          </div>

          <div class="render-row">
            <div class="render-meta">
              <h3 class="card-title">{{ t('extensions.renderer_section_title') }}</h3>
              <p class="render-desc">{{ t('extensions.renderer_section_desc') }}</p>
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
              <h3 class="card-title">{{ t('extensions.template_section_title') }}</h3>
              <p class="render-desc">{{ t('extensions.template_section_desc') }}</p>
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
              <h3 class="card-title">{{ t('extensions.render_plugin_config_title') }}</h3>
              <p class="render-desc">{{ t('extensions.render_plugin_config_desc') }}</p>
            </div>
          </div>
          <div v-if="render_config_loading" class="render-config-loading">
            <Spinner :size="16" /> {{ t('extensions.render_config_loading') }}
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
                    {{
                      item.kind === 'renderer'
                        ? t('extensions.renderer_kind_badge')
                        : t('extensions.template_kind_badge')
                    }}
                  </Badge>
                  <Badge :variant="item.available ? 'success' : 'neutral'">
                    <Icon
                      :icon="item.available ? 'lucide:circle-check' : 'lucide:circle-off'"
                      width="11"
                    />
                    {{
                      item.available
                        ? t('extensions.renderer_status_available')
                        : t('extensions.renderer_status_unavailable')
                    }}
                  </Badge>
                  <Badge v-if="item.current" variant="accent">
                    <Icon icon="lucide:star" width="11" />
                    {{ t('extensions.render_current_badge') }}
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
              {{ t('extensions.render_plugin_empty') }}
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

    <Dialog
      v-model="studio_intro_open"
      :title="t('extensions.studio_intro_dialog_title')"
      :description="t('extensions.studio_intro_dialog_description')"
      :confirm-text="t('extensions.studio_intro_confirm')"
      :loading="studio_launching"
      @confirm="confirm_studio_launch"
    >
      <div class="studio-intro">
        <p>{{ t('extensions.studio_intro_body') }}</p>
        <ul>
          <li>{{ t('extensions.studio_intro_feature_design') }}</li>
          <li>{{ t('extensions.studio_intro_feature_testing') }}</li>
          <li>{{ t('extensions.studio_intro_feature_package') }}</li>
        </ul>
        <p>{{ t('extensions.studio_intro_download_prompt') }}</p>
      </div>
    </Dialog>

    <Dialog
      v-model="studio_log_open"
      :title="t('extensions.studio_log_dialog_title')"
      :description="t('extensions.studio_log_dialog_description')"
      :hide-footer="true"
      width="min(720px, calc(100vw - 32px))"
    >
      <div class="studio-log-box">
        <div v-if="studio_log_loading" class="studio-log-loading">
          <Spinner :size="16" /> {{ t('extensions.studio_log_loading') }}
        </div>
        <pre v-else-if="studio_log" class="studio-log-content">{{ studio_log }}</pre>
        <div v-else class="studio-log-empty">{{ t('extensions.studio_log_empty') }}</div>
      </div>
    </Dialog>
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

/* 创意工坊首次下载说明弹窗 */
.studio-intro {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.studio-intro p {
  margin: 0 0 var(--space-2);
}

.studio-intro p:last-child {
  margin-bottom: 0;
}

.studio-intro ul {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-5);
}

.studio-intro li {
  margin-bottom: var(--space-1);
}

/* Extension Studio 日志弹窗 */
.studio-log-box {
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-base);
}

.studio-log-content {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}

.studio-log-loading,
.studio-log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6) 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
</style>
