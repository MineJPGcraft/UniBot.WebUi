<!-- 通用市场面板：搜索工具栏 + 卡片网格 + 分页，供插件市场 / 扩展市场复用 -->
<script setup>
import { Icon } from '@iconify/vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Pagination from '@/components/ui/Pagination.vue'

const props = defineProps({
  items: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  model_value: { type: String, default: '' },
  placeholder: { type: String, default: '搜索…' },
  /** 工具栏右侧提示文案，为空则不显示 */
  hint: { type: String, default: '' },
  empty_title: { type: String, default: '未找到相关项目' },
  empty_description: { type: String, default: '换个关键词试试，或检查网络连接后重新搜索' },
  /** 分页配置；total 为 0 时不显示分页 */
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  page_size: { type: Number, default: 20 },
  /** 卡片图标（Iconify），默认插件图标 */
  item_icon: { type: String, default: 'lucide:puzzle' },
  /** 当前操作中的条目 key，用于按钮 loading 与全局禁用 */
  busy: { type: String, default: '' },
  /** 是否显示安装 / 升级操作按钮（权限控制） */
  show_actions: { type: Boolean, default: true },
})

const emit = defineEmits(['update:model-value', 'search', 'page-change', 'install', 'upgrade'])

function item_key(item) {
  return item.module_name || item.id || item.project_link || ''
}

function is_official(item) {
  return Boolean(item.official || item.is_official)
}

function item_desc(item) {
  return item.description || item.desc || '暂无描述'
}

function item_version(item) {
  return item.latest_version || item.version
}

/** 项目仓库地址（owner/repo），为空时返回空字符串 */
function repo_url(item) {
  return item.repo ? `https://github.com/${item.repo}` : ''
}

/** 项目主页地址：优先 homepage，其次由 repo 拼出 GitHub 地址，都没有返回空 */
function project_url(item) {
  return item.homepage || repo_url(item)
}

/** 仓库地址第一段为作者名（owner），无 repo 时回退到 item.repo 原值 */
function repo_author(item) {
  if (!item.repo) return ''
  return String(item.repo).split('/')[0] || item.repo
}

/** 版本号是否一致（容忍 v 前缀差异，仅用于更新判断，不影响显示） */
function same_version(a, b) {
  return String(a).replace(/^v/i, '') === String(b).replace(/^v/i, '')
}

/**
 * 是否有可用更新：
 * 插件市场带 registered 字段（无已安装版本数据，沿用原逻辑）；
 * 扩展市场比较已安装版本与最新版本。
 */
function has_update(item) {
  if ('registered' in item) return true
  const { installed, installed_version, latest_version } = item
  if (!installed || !installed_version || !latest_version) return false
  return !same_version(installed_version, latest_version)
}

/**
 * 是否显示「升级」按钮：
 * 插件市场带 registered 字段（需已安装且已登记才可升级）；
 * 扩展市场无该字段，需已安装且有可用更新。
 */
function can_upgrade(item) {
  if ('registered' in item) return Boolean(item.installed && item.registered)
  return Boolean(item.installed && has_update(item))
}

function search() {
  emit('search')
}

function go_page(page) {
  emit('page-change', page)
}

function install(item) {
  emit('install', item)
}

function upgrade(item) {
  emit('upgrade', item)
}
</script>

<template>
  <div class="card market-panel">
    <form class="market-toolbar" @submit.prevent="search">
      <Input
        :model-value="model_value"
        class="market-search"
        :placeholder="placeholder"
        @update:model-value="(value) => emit('update:model-value', value)"
        @keydown.enter="search"
      />
      <Button variant="secondary" type="submit" :loading="loading">
        <Icon icon="lucide:search" width="14" />
        搜索
      </Button>
      <p v-if="hint" class="market-hint">{{ hint }}</p>
    </form>

    <div v-if="loading" class="loading-block"><Spinner :size="18" /> 加载中…</div>
    <EmptyState
      v-else-if="items.length === 0"
      icon="lucide:store"
      :title="empty_title"
      :description="empty_description"
    />
    <div v-else class="market-grid">
      <article v-for="item in items" :key="item_key(item)" class="market-card card">
        <div class="market-head">
          <div class="market-icon"><Icon :icon="item_icon" width="18" /></div>
          <div class="market-title">
            <h3 class="market-item-title">
              {{ item.name }}
              <Badge v-if="is_official(item)" variant="success">官方</Badge>
            </h3>
            <span class="market-name mono">{{ item_key(item) }}</span>
          </div>
          <Badge v-if="item.installed" variant="neutral">已安装</Badge>
          <Badge v-else-if="item.registered" variant="warning">已登记</Badge>
        </div>

        <p class="market-desc">{{ item_desc(item) }}</p>

        <div v-if="item.tags && item.tags.length" class="market-tags">
          <span
            v-for="tag in item.tags.slice(0, 3)"
            :key="tag.label"
            class="market-tag"
            :style="tag.color ? { '--tag-color': tag.color } : {}"
          >
            {{ tag.label }}
          </span>
        </div>

        <div class="market-foot">
          <div class="market-meta">
            <span class="mono">v{{ item_version(item) }}</span>
            <a
              v-if="item.repo"
              :href="repo_url(item)"
              target="_blank"
              rel="noopener noreferrer"
              class="market-author"
              title="项目仓库"
            >
              · {{ repo_author(item) }}
            </a>
            <span v-else-if="item.author" class="text-muted">· {{ item.author }}</span>
          </div>
          <div class="market-actions">
            <a
              v-if="project_url(item)"
              :href="project_url(item)"
              target="_blank"
              rel="noopener noreferrer"
              class="market-homepage"
              :title="item.homepage ? '项目主页' : '项目仓库'"
            >
              <Icon icon="lucide:github" width="15" />
            </a>
            <template v-if="show_actions">
              <Button
                v-if="can_upgrade(item)"
                variant="secondary"
                size="sm"
                :loading="busy === item_key(item)"
                :disabled="Boolean(busy)"
                @click="upgrade(item)"
              >
                <Icon icon="lucide:refresh-cw" width="13" />
                升级
              </Button>
              <Button
                v-else-if="!item.installed"
                size="sm"
                :loading="busy === item_key(item)"
                :disabled="Boolean(busy)"
                @click="install(item)"
              >
                <Icon icon="lucide:download" width="13" />
                安装
              </Button>
              <Button v-else variant="secondary" size="sm" disabled title="已是最新版本">
                <Icon icon="lucide:refresh-cw" width="13" />
                升级
              </Button>
            </template>
          </div>
        </div>
      </article>
    </div>

    <div v-if="total > page_size" class="market-pagination">
      <Pagination :page="page" :page-size="page_size" :total="total" @page-change="go_page" />
    </div>
  </div>
</template>

<style scoped>
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
  padding: var(--space-4);
}

.market-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  gap: var(--space-3);
}

.market-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.market-icon {
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

.market-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.market-item-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
}

.market-name {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.market-desc {
  font-size: var(--text-sm);
  color: var(--text-muted);
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

.market-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.market-meta,
.market-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
}

.market-actions {
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

.market-author {
  color: var(--text-muted);
  text-decoration: none;
  transition:
    color var(--transition),
    text-decoration-color var(--transition);
}

.market-author:hover {
  color: var(--accent);
  text-decoration: underline;
}

.market-pagination {
  display: flex;
  justify-content: center;
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border);
}
</style>
