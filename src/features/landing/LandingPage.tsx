import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { IconArrowRight } from '@/design-system'
import { HeroLogs } from './HeroLogs'
import { LiveConsole } from './LiveConsole'
import { WatchdogDemo } from './WatchdogDemo'
import './WatchdogDemo.css'
import './LandingPage.css'
import './LiveConsole.css'

/*
 * 소개 페이지 (로그인 없이 보는 공개 경로 /intro).
 * 숫자는 전부 monimo-backend README · AGENTS 에 근거가 있는 실측값이고, 화면 미리보기는 가짜 응답과 같은 쇼핑몰 4서비스로 그렸다.
 * 실제 API 를 부르지 않는다 : 로그인 전이라 부를 수 없고, 소개 화면이 서버 상태에 따라 깨지면 안 된다.
 */

const NAV = [
  { href: '#signals', label: '무엇을 보나' },
  { href: '#how', label: '동작 방식' },
  { href: '#screens', label: '화면' },
  { href: '#alerts', label: '경보' },
  { href: '#watchdog', label: 'Watchdog' },
]

const STATS = [
  { value: '5.1초', label: '요청 → 화면에 보이기까지 p95', note: '로컬 29회 실측' },
  { value: '+1.4~2.1%p', label: '에이전트를 붙인 앱의 CPU 부담', note: '초당 주문 20건' },
  { value: '73개', label: '이유와 되돌릴 조건을 남긴 설계 결정', note: 'ADR' },
]

const SIGNALS = [
  {
    key: 'trace',
    title: '트레이스',
    lead: '요청 하나가 어느 서비스를 거쳐 어디서 느려졌는지',
    items: ['서비스 간 호출 관계 (Service map)', '응답 시간 스캐터 · 느린 요청 골라내기', '스팬 단위 워터폴 · 에러 스택'],
    code: 'http.server.request.duration',
  },
  {
    key: 'metric',
    title: '지표',
    lead: 'JVM 이 버티고 있는지, 파드마다',
    items: ['힙 메모리 · GC 시간 · CPU', '처리량 · 에러율 · p95 지연', '스레드 덤프 요청 (팬아웃)'],
    code: 'jvm.memory.used · jvm.gc.duration',
  },
  {
    key: 'log',
    title: '로그',
    lead: '트레이스와 같은 ID 로 이어진 로그',
    items: ['트레이스 ID 로 바로 이동', '서비스 · 레벨 · 시간으로 거르기', 'Minimum log level 로 수집량 조절'],
    code: 'trace_id · span_id · severity',
  },
]

const PIPELINE = [
  { name: '에이전트', sub: 'OTel Java Agent', detail: '앱 코드는 그대로. -javaagent 한 줄' },
  { name: 'Collector', sub: 'OTLP gRPC 4317', detail: 'mTLS · 헬스체크 거르기 · 샘플링' },
  { name: 'Kafka', sub: 'raw', detail: '파티션으로 나눠 받고, 실패는 raw.dlq 에 30일' },
  { name: 'Ingester', sub: 'ClickHouse', detail: '스팬 · 지표 · 로그 적재, 1분 · 1시간 롤업' },
  { name: 'API server', sub: '/api/v1', detail: '화면용 조회 · 규칙 · 채널 · 설정' },
  { name: '화면', sub: 'React', detail: 'Service map · 트랜잭션 · Inspector · 경보' },
]

const SCREENS = [
  { key: 'map', label: 'Service map', caption: '쇼핑몰 네 서비스와 DB · Kafka 사이의 호출을 선으로 잇고, 에러가 난 구간을 빨갛게 띄웁니다.' },
  { key: 'trace', label: '트레이스', caption: '느린 요청 하나를 열면 어느 서비스의 어느 구간이 시간을 먹었는지 워터폴로 보입니다. 같은 트레이스 ID 로 로그까지 이어집니다.' },
  { key: 'scatter', label: '트랜잭션', caption: '요청 하나가 점 하나입니다. 위로 튄 점을 드래그하면 그 요청들의 트레이스로 바로 들어갑니다.' },
  { key: 'inspector', label: 'Inspector', caption: '파드 하나를 골라 힙 · GC · CPU 를 같은 시간축에 놓고, 필요하면 스레드 덤프를 요청합니다.' },
  { key: 'logs', label: '로그', caption: '같은 트레이스 ID 를 가진 로그만 모아 봅니다. 에러 로그에서 트레이스로, 트레이스에서 로그로 오갑니다.' },
] as const
type ScreenKey = (typeof SCREENS)[number]['key']

