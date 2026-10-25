import { Fragment, useState } from 'react'
import type { LogLevel, LogLine } from '@/api'
import {
  Badge,
  formatTime,
  IconChevronDown,
  IconChevronRight,
  shortId,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  type Tone,
} from '@/design-system'
import { useOpenTrace } from '../trace'
import './LogTable.css'

const LEVEL_TONE: Record<LogLevel, Tone> = { FATAL: 'crit', ERROR: 'crit', WARN: 'warn', INFO: 'accent', DEBUG: 'muted', TRACE: 'muted' }

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 본문에서 검색어를 찾아 <mark> 로 감싼다 (대소문자 무시).
 * 소문자로 바꾼 글자에서 찾은 위치로 원문을 자르면, 바꾸며 길이가 달라지는 글자(İ 등)가 앞에 있을 때 엉뚱한 곳이 칠해진다.
 * 그래서 원문에 대소문자 무시 정규식을 바로 건다 (split 의 캡처 그룹 → 홀수 번째가 찾은 부분)
 */
function highlight(text: string, q: string) {
  const needle = q.trim()
  if (!needle) return text
  return text
    .split(new RegExp(`(${escapeRegex(needle)})`, 'gi'))
    .map((part, i) => (i % 2 === 1 ? <mark key={i} className="log-mark">{part}</mark> : <Fragment key={i}>{part}</Fragment>))
}

type Props = {
  rows: LogLine[]
  /** 본문 검색어 — 결과에서 노란색으로 강조 */
  q?: string
  /** 한 서비스만 보는 곳(연결 로그 등)은 service_name 칸을 빼도 된다 */
  hideService?: boolean
  /** trace_id 칸을 뺀다 (트레이스 드로어 안처럼 이미 그 트레이스를 보고 있을 때) */
  hideTrace?: boolean
}

/**
 * 로그 결과 표 (로그 검색 화면 · 트레이스 드로어의 연결 로그 공용).
 * 행 왼쪽 ▸ 를 누르면 attributes(MDC) · span_id 를 펼쳐 본다. trace_id 를 누르면 트레이스 상세 드로어가 열린다
 */
export function LogTable({ rows, q = '', hideService, hideTrace }: Props) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const { open: openTrace } = useOpenTrace()
  // 로그 줄에는 고유 id 가 없어 순번을 덧붙인다. 「더 보기」는 뒤에만 이어 붙이므로 앞 행의 순번(과 펼침 상태)은 바뀌지 않는다
  const keyOf = (l: LogLine, i: number) => `${l.ts}|${l.span_id}|${i}`
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const cols = 7 - (hideService ? 1 : 0) - (hideTrace ? 1 : 0) + 1

  return (
    <Table className="log-table">
      <TableHead>
        <TableRow>
          <TableHeaderCell>ts</TableHeaderCell>
          <TableHeaderCell>level</TableHeaderCell>
          {hideService ? null : <TableHeaderCell>service_name</TableHeaderCell>}
          <TableHeaderCell>agent_key</TableHeaderCell>
          <TableHeaderCell>logger</TableHeaderCell>
          <TableHeaderCell>thread</TableHeaderCell>
          <TableHeaderCell>message</TableHeaderCell>
          {hideTrace ? null : <TableHeaderCell>trace_id</TableHeaderCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((l, i) => {
          const k = keyOf(l, i)
          const expanded = open.has(k)
          const attrs = Object.entries(l.attributes)
          return (
            <Fragment key={k}>
              <TableRow selected={expanded}>
                <TableCell type="mono">
                  <span className="log-ts">
                    <button
                      type="button"
                      className="log-toggle"
                      aria-expanded={expanded}
                      aria-label={`${formatTime(l.ts)} 로그 ${expanded ? '접기' : '펼치기'}`}
                      onClick={() => toggle(k)}
                    >
                      {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </button>
                    {formatTime(l.ts)}
                  </span>
                </TableCell>
                <TableCell type="badge">
                  {/* severity 모름('')은 색 없이 — 처럼 보여 준다 (ADR #59) */}
                  <Badge tone={l.level ? LEVEL_TONE[l.level] ?? 'muted' : 'muted'} className="text-mono-11">
                    {l.level || '—'}
                  </Badge>
                </TableCell>
                {hideService ? null : <TableCell>{l.service_name}</TableCell>}
                <TableCell type="mono" className="log-clip" title={l.agent_key}>{l.agent_key}</TableCell>
                <TableCell type="mono" className="log-clip" title={l.logger}>{l.logger}</TableCell>
                <TableCell type="mono" className="log-clip log-muted" title={l.thread}>{l.thread}</TableCell>
                <TableCell className="log-message" title={l.message}>{highlight(l.message, q)}</TableCell>
                {hideTrace ? null : (
                  <TableCell type="mono">
                    {l.trace_id ? (
                      <button type="button" className="log-trace" onClick={() => openTrace(l.trace_id)} title={`${l.trace_id} 트레이스 열기`}>
                        {shortId(l.trace_id)}
                      </button>
                    ) : (
                      <span className="log-muted">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
              {expanded ? (
                <tr className="log-detail">
                  <td colSpan={cols}>
                    <div className="log-detail__box">
                      <span className="text-caption-12-medium">attributes</span>
                      <code className="text-mono-11">
                        {attrs.length ? `{ ${attrs.map(([a, v]) => `"${a}": ${JSON.stringify(v)}`).join(', ')} }` : '(없음)'}
                      </code>
                      <span className="log-detail__span text-mono-11 log-muted">span_id {l.span_id ? shortId(l.span_id) : '—'}</span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
