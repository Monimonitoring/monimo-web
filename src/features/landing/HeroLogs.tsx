/*
 * 첫 화면 배경에 깔리는 로그. 제목 뒤로 천천히 위로 흐른다.
 * 같은 목록을 두 번 이어 붙이고 절반만큼 올려서 끊김 없이 돈다 (JS 없이 CSS 만).
 * 줄 내용은 정해진 규칙으로 만든다 : 매번 같은 그림이 나오고, 서버를 부르지 않는다.
 */

type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
type Row = { time: string; level: Level; svc: string; trace: string; msg: string }

const SERVICES = ['shop-gateway', 'shop-order', 'shop-inventory', 'shop-payment', 'collector', 'ingester']
const MESSAGES: Record<Level, string[]> = {
  INFO: [
    'POST /orders 200 84ms',
    'GET /orders/88121 200 21ms',
    'reserve sku=A-1029 qty=1 ok',
    'approve order=88121 143ms',
    'published order.created partition=2',
    'batch flushed spans=2048 to ClickHouse',
    'export 412 spans via OTLP gRPC',
    'GET /products?page=3 200 37ms',
  ],
  DEBUG: ['hikari pool active=4 idle=6', 'sampling ratio=0.5 system=shop', 'kafka poll records=318'],
  WARN: ['PG response slow 790ms', 'retry 1/3 payment gateway', 'consumer lag 1,204 on raw'],
  ERROR: ['approve failed: ReadTimeoutException', 'POST /orders 502 1,284ms', 'rollback order=88123'],
}

function makeRows(seed: number, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const k = (i * 7 + seed * 13) % 23
    const level: Level = k === 0 || k === 11 ? 'ERROR' : k === 5 || k === 17 ? 'WARN' : k % 6 === 3 ? 'DEBUG' : 'INFO'
    const msgs = MESSAGES[level]
    const sec = (i * 3 + seed) % 60
    const ms = String((i * 137 + seed * 71) % 1000).padStart(3, '0')
    const hex = ((i + 1) * 2654435761 + seed * 97).toString(16).slice(-8).padStart(8, '0')
    return {
      time: `14:05:${String(sec).padStart(2, '0')}.${ms}`,
      level,
      svc: SERVICES[(i * 5 + seed) % SERVICES.length],
      trace: hex,
      msg: msgs[(i + seed) % msgs.length],
    }
  })
}

const COLUMNS = [makeRows(1, 28), makeRows(2, 28), makeRows(3, 28)]

export function HeroLogs() {
  return (
    <div className="hlogs" aria-hidden="true">
      {COLUMNS.map((rows, c) => (
        <div key={c} className="hlogs__col" style={{ ['--speed' as string]: `${70 + c * 18}s`, ['--shift' as string]: `${-c * 12}s` }}>
          <div className="hlogs__roll">
            {[...rows, ...rows].map((r, i) => (
              <div key={i} className={`hlogs__row hlogs__row--${r.level.toLowerCase()}`}>
                <span className="hlogs__time">{r.time}</span>
                <span className="hlogs__lv">{r.level}</span>
                <span className="hlogs__svc">{r.svc}</span>
                <span className="hlogs__trace">{r.trace}</span>
                <span className="hlogs__msg">{r.msg}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
