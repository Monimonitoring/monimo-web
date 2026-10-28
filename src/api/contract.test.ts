// 계약 테스트 — 화면이 부르는 API 함수를 가짜 응답(MSW) 에 실제로 보내 보고,
// 돌아온 값에 api-spec 의 "응답 주요 필드" 칸에 적힌 이름이 다 있는지 본다.
// 가짜 응답이 명세와 어긋나면(필드 이름 오타 · 빠진 필드) 여기서 먼저 깨진다. 실서버로 바꿀 때 이 목록이 체크리스트가 된다.
//
// 필드 목록은 monimo-backend docs/design/web-v2/api-spec.md 의 표에서 그대로 옮겼다. 명세가 바뀌면 여기도 바꾼다.
// 명세에 없는 값(제안 문 · 프론트 가정)은 이슈 #60 표를 따르고, 줄 끝에 (가정) 이라고 적었다.
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiError,
  createAlertRule,
  createApplication,
  updateApplication,
  deleteApplication,
  getActiveThreads,
  getAgent,
  getAlertChannel,
  getAlertEvent,
  getAlertRule,
  getApplication,
  getApplicationConfig,
  getErrorTimeline,
  getHeatmap,
  getMetricSeries,
  getScatter,
  getServerMap,
  getThreadDump,
  getTrace,
  listAgents,
  listAlertChannels,
  listAlertEvents,
  listAlertNotifications,
  listAlertRules,
  listApplications,
  listErrors,
  listLogs,
  listMetricNames,
  listThreadDumps,
  listTransactions,
  listUrlStats,
  putApplicationConfig,
  requestThreadDump,
  setAlertChannelEnabled,
  setAlertRuleEnabled,
  testAlertChannel,
} from '@/api'
import { login, logout, restoreSession } from './auth'
import { tokens } from './tokens'
import { PASSWORD } from './mocks/common'
import { handlers } from './mocks/handlers'

const server = setupServer(...handlers)

const now = Date.now()
const HOUR = 3_600_000
const from = new Date(now - 6 * HOUR).toISOString()
const to = new Date(now).toISOString()
const SERVICE = 'shop-order'

/** obj 에 없는 필드 이름. 빈 배열이면 명세 필드가 다 있다 */
const missing = (obj: unknown, fields: string[]) => fields.filter((f) => !(obj && typeof obj === 'object' && f in obj))

/** 실패가 명세의 HTTP 상태 · 오류 코드로 오는지 */
async function expectApiError(p: Promise<unknown>, status: number, code: string) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e, `${status} ${code} 로 실패해야 한다`).toBeInstanceOf(ApiError)
  expect({ status: (e as ApiError).status, code: (e as ApiError).code }).toEqual({ status, code })
}

beforeAll(async () => {
  // 목록에 없는 주소를 부르면 실패시킨다 — 화면이 명세 밖 문을 부르면 바로 드러나게
  server.listen({ onUnhandledRequest: 'error' })
  await login('admin@monimo.io', PASSWORD)
})

afterAll(async () => {
  await logout()
  server.close()
})

describe('인증', () => {
  it('로그인은 access 토큰과 사용자를 주고 refresh 는 쿠키로 심는다 (POST /auth/login)', async () => {
    await logout()
    const user = await login('admin@monimo.io', PASSWORD)
    expect(missing(user, ['user_uuid', 'email', 'name', 'role'])).toEqual([])
    expect(user.role).toBe('ADMIN')
  })

  it('access 가 사라져도 refresh 쿠키로 되살린다 (POST /auth/refresh 본문 없음)', async () => {
    tokens.setAccess(null)
    expect(await restoreSession()).toMatchObject({ email: 'admin@monimo.io' })
  })

  it('로그아웃하면 쿠키가 지워져 되살릴 수 없다', async () => {
    await logout()
    expect(await restoreSession()).toBeNull()
    await login('admin@monimo.io', PASSWORD)
  })

  it('틀린 비밀번호는 401 UNAUTHENTICATED', async () => {
    await expectApiError(login('admin@monimo.io', 'wrong'), 401, 'UNAUTHENTICATED')
    await login('admin@monimo.io', PASSWORD)
  })
})

