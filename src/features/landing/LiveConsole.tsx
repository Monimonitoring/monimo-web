import { useEffect, useState, type ReactNode } from 'react'

/*
 * 첫 화면의 「살아 있는 콘솔」.
 * Service map 간선을 따라 요청 점이 흐르고, 16초마다 한 번 결제 서비스에 장애가 났다가 복구된다.
 * 장애 → 규칙 평가 → FIRING 경보 → Slack 발송 → RESOLVED 를 실제 MONIMO 경보 흐름 순서대로 보여 준다.
 * 실제 API 는 부르지 않는다 : 숫자는 정해진 대본 + 약간의 흔들림이다.
 */

const CYCLE = 16 // 초
const INCIDENT_FROM = 4
const INCIDENT_TO = 10
const FIRING_AT = 6
const SENT_AT = 7
const RESOLVED_AT = 11
const TOAST_HIDE = 15

type Phase = 'normal' | 'incident' | 'recovering'
type Toast = null | { kind: 'firing'; sent: boolean } | { kind: 'resolved' }

const phaseOf = (t: number): Phase => (t >= INCIDENT_FROM && t < INCIDENT_TO ? 'incident' : t >= INCIDENT_TO && t < RESOLVED_AT ? 'recovering' : 'normal')
const toastOf = (t: number): Toast => {
  if (t >= FIRING_AT && t < RESOLVED_AT) return { kind: 'firing', sent: t >= SENT_AT }
  if (t >= RESOLVED_AT && t < TOAST_HIDE) return { kind: 'resolved' }
  return null
}

