import { createRouter, createWebHistory } from 'vue-router'
import { is_authenticated } from '@/utils/http'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/components/layout/AppLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'LoginView',
      component: () => import('@/views/LoginView.vue'),
      meta: { title_key: 'nav.login', public: true },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'DashboardView',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title_key: 'nav.dashboard' },
        },
        {
          path: 'servers',
          name: 'ServersView',
          component: () => import('@/views/ServersView.vue'),
          meta: { title_key: 'nav.servers' },
        },
        {
          path: 'servers/:name',
          name: 'ServerDetailView',
          component: () => import('@/views/ServerDetailView.vue'),
          meta: { title_key: 'nav.server_detail' },
        },
        {
          path: 'players',
          name: 'PlayersView',
          component: () => import('@/views/PlayersView.vue'),
          meta: { title_key: 'nav.players' },
        },
        {
          path: 'config',
          name: 'ConfigView',
          component: () => import('@/views/ConfigView.vue'),
          meta: { title_key: 'nav.config', admin_only: true },
        },
        {
          path: 'logs',
          name: 'LogsView',
          component: () => import('@/views/LogsView.vue'),
          meta: { title_key: 'nav.logs' },
        },
        {
          path: 'statistics',
          name: 'StatisticsView',
          component: () => import('@/views/StatisticsView.vue'),
          meta: { title_key: 'nav.statistics' },
        },
        {
          path: 'plugins',
          name: 'PluginsView',
          component: () => import('@/views/PluginsView.vue'),
          meta: { title_key: 'nav.plugins' },
        },
        {
          path: 'extensions',
          name: 'ExtensionsView',
          component: () => import('@/views/ExtensionsView.vue'),
          meta: { title_key: 'nav.extensions' },
        },
        {
          path: 'adapters',
          name: 'AdaptersView',
          component: () => import('@/views/AdaptersView.vue'),
          meta: { title_key: 'nav.adapters' },
        },
        {
          path: 'users',
          name: 'UsersView',
          component: () => import('@/views/UsersView.vue'),
          meta: { title_key: 'nav.users', admin_only: true },
        },
        {
          path: 'settings',
          name: 'SettingsView',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title_key: 'nav.settings' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const logged_in = is_authenticated()

  // 未登录：仅允许访问登录页
  if (!logged_in && !to.meta.public) {
    return { name: 'LoginView' }
  }

  // 已登录访问登录页：重定向到首页
  if (logged_in && to.meta.public) {
    return { path: '/' }
  }

  // 管理员专属页面校验
  if (to.meta.admin_only && logged_in) {
    const auth_store = useAuthStore()
    if (!auth_store.user) {
      try {
        await auth_store.fetch_me()
      } catch {
        return { name: 'LoginView' }
      }
    }
    if (auth_store.user.role !== 'admin') {
      return { path: '/' }
    }
  }
})

// 全局未授权事件：跳转到登录页
window.addEventListener('unibot:unauthorized', () => {
  if (router.currentRoute.value.name !== 'LoginView') {
    router.push({ name: 'LoginView' })
  }
})

export default router
