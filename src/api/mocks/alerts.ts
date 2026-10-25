// 경보 가짜 응답 (GET /alert-events · /alert-events/:uuid · /alert-events/:uuid/notifications,
// /alert-rules 목록 · 상세 · 생성 · 수정 · 켜기/끄기 · 채널 교체, GET /alert-channels).
// 시안(Alerts.dc.html)의 이벤트 8건 — 발화 중 3 · 해소 5. 시각은 지금 기준(몇 분 전)으로 만든다.
// 규칙 · 채널은 메모리 배열이라 고치면 새로고침 전까지 남는다 (경보 상세도 바뀐 규칙 이름 · 조건을 따라간다)
import { http } from 'msw'
import { API_BASE } from '../client'
import type { AlertChannel, AlertChannelBody, AlertChannelRef, AlertChannelSummary, AlertEvent, AlertEventDetail, AlertNotification, AlertRule, AlertRuleBody, ChannelTestResult, ChannelType, MetricKind, NotifyResult, Operator, Severity } from '../alerts'
import { APPLICATIONS, fail, notAdmin, ok, okPage, unauthenticated } from './common'

const MIN = 60_000
const uuid = (kind: number, i: number) => `7c1e0a52-000${kind}-4a00-9000-0000000000${String(i).padStart(2, '0')}`

export type MockRule = {
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
  /** 연결된 채널 uuid */
  channels: string[]
  created_at: string
  updated_at: string
}

export type MockChannel = {
  alert_channel_uuid: string
  name: string
  type: ChannelType
  enabled: boolean
  /** 가리지 않은 원래 값. 응답으로 나갈 때 비밀값은 maskConfig 로 가린다 */
  config: Record<string, string>
  last_test: { result: ChannelTestResult; response: string; tested_at: string } | null
  created_at: string
  updated_at: string
}

// 시안(AlertChannels.dc.html)의 채널 6개. 앞 4개는 규칙 · 알림 발송 이력이 순번으로 가리킨다
export const CHANNELS: MockChannel[] = (
  [
    { name: '#ops-alerts', type: 'SLACK', config: { webhook_url: 'https://hooks.slack.com/services/T01/B02/ops9f3k', channel: '#ops-alerts' }, test: ['SUCCESS', 'ok', '2026-09-21T05:59:41Z'] },
    { name: 'oncall@monimo.io', type: 'EMAIL', config: { to: 'oncall@monimo.io', subject_prefix: '[MONIMO]' }, test: ['SUCCESS', '250 2.0.0 OK', '2026-09-20T09:30:04Z'] },
    { name: 'PagerDuty prod', type: 'PAGERDUTY', config: { routing_key: 'R02ab8c1d9e7f0K7' }, test: ['FAILED', '404 (routing_key not found)', '2026-09-20T02:10:11Z'], off: true },
    { name: 'Webhook n8n', type: 'WEBHOOK', config: { url: 'https://n8n.monimo.io/webhook/alerts', method: 'POST' }, test: ['SUCCESS', '200 accepted', '2026-09-19T02:20:45Z'] },
    { name: '#backend-oncall', type: 'SLACK', config: { webhook_url: 'https://hooks.slack.com/services/T01/B07/be2m1x', channel: '#backend-oncall' }, test: ['SUCCESS', 'ok', '2026-09-18T00:14:27Z'] },
    { name: '플랫폼 팀 메일', type: 'EMAIL', config: { to: 'platform@monimo.io', subject_prefix: '[MONIMO]' }, test: ['SUCCESS', '250 2.0.0 OK', '2026-09-12T06:47:52Z'], off: true },
  ] as { name: string; type: ChannelType; config: Record<string, string>; test: [ChannelTestResult, string, string]; off?: boolean }[]
).map(({ test: [result, response, tested_at], off, ...c }, i) => ({
  ...c,
  alert_channel_uuid: `9d4e0a52-0000-4a00-9000-0000000000${String(i + 1).padStart(2, '0')}`,
  enabled: !off,
  last_test: { result, response, tested_at },
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}))

