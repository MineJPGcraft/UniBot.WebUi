<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { StreamLanguage } from '@codemirror/language'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 高亮语言：toml | properties | yaml */
  language: { type: String, default: 'toml' },
  /** 只读模式：仅展示与选中，不可编辑（供 CodePanel 等复用） */
  readOnly: { type: Boolean, default: false },
  /** 最小高度，如 '0'、'200px'；默认 200px */
  minHeight: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const container = ref(null)
let view = null

const container_style = computed(() => ({ minHeight: props.minHeight || '200px' }))

function language_ext() {
  const modes = { toml, properties, yaml }
  return StreamLanguage.define(modes[props.language] || toml)
}

// 匹配项目亮色主题
const custom_theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: 'var(--surface-sunken)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.7',
  },
  '.cm-content': {
    caretColor: 'var(--text)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-sunken)',
    color: 'var(--text-muted)',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgb(0 0 0 / 0.02)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgb(0 0 0 / 0.03)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--accent-soft)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--accent-soft)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
})

function extensions() {
  return [
    basicSetup,
    language_ext(),
    EditorView.lineWrapping,
    custom_theme,
    ...(props.readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
    }),
  ]
}

onMounted(() => {
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: extensions(),
  })
  view = new EditorView({ state, parent: container.value })
})

watch(
  () => props.modelValue,
  (value) => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  },
)

watch(
  () => props.language,
  () => {
    if (view) {
      view.dispatch({ effects: EditorState.reconfigure.of(extensions()) })
    }
  },
)

onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div ref="container" class="code-editor" :style="container_style" />
</template>

<style scoped>
.code-editor {
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-sunken);
}

/* 覆盖全局 ::selection 的白字，保证选中文本在浅色高亮下可读 */
.code-editor ::selection {
  background: var(--accent-soft);
  color: var(--text);
}
</style>