describe('서비스 · 설정', () => {
  it('GET /applications 목록과 상세 (파드 수는 상세에만)', async () => {
    const apps = await listApplications()
    expect(apps.length).toBeGreaterThan(0)
    const fields = ['application_uuid', 'name', 'display_name', 'description', 'system', 'created_at', 'updated_at']
    expect(missing(apps[0], fields)).toEqual([])
    expect(apps[0]).not.toHaveProperty('agent_count')
    expect(missing(await getApplication(apps[0].application_uuid), [...fields, 'agent_count'])).toEqual([])
  })

  it('GET /applications/{uuid}/config', async () => {
    const [app] = await listApplications()
    const c = await getApplicationConfig(app.application_uuid)
    expect(missing(c, ['application_config_uuid', 'sampling_rate', 'version', 'updated_by', 'updated_at'])).toEqual([])
    // updated_by 는 메일이 아니라 { user_uuid, name } 객체이거나 null (backend ApplicationConfigDtos)
    if (c.updated_by) expect(missing(c.updated_by, ['user_uuid', 'name'])).toEqual([])
    expect(c.sampling_rate).toBeGreaterThanOrEqual(0)
    expect(c.sampling_rate).toBeLessThanOrEqual(1)
  })

  it('샘플링 변경은 판번호가 옛것이면 409 CONFIG_VERSION_CONFLICT, 맞으면 version +1', async () => {
    const app = (await listApplications()).find((a) => a.name === 'shop-payment')!
    const c = await getApplicationConfig(app.application_uuid)
    await expectApiError(putApplicationConfig(app.application_uuid, { sampling_rate: 0.2, expected_version: c.version - 1 }), 409, 'CONFIG_VERSION_CONFLICT')
    const next = await putApplicationConfig(app.application_uuid, { sampling_rate: 0.2, expected_version: c.version })
    expect(next.version).toBe(c.version + 1)
    expect(next.sampling_rate).toBe(0.2)
  })

  it('서비스 등록은 설정(샘플링 1 %, v1)을 같이 만들고, 이름이 겹치면 409 APPLICATION_NAME_TAKEN', async () => {
    await expectApiError(createApplication({ name: SERVICE, display_name: '', description: '' }), 409, 'APPLICATION_NAME_TAKEN')
    const a = await createApplication({ name: 'contract-test-svc', display_name: '', description: '' })
    expect(a.name).toBe('contract-test-svc')
    // 빈 표시명은 null 로 저장된다
    expect(a.display_name).toBeNull()
    // system 을 안 보내면 shop (backend #205)
    expect(a.system).toBe('shop')
    const c = await getApplicationConfig(a.application_uuid)
    expect({ rate: c.sampling_rate, version: c.version }).toEqual({ rate: 0.01, version: 1 })
    await deleteApplication(a.application_uuid)
  })

  it('system 은 보내면 그 값, 수정으로 바뀌고, 빈칸이면 400 (backend #205)', async () => {
    const a = await createApplication({ name: 'contract-test-sys', display_name: '', description: '', system: 'monimo' })
    expect(a.system).toBe('monimo')
    expect((await updateApplication(a.application_uuid, { display_name: '', description: '', system: 'shop' })).system).toBe('shop')
    await expectApiError(updateApplication(a.application_uuid, { display_name: '', description: '', system: '  ' }), 400, 'INVALID_REQUEST')
    await deleteApplication(a.application_uuid)
  })

  it('제외는 논리 삭제 — 딸린 규칙이 있어도 되고, 목록 · 조회에서 빠지고, 같은 이름은 다시 못 쓴다', async () => {
    const a = await createApplication({ name: 'contract-test-del', display_name: '', description: '' })
    const del = await deleteApplication(a.application_uuid)
    expect(missing(del, ['application_uuid', 'result'])).toEqual([])
    expect(del.result).toBe('DELETED')
    expect((await listApplications()).some((x) => x.application_uuid === a.application_uuid)).toBe(false)
    await expectApiError(getApplication(a.application_uuid), 404, 'NOT_FOUND')
    await expectApiError(createApplication({ name: 'contract-test-del', display_name: '', description: '' }), 409, 'APPLICATION_NAME_TAKEN')
  })
})

