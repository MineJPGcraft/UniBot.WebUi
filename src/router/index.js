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
      meta: { title: '登录', public: true },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'DashboardView',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '仪表盘' },
        },
        {
          path: 'servers',
          name: 'ServersView',
          component: () => import('@/views/ServersView.vue'),
          meta: { title: '服务器管理' },
        },
        {
          path: 'servers/:name',
          name: 'ServerDetailView',
          component: () => import('@/views/ServerDetailView.vue'),
          meta: { title: '服务器详情' },
        },
        {
          path: 'players',
          name: 'PlayersView',
          component: () => import('@/views/PlayersView.vue'),
          meta: { title: '玩家绑定' },
        },
        {
          path: 'config',
          name: 'ConfigView',
          component: () => import('@/views/ConfigView.vue'),
          meta: { title: '配置中心', admin_only: true },
        },
        {
          path: 'logs',
          name: 'LogsView',
          component: () => import('@/views/LogsView.vue'),
          meta: { title: '日志查看器' },
        },
        {
          path: 'plugins',
          name: 'PluginsView',
          component: () => import('@/views/PluginsView.vue'),
          meta: { title: '插件管理' },
        },
        {
          path: 'adapters',
          name: 'AdaptersView',
          component: () => import('@/views/AdaptersView.vue'),
          meta: { title: '适配器管理' },
        },
        {
          path: 'users',
          name: 'UsersView',
          component: () => import('@/views/UsersView.vue'),
          meta: { title: '用户管理', admin_only: true },
        },
        {
          path: 'settings',
          name: 'SettingsView',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: '个人设置' },
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
