<script setup>
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { use_async_action } from '@/composables/use_async_action'
import Dialog from '@/components/ui/Dialog.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import CodePanel from '@/components/ui/CodePanel.vue'

const open = defineModel({ type: Boolean, default: false })

const config_store = useConfigStore()
const { env_values } = storeToRefs(config_store)
const { run, busy } = use_async_action()

/** 服务器名称，两端配置中的 server_name 必须一致 */
const server_name = ref('survival')

/** 鉴权令牌，两端保持一致；留空则不校验 */
const access_token = ref('')

/** Bot → MC 模式下 MC 服务器端 WebSocket 地址 */
const mc_ws_url = ref('')

/** 当前连接方式：mc_to_bot = MC 服务器主动连接核心；bot_to_mc = 核心主动连接 MC 服务器 */
const active_tab = ref('mc_to_bot')

/** 核心配置是否已写入 */
const write_done = ref(false)

/** 配置中展示的服务器名称，未填写时用占位符提醒 */
const display_name = computed(() => server_name.value.trim() || '<服务器名称>')

/** 配置中展示的鉴权令牌 */
const display_token = computed(() => access_token.value.trim())

/** MC 服务器地址是否有效（仅 Bot → MC 模式需要） */
const mc_ws_url_valid = computed(() => /^wss?:\/\//.test(mc_ws_url.value.trim()))

/**
 * 核心侧 WebSocket 地址
 * WebUI 与机器人核心同端口部署，直接取当前访问地址生成，路径固定 /minecraft/ws
 */
const core_ws_url = computed(() => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/minecraft/ws`
})

/** 写入核心配置的键值（MC → Bot 只写令牌；Bot → MC 额外合并写入 WS 地址表） */
function core_env_fields() {
  const fields = { MINECRAFT_ACCESS_TOKEN: display_token.value }
  if (active_tab.value !== 'bot_to_mc') return fields

  const existing = env_values.value?.MINECRAFT_WS_URLS
  const merged =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {}
  merged[display_name.value] = [mc_ws_url.value.trim()]
  fields.MINECRAFT_WS_URLS = merged
  return fields
}

async function write_core_config() {
  const ok = await run(
    () => config_store.save_env_fields(core_env_fields()),
    '写入核心配置失败',
    busy,
  )
  if (ok) write_done.value = true
}

/** 输入变化后已写入状态失效 */
watch([server_name, access_token, mc_ws_url, active_tab], () => {
  write_done.value = false
})

/** MC 服务器侧鹊桥配置（可直接复制） */
const server_block = computed(() => ({
  title: 'MC 服务器侧 · 鹊桥（config.yml）',
  language: 'yaml',
  code:
    active_tab.value === 'mc_to_bot'
      ? [
          `server_name: "${display_name.value}"`,
          `access_token: "${display_token.value}"`,
          '',
          '# 反向 WebSocket：MC 服务器主动连接核心',
          'websocket_client:',
          '  enable: true',
          '  reconnect_interval: 5',
          '  reconnect_max_times: 5',
          '  url_list:',
          `    - "${core_ws_url.value}"`,
          '',
          'websocket_server:',
          '  enable: false',
        ].join('\n')
      : [
          `server_name: "${display_name.value}"`,
          `access_token: "${display_token.value}"`,
          '',
          '# 正向 WebSocket：MC 服务器开放监听端口，等待核心接入',
          'websocket_server:',
          '  enable: true',
          '  host: "0.0.0.0"',
          '  port: 8080',
          '',
          'websocket_client:',
          '  enable: false',
        ].join('\n'),
}))
</script>

<template>
  <Dialog
    v-model="open"
    title="接入 Minecraft 服务器"
    description="选择连接方式后，核心侧一键写入，MC 侧复制到鹊桥配置文件即可。"
    :hide-footer="true"
    width="min(640px, calc(100vw - 32px))"
  >
    <div class="connect-guide">
      <!-- 基础信息 -->
      <div class="basic-fields">
        <div class="field">
          <label class="field-label" for="mc-connect-server-name">服务器名称</label>
          <Input id="mc-connect-server-name" v-model="server_name" placeholder="例如 survival" />
        </div>
        <div class="field">
          <label class="field-label" for="mc-connect-access-token">鉴权令牌</label>
          <Input
            id="mc-connect-access-token"
            v-model="access_token"
            placeholder="选填，留空则不校验"
          />
        </div>
        <div v-if="active_tab === 'bot_to_mc'" class="field field--full">
          <label class="field-label" for="mc-connect-server-url">MC 服务器地址</label>
          <Input
            id="mc-connect-server-url"
            v-model="mc_ws_url"
            placeholder="ws://<MC服务器IP>:8080/mc"
          />
        </div>
      </div>

      <!-- 连接方式 -->
      <Tabs
        v-model="active_tab"
        :tabs="[
          { value: 'mc_to_bot', label: 'MC → Bot' },
          { value: 'bot_to_mc', label: 'Bot → MC' },
        ]"
      >
        <template #[active_tab]>
          <p v-if="active_tab === 'mc_to_bot'" class="mode-note mode-note--recommend">
            <Icon icon="lucide:thumbs-up" width="13" />
            推荐：MC 服务器主动连接核心，MC 侧无需开放端口；核心地址已按当前访问地址自动生成。
          </p>
          <p v-else class="mode-note">
            <Icon icon="lucide:info" width="13" />
            核心主动连接 MC 服务器，需要 MC 侧开放监听端口，地址填 MC 服务器可被访问的 WebSocket
            地址。
          </p>

          <!-- 核心侧：一键写入 -->
          <div class="core-card">
            <div class="core-card-head">
              <span class="core-card-title">
                <Icon icon="lucide:server" width="14" />
                核心侧 · UniBot
              </span>
              <span v-if="write_done" class="core-card-done">
                <Icon icon="lucide:circle-check" width="14" />
                已写入，重启机器人后生效
              </span>
            </div>
            <p class="core-card-desc">
              {{
                active_tab === 'mc_to_bot'
                  ? '将把鉴权令牌写入 .env（MINECRAFT_ACCESS_TOKEN），WS 地址保持为空。'
                  : '将把该服务器的地址与令牌写入 .env（MINECRAFT_WS_URLS / MINECRAFT_ACCESS_TOKEN），已有其他服务器不受影响。'
              }}
            </p>
            <Button
              size="sm"
              :variant="write_done ? 'secondary' : 'primary'"
              :disabled="active_tab === 'bot_to_mc' && !mc_ws_url_valid"
              :loading="busy"
              @click="write_core_config"
            >
              <Icon :icon="write_done ? 'lucide:check' : 'lucide:pen-line'" width="14" />
              {{ write_done ? '已写入' : '写入核心配置' }}
            </Button>
          </div>

          <!-- MC 侧：复制配置 -->
          <CodePanel
            class="mode-panel"
            :title="server_block.title"
            :language="server_block.language"
            :code="server_block.code"
          />
        </template>
      </Tabs>

      <p class="config-tip">
        鹊桥插件端配置位于 <code class="mono">./plugins/QueQiao/config.yml</code>， 模组端位于
        <code class="mono">./config/QueQiao/config.yml</code>； 两端的
        <code class="mono">server_name</code> 与令牌必须一致。
      </p>

      <!-- 文档引导 -->
      <a
        class="docs-entry"
        href="https://bot.mcjpg.dev/adapter/usage.html"
        target="_blank"
        rel="noopener"
      >
        <span class="docs-entry-icon">
          <Icon icon="lucide:book-open" width="16" />
        </span>
        <span class="docs-entry-body">
          <span class="docs-entry-title">查看完整接入文档</span>
          <span class="docs-entry-desc">MCDR 插件接入、Header 鉴权、基岩版支持等</span>
        </span>
        <Icon icon="lucide:chevron-right" width="16" class="docs-entry-arrow" />
      </a>
    </div>
  </Dialog>
</template>

<style scoped>
.connect-guide {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.basic-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field--full {
  grid-column: 1 / -1;
}

.field-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
}

.mode-note {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.6;
}

.mode-note svg {
  flex-shrink: 0;
}

.mode-note--recommend {
  background: var(--accent-soft);
  color: var(--text-secondary);
}

.mode-note--recommend svg {
  color: var(--accent);
}

/* 核心侧写入卡 */
.core-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

.core-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.core-card-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.core-card-done {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--success);
}

.core-card-desc {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.6;
}

.mode-panel {
  margin-top: var(--space-1);
}

.config-tip {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.7;
}

/* 文档入口 */
.docs-entry {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  transition:
    border-color var(--transition),
    background-color var(--transition);
}

.docs-entry:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.docs-entry-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.docs-entry-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.docs-entry-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.docs-entry-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.docs-entry-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
  transition:
    transform var(--transition),
    color var(--transition);
}

.docs-entry:hover .docs-entry-arrow {
  transform: translateX(2px);
  color: var(--accent);
}
</style>
