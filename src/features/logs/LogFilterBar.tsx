import { useState, type FormEvent } from 'react'
import { LOG_LEVELS, type Agent, type LogLevel } from '@/api'
import { Button, Card, Chip, Input, Select, type ChipTone } from '@/design-system'
import { EMPTY, type LogFilters } from './useLogFilters'

const LEVEL_TONE: Partial<Record<LogLevel, ChipTone>> = { WARN: 'warn', ERROR: 'crit', FATAL: 'crit' }
// severity 모름('')도 고를 수 있게 끝에 하나 더 둔다 — Chip 에 muted tone 이 없어 선택 안 한 default 모양을 그대로 쓴다
const LEVEL_CHIPS = [...LOG_LEVELS, ''] as const

type Props = { filters: LogFilters; agents: Agent[]; showAgents: boolean; onApply: (f: LogFilters) => void }

/** 로그 필터. 고른 값은 「검색」을 눌러야 걸린다 (본문을 치는 도중에 매번 부르지 않게) */
export function LogFilterBar(props: Props) {
  // 주소의 필터가 바뀌면(초기화 · 링크) 입력칸도 따라가게, 주소 값을 key 로 다시 만든다
  return <Form key={JSON.stringify(props.filters)} {...props} />
}

function Form({ filters, agents, showAgents, onApply }: Props) {
  const [d, setD] = useState(filters)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onApply({ ...d, logger: d.logger.trim(), traceId: d.traceId.trim(), q: d.q.trim() })
  }
  const toggleLevel = (lv: LogLevel | '', on: boolean) =>
    setD({ ...d, levels: on ? LEVEL_CHIPS.filter((x) => x === lv || d.levels.includes(x)) : d.levels.filter((x) => x !== lv) })

  return (
    <Card>
      <form className="lg-filters" onSubmit={submit} aria-label="로그 필터">
        <div className="lg-row">
          {showAgents ? (
            <label className="lg-field">
              <span className="text-caption-12-medium">agent_key</span>
              <Select value={d.agentKey} onChange={(e) => setD({ ...d, agentKey: e.target.value })}>
                <option value="">전체</option>
                {agents.map((a) => (
                  <option key={a.agent_uuid} value={a.agent_key}>
                    {a.agent_key}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <fieldset className="lg-field lg-levels">
            <legend className="text-caption-12-medium">level (여러 개 선택, 비우면 전체)</legend>
            <div className="lg-chips">
              {LEVEL_CHIPS.map((lv) => (
                <Chip key={lv || 'NONE'} tone={(lv && LEVEL_TONE[lv]) || 'default'} selected={d.levels.includes(lv)} onChange={(on) => toggleLevel(lv, on)}>
                  {lv || '(없음)'}
                </Chip>
              ))}
            </div>
          </fieldset>
          <p className="lg-note text-caption-12">보관 7일 · 그 뒤 S3 90일. 더 오래된 범위는 404 SIGNAL_EXPIRED 로 안내</p>
        </div>
        <div className="lg-row">
          <label className="lg-field lg-grow">
            <span className="text-caption-12-medium">logger (앞부분)</span>
            <Input value={d.logger} placeholder="예: com.shop.order" onChange={(e) => setD({ ...d, logger: e.target.value })} />
          </label>
          <label className="lg-field lg-grow">
            <span className="text-caption-12-medium">trace_id</span>
            <Input value={d.traceId} onChange={(e) => setD({ ...d, traceId: e.target.value })} />
          </label>
          <label className="lg-field lg-grow2">
            <span className="text-caption-12-medium">q (본문 검색)</span>
            <Input value={d.q} placeholder="예: timeout" onChange={(e) => setD({ ...d, q: e.target.value })} />
          </label>
          <div className="lg-actions">
            <Button type="submit" variant="primary">
              검색
            </Button>
            <Button onClick={() => onApply(EMPTY)}>초기화</Button>
          </div>
        </div>
      </form>
    </Card>
  )
}
