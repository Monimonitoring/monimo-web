// 경보 이벤트 (api-spec 16번 GET /alert-events · 45번 상세 · 24번 알림 발송 이력, VIEWER+). 경보 화면 · Service map 발화 중 띠가 쓴다
import { api, type Page } from './client'

export type AlertState = 'FIRING' | 'RESOLVED'
export type Severity = 'CRITICAL' | 'WARNING' | 'INFO'

export type AlertEvent = {
  alert_event_uuid: string
  alert_rule_uuid: string
  rule_name: string
  service_name: string
  agent_key: string | null
  fingerprint: string
  state: AlertState
  severity: Severity
  /** 경보가 울릴 때 잰 값. 단위는 규칙의 metric_kind 에 따른다 (이 응답에는 없다). 잰 값이 없는 사건(AGENT_DOWN 등)은 null */
  observed_value: number | null
  fired_at: string
  resolved_at: string | null
}

export type AlertEventsQuery = {
  serviceName?: string | null
  state?: AlertState
  severity?: Severity
  from?: string
  to?: string
  cursor?: string | null
  limit?: number
}

export function listAlertEvents(q: AlertEventsQuery = {}, signal?: AbortSignal): Promise<Page<AlertEvent>> {
  const { serviceName, state, severity, from, to, cursor, limit } = q
  return api.getPage<AlertEvent>('/alert-events', { query: { service_name: serviceName, state, severity, from, to, cursor, limit }, signal })
}

/** 경보 규칙이 재는 값 7종 */
export type MetricKind = '5XX_RATE' | '4XX_RATE' | 'P95_LATENCY' | 'CPU' | 'HEAP' | 'GC_TIME' | 'AGENT_DOWN'
/** 비교 방법: 크다 · 크거나 같다 · 작다 · 작거나 같다 */
export type Operator = 'GT' | 'GTE' | 'LT' | 'LTE'

/** 경보 하나의 상세 — 목록 필드 + 규칙 조건 */
export type AlertEventDetail = AlertEvent & {
  metric_kind: MetricKind
  operator: Operator
  threshold: number
  window_sec: number
}

export function getAlertEvent(uuid: string, signal?: AbortSignal): Promise<AlertEventDetail> {
  return api.get<AlertEventDetail>(`/alert-events/${encodeURIComponent(uuid)}`, { signal })
}

export type ChannelType = 'SLACK' | 'EMAIL' | 'WEBHOOK' | 'PAGERDUTY'
export type NotifyResult = 'SUCCESS' | 'FAIL'

/** 이 경보를 채널 하나로 보낸 기록 */
export type AlertNotification = {
  notification_uuid: string
  alert_channel_uuid: string
  channel_name: string
  type: ChannelType
  result: NotifyResult
  /** 실패 뒤 다시 보낸 횟수 */
  retry_count: number
  /** 채널이 돌려준 응답 (예: 200 ok · 429 rate_limited). 응답을 못 받았으면 null */
  response: string | null
  sent_at: string
}

export function listAlertNotifications(uuid: string, { cursor, limit }: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignal): Promise<Page<AlertNotification>> {
  return api.getPage<AlertNotification>(`/alert-events/${encodeURIComponent(uuid)}/notifications`, { query: { cursor, limit }, signal })
}

// ── 경보 규칙 (api-spec 48 목록 · 23 상세 · 10 생성 · 30 수정 · 44 켜기/끄기 · 11 채널 교체, 변경은 ADMIN) ──

/** 규칙에 붙은 채널 한 줄 (규칙 응답의 channels[]) */
export type AlertChannelRef = { alert_channel_uuid: string; name: string; type: ChannelType }

export type AlertRule = {
  alert_rule_uuid: string
  application_uuid: string
  service_name: string
  name: string
  metric_kind: MetricKind
  operator: Operator
  threshold: number
  window_sec: number
  severity: Severity
  enabled: boolean
  /** 상세 · 생성 · 수정 응답에만 있다. 목록(GET /alert-rules)에는 없다 */
  channels?: AlertChannelRef[]
  created_at: string
  updated_at: string
}

export type AlertRulesQuery = {
  serviceName?: string | null
  enabled?: boolean
  severity?: Severity
  cursor?: string | null
  limit?: number
}

export function listAlertRules(q: AlertRulesQuery = {}, signal?: AbortSignal): Promise<Page<AlertRule>> {
  const { serviceName, enabled, severity, cursor, limit } = q
  return api.getPage<AlertRule>('/alert-rules', { query: { service_name: serviceName, enabled, severity, cursor, limit }, signal })
}

