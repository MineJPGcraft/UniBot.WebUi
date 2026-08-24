<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useStatisticsStore } from '@/stores/statistics'
import { useAuthStore } from '@/stores/auth'
import { use_async_action } from '@/composables/use_async_action'
import TrendChart from '@/components/charts/TrendChart.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import { format_datetime } from '@/utils/format'

const AUTO_REFRESH_INTERVAL_MS = 60000

const statistics_store = useStatisticsStore()
const auth_store = useAuthStore()
const { statistics } = storeToRefs(statistics_store)
const { run } = use_async_action()

const trend_days = ref('30')
const reset_dialog_open = ref(false)
const resetting = ref(false)

const trend_options = [
  { value: '7', label: '最近 7 天' },
  { value: '14', label: '最近 14 天' },
  { value: '30', label: '最近 30 天' },
]

const summary_items = computed(() => [
  {
    label: '机器人发言总数',
    value: statistics.value?.summary?.sent_total ?? '—',
    icon: 'lucide:message-square-share',
  },
  {
    label: '收到消息总数',
    value: statistics.value?.summary?.received_total ?? '—',
    icon: 'lucide:inbox',
  },
  {
    label: '群聊消息',
    value: statistics.value?.summary?.group_received_total ?? '—',
    icon: 'lucide:users-round',
  },
  {
    label: '今日活跃群聊',
    value: statistics.value?.summary?.active_groups_today ?? '—',
    icon: 'lucide:flame',
  },
])

/** 趋势图数据与序列定义（颜色为字面量，对应 --accent / --success，ECharts canvas 不支持 CSS 变量） */
const trend_series = [
  { key: 'received', name: '收到消息', color: '#2563eb' },
  { key: 'sent', name: '机器人发言', color: '#16a34a' },
]
const trend_items = computed(() =>
  (statistics.value?.trend || []).map((day) => ({
    label: day.date,
    received: day.received,
    sent: day.sent,
  })),
)

/** 活跃群聊排行（相对条形宽度） */
const active_groups = computed(() => statistics.value?.groups || [])
const max_group_count = computed(() =>
  Math.max(1, ...active_groups.value.map((group) => group.received)),
)

/** 平台分布（相对条形宽度） */
const platform_rank = computed(() => statistics.value?.platforms || [])
const max_platform_count = computed(() =>
  Math.max(1, ...platform_rank.value.map((item) => item.count)),
)

const connected_bots = computed(() => statistics.value?.bots || [])

async function refresh() {
  await run(() => statistics_store.fetch_statistics(Number(trend_days.value)), '获取统计数据失败')
}

/** 群聊最近活跃时间（Unix 秒）转可读格式 */
function format_active_time(timestamp_seconds) {
  return format_datetime(new Date(timestamp_seconds * 1000).toISOString())
}

async function confirm_reset() {
  const ok = await run(() => statistics_store.reset_statistics(), '清空统计数据失败', resetting)
  if (ok) reset_dialog_open.value = false
}

let refresh_timer = null

onMounted(() => {
  refresh()
  refresh_timer = setInterval(refresh, AUTO_REFRESH_INTERVAL_MS)
})