const ALERT_STEPS = [
  { t: '15초마다', title: '규칙 평가', body: 'Detector 가 ClickHouse 롤업을 읽어 5xx · 4xx 비율, p95, CPU, 힙, GC, 에이전트 끊김 규칙을 확인합니다.' },
  { t: 'FIRING', title: '한 번만 발화', body: '같은 규칙 · 같은 서비스는 상태 머신이 하나로 붙잡아 중복을 막습니다.', tone: 'crit' },
  { t: '10초', title: '묶어서 보내기', body: '비슷한 시각에 터진 경보를 그룹 대기로 모아 한 메시지로 보냅니다.' },
  { t: '재시도', title: '놓치지 않기', body: '발송 큐 · 백오프 재시도 · 서킷 브레이커로 채널이 흔들려도 다시 보냅니다.' },
  { t: 'RESOLVED', title: '복구도 알림', body: '조건이 풀리면 복구 메시지도 같은 채널로 보냅니다.', tone: 'ok' },
]

const REPOS = [
  { name: 'monimo-backend', href: 'https://github.com/Monimonitoring/monimo-backend' },
  { name: 'monimo-web', href: 'https://github.com/Monimonitoring/monimo-web' },
  { name: 'monimo-shop', href: 'https://github.com/Monimonitoring/monimo-shop' },
  { name: 'monimo-deploy', href: 'https://github.com/Monimonitoring/monimo-deploy' },
]

