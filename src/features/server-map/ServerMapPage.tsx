import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiError, getServerMap } from '@/api'
import { Button, Card, IconDbCylinder, IconRefresh, Input, StatusDot } from '@/design-system'
import { useServiceName, useTimeWindow } from '@/stores'
import { AlertStrip } from './AlertStrip'
import { toGraph } from './model'
import { ScatterCard } from './ScatterCard'
import { SelectedNodeCard } from './SelectedNodeCard'
import { ServerMapGraph } from './ServerMapGraph'
import { TopUrlCard } from './TopUrlCard'
import './ServerMap.css'

/** Service map (S01) — 서비스 간 호출량 · 에러 · 평균 소요시간 그래프와 선택한 노드 요약 */
export function ServerMapPage() {
  const serviceName = useServiceName()
  const { from, to } = useTimeWindow()
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['server-map', serviceName, from, to],
    queryFn: ({ signal }) => getServerMap({ serviceName, from, to }, signal),
    // 새로고침 · 시간 범위 변경 중에도 이전 그래프를 그대로 보여 준다
    placeholderData: keepPreviousData,
  })
  const graph = useMemo(() => (data ? toGraph(data) : undefined), [data])

  // 처음에는 상단바에서 고른 서비스가 선택된다. 노드를 누르면 그 노드로 바뀌고, 상단바 서비스를 바꾸면 다시 따라간다
  const [picked, setPicked] = useState<{ for: string | null; name: string } | null>(null)
  const selected = picked && picked.for === serviceName ? picked.name : serviceName
  const [query, setQuery] = useState('')
  const [layoutNonce, setLayoutNonce] = useState(0)

  let state: string | null = null
  if (isPending) state = 'Service map 을 불러오는 중입니다…'
  else if (error && !graph) state = `Service map 을 불러오지 못했습니다. ${error instanceof ApiError ? `(${error.code})` : ''}`
  else if (graph && graph.nodes.length === 0) state = '이 시간 범위에 기록된 호출이 없습니다.'

  // 스캐터 · 상위 URL 은 서비스 노드에서만 나온다 (DB · 외부는 스팬을 보내지 않는다)
  const kind = graph?.nodes.find((n) => n.name === selected)?.kind
  const sideService = kind === 'SERVICE' ? selected : null
  const sideNotice = kind ? 'DB · 외부 노드에는 요청 기록이 없습니다. 서비스 노드를 고르면 나옵니다.' : '그래프에서 서비스 노드를 누르면 나옵니다.'

  return (
    <div className="sm-screen">
      <AlertStrip />
      <div className="sm-page">
        <Card className="sm-graph-card">
          <div className="sm-toolbar">
            <Input
              className="sm-toolbar__search"
              type="search"
              aria-label="서비스 검색"
              placeholder="서비스 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button icon={<IconRefresh />} onClick={() => setLayoutNonce((n) => n + 1)} disabled={!graph?.nodes.length}>
              레이아웃 재정렬
            </Button>
            <div className="sm-legend text-micro-11" aria-label="범례">
              <span className="sm-legend__item"><StatusDot tone="ok" />정상</span>
              <span className="sm-legend__item"><StatusDot tone="warn" />경고</span>
              <span className="sm-legend__item"><StatusDot tone="crit" />에러</span>
              <span className="sm-legend__item"><IconDbCylinder size={14} />DB</span>
              <span className="sm-legend__item"><span className="sm-legend__ext" aria-hidden />외부</span>
              <span className="sm-legend__item"><span className="sm-legend__msg" aria-hidden />비동기</span>
            </div>
          </div>
          <div className={`sm-canvas${isFetching && !isPending ? ' is-loading' : ''}`} aria-busy={isFetching}>
            {graph && graph.nodes.length > 0 ? (
              <ServerMapGraph
                graph={graph}
                selected={selected}
                onSelect={(name) => setPicked({ for: serviceName, name })}
                query={query}
                layoutNonce={layoutNonce}
              />
            ) : null}
            {state ? (
              <div className="sm-canvas__state text-body-13" role={error ? 'alert' : 'status'}>
                <div>
                  <p style={{ margin: '0 0 8px' }}>{state}</p>
                  {error && !graph ? <Button onClick={() => refetch()}>다시 시도</Button> : null}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
        <aside className="sm-aside" aria-label="선택한 노드 정보">
          <SelectedNodeCard graph={graph} selected={selected} />
          <ScatterCard serviceName={sideService} notice={sideNotice} />
          <TopUrlCard serviceName={sideService} notice={sideNotice} />
        </aside>
      </div>
    </div>
  )
}