const appOf = (serviceName: string) => APPLICATIONS.find((a) => a.name === serviceName)!.application_uuid

// 시안(AlertRules.dc.html)의 규칙 8개. 앞 7개는 아래 경보 이벤트가 순번으로 가리킨다. 수정 · 켜기/끄기는 이 배열을 그대로 고친다
// chs 는 CHANNELS 순번 — 경보 이벤트의 알림 발송 이력과 맞춘다 (첫 규칙 · 에이전트 끊김은 4곳, 나머지는 Slack · Email)
export const RULES: MockRule[] = [
  { name: 'shop-payment 5xx 비율 초과', service_name: 'shop-payment', metric_kind: '5XX_RATE', operator: 'GT', threshold: 1, window_sec: 300, severity: 'CRITICAL', chs: [0, 1, 2, 3], at: '2026-09-21T04:40:12Z' },
  { name: 'shop-order p95 지연', service_name: 'shop-order', metric_kind: 'P95_LATENCY', operator: 'GT', threshold: 1200, window_sec: 300, severity: 'CRITICAL', chs: [0, 1], at: '2026-09-21T02:02:55Z' },
  { name: 'shop-inventory 힙 사용률', service_name: 'shop-inventory', metric_kind: 'HEAP', operator: 'GTE', threshold: 85, window_sec: 600, severity: 'WARNING', chs: [0, 1], at: '2026-09-20T08:26:41Z' },
  { name: 'shop-gateway 에이전트 응답 없음', service_name: 'shop-gateway', metric_kind: 'AGENT_DOWN', operator: 'GT', threshold: 90, window_sec: 60, severity: 'CRITICAL', chs: [0, 1, 2, 3], at: '2026-09-16T07:05:33Z' },
  { name: 'shop-gateway CPU 사용률', service_name: 'shop-gateway', metric_kind: 'CPU', operator: 'GTE', threshold: 85, window_sec: 600, severity: 'WARNING', chs: [0, 1], at: '2026-09-19T00:51:07Z' },
  { name: 'shop-order GC 시간', service_name: 'shop-order', metric_kind: 'GC_TIME', operator: 'GT', threshold: 1000, window_sec: 300, severity: 'WARNING', chs: [0, 1], at: '2026-09-18T05:33:20Z', off: true },
  { name: 'shop-gateway 4xx 비율', service_name: 'shop-gateway', metric_kind: '4XX_RATE', operator: 'GT', threshold: 5, window_sec: 900, severity: 'INFO', chs: [0, 1], at: '2026-09-17T01:12:48Z', off: true },
  { name: 'shop-gateway 5xx 비율 초과', service_name: 'shop-gateway', metric_kind: '5XX_RATE', operator: 'GT', threshold: 2, window_sec: 300, severity: 'CRITICAL', chs: [0, 1, 3], at: '2026-09-15T02:44:02Z' },
].map(({ chs, at, off, ...r }, i) => ({
  ...r,
  alert_rule_uuid: `5b2d0a52-0000-4a00-9000-0000000000${String(i + 1).padStart(2, '0')}`,
  application_uuid: appOf(r.service_name),
  enabled: !off,
  channels: chs.map((c) => CHANNELS[c].alert_channel_uuid),
  created_at: '2026-09-01T00:00:00Z',
  updated_at: at,
}) as MockRule)

type Seed = { rule: number; agent?: string; value: number; firedAgoMin: number; resolvedAgoMin?: number }

// rule 은 RULES 순번
const SEEDS: Seed[] = [
  { rule: 0, value: 4.2, firedAgoMin: 18 },
  { rule: 1, value: 1240, firedAgoMin: 12 },
  { rule: 2, agent: 'shop-inventory-7d9f4-x2k8q', value: 91.3, firedAgoMin: 6 },
  { rule: 3, agent: 'shop-gateway-7d9f4-m4p1z', value: 92, firedAgoMin: 67, resolvedAgoMin: 55 },
  { rule: 4, agent: 'shop-gateway-7d9f4-m4p1z', value: 88.6, firedAgoMin: 86, resolvedAgoMin: 70 },
  { rule: 5, agent: 'shop-order-7d9f4-q4t0b', value: 1310, firedAgoMin: 114, resolvedAgoMin: 96 },
  { rule: 6, value: 6.8, firedAgoMin: 157, resolvedAgoMin: 150 },
  { rule: 0, value: 2.6, firedAgoMin: 336, resolvedAgoMin: 310 },
]

