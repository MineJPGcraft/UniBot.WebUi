<script setup>
import { RouterLink } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/stores/auth'
import { use_restart } from '@/composables/use_restart'

const auth_store = useAuthStore()
const { restarting, ask_restart } = use_restart()

const nav_items = [
  { path: '/', label: '仪表盘', icon: 'lucide:layout-dashboard', admin_only: false },
  { path: '/servers', label: '服务器', icon: 'lucide:server', admin_only: false },
  { path: '/players', label: '玩家', icon: 'lucide:users', admin_only: false },
  { path: '/config', label: '配置', icon: 'lucide:settings-2', admin_only: true },
  { path: '/logs', label: '日志', icon: 'lucide:scroll-text', admin_only: false },
  { path: '/plugins', label: '插件', icon: 'lucide:puzzle', admin_only: false },
  { path: '/adapters', label: '适配器', icon: 'lucide:unplug', admin_only: false },
  { path: '/users', label: '用户', icon: 'lucide:shield-check', admin_only: true },
]
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-logo">
        <Icon icon="lucide:bot" width="20" />
      </div>
      <div class="brand-text">
        <span class="brand-name">UniBot</span>
        <span class="brand-sub">控制面板</span>
      </div>
      <button
        v-if="auth_store.is_admin"
        class="restart-button"
        type="button"
        title="重启机器人"
        aria-label="重启机器人"
        :disabled="restarting"
        @click="ask_restart('当前连接会短暂中断，服务恢复后页面将自动刷新。', '确认重启机器人？')"
      >
        <Icon icon="lucide:refresh-cw" width="16" :class="{ spinning: restarting }" />
      </button>
    </div>

    <nav class="sidebar-nav">
      <RouterLink
        v-for="item in nav_items.filter((nav) => !nav.admin_only || auth_store.is_admin)"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ 'nav-item--exact': item.path === '/' }"
      >
        <Icon :icon="item.icon" width="16" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar-footer">
      <RouterLink to="/settings" class="nav-item">
        <Icon icon="lucide:settings" width="16" />
        <span>个人设置</span>
      </RouterLink>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  height: 100%;
  background: var(--surface);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4);
  border-bottom: 1px solid var(--border);
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
  flex: 1;
}

.brand-name {
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.brand-sub {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.restart-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color var(--transition),
    color var(--transition);
}

.restart-button:hover:not(:disabled) {
  background: var(--danger-soft);
  color: var(--danger);
}

.restart-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.restart-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  overflow-y: auto;
}

.sidebar-footer {
  padding: var(--space-3);
  border-top: 1px solid var(--border);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
  transition:
    background-color var(--transition),
    color var(--transition);
}

.nav-item:hover {
  background: rgb(0 0 0 / 0.04);
  color: var(--text);
}

.nav-item.router-link-active {
  background: var(--accent-soft);
  color: var(--accent);
}

/* 非首页的精确匹配由嵌套路由天然保证，这里仅首页需 exact */
.nav-item--exact.router-link-active:not(.router-link-exact-active) {
  background: transparent;
  color: var(--text-muted);
}
</style>