export function LandingPage() {
  useReveal()
  const [screen, setScreen] = useState<ScreenKey>('map')
  const current = SCREENS.find((s) => s.key === screen) ?? SCREENS[0]

  return (
    <div className="landing">
      <header className="landing__header">
        <div className="landing__bar">
          <a href="#top" className="landing__wordmark text-mono-16-strong">MONIMO</a>
          <nav className="landing__nav" aria-label="소개 페이지 목차">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-body-13-strong">{n.label}</a>
            ))}
          </nav>
          <Link to="/login" className="landing__btn landing__btn--ghost-dark text-body-13-strong">로그인</Link>
        </div>
      </header>

      <main>
        {/* 1. 첫 화면 */}
        <section id="top" className="landing__hero">
          <HeroLogs />
          <div className="landing__hero-inner landing__hero-inner--stack">
            <div className="landing__hero-copy landing__hero-copy--center">
              <span className="landing__eyebrow text-micro-11"><span className="landing__live-dot" /> Java MSA 를 위한 APM</span>
              <h1 className="landing__display">
                수많은 요청 속에서<br />
                <em>느려진 한 줄</em>을 찾습니다
              </h1>
              <p className="landing__lead">
                서비스가 몇 개로 쪼개져 있어도, 앱 코드는 고치지 않고 에이전트만 붙이면 요청 하나가 어디를 거쳐 어디서 느려졌는지 서비스 지도와 경보로 보여 줍니다.
              </p>
              <div className="landing__cta">
                <Link to="/server-map" className="landing__btn landing__btn--primary text-body-13-strong">
                  콘솔 열기 <IconArrowRight size={14} />
                </Link>
                <a href="#how" className="landing__btn landing__btn--ghost-dark text-body-13-strong">동작 방식 보기</a>
              </div>
            </div>
            <LiveConsole />
          </div>
          <dl className="landing__stats" data-reveal>
            {STATS.map((s) => (
              <div key={s.label} className="landing__stat">
                <dt className="landing__stat-label text-caption-12">{s.label}</dt>
                <dd className="landing__stat-value">{s.value}</dd>
                <dd className="landing__stat-note text-mono-11">{s.note}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 2. 무엇을 보나 */}
        <section id="signals" className="landing__section">
          <SectionHead micro="무엇을 모니터링하나요" title={<>요청 · JVM · 로그를<br />하나의 ID 로 잇습니다</>} body="OpenTelemetry 표준 신호 세 가지를 받습니다. 셋이 같은 트레이스 ID 를 공유해서 한 화면에서 다른 화면으로 끊기지 않고 넘어갑니다." />
          <div className="landing__signals">
            {SIGNALS.map((s, i) => (
              <article key={s.key} className={`landing__card landing__signal landing__signal--${s.key}`} data-reveal style={{ ['--d' as string]: i }}>
                <h3 className="text-section-15">{s.title}</h3>
                <p className="landing__muted">{s.lead}</p>
                <ul>
                  {s.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
                <code className="landing__code text-mono-11">{s.code}</code>
              </article>
            ))}
          </div>
          <div className="landing__agent" data-reveal>
            <span className="text-micro-11 landing__muted">붙이는 법은 한 줄</span>
            <pre className="text-mono-12"><span className="landing__prompt">$</span> java <b>-javaagent:opentelemetry-javaagent.jar</b> -jar shop-order.jar</pre>
          </div>
        </section>

        {/* 3. 동작 방식 */}
        <section id="how" className="landing__section landing__section--dark">
          <SectionHead dark micro="동작 방식" title={<>앱에서 화면까지,<br />다섯 서비스가 나눠 맡습니다</>} body="수집 · 저장 · 조회 · 경보를 Kotlin 서비스 다섯으로 직접 만들었습니다. 받는 쪽이 느려져도 Kafka 가 앞에서 받아 내고, 저장은 ClickHouse 가 맡습니다." />
          <ol className="landing__pipeline">
            {PIPELINE.map((p, i) => (
              <li key={p.name} className="landing__pipe" data-reveal style={{ ['--i' as string]: i, ['--d' as string]: i }}>
                <div className="landing__pipe-node">
                  <span className="text-body-13-strong">{p.name}</span>
                  <span className="text-mono-11 landing__dim">{p.sub}</span>
                </div>
                <p className="text-caption-12">{p.detail}</p>
              </li>
            ))}
          </ol>
          <div className="landing__branch" data-reveal style={{ ['--d' as string]: 6 }}>
            <div className="landing__branch-node"><span className="text-body-13-strong">Detector</span><span className="text-mono-11 landing__dim">규칙 평가</span></div>
            <IconArrowRight size={14} className="landing__dim" />
            <div className="landing__branch-node"><span className="text-body-13-strong">Notifier</span><span className="text-mono-11 landing__dim">Slack · 이메일 · 웹훅 · PagerDuty</span></div>
            <p className="text-caption-12 landing__dim">ClickHouse 에 쌓인 값을 읽어 경보를 냅니다</p>
          </div>
        </section>

        {/* 4. 화면 */}
        <section id="screens" className="landing__section">
          <SectionHead micro="화면" title={<>느린 요청 하나에서<br />원인 파드까지 따라갑니다</>} body={current.caption} />
          <div className="landing__tabs" data-reveal role="tablist" aria-label="화면 미리보기">
            {SCREENS.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={s.key === screen} className="landing__tab text-body-13-strong" onClick={() => setScreen(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="landing__window" data-reveal style={{ ['--d' as string]: 1 }} role="tabpanel" aria-label={`${current.label} 미리보기`}>
            <div className="landing__window-bar">
              <i /><i /><i />
              <span className="text-mono-11 landing__muted">monimo / {current.label}</span>
            </div>
            <div className="landing__window-body">
              {screen === 'map' && <PreviewMap />}
              {screen === 'trace' && <div className="landing__trace-wrap"><HeroTrace /></div>}
              {screen === 'scatter' && <PreviewScatter />}
              {screen === 'inspector' && <PreviewInspector />}
              {screen === 'logs' && <PreviewLogs />}
            </div>
          </div>
        </section>

        {/* 5. 경보 */}
        <section id="alerts" className="landing__section landing__section--tint">
          <SectionHead micro="경보" title={<>이상하면 한 번만,<br />묶어서 알립니다</>} body="같은 장애로 메시지가 수십 개 쏟아지지 않게 합니다. 경보는 상태 머신으로, 발송은 따로 떨어진 큐로 처리합니다." />
          <div className="landing__alerts">
            <ol className="landing__timeline">
              {ALERT_STEPS.map((s, i) => (
                <li key={s.title} className="landing__tl" data-reveal style={{ ['--i' as string]: i, ['--d' as string]: i }}>
                  <span className={`landing__tl-tag text-mono-12-strong${s.tone ? ` landing__tl-tag--${s.tone}` : ''}`}>{s.t}</span>
                  <div>
                    <h3 className="text-body-13-strong">{s.title}</h3>
                    <p className="landing__muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <SlackMock />
          </div>
        </section>

        {/* 6. 감시자의 감시 */}
        <section id="watchdog" className="landing__section">
          <SectionHead micro="Watchdog" title={<>MONIMO 가 멈추면,<br />누가 알려 주나요?</>} body="모니터링 도구가 멈추면 경보도 같이 조용해집니다. 「알림이 안 온다」가 「아무 일 없다」처럼 보이는 게 가장 위험합니다. 그래서 클러스터 밖에서 1분마다 직접 확인합니다." />
          <div data-reveal>
            <WatchdogDemo />
          </div>
          <div className="landing__watch">
            <article className="landing__card landing__mini" data-reveal style={{ ['--d' as string]: 0 }}>
              <span className="landing__mini-icon landing__mini-icon--a" aria-hidden="true">λ</span>
              <div>
                <h3 className="text-body-13-strong">Watchdog 이 죽으면?</h3>
                <p className="landing__muted">Watchdog 도 매번 Healthchecks.io 에 「살아 있다」 핑을 보냅니다. 핑이 끊기면 거기서 알립니다.</p>
              </div>
            </article>
            <article className="landing__card landing__mini" data-reveal style={{ ['--d' as string]: 1 }}>
              <span className="landing__mini-icon landing__mini-icon--b" aria-hidden="true">↻</span>
              <div>
                <h3 className="text-body-13-strong">우리 서비스도 같은 화면에서</h3>
                <p className="landing__muted">MONIMO 의 서비스 다섯에도 같은 에이전트를 붙여, 쇼핑몰을 보듯 MONIMO 자신의 지연 · 에러 · JVM 을 봅니다.</p>
              </div>
            </article>
          </div>
        </section>

        {/* 7. 마무리 */}
        <section className="landing__final">
          <h2 className="landing__display landing__display--sm" data-reveal>쇼핑몰 네 서비스가 보내는 요청을<br />지금 직접 열어 보세요</h2>
          <div className="landing__cta landing__cta--center">
            <Link to="/server-map" className="landing__btn landing__btn--primary text-body-13-strong">콘솔 열기 <IconArrowRight size={14} /></Link>
            <Link to="/login" className="landing__btn landing__btn--ghost-dark text-body-13-strong">로그인</Link>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <span className="text-mono-16-strong">MONIMO</span>
        <ul>
          {REPOS.map((r) => (
            <li key={r.name}><a href={r.href} target="_blank" rel="noreferrer" className="text-mono-12">{r.name}</a></li>
          ))}
        </ul>
      </footer>
    </div>
  )
}

function SectionHead({ micro, title, body, dark }: { micro: string; title: ReactNode; body: string; dark?: boolean }) {
  return (
    <div className={dark ? 'landing__head landing__head--dark' : 'landing__head'} data-reveal>
      <span className="landing__eyebrow text-micro-11">{micro}</span>
      <h2 className="landing__h2">{title}</h2>
      <p className="landing__lead landing__lead--sm">{body}</p>
    </div>
  )
}

/** 첫 화면 오른쪽 : 트레이스 하나의 워터폴. 결제 스팬 하나가 느리다 */
function HeroTrace() {
  const spans = [
    { name: 'shop-gateway', op: 'POST /orders', start: 0, len: 100, svc: 1 },
    { name: 'shop-order', op: 'createOrder', start: 4, len: 92, svc: 2 },
    { name: 'shop-inventory', op: 'reserve', start: 8, len: 12, svc: 3 },
    { name: 'postgres', op: 'INSERT orders', start: 22, len: 6, svc: 2 },
    { name: 'shop-payment', op: 'approve', start: 30, len: 62, svc: 5, slow: true },
    { name: 'kafka', op: 'order.created', start: 93, len: 3, svc: 4 },
  ]
  return (
    <figure className="landing__trace" aria-label="트레이스 워터폴 예시 : 주문 요청 1,284ms 중 shop-payment approve 가 812ms">
      <figcaption className="landing__trace-head">
        <span className="text-mono-11 landing__dim">trace 4bf92f35…a3ce</span>
        <span className="landing__badge-crit text-mono-12-strong">1,284 ms</span>
      </figcaption>
      <ul>
        {spans.map((s, i) => (
          <li key={s.name + s.op} className={s.slow ? 'landing__span landing__span--slow' : 'landing__span'} style={{ ['--i' as string]: i }}>
            <span className="landing__span-name text-mono-11">{s.name}<span className="landing__dim"> {s.op}</span></span>
            <span className="landing__span-track">
              <span className="landing__span-bar" style={{ left: `${s.start}%`, width: `${s.len}%`, background: s.slow ? 'var(--color-status-crit)' : `var(--color-service-${s.svc})` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="landing__trace-foot text-caption-12">
        <span className="landing__dot landing__dot--crit" /> shop-payment <b>approve</b> 가 전체의 63%
      </p>
    </figure>
  )
}

function PreviewMap() {
  // 노드 좌표는 viewBox(640 x 300) 기준
  const nodes = [
    { id: 'gw', x: 70, y: 150, label: 'shop-gateway', svc: 1, rps: '42/s' },
    { id: 'order', x: 260, y: 150, label: 'shop-order', svc: 2, rps: '38/s' },
    { id: 'inv', x: 450, y: 60, label: 'shop-inventory', svc: 3, rps: '38/s' },
    { id: 'pay', x: 450, y: 150, label: 'shop-payment', svc: 5, rps: '35/s', err: true },
    { id: 'db', x: 450, y: 245, label: 'postgres', kind: 'db' },
    { id: 'kafka', x: 590, y: 245, label: 'kafka', kind: 'mq' },
  ]
  const edges: [string, string, ('err' | 'async')?][] = [['gw', 'order'], ['order', 'inv'], ['order', 'pay', 'err'], ['order', 'db'], ['order', 'kafka', 'async']]
  const at = (id: string) => nodes.find((n) => n.id === id)!
  return (
    <svg viewBox="0 0 640 300" className="landing__map" role="img" aria-label="Service map 예시 : shop-order 에서 shop-payment 로 가는 호출에 에러가 있다">
      {edges.map(([a, b, kind]) => {
        const p = at(a), q = at(b)
        return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={`landing__edge${kind ? ` landing__edge--${kind}` : ''}`} />
      })}
      {nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
          {n.kind === 'db' ? (
            <rect x={-36} y={-18} width={72} height={36} rx={18} className="landing__node landing__node--infra" />
          ) : n.kind === 'mq' ? (
            <polygon points="-34,0 -17,-20 17,-20 34,0 17,20 -17,20" className="landing__node landing__node--infra" />
          ) : (
            <rect x={-62} y={-22} width={124} height={44} rx={8} className={n.err ? 'landing__node landing__node--err' : 'landing__node'} style={{ stroke: n.err ? undefined : `var(--color-service-${n.svc})` }} />
          )}
          <text y={n.rps ? -3 : 4} textAnchor="middle" className="landing__node-label">{n.label}</text>
          {n.rps ? <text y={13} textAnchor="middle" className="landing__node-sub">{n.rps}{n.err ? ' · 에러 4.2%' : ''}</text> : null}
        </g>
      ))}
    </svg>
  )
}

function PreviewScatter() {
  // 정해진 난수 : 같은 그림이 매번 나온다
  const pts = Array.from({ length: 140 }, (_, i) => {
    const x = (i * 37) % 600 + 20
    const base = 200 + ((i * 53) % 60)
    const slow = i % 23 === 0
    return { x, y: slow ? 40 + ((i * 7) % 50) : base, slow, err: i % 41 === 0 }
  })
  return (
    <svg viewBox="0 0 640 300" className="landing__scatter" role="img" aria-label="응답 시간 스캐터 예시 : 대부분 아래쪽에 모이고 몇 개가 위로 튄다">
      {[60, 140, 220].map((y) => <line key={y} x1={20} x2={620} y1={y} y2={y} className="landing__grid" />)}
      <rect x={300} y={28} width={180} height={80} rx={6} className="landing__brush" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} className={p.err ? 'landing__pt landing__pt--err' : p.slow ? 'landing__pt landing__pt--slow' : 'landing__pt'} />)}
      <text x={308} y={22} className="landing__node-sub">드래그한 요청 → 트레이스로</text>
    </svg>
  )
}

function PreviewInspector() {
  const heap = [42, 48, 55, 61, 67, 72, 40, 46, 52, 58, 64, 70, 76, 44, 50, 57, 63, 69, 75, 81, 47, 53]
  const gc = [2, 2, 3, 2, 3, 3, 14, 2, 3, 2, 3, 4, 4, 16, 3, 2, 3, 3, 4, 5, 18, 3]
  return (
    <div className="landing__insp">
      <div className="landing__insp-head">
        <span className="text-mono-12">shop-payment-7d9f…-x2k4p</span>
        <span className="landing__pill landing__pill--warn text-mono-11">GC 1분 18%</span>
      </div>
      <Bars title="힙 사용량 (MB)" values={heap} max={100} />
      <Bars title="GC 시간 (ms / 1분)" values={gc} max={20} warnAt={12} />
      <div className="landing__insp-foot text-caption-12 landing__muted">스레드 덤프 요청 → 파드에 팬아웃 → 같은 화면에서 열람</div>
    </div>
  )
}

function Bars({ title, values, max, warnAt }: { title: string; values: number[]; max: number; warnAt?: number }) {
  return (
    <div className="landing__bars">
      <span className="text-caption-12 landing__muted">{title}</span>
      <div className="landing__bars-row">
        {values.map((v, i) => (
          <span key={i} className={warnAt && v >= warnAt ? 'landing__vbar landing__vbar--warn' : 'landing__vbar'} style={{ height: `${(v / max) * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

function PreviewLogs() {
  const rows = [
    { t: '14:05:30.112', lv: 'INFO', svc: 'shop-order', msg: 'order created id=88123' },
    { t: '14:05:30.418', lv: 'WARN', svc: 'shop-payment', msg: 'PG response slow 812ms' },
    { t: '14:05:30.902', lv: 'ERROR', svc: 'shop-payment', msg: 'approve failed: ReadTimeoutException' },
    { t: '14:05:30.905', lv: 'ERROR', svc: 'shop-order', msg: 'payment rollback order=88123' },
    { t: '14:05:31.020', lv: 'INFO', svc: 'shop-gateway', msg: 'POST /orders 502 1284ms' },
  ]
  return (
    <div className="landing__logs">
      <div className="landing__logs-filter text-mono-11"><span className="landing__muted">trace_id =</span> 4bf92f3577b34da6a3ce929d0e0e4736</div>
      {rows.map((r) => (
        <div key={r.t} className={`landing__log landing__log--${r.lv.toLowerCase()} text-mono-12`}>
          <span className="landing__muted">{r.t}</span>
          <span className="landing__log-lv">{r.lv}</span>
          <span>{r.svc}</span>
          <span className="landing__log-msg">{r.msg}</span>
        </div>
      ))}
    </div>
  )
}

function SlackMock() {
  return (
    <div className="landing__slack" data-reveal style={{ ['--d' as string]: 2 }} aria-label="Slack 경보 메시지 예시">
      <div className="landing__slack-head text-caption-12-medium"># alerts-shop</div>
      <div className="landing__slack-msg">
        <span className="landing__slack-avatar text-mono-12-strong">M</span>
        <div>
          <div className="text-body-13-strong">MONIMO <span className="landing__muted text-caption-12">14:05</span></div>
          <div className="landing__slack-card landing__slack-card--crit">
            <b className="text-body-13-strong">FIRING · 결제 에러율 &gt; 2%</b>
            <span className="text-caption-12">shop-payment · 4.2% (최근 1분) · 같은 그룹 2건</span>
          </div>
          <div className="landing__slack-card landing__slack-card--ok">
            <b className="text-body-13-strong">RESOLVED · 결제 에러율 &gt; 2%</b>
            <span className="text-caption-12">14:11 복구 · 6분 지속</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 스크롤해서 화면에 들어온 [data-reveal] 요소에 is-in 을 붙인다 (한 번만).
 * JS 가 돌기 전 · 움직임을 끈 사람 · IntersectionObserver 가 없는 브라우저에서는 처음부터 다 보인다 (.landing--reveal 이 없으면 숨기지 않는다).
 */
function useReveal() {
  useEffect(() => {
    const root = document.querySelector('.landing')
    if (!root || !('IntersectionObserver' in window)) return
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    } catch {
      /* matchMedia 가 없으면 그냥 움직인다 */
    }
    root.classList.add('landing--reveal')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    )
    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      root.classList.remove('landing--reveal')
    }
  }, [])
}