function events(now: number): AlertEventDetail[] {
  return SEEDS.map((s, i) => {
    const rule = RULES[s.rule]
    return {
      alert_event_uuid: uuid(1, i + 1),
      alert_rule_uuid: rule.alert_rule_uuid,
      rule_name: rule.name,
      service_name: rule.service_name,
      agent_key: s.agent ?? null,
      fingerprint: [rule.service_name, rule.metric_kind, s.agent].filter(Boolean).join('|'),
      state: s.resolvedAgoMin === undefined ? 'FIRING' : 'RESOLVED',
      severity: rule.severity,
      observed_value: s.value,
      fired_at: new Date(now - s.firedAgoMin * MIN).toISOString(),
      resolved_at: s.resolvedAgoMin === undefined ? null : new Date(now - s.resolvedAgoMin * MIN).toISOString(),
      metric_kind: rule.metric_kind,
      operator: rule.operator,
      threshold: rule.threshold,
      window_sec: rule.window_sec,
    }
  })
}

/** 알림 발송 이력: 첫 경보는 시안처럼 채널 4개(PagerDuty 는 429 로 실패), 나머지는 Slack · Email 두 곳 */
function notifications(e: AlertEventDetail, index: number): AlertNotification[] {
  const fired = Date.parse(e.fired_at)
  const rows: [channel: number, result: NotifyResult, retry: number, response: string, afterSec: number][] =
    index === 0
      ? [
          [0, 'SUCCESS', 0, 'ok', 1],
          [1, 'SUCCESS', 0, '250 2.0.0 OK', 2],
          [2, 'FAIL', 2, '429 rate_limited', 6],
          [3, 'SUCCESS', 1, '200 accepted', 11],
        ]
      : [
          [0, 'SUCCESS', 0, 'ok', 1],
          [1, 'SUCCESS', 0, '250 2.0.0 OK', 2],
        ]
  return rows.map(([c, result, retry_count, response, afterSec], i) => ({
    notification_uuid: uuid(2, index * 10 + i + 1),
    alert_channel_uuid: CHANNELS[c].alert_channel_uuid,
    channel_name: CHANNELS[c].name,
    type: CHANNELS[c].type,
    result,
    retry_count,
    response,
    sent_at: new Date(fired + afterSec * 1000).toISOString(),
  }))
}

/** 목록 응답에는 규칙 조건(metric_kind 등)이 없다 (명세 16번) */
const toListItem = ({ metric_kind: _m, operator: _o, threshold: _t, window_sec: _w, ...rest }: AlertEventDetail): AlertEvent => rest

