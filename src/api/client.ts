// API 호출의 입구. 화면은 fetch 를 직접 쓰지 않고 여기 api.get/post/... 만 쓴다.
// 규약은 monimo-backend docs/design/web-v2/api-spec.md §0 을 따른다.
//   성공(단건) { data }  ·  성공(목록) { data: [...], page: { next_cursor, limit } }  ·  실패 { error: { code, message } }
//   모든 응답 헤더에 X-Request-Id — 장애 문의 때 쓰도록 ApiError 에 담는다.
// 인증: access 토큰이 있으면 Authorization: Bearer 를 붙인다. 401 이면 refresh 로 한 번 재발급하고 원 요청을 다시 보낸다.
// refresh 는 httpOnly 쿠키라 화면이 다루지 않는다. 쿠키가 붙으려면 API 가 같은 출처여야 한다 (개발은 vite 프록시, 운영은 Ingress 하나).
import { notifySessionExpired, tokens } from './tokens'

export const API_BASE = (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/+$/, '')

export class ApiError extends Error {
  /** HTTP 상태코드. 네트워크 실패는 0 */
  readonly status: number
  /** 명세의 오류 코드 (예: UNAUTHENTICATED · CONFLICT · CONFIG_VERSION_CONFLICT). 본문이 없으면 HTTP_<status> */
  readonly code: string
  /** 서버가 붙인 X-Request-Id. 장애 문의 때 알려 준다 */
  readonly requestId: string | null

  constructor(status: number, code: string, message: string, requestId: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

export type RequestOptions = Omit<RequestInit, 'body' | 'method'> & {
  /** 쿼리 문자열. undefined · null 값은 빠진다 */
  query?: Query
  /** false 면 Authorization 을 붙이지 않고 401 재발급도 하지 않는다 (로그인 · 재발급 같은 공개 문) */
  auth?: boolean
}

export type Page<T> = { items: T[]; nextCursor: string | null; limit: number }

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    // 오류 응답이 JSON 이 아니면(게이트웨이 502 HTML 등) 본문은 버리고 HTTP_<status> 로 알린다
    if (!res.ok) return undefined
    throw new ApiError(res.status, 'INVALID_RESPONSE', '서버 응답을 읽지 못했습니다.', res.headers.get('X-Request-Id'))
  }
}

function toApiError(res: Response, body: unknown): ApiError {
  const err = body && typeof body === 'object' ? (body as { error?: { code?: unknown; message?: unknown } }).error : undefined
  return new ApiError(
    res.status,
    typeof err?.code === 'string' ? err.code : `HTTP_${res.status}`,
    typeof err?.message === 'string' ? err.message : res.statusText || '요청을 처리하지 못했습니다.',
    res.headers.get('X-Request-Id'),
  )
}

/** 봉투를 벗기기 전 본문 전체를 돌려준다 */
async function send(method: string, path: string, body: unknown, options: RequestOptions, retried = false): Promise<unknown> {
  // 토큰이 API server 가 아닌 곳으로 가지 않도록 경로는 항상 '/…' 로 시작하는 우리 쪽 상수여야 한다
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error(`API 경로는 '/' 로 시작해야 합니다: ${path}`)
  const { query, headers, auth = true, ...init } = options
  const generation = tokens.generation()
  const qs = query
    ? new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : ''

  // Headers 인스턴스 · 배열 형태도 합쳐지도록 Headers 로 통일한다 (호출자 값이 이긴다)
  const merged = new Headers({ Accept: 'application/json' })
  if (body !== undefined) merged.set('Content-Type', 'application/json')
  const access = tokens.getAccess()
  if (auth && access) merged.set('Authorization', `Bearer ${access}`)
  new Headers(headers).forEach((v, k) => merged.set(k, v))

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ''}`, {
      credentials: 'include', // 재발급 · 로그아웃이 쓰는 refresh 쿠키
      ...init,
      method,
      headers: merged,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e // TanStack Query 취소는 그대로
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했습니다.')
  }

  if (res.status === 401 && auth && !retried) {
    const outcome = await refreshAccessToken()
    if (outcome === 'ok') return send(method, path, body, options, true)
    // 요청 도중 로그아웃했으면(세대가 바뀜) 세션 만료로 알리지 않는다
    if (outcome === 'invalid' && generation === tokens.generation()) {
      tokens.clear()
      notifySessionExpired()
    }
    // 'error'(재발급 서버 오류 · 네트워크) 는 세션을 유지하고 원래 401 을 그대로 알린다
  }

  const parsed = await parseBody(res)
  if (!res.ok) throw toApiError(res, parsed)
  return parsed
}

function unwrap<T>(body: unknown): T {
  return (body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body) as T
}

// ── access 토큰 재발급 (동시에 여러 요청이 401 이어도 한 번만) ──
type RefreshOutcome = 'ok' | 'invalid' | 'error'
let refreshing: Promise<RefreshOutcome> | null = null

/** refresh 쿠키로 access 를 다시 받는다. invalid = 쿠키가 없거나 거절됨(다시 로그인 필요) */
export function refreshAccessToken(): Promise<RefreshOutcome> {
  refreshing ??= (async (): Promise<RefreshOutcome> => {
    const generation = tokens.generation()
    try {
      const data = unwrap<{ access_token: string }>(await send('POST', '/auth/refresh', undefined, { auth: false }))
      // 재발급 중에 로그아웃했으면 받은 토큰을 되살리지 않는다
      if (generation !== tokens.generation()) return 'error'
      tokens.setAccess(data.access_token)
      return 'ok'
    } catch (e) {
      return e instanceof ApiError && e.status >= 400 && e.status < 500 ? 'invalid' : 'error'
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

export const api = {
  get: async <T>(path: string, options: RequestOptions = {}) => unwrap<T>(await send('GET', path, undefined, options)),
  post: async <T>(path: string, body?: unknown, options: RequestOptions = {}) => unwrap<T>(await send('POST', path, body, options)),
  put: async <T>(path: string, body?: unknown, options: RequestOptions = {}) => unwrap<T>(await send('PUT', path, body, options)),
  patch: async <T>(path: string, body?: unknown, options: RequestOptions = {}) => unwrap<T>(await send('PATCH', path, body, options)),
  delete: async <T>(path: string, options: RequestOptions = {}) => unwrap<T>(await send('DELETE', path, undefined, options)),
  /** 목록 문. 커서 페이징(§0) — 다음 쪽은 nextCursor 를 query.cursor 로 넘긴다. 마지막 쪽이면 null */
  getPage: async <T>(path: string, options: RequestOptions = {}): Promise<Page<T>> => {
    const body = (await send('GET', path, undefined, options)) as { data?: T[]; page?: { next_cursor?: string | null; limit?: number } } | undefined
    return { items: body?.data ?? [], nextCursor: body?.page?.next_cursor ?? null, limit: body?.page?.limit ?? 0 }
  },
}
