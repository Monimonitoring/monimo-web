import { Badge, Card } from '@/design-system'
import { useFilters, type TimeRange } from '@/stores'
import { errorRate, fmtCount, incomingAvg, type MapGraph } from './model'

const RANGE_LABEL = { '5m': '최근 5분', '15m': '최근 15분', '1h': '최근 1시간', '6h': '최근 6시간', '24h': '최근 24시간' } as const
const rangeLabel = (r: TimeRange) => (r.kind === 'preset' ? RANGE_LABEL[r.preset] : '사용자 지정 범위')

/** 선택한 노드 요약 — cnt · err_cnt · 에러율 · avg(들어오는 간선의 avg_duration_ms) */
export function SelectedNodeCard({ graph, selected }: { graph: MapGraph | undefined; selected: string | null }) {
  const range = useFilters((s) => s.range)
  const node = graph?.nodes.find((n) => n.name === selected)

  if (!graph || !node) {
    return (
      <Card title="선택한 노드">
        <p className="sm-picked__note text-body-13">그래프에서 노드를 누르면 호출 수 · 에러 · 평균 소요시간이 여기에 나옵니다.</p>
      </Card>
    )
  }

  const avg = incomingAvg(graph, node.name)
  const tone = `sm-err--${node.health}`
  return (
    <Card>
      <div className="sm-picked__head">
        <h2 className="text-section-15" style={{ margin: 0 }}>선택한 노드</h2>
        <Badge tone="accent" className="text-mono-12-strong">{node.name}</Badge>
        <span className="sm-picked__range text-caption-12">{rangeLabel(range)}</span>
      </div>
      <dl className="sm-picked__stats">
        <div>
          <dt className="text-micro-11">cnt</dt>
          <dd className="text-number-28">{fmtCount(node.cnt)}</dd>
        </div>
        <div>
          <dt className="text-micro-11">err_cnt</dt>
          <dd className={`text-number-28 ${tone}`}>{fmtCount(node.errCnt)}</dd>
        </div>
        <div>
          <dt className="text-micro-11">에러율</dt>
          <dd className={`text-number-28 ${tone}`}>{(errorRate(node.cnt, node.errCnt) * 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt className="text-micro-11">avg</dt>
          <dd className="text-number-28">
            {avg ? Math.round(avg.avgMs).toLocaleString('en-US') : '—'}
            {avg ? <span className="sm-picked__unit text-caption-12">ms</span> : null}
          </dd>
        </div>
      </dl>
      <p className="sm-picked__note text-caption-12">
        {!avg
          ? '들어오는 간선이 없어 평균 소요시간이 없습니다 (가장 앞에서 부르는 서비스).'
          : avg.edges.length === 1
            ? `avg 는 간선 ${avg.edges[0].caller_service} → ${node.name} 의 avg_duration_ms(소수 1자리). 노드 err 는 5xx 만, 간선 err 는 4xx 도 센다 · Collector 1 % 샘플이라 cnt 는 표본 수(보정 없음)`
            : `avg 는 들어오는 간선 ${avg.edges.length}개의 avg_duration_ms(소수 1자리)를 호출 수로 가중 평균한 값입니다. 노드 err 는 5xx 만, 간선 err 는 4xx 도 센다 · Collector 1 % 샘플이라 cnt 는 표본 수(보정 없음)`}
      </p>
    </Card>
  )
}