export const alertsHandlers = [
  // 목록: state 기본 FIRING, 최근 발화 순. from · to 는 fired_at 기준(선택)
  http.get(`${API_BASE}/alert-events`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const q = new URL(request.url).searchParams
    const state = q.get('state') ?? 'FIRING'
    const from = Date.parse(q.get('from') ?? '')
    const to = Date.parse(q.get('to') ?? '')
    const rows = events(Date.now())
      .filter(
        (e) =>
          e.state === state &&
          (!q.get('service_name') || e.service_name === q.get('service_name')) &&
          (!q.get('severity') || e.severity === q.get('severity')) &&
          (Number.isNaN(from) || Date.parse(e.fired_at) >= from) &&
          (Number.isNaN(to) || Date.parse(e.fired_at) < to),
      )
      .sort((a, b) => b.fired_at.localeCompare(a.fired_at))
      .map(toListItem)
    const limit = Math.min(Number(q.get('limit')) || 50, 500)
    const offset = Number(q.get('cursor')) || 0
    return okPage(rows.slice(offset, offset + limit), limit, offset + limit < rows.length ? String(offset + limit) : null)
  }),

  http.get(`${API_BASE}/alert-events/:uuid`, ({ request, params }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const e = events(Date.now()).find((x) => x.alert_event_uuid === params.uuid)
    return e ? ok(e) : fail(404, 'NOT_FOUND', '경보를 찾을 수 없습니다.')
  }),

  http.get(`${API_BASE}/alert-events/:uuid/notifications`, ({ request, params }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const all = events(Date.now())
    const i = all.findIndex((x) => x.alert_event_uuid === params.uuid)
    if (i === -1) return fail(404, 'NOT_FOUND', '경보를 찾을 수 없습니다.')
    const rows = notifications(all[i], i)
    return okPage(rows, 50)
  }),
]

// ── 규칙 ──

const METRIC_KINDS: MetricKind[] = ['5XX_RATE', '4XX_RATE', 'P95_LATENCY', 'CPU', 'HEAP', 'GC_TIME', 'AGENT_DOWN']
const OPERATORS: Operator[] = ['GT', 'GTE', 'LT', 'LTE']
const SEVERITIES: Severity[] = ['CRITICAL', 'WARNING', 'INFO']

const channelRefs = (uuids: string[]): AlertChannelRef[] =>
  uuids.flatMap((id) => {
    const c = CHANNELS.find((x) => x.alert_channel_uuid === id)
    return c ? [{ alert_channel_uuid: c.alert_channel_uuid, name: c.name, type: c.type }] : []
  })

const toRule = (r: MockRule): AlertRule => ({ ...r, channels: channelRefs(r.channels) })
/** 목록 줄. 백엔드 목록 응답에는 channels 가 없다 */
const toRuleSummary = ({ channels: _channels, ...r }: MockRule): AlertRule => r

/** 수정 · 생성 본문 검사. 틀리면 400 INVALID_REQUEST 응답, 맞으면 null */
function invalidBody(b: Partial<AlertRuleBody> | null) {
  const bad = (msg: string) => fail(400, 'INVALID_REQUEST', msg)
  if (!b) return bad('본문이 없습니다.')
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > 200) return bad('name 은 1~200자여야 합니다.')
  if (!METRIC_KINDS.includes(b.metric_kind as MetricKind)) return bad('metric_kind 가 올바르지 않습니다.')
  if (!OPERATORS.includes(b.operator as Operator)) return bad('operator 가 올바르지 않습니다.')
  if (typeof b.threshold !== 'number' || !Number.isFinite(b.threshold) || b.threshold < 0) return bad('threshold 는 0 이상의 숫자여야 합니다.')
  if (!Number.isInteger(b.window_sec) || b.window_sec! < 60 || b.window_sec! > 3600) return bad('window_sec 는 60~3600 사이 정수여야 합니다.')
  if (!SEVERITIES.includes(b.severity as Severity)) return bad('severity 가 올바르지 않습니다.')
  return null
}

const unknownChannel = (ids: unknown) =>
  !Array.isArray(ids) || ids.some((id) => !CHANNELS.some((c) => c.alert_channel_uuid === id))
    ? fail(400, 'INVALID_REQUEST', 'channel_uuids 에 없는 채널이 있습니다.')
    : null

const findRule = (id: unknown) => RULES.find((r) => r.alert_rule_uuid === id)
const ruleNotFound = () => fail(404, 'NOT_FOUND', '규칙을 찾을 수 없습니다.')