export function getAlertRule(uuid: string, signal?: AbortSignal): Promise<AlertRule> {
  return api.get<AlertRule>(`/alert-rules/${encodeURIComponent(uuid)}`, { signal })
}

/** 수정(30번)이 받는 값. 서비스(application)는 만들 때만 정한다 */
export type AlertRuleBody = Pick<AlertRule, 'name' | 'metric_kind' | 'operator' | 'threshold' | 'window_sec' | 'severity'>

export function createAlertRule(body: AlertRuleBody & { application_uuid: string; enabled: boolean; channel_uuids: string[] }): Promise<AlertRule> {
  return api.post<AlertRule>('/alert-rules', body)
}

export function updateAlertRule(uuid: string, body: AlertRuleBody): Promise<AlertRule> {
  return api.put<AlertRule>(`/alert-rules/${encodeURIComponent(uuid)}`, body)
}

export function setAlertRuleEnabled(uuid: string, enabled: boolean): Promise<{ alert_rule_uuid: string; enabled: boolean; updated_at: string }> {
  return api.patch(`/alert-rules/${encodeURIComponent(uuid)}/enabled`, { enabled })
}

/** 규칙-채널 연결을 통째로 바꾼다 (빈 배열이면 전부 끊는다) */
export function setAlertRuleChannels(uuid: string, channelUuids: string[]): Promise<{ alert_rule_uuid: string; channels: AlertChannelRef[] }> {
  return api.put(`/alert-rules/${encodeURIComponent(uuid)}/channels`, { channel_uuids: channelUuids })
}

// ── 알림 채널 (api-spec 42 목록 · 33 상세 · 37 등록 · 17 수정 · 7 켜기/끄기 · 19 테스트 발송, 변경 · 상세는 ADMIN) ──

/** 테스트 발송 결과. 알림 발송 이력(NotifyResult)의 FAIL 과 달리 명세 19 · 50 번은 FAILED 다 */
export type ChannelTestResult = 'SUCCESS' | 'FAILED'

export type ChannelTest = {
  alert_channel_uuid: string
  type: ChannelType
  result: ChannelTestResult
  /** 채널이 돌려준 응답 (예: ok · 404 routing_key not found) */
  response: string
  tested_at: string
}

/** 목록(42번) 한 줄. 설정(config)은 없다 — 상세(ADMIN)에서만 */
export type AlertChannelSummary = AlertChannelRef & {
  enabled: boolean
  created_at: string
  updated_at: string
}

export type AlertChannel = AlertChannelSummary & {
  /** 종류별 설정(webhook_url · to 등). 비밀값은 서버가 가려서(••••) 준다 */
  config: Record<string, string>
}

export function listAlertChannels(q: { type?: ChannelType; enabled?: boolean; cursor?: string | null; limit?: number } = {}, signal?: AbortSignal): Promise<Page<AlertChannelSummary>> {
  return api.getPage<AlertChannelSummary>('/alert-channels', { query: q, signal })
}

export function getAlertChannel(uuid: string, signal?: AbortSignal): Promise<AlertChannel> {
  return api.get<AlertChannel>(`/alert-channels/${encodeURIComponent(uuid)}`, { signal })
}

/** 수정(17번)이 받는 값. config 의 비밀값은 새로 적을 때만 넣고, 빼면 서버가 이전 값을 그대로 둔다 */
export type AlertChannelBody = Pick<AlertChannel, 'name' | 'type' | 'config'>

export function createAlertChannel(body: AlertChannelBody & { enabled: boolean }): Promise<AlertChannel> {
  return api.post<AlertChannel>('/alert-channels', body)
}

export function updateAlertChannel(uuid: string, body: AlertChannelBody): Promise<AlertChannel> {
  return api.put<AlertChannel>(`/alert-channels/${encodeURIComponent(uuid)}`, body)
}

export function setAlertChannelEnabled(uuid: string, enabled: boolean): Promise<{ alert_channel_uuid: string; enabled: boolean; updated_at: string }> {
  return api.patch(`/alert-channels/${encodeURIComponent(uuid)}/enabled`, { enabled })
}

/** 저장된 설정으로 시험 메시지를 한 번 실제로 보낸다. 실패도 200 으로 오고 result 가 FAILED */
export function testAlertChannel(uuid: string): Promise<ChannelTest> {
  return api.post<ChannelTest>(`/alert-channels/${encodeURIComponent(uuid)}/test`)
}
