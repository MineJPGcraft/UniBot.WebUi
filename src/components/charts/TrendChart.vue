<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'

// 按需注册：柱状图 + 网格/图例/提示框 + Canvas 渲染
use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({
  /** 数据项：[{ label: '2026-08-24', ...series.key ]} */
  items: { type: Array, required: true },
  /** 序列定义：[{ key: 'received', name: '接收', color: '#2563eb' }] */
  series: { type: Array, required: true },
})

/** ECharts 用 canvas 渲染，颜色需为字面量，无法解析 CSS 变量 */
const chart_option = computed(() => ({
  grid: { left: 44, right: 12, top: 28, bottom: 24 },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    confine: true,
  },
  legend: {
    top: 0,
    left: 'center',
    icon: 'roundRect',
    itemWidth: 10,
    itemHeight: 10,
    textStyle: { color: '#71717a', fontSize: 12 },
  },
  xAxis: {
    type: 'category',
    data: props.items.map((item) => item.label),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#e4e4e7' } },
    axisLabel: {
      color: '#71717a',
      fontSize: 10,
      // 标签格式化为 MM-DD，并抽样避免重叠
      formatter: (value) => value.slice(5),
      interval: Math.max(0, Math.ceil(props.items.length / 8) - 1),
    },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#e4e4e7' } },
    axisLabel: { color: '#71717a', fontSize: 10 },
  },
  series: props.series.map((serie) => ({
    name: serie.name,
    type: 'bar',
    data: props.items.map((item) => Number(item[serie.key]) || 0),
    itemStyle: { color: serie.color, borderRadius: [2, 2, 0, 0] },
    barMaxWidth: 14,
  })),
}))
</script>

<template>
  <VChart class="trend-chart" :option="chart_option" autoresize />
</template>

<style scoped>
.trend-chart {
  width: 100%;
  height: 260px;
}
</style>
