import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, getTrace, listApplications } from '@/api'
import { Badge, formatTime, httpStatusTone, IconArrowRight, IconCopy, serviceColor, shortId } from '@/design-system'
import type { TraceBodyProps } from '@/shared/trace'
import { LinkedLogs } from './LinkedLogs'
import { SpanDetail } from './SpanDetail'
import { SpanTimeline } from './SpanTimeline'
import { allSpans, fmtMs, initialSpan, spanMs } from './tree'
import './TraceDetail.css'

/** 트레이스 상세 (S03) — 드로어 본문. 머리말(요약 · 서비스 경로)과 스팬 타임라인 트리 */
export function TraceDetail({ traceId }: TraceBodyProps) {
  const { data: trace, error, isPending } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: ({ signal }) => getTrace(traceId, signal),
    // 트레이스는 한 번 쌓이면 바뀌지 않는다
    staleTime: Infinity,
  })
  // 서비스 색은 Service map 과 같게: 전체 서비스를 이름순으로 세운 순번. 목록을 받기 전에 그리면 색이 바뀌므로 기다린다
  // (상단바가 이미 불러 둔 목록이라 보통 바로 온다. 실패하면 이 트레이스의 서비스만으로 정한다)
  const apps = useQuery({ queryKey: ['applications'], queryFn: listApplications, staleTime: 5 * 60_000 })
  const names = (apps.data?.map((a) => a.name) ?? trace?.services ?? []).slice().sort()
  const colorIndex = (service: string) => Math.max(0, names.indexOf(service))

  // 고른 스팬. 고르기 전에는 실패가 시작된 스팬(없으면 루트)
  const [picked, setPicked] = useState<string | null>(null)
  const detailId = useId()
  const spans = useMemo(() => (trace ? allSpans(trace.root) : []), [trace])
  const selectedId = picked ?? (trace ? initialSpan(trace.root).span_id : '')
  const selectedIndex = spans.findIndex((s) => s.span_id === selectedId)

  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = () => {
    void navigator.clipboard?.writeText(traceId).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    })
  }

  if (isPending || apps.isPending) return <p className="td-state text-body-13" role="status">트레이스를 불러오는 중…</p>
  if (error || !trace) {
    const code = error instanceof ApiError ? error.code : ''
    return (
      <p className="td-state text-body-13" role="alert">
        {code === 'SIGNAL_EXPIRED'
          ? '보관 기간(93일)이 지나 이 트레이스는 지워졌습니다.'
          : code === 'NOT_FOUND'
            ? '이 trace_id 의 트레이스를 찾을 수 없습니다.'
            : `트레이스를 불러오지 못했습니다. ${code ? `(${code})` : ''}`}
      </p>
    )
  }

  const root = trace.root
  const failed = root.status_code === 'ERROR'
  return (
    <div className="td">
      <section className="td-summary" aria-label="트레이스 요약">
        <div className="td-summary__line">
          <span className="text-caption-12-medium td-muted">trace_id</span>
          <span className="text-mono-16-strong" title={traceId}>{shortId(traceId)}</span>
          <button type="button" className="td-iconbtn" onClick={copy} aria-label="trace_id 복사">
            <IconCopy size={14} />
          </button>
          {copied ? <span className="text-caption-12 td-muted" role="status">복사됨</span> : null}
          <Badge className="text-mono-12">{root.span_name}</Badge>
          {failed ? <Badge tone="crit">ERROR</Badge> : null}
          {root.http_status != null ? <Badge tone={httpStatusTone(root.http_status)} className="text-mono-11">http {root.http_status}</Badge> : null}
        </div>
        <div className="td-summary__line text-caption-12">
          <span>시작 <span className="text-mono-12">{formatTime(root.start_time)}</span></span>
          <span className="td-sep" aria-hidden />
          <span>총 소요 <span className={`text-mono-12-strong${failed ? ' td-crit' : ''}`}>{fmtMs(spanMs(root))}</span></span>
          <span className="td-sep" aria-hidden />
          <span>span_count <span className="text-mono-12-strong">{trace.span_count}</span></span>
          <span className="td-sep" aria-hidden />
          <span className="td-muted">서비스 경로</span>
          <ol className="td-path">
            {trace.services.map((s, i) => (
              <li key={s}>
                {i > 0 ? <IconArrowRight size={12} className="td-muted" aria-hidden /> : null}
                <span className="td-chip text-mono-11">
                  <i className="td-dot" style={{ background: serviceColor(colorIndex(s)) }} aria-hidden />
                  {s}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="td-card" aria-label="스팬 트리 타임라인">
        <header className="td-card__head">
          <h3 className="text-section-15">스팬 트리 · 타임라인</h3>
          <span className="text-caption-12 td-muted">0 ms ~ {fmtMs(spanMs(root))} · {trace.span_count}개 스팬</span>
        </header>
        <p className="text-caption-12 td-muted td-tree-note">
          루트 스팬은 parent_span_id 가 null · HTTP 가 아니면 http_status 도 null · 부모 없는 스팬이 2개 이상이면 '(누락된 구간)' 가짜 루트 아래로 묶인다 (1 % 샘플링 · 수집기 유실)
        </p>
        <SpanTimeline root={root} selectedId={selectedId} onSelect={(s) => setPicked(s.span_id)} detailId={detailId} colorIndex={colorIndex} />
      </section>

      {selectedIndex >= 0 ? <SpanDetail id={detailId} span={spans[selectedIndex]} index={selectedIndex + 1} /> : null}

      <LinkedLogs traceId={traceId} root={root} />
    </div>
  )
}