export const rulesHandlers = [
  // 목록: 최근 고친 순. service_name · enabled(true/false) · severity 로 거른다
  http.get(`${API_BASE}/alert-rules`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const q = new URL(request.url).searchParams
    const enabled = q.get('enabled')
    const rows = RULES.filter(
      (r) =>
        (!q.get('service_name') || r.service_name === q.get('service_name')) &&
        (enabled === null || String(r.enabled) === enabled) &&
        (!q.get('severity') || r.severity === q.get('severity')),
    )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(toRuleSummary)
    const limit = Math.min(Number(q.get('limit')) || 50, 500)
    const offset = Number(q.get('cursor')) || 0
    return okPage(rows.slice(offset, offset + limit), limit, offset + limit < rows.length ? String(offset + limit) : null)
  }),

  http.get(`${API_BASE}/alert-rules/:uuid`, ({ request, params }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const r = findRule(params.uuid)
    return r ? ok(toRule(r)) : ruleNotFound()
  }),

  http.get(`${API_BASE}/alert-rules/:uuid/channels`, ({ request, params }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const r = findRule(params.uuid)
    return r ? ok({ alert_rule_uuid: r.alert_rule_uuid, channels: channelRefs(r.channels) }) : ruleNotFound()
  }),

  http.post(`${API_BASE}/alert-rules`, async ({ request }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const b = (await request.json().catch(() => null)) as (AlertRuleBody & { application_uuid?: string; enabled?: boolean; channel_uuids?: string[] }) | null
    const invalid = invalidBody(b) ?? unknownChannel(b!.channel_uuids ?? [])
    if (invalid) return invalid
    const ids = b!.channel_uuids ?? []
    if (new Set(ids).size !== ids.length) return fail(409, 'RULE_CHANNEL_DUPLICATE', '같은 채널을 두 번 연결할 수 없습니다.')
    const app = APPLICATIONS.find((a) => a.application_uuid === b!.application_uuid)
    if (!app) return fail(400, 'INVALID_REQUEST', 'application_uuid 가 올바르지 않습니다.')
    const now = new Date().toISOString()
    const rule: MockRule = {
      alert_rule_uuid: crypto.randomUUID(),
      application_uuid: app.application_uuid,
      service_name: app.name,
      name: b!.name.trim(),
      metric_kind: b!.metric_kind,
      operator: b!.operator,
      threshold: b!.threshold,
      window_sec: b!.window_sec,
      severity: b!.severity,
      enabled: b!.enabled !== false,
      channels: ids,
      created_at: now,
      updated_at: now,
    }
    RULES.push(rule)
    return ok(toRule(rule), 201)
  }),

  http.put(`${API_BASE}/alert-rules/:uuid`, async ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const r = findRule(params.uuid)
    if (!r) return ruleNotFound()
    const b = (await request.json().catch(() => null)) as AlertRuleBody | null
    const invalid = invalidBody(b)
    if (invalid) return invalid
    Object.assign(r, {
      name: b!.name.trim(),
      metric_kind: b!.metric_kind,
      operator: b!.operator,
      threshold: b!.threshold,
      window_sec: b!.window_sec,
      severity: b!.severity,
      updated_at: new Date().toISOString(),
    })
    return ok(toRule(r))
  }),

  http.patch(`${API_BASE}/alert-rules/:uuid/enabled`, async ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const r = findRule(params.uuid)
    if (!r) return ruleNotFound()
    const b = (await request.json().catch(() => null)) as { enabled?: unknown } | null
    if (typeof b?.enabled !== 'boolean') return fail(400, 'INVALID_REQUEST', 'enabled 는 true/false 여야 합니다.')
    // updated_at 은 기준값 · 구간을 바꾼 시각이라(erd.md) 켜고 끄기만으로는 바꾸지 않는다 — 표 순서도 그대로
    r.enabled = b.enabled
    return ok({ alert_rule_uuid: r.alert_rule_uuid, enabled: r.enabled, updated_at: r.updated_at })
  }),

  // 연결 전체 교체. 같은 채널이 두 번 오면 명세의 409 RULE_CHANNEL_DUPLICATE
  http.put(`${API_BASE}/alert-rules/:uuid/channels`, async ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const r = findRule(params.uuid)
    if (!r) return ruleNotFound()
    const b = (await request.json().catch(() => null)) as { channel_uuids?: string[] } | null
    const invalid = unknownChannel(b?.channel_uuids)
    if (invalid) return invalid
    const ids = b!.channel_uuids!
    if (new Set(ids).size !== ids.length) return fail(409, 'RULE_CHANNEL_DUPLICATE', '같은 채널을 두 번 연결할 수 없습니다.')
    r.channels = ids
    return ok({ alert_rule_uuid: r.alert_rule_uuid, channels: channelRefs(r.channels) })
  }),

  // 채널 목록. type · enabled 로 거른다. 비밀값은 가려서 준다
  http.get(`${API_BASE}/alert-channels`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const q = new URL(request.url).searchParams
    const enabled = q.get('enabled')
    const rows = CHANNELS.filter((c) => (!q.get('type') || c.type === q.get('type')) && (enabled === null || String(c.enabled) === enabled)).map(toChannelSummary)
    const limit = Math.min(Number(q.get('limit')) || 50, 500)
    const offset = Number(q.get('cursor')) || 0
    return okPage(rows.slice(offset, offset + limit), limit, offset + limit < rows.length ? String(offset + limit) : null)
  }),
]