describe('Service map · 트랜잭션 · 트레이스', () => {
  it('GET /server-map', async () => {
    const m = await getServerMap({ serviceName: null, from, to })
    expect(missing(m.nodes[0], ['service_name', 'cnt', 'err_cnt'])).toEqual([])
    expect(missing(m.edges[0], ['caller_service', 'callee_service', 'callee_kind', 'cnt', 'err_cnt', 'avg_duration_ms'])).toEqual([])
    // callee_kind 는 명세의 네 값만 온다 (SERVICE · DB · EXTERNAL · MESSAGING)
    expect([...new Set(m.edges.map((e) => e.callee_kind))].filter((k) => !['SERVICE', 'DB', 'EXTERNAL', 'MESSAGING'].includes(k))).toEqual([])
    // 비동기는 간선이 큐를 거쳐 둘로 쪼개진다 : 큐로 들어가는 간선과 큐에서 나가는 간선이 같이 온다
    const queues = m.edges.filter((e) => e.callee_kind === 'MESSAGING')
    expect(queues.some((e) => e.callee_service === 'kafka')).toBe(true)
    expect(queues.some((e) => e.caller_service === 'kafka')).toBe(true)
  })

  it('시간 범위가 거꾸로면 422 UNPROCESSABLE', async () => {
    await expectApiError(getServerMap({ serviceName: null, from: to, to: from }), 422, 'UNPROCESSABLE')
  })

  it('GET /traces/scatter', async () => {
    const s = await getScatter({ serviceName: SERVICE, from, to })
    expect(missing(s, ['mode', 'total_count', 'points'])).toEqual([])
    expect(['raw', 'bucketed']).toContain(s.mode)
    expect(missing(s.points[0], ['trace_id', 'start_time', 'duration_ms', 'is_error', 'http_status', 'span_name', 'agent_key'])).toEqual([])
  })

  it('GET /traces/heatmap', async () => {
    const h = await getHeatmap({ serviceName: SERVICE, from, to })
    expect(missing(h, ['bucket_width_ms', 'step', 'cells'])).toEqual([])
    expect(missing(h.cells[0], ['ts_min', 'latency_bucket', 'is_error', 'cnt'])).toEqual([])
  })

  it('GET /traces/transactions → GET /traces/{traceId}', async () => {
    const page = await listTransactions({ serviceName: SERVICE, from, to, limit: 5 })
    const t = page.items[0]
    expect(missing(t, ['trace_id', 'start_time', 'duration_ms', 'service_name', 'agent_key', 'span_name', 'is_error', 'http_status'])).toEqual([])
    const trace = await getTrace(t.trace_id)
    expect(missing(trace, ['trace_id', 'span_count', 'services', 'root'])).toEqual([])
    expect(missing(trace.root, ['span_id', 'service_name', 'agent_key', 'duration_ns', 'status_code', 'events', 'children'])).toEqual([])
  })

  it('GET /stats/urls', async () => {
    const page = await listUrlStats({ serviceName: SERVICE, from, to })
    expect(missing(page.items[0], ['span_name', 'cnt', 'err_cnt', 'error_rate', 'p50_ms', 'p95_ms', 'p99_ms'])).toEqual([])
  })
})

describe('에러 · 로그', () => {
  it('GET /errors · GET /errors/timeline', async () => {
    const page = await listErrors({ serviceName: SERVICE, from, to })
    const fields = ['trace_id', 'span_id', 'start_time', 'duration_ns', 'service_name', 'agent_key', 'span_name', 'span_kind', 'status_code', 'http_status', 'exception_type', 'exception_message']
    expect(missing(page.items[0], fields)).toEqual([])
    const tl = await getErrorTimeline({ serviceName: SERVICE, from, to, step: 60 })
    expect(missing(tl, ['step', 'series'])).toEqual([])
    expect(missing(tl.series[0], ['ts_min', 'http_status_class', 'exception_type', 'cnt'])).toEqual([])
  })

  it('GET /logs (level 여러 개는 쉼표로 · 가정)', async () => {
    const page = await listLogs({ serviceName: SERVICE, from, to, levels: ['ERROR', 'WARN'] })
    expect(missing(page.items[0], ['ts', 'service_name', 'agent_key', 'level', 'logger', 'thread', 'message', 'trace_id', 'span_id', 'attributes'])).toEqual([])
    expect(page.items.every((l) => l.level === 'ERROR' || l.level === 'WARN')).toBe(true)
  })
})

