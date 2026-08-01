<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { StreamLanguage } from '@codemirror/language'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 高亮语言：toml | properties */
  language: { type: String, default: 'toml' },
})

const emit = defineEmits(['update:modelValue'])

const container = ref(null)
let view = null

function language_ext() {
  return StreamLanguage.define(props.language === 'properties' ? properties : toml)
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
  <div ref="container" class="code-editor" />
</template>

<style scoped>
.code-editor {
  height: 100%;
  min-height: 200px;
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
