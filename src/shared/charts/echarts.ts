// ECharts 등록. 전체(echarts)를 통째로 넣지 않고 쓰는 차트 · 부품만 골라 넣어 번들을 줄인다.
// 화면이 새 차트 종류(예: 파이)가 필요하면 여기에 한 줄 추가한다.
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts'
import { BrushComponent, GridComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, VisualMapPiecewiseComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  ScatterChart, // 트랜잭션 스캐터 (06 P5)
  HeatmapChart, // 트랜잭션 히트맵
  LineChart, // Inspector 지표 · avg 선 + min–max 밴드
  BarChart, // 에러 시간대별 건수
  GridComponent,
  TooltipComponent,
  BrushComponent, // 스캐터 드래그 선택
  ToolboxComponent, // brush 가 내부에서 toolbox 기능을 같이 등록해 없으면 콘솔에 오류를 찍는다. 버튼은 BrushChart 가 숨긴다
  MarkLineComponent, // 임계값 선
  VisualMapPiecewiseComponent, // 히트맵 필수 — 06 P5 농도 5단계 + 에러 색을 구간별로 칠한다
  CanvasRenderer,
])
// 범례(Legend) · 확대(DataZoom) · 연속 색 범례(VisualMapContinuous) · 표시 영역(MarkArea) 은 쓰는 화면이 생길 때 여기에 추가한다 (번들 크기 때문에 미리 넣지 않음)

export { echarts }
export type { EChartsCoreOption as ChartOption, ECharts as ChartInstance, ECElementEvent as ChartEvent } from 'echarts/core'