// ── 채널 ──

const CHANNEL_TYPES: ChannelType[] = ['SLACK', 'EMAIL', 'WEBHOOK', 'PAGERDUTY']
/** 종류별 config 키. secret 은 응답에서 가린다 */
const CONFIG_KEYS: Record<ChannelType, { key: string; required: boolean; secret?: boolean }[]> = {
  SLACK: [{ key: 'webhook_url', required: true, secret: true }, { key: 'channel', required: false }],
  EMAIL: [{ key: 'to', required: true }, { key: 'subject_prefix', required: false }],
  WEBHOOK: [{ key: 'url', required: true }, { key: 'method', required: false }],
  PAGERDUTY: [{ key: 'routing_key', required: true, secret: true }],
}

/** https://hooks.slack.com/services/T01/B02/ops9f3k → https://hooks.slack.com/••••/•••• , R02ab8c1d9e7f0K7 → R02••••••••K7 */
function mask(v: string) {
  const url = /^(https?:\/\/[^/]+)\//.exec(v)
  if (url) return `${url[1]}/••••/••••`
  return v.length <= 5 ? '••••' : `${v.slice(0, 3)}••••••••${v.slice(-2)}`
}

function maskConfig(c: Pick<MockChannel, 'type' | 'config'>): Record<string, string> {
  const secrets = new Set(CONFIG_KEYS[c.type].filter((k) => k.secret).map((k) => k.key))
  return Object.fromEntries(Object.entries(c.config).map(([k, v]) => [k, secrets.has(k) ? mask(v) : v]))
}

const toChannel = ({ last_test: _t, ...c }: MockChannel): AlertChannel => ({ ...c, config: maskConfig(c) })
/** 목록 줄. 백엔드 목록 응답에는 config 가 없고 last_test 는 어디에도 없다 (last_test 는 테스트 발송 응답에만 쓴다) */
const toChannelSummary = ({ last_test: _t, config: _c, ...c }: MockChannel): AlertChannelSummary => c
const findChannel = (id: unknown) => CHANNELS.find((c) => c.alert_channel_uuid === id)
const channelNotFound = () => fail(404, 'NOT_FOUND', '채널을 찾을 수 없습니다.')

/**
 * 등록 · 수정 본문 검사 후 저장할 config 를 만든다. 비밀값이 빠져 있으면 같은 종류일 때만 이전 값을 이어 쓴다.
 * 틀리면 400 응답
 */
