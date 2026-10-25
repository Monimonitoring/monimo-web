// Figma 06 P4 상태 · 심각도 색 사용 규칙 — 같은 뜻에는 항상 같은 색.
//   나쁨 = crit · 주의 = warn · 정상 = ok · 정보 · 분류 = muted
// 색만으로 뜻을 전하지 않도록 배지에는 값 글자를 같이 적는다:  <Badge tone={severityTone(v)}>{v}</Badge>
// muted 는 좋고 나쁨이 없는 분류값에만 쓴다 (채널 type 에 ok · crit 을 쓰면 안 된다).
// 모르는 값은 muted 로 떨어진다.
import type { Tone } from '../components/base'

const pick = (map: Record<string, Tone>, value: string): Tone => map[value.toUpperCase()] ?? 'muted'

/** 경보 state — 경보 이벤트 표 · 드로어 · Service map 상단 발화 띠 */
export const alertStateTone = (v: string) => pick({ FIRING: 'crit', RESOLVED: 'ok' }, v)

/** 경보 severity — 경보 이벤트 · 규칙 표의 심각도 컬럼 */
export const severityTone = (v: string) => pick({ CRITICAL: 'crit', WARNING: 'warn', INFO: 'muted' }, v)

/** 파드 status — Inspector 파드 목록 · 플랫폼 상태 */
export const podStatusTone = (v: string) => pick({ UP: 'ok', DOWN: 'crit', UNKNOWN: 'muted' }, v)

/** 알림 발송 result — 경보 드로어의 발송 이력 (FAIL). 채널 시험 발송(명세 19번)은 같은 뜻을 FAILED 로 적어 둘 다 빨강 */
export const notifyResultTone = (v: string) => pick({ SUCCESS: 'ok', FAIL: 'crit', FAILED: 'crit' }, v)

/** 채널 type (SLACK · EMAIL · WEBHOOK · PAGERDUTY) — 좋고 나쁨이 없는 분류라 항상 muted */
export const channelTypeTone = (_v: string): Tone => 'muted'

/** http 상태코드 — 2xx ok · 4xx warn · 5xx crit, 그 밖(1xx · 3xx)은 muted */
export function httpStatusTone(code: number): Tone {
  if (code >= 500) return 'crit'
  if (code >= 400) return 'warn'
  if (code >= 200 && code < 300) return 'ok'
  return 'muted'
}
