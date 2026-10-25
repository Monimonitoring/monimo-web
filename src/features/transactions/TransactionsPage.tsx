import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { getHeatmap, getScatter, listAgents } from '@/api'
import { Card, Tabs } from '@/design-system'
import { useServiceName, useTimeWindow } from '@/stores'
import { DistributionPanel, type View } from './DistributionPanel'
import { heatmapStepSec } from './heatmap'
import { selectedCount, type ResultFilter, type Selection } from './selection'
import { TransactionTable } from './TransactionTable'
import { UrlStatsTable } from './UrlStatsTable'
import './Transactions.css'

/** 스캐터에 그릴 점 상한. 넘으면 서버가 격자로 접는다(mode=bucketed) */
const SCATTER_LIMIT = 5000

type Tab = 'requests' | 'urls'

/** 트랜잭션 (S02) — 응답시간 스캐터 · 히트맵에서 드래그로 긁은 영역의 요청 목록, URL 통계 */
export function TransactionsPage() {
  const serviceName = useServiceName()
  if (!serviceName) {
    return (
      <Card title="서비스를 골라 주세요">
        <p className="tx-empty text-body-13">트랜잭션은 서비스 하나씩 봅니다. 상단바에서 서비스를 고르면 응답시간 분포가 나옵니다.</p>
      </Card>
    )
  }
  // 서비스가 바뀌면 필터 · 선택을 처음부터
  return <ServiceTransactions key={serviceName} serviceName={serviceName} />
}

function ServiceTransactions({ serviceName }: { serviceName: string }) {
  const { from, to } = useTimeWindow()
  const [view, setView] = useState<View>('scatter')
  const [agentKey, setAgentKey] = useState('')
  const [result, setResult] = useState<ResultFilter>('all')
  const [selection, setSelection] = useState<Selection | null>(null)

  // 아래 탭은 주소(tab=urls)에 둔다 — Service map 의 「URL 통계 전체」 링크가 바로 연다. 기록은 남기지 않는다
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'urls' ? 'urls' : 'requests'
  const setTab = (t: Tab) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (t === 'urls') next.set('tab', 'urls')
        else next.delete('tab')
        return next
      },
      { replace: true },
    )

  const agents = useQuery({
    queryKey: ['agents', serviceName],
    queryFn: ({ signal }) => listAgents({ serviceName, limit: 500 }, signal),
    staleTime: 5 * 60_000,
  })
  // 선택 건수를 세려고 스캐터는 히트맵 보기에서도 불러 둔다
  const scatter = useQuery({
    queryKey: ['scatter', serviceName, from, to, agentKey, SCATTER_LIMIT],
    queryFn: ({ signal }) => getScatter({ serviceName, from, to, agentKey: agentKey || undefined, limit: SCATTER_LIMIT }, signal),
    placeholderData: keepPreviousData,
  })
  const step = heatmapStepSec(from, to)
  const heatmap = useQuery({
    queryKey: ['heatmap', serviceName, from, to, step],
    queryFn: ({ signal }) => getHeatmap({ serviceName, from, to, step }, signal),
    enabled: view === 'heatmap',
    placeholderData: keepPreviousData,
  })

  // 선택 건수 — 스캐터 머리말과 탭 이름이 같은 값을 쓴다
  const count = useMemo(() => selectedCount(scatter.data, selection, result), [scatter.data, selection, result])

  const tabs = (
    <Tabs<Tab>
      aria-label="아래 표"
      value={tab}
      onChange={setTab}
      items={[
        { value: 'requests', label: `선택 영역 요청 목록${count ? ` (${count.total.toLocaleString('en-US')})` : ''}` },
        { value: 'urls', label: 'URL 통계' },
      ]}
    />
  )

  return (
    <div className="tx-page">
      <DistributionPanel
        view={view}
        onView={setView}
        scatter={scatter.data}
        scatterError={scatter.isError}
        heatmap={heatmap.data}
        heatmapError={heatmap.isError}
        from={from}
        to={to}
        agents={agents.data?.items ?? []}
        agentKey={agentKey}
        onAgentKey={setAgentKey}
        result={result}
        onResult={setResult}
        selection={selection}
        count={count}
        onSelection={setSelection}
      />
      {tab === 'urls' ? (
        <UrlStatsTable serviceName={serviceName} from={from} to={to} agentKey={agentKey} tabs={tabs} />
      ) : (
        <TransactionTable serviceName={serviceName} selection={selection} agentKey={agentKey} result={result} tabs={tabs} />
      )}
    </div>
  )
}
