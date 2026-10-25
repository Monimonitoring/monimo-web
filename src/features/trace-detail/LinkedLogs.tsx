import { useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, listLogs, type Span } from '@/api'
// 차트(echarts)까지 딸려 오지 않게 barrel(@/shared) 대신 logs 만 가져온다 — 드로어 본문 파일을 가볍게
import { LogTable } from '@/shared/logs'
import { toIso, useFilterHref } from '@/stores'
import { spanMs } from './tree'

/** 트레이스 앞뒤로 이만큼 넓혀 찾는다 (요청 전후에 찍힌 로그 · 시계 어긋남 대비) */
const PAD_MS = 5 * 60_000
/** 한 트레이스의 로그는 보통 수십 줄. 넘으면 로그 화면에서 이어 본다 */
const LIMIT = 200

type Props = { traceId: string; root: Span }

/** 이 트레이스가 남긴 로그 — trace_id 로 고정해 찾고, 시각 순으로 보인다 */
export function LinkedLogs({ traceId, root }: Props) {
  const href = useFilterHref()
  const start = Date.parse(root.start_time)
  const from = toIso(start - PAD_MS)
  // toIso 는 초 아래를 버린다. 끝(제외)은 다음 초로 올려야 경계의 로그가 빠지지 않는다
  const to = toIso(Math.ceil((start + spanMs(root) + PAD_MS) / 1000) * 1000)

  const { data, error, isPending } = useQuery({
    queryKey: ['logs', 'trace', traceId, from, to],
    queryFn: ({ signal }) => listLogs({ traceId, from, to, limit: LIMIT }, signal),
    // 지난 요청의 로그는 바뀌지 않는다
    staleTime: Infinity,
  })
  // 로그 API 는 최신 순이라, 요청 안에서 벌어진 순서대로 읽히게 뒤집는다
  const rows = useMemo(() => [...(data?.items ?? [])].reverse(), [data])
  const headingId = useId()
  const code = error instanceof ApiError ? error.code : ''

  // 로그 화면을 같은 조건(trace_id · 이 기간)으로. 로그는 대부분 루트 서비스가 남기므로 그 서비스로 연다
  const logsLink = href('/logs', { serviceName: root.service_name, range: { kind: 'custom', from, to } }, { trace_id: traceId })

  return (
    <section className="td-card td-logs" aria-labelledby={headingId}>
      <header className="td-card__head">
        <h3 id={headingId} className="text-section-15">연결 로그{data ? ` (${rows.length}${data.nextCursor ? '+' : ''})` : ''}</h3>
        <span className="text-caption-12 td-muted">trace_id 고정 · 시작 5분 전 ~ 끝 5분 뒤 · 시각 순</span>
        <Link className="td-logs__link text-caption-12-medium" to={logsLink}>
          로그 검색에서 열기 →
        </Link>
      </header>
      {isPending ? (
        <p className="td-none text-caption-12" role="status">
          로그를 불러오는 중…
        </p>
      ) : error ? (
        <p className="td-none text-caption-12" role="alert">
          {code === 'SIGNAL_EXPIRED' ? '보관 기간(97일)이 지나 이 요청의 로그는 지워졌습니다.' : `로그를 불러오지 못했습니다. ${code ? `(${code})` : ''}`}
        </p>
      ) : rows.length === 0 ? (
        <p className="td-none text-caption-12">이 요청이 남긴 로그가 없습니다 (로그에 trace_id 가 붙지 않았을 수 있습니다).</p>
      ) : (
        <div className="td-logs__table">
          <LogTable rows={rows} hideTrace />
        </div>
      )}
    </section>
  )
}
