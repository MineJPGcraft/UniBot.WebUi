<script setup>
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useStatusStore } from '@/stores/status'
import { use_poem } from '@/composables/use_poem'
import { format_uptime, format_mb } from '@/utils/format'

const status_store = useStatusStore()
const { status } = storeToRefs(status_store)

const uptime_text = computed(() => format_uptime(status.value?.uptime))

const { poem, loading, load_poem } = use_poem()

onMounted(load_poem)
</script>

<template>
  <footer class="statusbar">
    <span>UniBot {{ status?.version || '—' }}</span>
    <span class="statusbar-sep">·</span>
    <span>运行 {{ uptime_text }}</span>
    <span class="statusbar-sep">·</span>
    <span>内存 {{ format_mb(status?.memory_mb) }}</span>
    <span class="statusbar-sep">·</span>
    <span>CPU {{ status?.cpu_percent ?? '—' }}%</span>
    <span v-if="loading" class="statusbar-poem">正在加载诗词…</span>
    <span v-else-if="poem" class="statusbar-poem" title="点击换一句" @click="load_poem()">
      {{ poem }}
    </span>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--statusbar-height);
  padding: 0 var(--space-6);
  background: var(--surface);
  border-top: 1px solid var(--border);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.statusbar-sep {
  color: var(--border-strong);
}

.statusbar-poem {
  margin-left: auto;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: color 150ms ease-out;
}

.statusbar-poem:hover {
  color: var(--accent);
}
</style>