onUnmounted(() => clearInterval(refresh_timer))
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">数据统计</h1>
        <p class="page-desc">机器人消息量、活跃群聊与在线账号总览</p>
      </div>
      <div class="page-actions">
        <Select v-model="trend_days" :options="trend_options" @update:model-value="refresh" />
        <Button variant="secondary" :loading="statistics_store.loading" @click="refresh">
          <Icon icon="lucide:refresh-cw" width="15" />
          刷新
        </Button>
        <Button v-if="auth_store.is_admin" variant="danger" @click="reset_dialog_open = true">
          <Icon icon="lucide:eraser" width="15" />
          清空统计
        </Button>
      </div>
    </div>

    <!-- 总览指标 -->
    <section class="stats-strip card">
      <div v-for="item in summary_items" :key="item.label" class="stat-cell">
        <Icon :icon="item.icon" width="16" class="stat-icon" />
        <div class="stat-body">
          <span class="stat-value">{{ item.value }}</span>
          <span class="stat-label">{{ item.label }}</span>
        </div>
      </div>
      <div class="stat-cell">
        <Icon icon="lucide:bot" width="16" class="stat-icon" />
        <div class="stat-body">
          <span class="stat-value">{{ connected_bots.length }}</span>
          <span class="stat-label">已连接机器人</span>
        </div>
      </div>
    </section>

    <!-- 消息趋势 -->
    <section class="card trend-card">
      <div class="card-header">
        <h3 class="card-title">消息趋势</h3>
        <Badge variant="neutral">{{ trend_days }} 天</Badge>
      </div>
      <div class="card-body">
        <TrendChart :items="trend_items" :series="trend_series" />
      </div>
    </section>

    <div class="detail-grid">
      <!-- 活跃群聊排行 -->
      <section class="card">
        <div class="card-header">
          <h3 class="card-title">活跃群聊</h3>
          <Badge variant="accent">累计 {{ statistics?.summary?.tracked_groups ?? 0 }} 个</Badge>
        </div>
        <div class="card-body group-panel">
          <EmptyState
            v-if="active_groups.length === 0"
            icon="lucide:message-circle-off"
            title="暂无群聊数据"
            description="机器人在群聊中收到消息后，这里会展示活跃排行"
          />
          <ul v-else class="group-rows">
            <li v-for="group in active_groups" :key="group.key" class="group-row">
              <Icon icon="lucide:message-circle" width="15" class="group-icon" />
              <div class="group-info">
                <span class="group-name">{{ group.name || group.key }}</span>
                <span class="group-key mono">{{ group.name ? group.key : '' }}</span>
                <div class="group-bar-track">
                  <div
                    class="group-bar"
                    :style="{ width: `${(group.received / max_group_count) * 100}%` }"
                  />
                </div>
              </div>
              <div class="group-meta">
                <span class="group-count">{{ group.received }}</span>
                <span class="group-time text-xs text-muted">{{
                  format_active_time(group.last_active)
                }}</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <div class="side-column">
        <!-- 平台分布 -->
        <section class="card">
          <div class="card-header">
            <h3 class="card-title">平台分布</h3>
          </div>
          <div class="card-body">
            <EmptyState
              v-if="platform_rank.length === 0"
              icon="lucide:radio"
              title="暂无平台数据"
            />
            <ul v-else class="platform-rows">
              <li v-for="item in platform_rank" :key="item.platform" class="platform-row">
                <span class="platform-name">{{ item.platform }}</span>
                <div class="platform-bar-track">
                  <div
                    class="platform-bar"
                    :style="{ width: `${(item.count / max_platform_count) * 100}%` }"
                  />
                </div>
                <span class="platform-count mono">{{ item.count }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- 已连接机器人 -->
        <section class="card">
          <div class="card-header">
            <h3 class="card-title">已连接机器人</h3>
            <Badge :variant="connected_bots.length > 0 ? 'success' : 'danger'">
              {{ connected_bots.length > 0 ? `${connected_bots.length} 个在线` : '暂无连接' }}
            </Badge>
          </div>
          <div class="card-body">
            <EmptyState
              v-if="connected_bots.length === 0"
              icon="lucide:unplug"
              title="暂无机器人连接"
              description="机器人账号通过适配器连接后会显示在这里"
            />
            <ul v-else class="bot-rows">
              <li v-for="account in connected_bots" :key="account.self_id" class="bot-row">
                <span class="status-dot status-dot--on" />
                <span class="bot-id mono">{{ account.self_id }}</span>
                <Badge variant="neutral">
                  <Icon icon="lucide:plug" width="12" />
                  {{ account.adapter }}
                </Badge>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <!-- 清空确认弹窗 -->
    <Dialog
      v-model="reset_dialog_open"
      title="清空统计数据"
      description="将清空全部历史统计数据并立即生效，此操作不可恢复。"
      confirm-text="确认清空"
      confirm-variant="danger"
      :loading="resetting"
      @confirm="confirm_reset"
    />
  </div>
</template>

<style scoped>
.page-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* 总览指标条 */
.stats-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: var(--space-5);
}

.stat-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
}

.stat-cell + .stat-cell {
  border-left: 1px solid var(--border);
}

.stat-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.stat-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-value {
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.trend-card {
  margin-bottom: var(--space-5);
}

/* 双栏明细 */
.detail-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: var(--space-5);
}

.side-column {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* 活跃群聊 */
.group-panel {
  padding: 0;
}

.group-rows {
  display: flex;
  flex-direction: column;
}

.group-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.group-row:last-child {
  border-bottom: none;
}

.group-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.group-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.group-name {
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-key {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.group-bar-track {
  height: 4px;
  border-radius: 2px;
  background: var(--surface-sunken);
  overflow: hidden;
}

.group-bar {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width var(--transition);
}

.group-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.group-count {
  font-size: var(--text-sm);
  font-weight: 700;
}

/* 平台分布 */
.platform-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.platform-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.platform-name {
  width: 88px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.platform-bar-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--surface-sunken);
  overflow: hidden;
}

.platform-bar {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  opacity: 0.75;
}

.platform-count {
  width: 48px;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 已连接机器人 */
.bot-rows {
  display: flex;
  flex-direction: column;
}

.bot-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

.bot-row:last-child {
  border-bottom: none;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--on {
  background: var(--success);
}

.bot-id {
  flex: 1;
  font-size: var(--text-sm);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1100px) {
  .stats-strip {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-cell:nth-child(odd) {
    border-left: none;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
