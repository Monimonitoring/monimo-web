import { useState } from 'react'
import type { Span } from '@/api'
import { IconAlertCircle, IconChevronDown, IconChevronRight, serviceColor } from '@/design-system'
import { flatten, fmtMs, spanMs, ticks } from './tree'

type Props = {
  root: Span
  /** 고른 스팬 (상세 패널에 보이는 것) */
  selectedId: string
  onSelect: (span: Span) => void
  /** 스팬 상세 영역 id (버튼이 무엇을 바꾸는지 보조기술에 알린다) */
  detailId: string
  /** 서비스 이름 → 서비스 팔레트 순번 (Service map 과 같은 색) */
  colorIndex: (service: string) => number
}

/** 간트형 스팬 트리 — 왼쪽은 들여쓴 나무(접기 · 펼치기), 오른쪽은 루트 기준 시작 위치 · 길이 막대 */
export function SpanTimeline({ root, selectedId, onSelect, detailId, colorIndex }: Props) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const rootStart = Date.parse(root.start_time)
  const total = spanMs(root)
  // 루트가 0ms 여도 NaN% 가 되지 않게
  const pct = (ms: number) => (total > 0 ? `${Math.min(100, Math.max(0, (ms / total) * 100))}%` : '0%')
  const rows = flatten(root, collapsed)

  return (
    <div className="td-timeline">
      <div className="td-timeline__head text-caption-12-medium">
        <span>span_name · service_name · agent_key</span>
        <div className="td-axis text-mono-11" aria-hidden>
          {ticks(total).map((t) => (
            <span key={t} style={{ left: pct(t) }}>{Math.round(t).toLocaleString('en-US')}</span>
          ))}
          <span className="td-axis__end">{fmtMs(total)}</span>
        </div>
      </div>
      <ul className="td-rows">
        {rows.map(({ span, depth, hasChildren }) => {
          const error = span.status_code === 'ERROR'
          const open = !collapsed.has(span.span_id)
          // 시계가 어긋나 루트보다 먼저 시작한 스팬은 0 에 붙인다 (막대 · 라벨 · 아이콘이 같은 자리를 쓰게)
          const offset = Math.max(0, Date.parse(span.start_time) - rootStart)
          const width = total > 0 ? (spanMs(span) / total) * 100 : 0
          const color = serviceColor(colorIndex(span.service_name))
          return (
            <li key={span.span_id} className={`td-row${error ? ' is-error' : ''}${span.span_id === selectedId ? ' is-selected' : ''}`}>
              <div className="td-row__name" style={{ paddingLeft: depth * 14 }}>
                {hasChildren ? (
                  <button
                    type="button"
                    className="td-toggle"
                    aria-expanded={open}
                    aria-label={`${span.span_name} ${open ? '접기' : '펼치기'}`}
                    onClick={() => toggle(span.span_id)}
                  >
                    {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </button>
                ) : (
                  <span className="td-toggle" aria-hidden />
                )}
                <span className="td-sr">{depth + 1}단계</span>
                <i className="td-dot" style={{ background: color }} aria-hidden />
                {/* 이름을 누르면(Enter · Space 도) 이 스팬의 상세가 아래에 나온다 */}
                <button
                  type="button"
                  className={`td-row__span ${span.span_kind === 'CLIENT' && span.span_name.startsWith('JDBC') ? 'text-mono-12' : 'text-body-13'}`}
                  title={span.span_name}
                  aria-current={span.span_id === selectedId ? 'true' : undefined}
                  aria-controls={detailId}
                  onClick={() => onSelect(span)}
                >
                  {span.span_name}
                </button>
                <span className="td-row__agent text-mono-11" title={`${span.service_name} · ${span.agent_key}`}>{span.agent_key}</span>
              </div>
              <div className="td-row__bar">
                <span
                  className="td-bar"
                  style={{ left: pct(offset), width: `max(3px, ${Math.min(100, width)}%)`, background: error ? 'var(--color-status-crit)' : color }}
                >
                  {width > 14 ? <span className="td-bar__label td-bar__label--in text-mono-11">{fmtMs(spanMs(span))}</span> : null}
                </span>
                {width <= 14 ? (
                  <span className="td-bar__label text-mono-11" style={{ left: `calc(${pct(offset + spanMs(span))} + 6px)` }}>
                    {fmtMs(spanMs(span))}
                  </span>
                ) : null}
                {error ? (
                  <span className="td-bar__err" style={{ left: `calc(${pct(offset)} - 16px)` }} role="img" aria-label="에러 스팬">
                    <IconAlertCircle size={13} />
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
