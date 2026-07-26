<script setup>
import Dialog from '@/components/ui/Dialog.vue'
import { use_restart } from '@/composables/use_restart'

const { prompt_open, prompt_title, prompt_message, restarting, restart_bot } = use_restart()
</script>

<template>
  <Dialog
    v-model="prompt_open"
    :title="prompt_title || '需要重启机器人'"
    :description="prompt_message"
    confirm-text="立即重启"
    cancel-text="稍后手动重启"
    confirm-variant="danger"
    :loading="restarting"
    @confirm="restart_bot"
  />
</template>