function channelConfig(b: Partial<AlertChannelBody> | null, before?: MockChannel): Record<string, string> | Response {
  const bad = (msg: string) => fail(400, 'INVALID_REQUEST', msg)
  if (!b) return bad('본문이 없습니다.')
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > 100) return bad('name 은 1~100자여야 합니다.')
  if (!CHANNEL_TYPES.includes(b.type as ChannelType)) return bad('type 이 올바르지 않습니다.')
  const type = b.type as ChannelType
  const given = b.config && typeof b.config === 'object' ? b.config : {}
  const out: Record<string, string> = {}
  for (const { key, required, secret } of CONFIG_KEYS[type]) {
    const v = typeof given[key] === 'string' ? given[key].trim() : ''
    const kept = secret && before?.type === type ? before.config[key] : undefined
    const value = v || kept || ''
    if (required && !value) return bad(`config.${key} 가 필요합니다.`)
    if (value) out[key] = value
  }
  if (type === 'EMAIL' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.to)) return bad('config.to 가 메일 주소가 아닙니다.')
  if ((type === 'SLACK' || type === 'WEBHOOK') && !/^https?:\/\//.test(out.webhook_url ?? out.url)) return bad('주소는 http(s):// 로 시작해야 합니다.')
  return out
}

export const channelsHandlers = [
  // 상세는 ADMIN (명세 33번) — 수정 모달이 연다
  http.get(`${API_BASE}/alert-channels/:uuid`, ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const c = findChannel(params.uuid)
    return c ? ok(toChannel(c)) : channelNotFound()
  }),

  http.post(`${API_BASE}/alert-channels`, async ({ request }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const b = (await request.json().catch(() => null)) as (AlertChannelBody & { enabled?: boolean }) | null
    const config = channelConfig(b)
    if (config instanceof Response) return config
    const now = new Date().toISOString()
    const c: MockChannel = {
      alert_channel_uuid: crypto.randomUUID(),
      name: b!.name.trim(),
      type: b!.type,
      enabled: b!.enabled !== false,
      config,
      last_test: null,
      created_at: now,
      updated_at: now,
    }
    CHANNELS.push(c)
    return ok(toChannel(c), 201)
  }),

  http.put(`${API_BASE}/alert-channels/:uuid`, async ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const c = findChannel(params.uuid)
    if (!c) return channelNotFound()
    const b = (await request.json().catch(() => null)) as AlertChannelBody | null
    const config = channelConfig(b, c)
    if (config instanceof Response) return config
    // 주소가 바뀌면 이전 테스트 결과는 더 이상 이 설정의 결과가 아니다
    const changed = c.type !== b!.type || JSON.stringify(c.config) !== JSON.stringify(config)
    Object.assign(c, { name: b!.name.trim(), type: b!.type, config, updated_at: new Date().toISOString(), last_test: changed ? null : c.last_test })
    return ok(toChannel(c))
  }),

  http.patch(`${API_BASE}/alert-channels/:uuid/enabled`, async ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const c = findChannel(params.uuid)
    if (!c) return channelNotFound()
    const b = (await request.json().catch(() => null)) as { enabled?: unknown } | null
    if (typeof b?.enabled !== 'boolean') return fail(400, 'INVALID_REQUEST', 'enabled 는 true/false 여야 합니다.')
    c.enabled = b.enabled
    return ok({ alert_channel_uuid: c.alert_channel_uuid, enabled: c.enabled, updated_at: c.updated_at })
  }),

  // 테스트 발송: Notifier(#50)가 대행해 보낸다. PagerDuty 의 가짜 routing_key 와 example 주소는 실패로 돌려준다
  http.post(`${API_BASE}/alert-channels/:uuid/test`, async ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const c = findChannel(params.uuid)
    if (!c) return channelNotFound()
    await new Promise((r) => setTimeout(r, 600))
    const bad = c.type === 'PAGERDUTY' ? '404 (routing_key not found)' : Object.values(c.config).some((v) => v.includes('example')) ? '502 (host unreachable)' : null
    const okResponse = { SLACK: 'ok', EMAIL: '250 2.0.0 OK', WEBHOOK: '200 accepted', PAGERDUTY: '202 accepted' }[c.type]
    c.last_test = { result: bad ? 'FAILED' : 'SUCCESS', response: bad ?? okResponse, tested_at: new Date().toISOString() }
    return ok({ alert_channel_uuid: c.alert_channel_uuid, type: c.type, ...c.last_test })
  }),
]