function clock(sec: number) {
  const total = 14 * 3600 + 5 * 60 + sec // 14:05:00 부터 흐른다
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(Math.floor(total / 3600) % 24)}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}`
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

type LiveState = { tick: number; p95s: number[] }

/** 한 초 진행 : p95 한 점. 흔들림만 난수다 */
function step(prev: LiveState): LiveState {
  const tick = prev.tick + 1
  const ph = phaseOf(tick % CYCLE)
  const jitter = Math.round(Math.random() * 24)
  const p95 = ph === 'incident' ? 760 + jitter * 3 : ph === 'recovering' ? 420 + jitter * 2 : 168 + jitter
  return { tick, p95s: [...prev.p95s.slice(1), p95] }
}

function initialState(reduced: boolean): LiveState {
  let st: LiveState = { tick: -1, p95s: Array.from({ length: 32 }, (_, i) => 170 + ((i * 37) % 30)) }
  // 움직임을 끈 사람에게는 「경보를 Slack 으로 보낸 순간」 한 장면을 멈춰서 보여 준다. 그 외에는 처음부터
  const until = reduced ? SENT_AT : 0
  while (st.tick < until) st = step(st)
  return st
}

export function LiveConsole() {
  const [reduced] = useState(prefersReducedMotion)
  const [{ tick, p95s }, setState] = useState(() => initialState(reduced))

  const t = tick % CYCLE
  const phase = phaseOf(t)
  const toast = toastOf(t)

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setState(step), 1000)
    return () => window.clearInterval(id)
  }, [reduced])

  const p95 = p95s[p95s.length - 1]
  const errRate = phase === 'incident' ? 4.2 : phase === 'recovering' ? 1.1 : 0.3
  const rps = 42 + (tick % 5) - 2
  const firing = toast?.kind === 'firing' ? 1 : 0

  return (
    <div className={`live live--${phase}`} aria-label="MONIMO 콘솔 예시 : 요청이 서비스 사이를 흐르고, 결제 서비스 장애가 경보로 이어졌다가 복구된다">
      <div className="live__bar">
        <span className="live__dots"><i /><i /><i /></span>
        <span className="text-mono-11 live__path">monimo / Service map</span>
        <span className="live__badge text-mono-11"><span className="live__rec" /> LIVE</span>
        <span className="text-mono-11 live__clock">{clock(tick)}</span>
      </div>

      <div className="live__body">
        <aside className="live__kpis">
          <Kpi label="처리량" value={`${rps}`} unit="req/s" />
          <Kpi label="p95 지연" value={`${p95}`} unit="ms" tone={p95 > 600 ? 'crit' : p95 > 300 ? 'warn' : undefined}>
            <Spark values={p95s} max={900} tone={p95 > 600 ? 'crit' : 'accent'} />
          </Kpi>
          <Kpi label="5xx 비율" value={errRate.toFixed(1)} unit="%" tone={errRate > 2 ? 'crit' : errRate > 1 ? 'warn' : undefined} />
          <Kpi label="열린 경보" value={`${firing}`} unit="건" tone={firing ? 'crit' : undefined} />
        </aside>

        <div className="live__map">
          <LiveMap phase={phase} rps={rps} errRate={errRate} animate={!reduced} />
          <AlertToast toast={toast} />
        </div>

      </div>
    </div>
  )
}

function Kpi({ label, value, unit, tone, children }: { label: string; value: string; unit: string; tone?: 'warn' | 'crit'; children?: ReactNode }) {
  return (
    <div className={tone ? `live__kpi live__kpi--${tone}` : 'live__kpi'}>
      <span className="text-caption-12">{label}</span>
      <span className="live__kpi-value">{value}<small className="text-mono-11"> {unit}</small></span>
      {children}
    </div>
  )
}

function Spark({ values, max, tone }: { values: number[]; max: number; tone: 'accent' | 'crit' }) {
  const w = 160
  const h = 36
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - (Math.min(v, max) / max) * h).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`live__spark live__spark--${tone}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,${h} ${pts} ${w},${h}`} className="live__spark-area" />
      <polyline points={pts} className="live__spark-line" />
    </svg>
  )
}

/* ── Service map ── */

type Node = { id: string; x: number; y: number; label: string; svc?: number; kind?: 'db' | 'mq' }
const NODES: Node[] = [
  { id: 'gw', x: 80, y: 160, label: 'shop-gateway', svc: 1 },
  { id: 'order', x: 270, y: 160, label: 'shop-order', svc: 2 },
  { id: 'inv', x: 470, y: 64, label: 'shop-inventory', svc: 3 },
  { id: 'pay', x: 470, y: 160, label: 'shop-payment', svc: 5 },
  { id: 'db', x: 470, y: 262, label: 'postgres', kind: 'db' },
  { id: 'kafka', x: 596, y: 262, label: 'kafka', kind: 'mq' },
]
const at = (id: string) => NODES.find((n) => n.id === id)!
// [출발, 도착, 한 바퀴 시간(초), 동시에 흐르는 점 수, 비동기]
const EDGES: [string, string, number, number, boolean?][] = [
  ['gw', 'order', 1.4, 4],
  ['order', 'inv', 1.2, 3],
  ['order', 'pay', 1.3, 3],
  ['order', 'db', 1.1, 2],
  ['order', 'kafka', 2.2, 2, true],
]

function edgePath(a: string, b: string) {
  const p = at(a)
  const q = at(b)
  const x1 = p.x + (p.kind ? 30 : 62)
  const x2 = q.x - (q.kind ? 34 : 62)
  const mx = (x1 + x2) / 2
  return `M${x1} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${x2} ${q.y}`
}

function LiveMap({ phase, rps, errRate, animate }: { phase: Phase; rps: number; errRate: number; animate: boolean }) {
  const broken = phase === 'incident'
  const hurt = phase !== 'normal'
  return (
    <svg viewBox="0 0 660 320" className="live__svg" role="img" aria-label={broken ? 'shop-order 에서 shop-payment 로 가는 호출이 실패하고 있다' : '요청이 shop-gateway 에서 shop-order 를 거쳐 재고 · 결제 · DB · Kafka 로 흐른다'}>
      <defs>
        <radialGradient id="live-glow">
          <stop offset="0%" stopColor="var(--color-status-crit)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-status-crit)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {EDGES.map(([a, b, dur, n, async]) => {
        const d = edgePath(a, b)
        const bad = b === 'pay' && broken
        return (
          <g key={a + b}>
            <path d={d} className={`live__edge${async ? ' live__edge--async' : ''}${bad ? ' live__edge--bad' : ''}`} />
            {animate
              ? Array.from({ length: n }, (_, i) => (
                  <circle key={i} r={bad ? 4.5 : 3.5} className={bad && i % 2 === 0 ? 'live__packet live__packet--bad' : 'live__packet'} style={{ ['--svc' as string]: `var(--color-service-${at(a).svc ?? 2})` }}>
                    <animateMotion dur={`${bad ? dur * 1.9 : dur}s`} begin={`${(-dur * i) / n}s`} repeatCount="indefinite" path={d} />
                  </circle>
                ))
              : null}
          </g>
        )
      })}

      {hurt ? <circle cx={at('pay').x} cy={at('pay').y} r={70} fill="url(#live-glow)" className="live__glow" /> : null}

      {NODES.map((n) => {
        const isPay = n.id === 'pay'
        const cls = isPay && broken ? 'live__node live__node--bad' : isPay && hurt ? 'live__node live__node--warn' : 'live__node'
        return (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
            {isPay && broken ? <rect x={-62} y={-24} width={124} height={48} rx={10} className="live__ring" /> : null}
            {n.kind === 'db' ? (
              <rect x={-34} y={-18} width={68} height={36} rx={18} className="live__node live__node--infra" />
            ) : n.kind === 'mq' ? (
              <polygon points="-34,0 -17,-20 17,-20 34,0 17,20 -17,20" className="live__node live__node--infra" />
            ) : (
              <rect x={-62} y={-24} width={124} height={48} rx={10} className={cls} style={{ stroke: isPay && hurt ? undefined : `var(--color-service-${n.svc})` }} />
            )}
            <text y={n.kind ? 4 : -4} textAnchor="middle" className="live__label">{n.label}</text>
            {!n.kind ? (
              <text y={13} textAnchor="middle" className={isPay && hurt ? 'live__sub live__sub--bad' : 'live__sub'}>
                {isPay ? `${rps - 7}/s · 5xx ${errRate.toFixed(1)}%` : `${n.id === 'gw' ? rps : rps - 4}/s`}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

function AlertToast({ toast }: { toast: Toast }) {
  if (!toast) return null
  if (toast.kind === 'resolved') {
    return (
      <div key="resolved" className="live__toast live__toast--ok" role="status">
        <span className="live__toast-tag text-mono-11">RESOLVED</span>
        <b className="text-body-13-strong">결제 5xx 비율 정상화</b>
        <span className="text-caption-12">shop-payment · 0.3% · 복구 메시지도 같은 채널로</span>
      </div>
    )
  }
  return (
    <div key="firing" className="live__toast live__toast--crit" role="alert">
      <span className="live__toast-tag text-mono-11">FIRING</span>
      <b className="text-body-13-strong">결제 5xx 비율 &gt; 2%</b>
      <span className="text-caption-12">shop-payment · 4.2% · 최근 1분</span>
      <span className={toast.sent ? 'live__toast-sent live__toast-sent--on text-caption-12-medium' : 'live__toast-sent text-caption-12-medium'}>
        {toast.sent ? '✓ Slack #alerts-shop 으로 보냄' : '그룹 대기 중 · 같은 장애를 한 메시지로 묶는 중'}
      </span>
    </div>
  )
}