describe('Inspector · 스레드 덤프', () => {
  it('GET /agents → GET /agents/{uuid} · active-threads', async () => {
    const page = await listAgents({ serviceName: SERVICE })
    const a = page.items.find((x) => x.status === 'UP')!
    const list = ['agent_uuid', 'service_name', 'agent_key', 'hostname', 'ip', 'jvm_version', 'agent_version', 'status']
    expect(missing(a, list)).toEqual([])
    expect(missing(await getAgent(a.agent_uuid), [...list, 'application_uuid', 'first_seen_at', 'updated_at'])).toEqual([])
    expect(missing(await getActiveThreads(a.agent_uuid), ['agent_uuid', 'agent_key', 'service_name', 'metric_name', 'ts_min', 'last_v'])).toEqual([])
  })

  it('GET /metrics/series · GET /metrics/names', async () => {
    const a = (await listAgents({ serviceName: SERVICE })).items.find((x) => x.status === 'UP')!
    const s = await getMetricSeries({ serviceName: SERVICE, metricName: 'jvm.thread.count', agentKey: a.agent_key, from, to })
    expect(missing(s, ['metric_name', 'source_table', 'step', 'series'])).toEqual([])
    expect(missing(s.series[0], ['agent_key', 'attributes', 'points'])).toEqual([])
    expect(missing(s.series[0].points[0], ['ts_min', 'avg_v', 'min_v', 'max_v', 'last_v'])).toEqual([])
    const names = await listMetricNames({ serviceName: SERVICE })
    expect(missing(names[0], ['metric_name', 'attribute_keys'])).toEqual([])
  })

  it('스레드 덤프 요청 · 목록 · 본문', async () => {
    const a = (await listAgents({ serviceName: SERVICE })).items.find((x) => x.agent_key.endsWith('x2k8q'))!
    const d = await requestThreadDump(a.agent_uuid, 10_000)
    expect(missing(d, ['dump_uuid', 'agent_uuid', 'agent_key', 'service_name', 'requested_by', 'requested_at', 'thread_count', 'dump'])).toEqual([])
    const page = await listThreadDumps({ serviceName: SERVICE, from, to: new Date().toISOString() })
    expect(page.items.some((x) => x.dump_uuid === d.dump_uuid)).toBe(true)
    // from · to 는 쌍으로만 (backend ThreadDumpController)
    await expectApiError(listThreadDumps({ serviceName: SERVICE, from }), 400, 'INVALID_REQUEST')
    expect(missing(page.items[0], ['dump_uuid', 'agent_key', 'service_name', 'requested_by', 'requested_at', 'thread_count'])).toEqual([])
    expect(missing(await getThreadDump(d.dump_uuid), ['dump_uuid', 'agent_key', 'service_name', 'requested_by', 'requested_at', 'thread_count', 'dump'])).toEqual([])
  })

  it('끊긴 파드는 503 AGENT_NOT_REACHABLE, 느린 파드는 503 THREAD_DUMP_TIMEOUT', async () => {
    const agents = (await listAgents({ serviceName: SERVICE })).items
    await expectApiError(requestThreadDump(agents.find((x) => x.status === 'DOWN')!.agent_uuid, 1000), 503, 'AGENT_NOT_REACHABLE')
    await expectApiError(requestThreadDump(agents.find((x) => x.agent_key.endsWith('z9k1w'))!.agent_uuid, 1000), 503, 'THREAD_DUMP_TIMEOUT')
  })
})

