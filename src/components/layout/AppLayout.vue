<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'
import StatusBar from './StatusBar.vue'
import RestartPrompt from './RestartPrompt.vue'
import { useAuthStore } from '@/stores/auth'
import { useStatusStore } from '@/stores/status'
import { use_websocket } from '@/composables/use_websocket'

const auth_store = useAuthStore()
const status_store = useStatusStore()
const { status } = storeToRefs(status_store)
const { connect, disconnect } = use_websocket()

onMounted(() => {
  auth_store.fetch_me().catch(() => {})
  status_store.fetch_status().catch(() => {})
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
