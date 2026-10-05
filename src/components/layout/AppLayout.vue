<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'
import StatusBar from './StatusBar.vue'
import RestartPrompt from './RestartPrompt.vue'
import UpdatePrompt from './UpdatePrompt.vue'
import { useAuthStore } from '@/stores/auth'
import { useStatusStore } from '@/stores/status'
import { use_websocket } from '@/composables/use_websocket'
import { use_locale_refresh } from '@/composables/use_locale_refresh'

const auth_store = useAuthStore()
const status_store = useStatusStore()
const { status } = storeToRefs(status_store)
const { connect, disconnect } = use_websocket()

// 界面语言切换后重拉已加载的语言相关数据（配置 schema / 适配器 / 扩展 / 插件等）
use_locale_refresh()

onMounted(() => {
  auth_store.fetch_me().catch((error) => console.warn('fetch_me failed', error))
  status_store.fetch_status().catch((error) => console.warn('fetch_status failed', error))
  status_store.init()
  connect()
})

onUnmounted(() => {
  status_store.dispose()
  disconnect()
})
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <div class="app-main">
      <TopBar />
      <main class="app-content">
        <RouterView v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
      <StatusBar />
    </div>
    <RestartPrompt />
    <UpdatePrompt />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
</style>
