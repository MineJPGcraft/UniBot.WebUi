/**
 * 今日诗词随机古诗词（浏览器端）
 * - 基于 jinrishici SDK，自动处理 token 存储与智能推荐
 * - 加载失败时静默降级，不阻塞脚栏
 */
import { ref } from 'vue'
import { load as load_poem_sentence } from 'jinrishici'

const poem = ref('')
const loading = ref(false)

function load_poem() {
  loading.value = true
  load_poem_sentence(
    (result) => {
      const { content, origin } = result.data
      poem.value = `${content}  —— 《${origin.title}》${origin.dynasty} · ${origin.author}`
      loading.value = false
    },
    () => {
      // 接口失败时静默隐藏，不打扰用户
      loading.value = false
    },
  )
}

export function use_poem() {
  return { poem, loading, load_poem }
}