describe('경보', () => {
  const EVENT = ['alert_event_uuid', 'alert_rule_uuid', 'rule_name', 'service_name', 'agent_key', 'fingerprint', 'state', 'severity', 'observed_value', 'fired_at', 'resolved_at']

  it('GET /alert-events → 상세 · 발송 이력', async () => {
    const page = await listAlertEvents({ state: 'FIRING' })
    const e = page.items[0]
    expect(missing(e, EVENT)).toEqual([])
    expect(missing(await getAlertEvent(e.alert_event_uuid), [...EVENT, 'threshold', 'operator', 'window_sec', 'metric_kind'])).toEqual([])
    const sent = await listAlertNotifications(e.alert_event_uuid)
    expect(missing(sent.items[0], ['notification_uuid', 'alert_channel_uuid', 'channel_name', 'type', 'result', 'retry_count', 'response', 'sent_at'])).toEqual([])
  })

  it('목록은 커서로 쪽을 나눈다 (page.next_cursor)', async () => {
    const first = await listAlertEvents({ state: 'RESOLVED', limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeTruthy()
    const second = await listAlertEvents({ state: 'RESOLVED', limit: 2, cursor: first.nextCursor })
    expect(second.items[0].alert_event_uuid).not.toBe(first.items[0].alert_event_uuid)
  })

  it('GET /alert-rules · 상세 · 켜기/끄기 (channels[] 는 상세에만)', async () => {
    const rule = (await listAlertRules()).items[0]
    const fields = ['alert_rule_uuid', 'application_uuid', 'service_name', 'name', 'metric_kind', 'operator', 'threshold', 'window_sec', 'severity', 'enabled']
    expect(missing(rule, fields)).toEqual([])
    expect(rule).not.toHaveProperty('channels')
    expect(missing(await getAlertRule(rule.alert_rule_uuid), [...fields, 'channels'])).toEqual([])
    const r = await setAlertRuleEnabled(rule.alert_rule_uuid, !rule.enabled)
    expect(missing(r, ['alert_rule_uuid', 'enabled', 'updated_at'])).toEqual([])
    expect(r.enabled).toBe(!rule.enabled)
    await setAlertRuleEnabled(rule.alert_rule_uuid, rule.enabled)
  })

  it('GET /alert-channels · 테스트 발송 (config 는 상세에만, 비밀값은 가려서)', async () => {
    const ch = (await listAlertChannels()).items
    expect(missing(ch[0], ['alert_channel_uuid', 'name', 'type', 'enabled'])).toEqual([])
    expect(ch[0]).not.toHaveProperty('config')
    const slack = ch.find((c) => c.type === 'SLACK')!
    expect((await getAlertChannel(slack.alert_channel_uuid)).config.webhook_url).toContain('••••')
    const t = await testAlertChannel(slack.alert_channel_uuid)
    expect(missing(t, ['alert_channel_uuid', 'type', 'result', 'response', 'tested_at'])).toEqual([])
    expect(['SUCCESS', 'FAILED']).toContain(t.result)
    const on = await setAlertChannelEnabled(slack.alert_channel_uuid, slack.enabled)
    expect(missing(on, ['alert_channel_uuid', 'enabled', 'updated_at'])).toEqual([])
  })
})

describe('권한', () => {
  it('VIEWER 가 바꾸려 하면 403 FORBIDDEN', async () => {
    await logout()
    await login('viewer@monimo.io', PASSWORD)
    const [app] = await listApplications()
    await expectApiError(
      createAlertRule({ application_uuid: app.application_uuid, name: 'x', metric_kind: 'CPU', operator: 'GT', threshold: 1, window_sec: 300, severity: 'INFO', enabled: true, channel_uuids: [] }),
      403,
      'FORBIDDEN',
    )
    await expectApiError(putApplicationConfig(app.application_uuid, { sampling_rate: 0.1, expected_version: 1 }), 403, 'FORBIDDEN')
    // 읽기는 된다
    expect((await listAlertRules()).items.length).toBeGreaterThan(0)
    await logout()
    await login('admin@monimo.io', PASSWORD)
  })
})
