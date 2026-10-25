import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listAgents } from '@/api'
import { Card, Tabs } from '@/design-system'
import { useServiceName, useTimeWindow } from '@/stores'
import { DumpRequestModal } from './DumpRequestModal'
import { DumpsTab } from './DumpsTab'
import { MetricChartCard } from './MetricChartCard'
import { MetricPicker } from './MetricPicker'
import { customMetric, DEFAULT_METRICS } from './metricView'
import { PodHeader } from './PodHeader'
import { PodList } from './PodList'
import { useInspectorParams, type InspectorTab } from './useInspectorParams'
import './Inspector.css'

/** Inspector (S04 · S05) — 메트릭 탭(파드 목록 · 머리 · 지표 차트 · 지표 추가)과 스레드 덤프 탭. 덤프 요청은 모달 */
export function InspectorPage() {
  const serviceName = useServiceName()
  const { from, to } = useTimeWindow()
  const p = useInspectorParams()
  const { agentId, status, metrics, selectAgent, setStatus, addMetric, removeMetric } = p
  // 덤프 요청 모달 대상. 부작용이 있는 요청이라 주소에 두지 않는다 (새로고침으로 다시 뜨지 않게)
  const [requestFor, setRequestFor] = useState<{ agent_uuid: string; agent_key: string } | null>(null)

  const agents = useQuery({
    queryKey: ['agents', serviceName],
    queryFn: ({ signal }) => listAgents({ serviceName, limit: 500 }, signal),
    placeholderData: keepPreviousData,
  })
  // 서비스를 바꾼 직후 이전 서비스 목록이 남아 보이지 않게
  const list = agents.data?.items.filter((a) => !serviceName || a.service_name === serviceName)
  // 주소의 파드가 목록에 없으면(서비스를 바꿨거나 처음 열었을 때) 살아 있는 첫 파드를 보여 준다. 주소는 누를 때만 쓴다
  const selected = list?.find((a) => a.agent_uuid === agentId) ?? list?.find((a) => a.status === 'UP') ?? list?.[0]

  const custom = useMemo(() => metrics.filter((m) => !DEFAULT_METRICS.some((d) => d.metric === m)).map(customMetric), [metrics])
  const shown = [...DEFAULT_METRICS.map((d) => d.metric), ...custom.map((c) => c.metric)]

  return (
    <div className="in-wrap">
      <Tabs<InspectorTab>
        aria-label="인스펙터"
        value={p.tab}
        onChange={p.setTab}
        items={[
          { value: 'metrics', label: '메트릭' },
          { value: 'dumps', label: '스레드 덤프' },
        ]}
      />
      {p.tab === 'dumps' ? (
        <DumpsTab
          dumpId={p.dumpId}
          dumpAgent={p.dumpAgent}
          period={p.period}
          onOpen={p.openDump}
          onAgent={p.setDumpAgent}
          onPeriod={p.setPeriod}
          onRequest={setRequestFor}
        />
      ) : (
        <div className="in-page">
          <PodList
            agents={list}
            isError={agents.isError}
            status={status}
            onStatus={setStatus}
            selectedId={selected?.agent_uuid ?? null}
            onSelect={selectAgent}
            showService={!serviceName}
          />
          <div className="in-main">
            {!selected ? (
              <Card>
                <p className="in-empty text-body-13" role="status">
                  {agents.data ? '왼쪽에서 파드를 고르세요.' : '파드 목록을 불러오는 중…'}
                </p>
              </Card>
            ) : (
              <>
                <PodHeader key={selected.agent_uuid} agentId={selected.agent_uuid} onRequestDump={setRequestFor} onShowDumps={p.showDumpsOf} />
                <div className="in-charts">
                  {[...DEFAULT_METRICS, ...custom].map((ui) => (
                    <MetricChartCard
                      key={ui.metric}
                      ui={ui}
                      serviceName={selected.service_name}
                      agentKey={selected.agent_key}
                      from={from}
                      to={to}
                      onRemove={DEFAULT_METRICS.includes(ui) ? undefined : () => removeMetric(ui.metric)}
                    />
                  ))}
                </div>
                <MetricPicker serviceName={selected.service_name} from={from} to={to} shown={shown} onAdd={addMetric} />
              </>
            )}
          </div>
        </div>
      )}
      <DumpRequestModal
        agent={requestFor}
        onClose={() => setRequestFor(null)}
        onDone={(id) => {
          setRequestFor(null)
          p.showNewDump(id)
        }}
      />
    </div>
  )
}
