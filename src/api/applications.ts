// 감시 대상 서비스 (api-spec 18번 GET /applications, VIEWER+)
import { api } from './client'

export type Application = {
  application_uuid: string
  /** 명세의 service_name 과 같은 글자. 바뀌지 않는다 */
  name: string
  /** 비워 두면 null (백엔드는 빈 글자를 null 로 저장한다) */
  display_name: string | null
  description?: string | null
  /** 속한 시스템. Collector 가 같은 값끼리 샘플링 비율의 최댓값을 묶는다(backend #205 · #206). 기본 shop */
  system: string
  /** 상세(GET /applications/{uuid})에만 있다. 목록에는 없다 */
  agent_count?: number
  created_at?: string
  updated_at?: string
}

/** 서비스 전체 (상한 4~5개라 한 쪽이면 다 온다) */
export async function listApplications(): Promise<Application[]> {
  const page = await api.getPage<Application>('/applications', { query: { limit: 500 } })
  return page.items
}

export function getApplication(uuid: string, signal?: AbortSignal): Promise<Application> {
  return api.get<Application>(`/applications/${encodeURIComponent(uuid)}`, { signal })
}

/** 등록. name 은 Collector 가 받는 otel.service.name 과 같은 글자여야 하고, 겹치면(제외한 서비스 이름 포함) 409 APPLICATION_NAME_TAKEN. 설정 한 줄(샘플링 1 %, v1)이 같이 생긴다. system 을 안 보내면 shop, 빈칸이면 400 */
export function createApplication(body: { name: string; display_name: string; description: string; system?: string }): Promise<Application> {
  return api.post<Application>('/applications', body)
}

/** 표시명 · 설명 · system 을 고친다(8번). name 은 모든 신호의 열쇠라 바꿀 수 없다 */
export function updateApplication(uuid: string, body: { display_name: string; description: string; system?: string }): Promise<Application> {
  return api.patch<Application>(`/applications/${encodeURIComponent(uuid)}`, body)
}

/** 감시 대상에서 제외. 논리 삭제라 규칙 · 파드 · 이력은 남고, 이후 목록 · 조회에서 빠진다. 같은 이름으로 다시 등록할 수 없다 */
export function deleteApplication(uuid: string): Promise<{ application_uuid: string; result: 'DELETED' }> {
  return api.delete(`/applications/${encodeURIComponent(uuid)}`)
}

/** 서비스 설정(29 · 39번) — 샘플링률(0~1)과 판번호. 고칠 때마다 version +1 */
export type ApplicationConfig = {
  application_config_uuid: string
  /** 0.0100 = 100건 중 1건만 트레이스로 남긴다 */
  sampling_rate: number
  version: number
  /** 마지막으로 고친 사람. 처음 만든 뒤 아무도 안 고쳤으면 null */
  updated_by: { user_uuid: string; name: string } | null
  updated_at: string
}

export function getApplicationConfig(uuid: string, signal?: AbortSignal): Promise<ApplicationConfig> {
  return api.get<ApplicationConfig>(`/applications/${encodeURIComponent(uuid)}/config`, { signal })
}

/** 낙관적 잠금: 내가 본 판번호(expected_version)가 아직 최신일 때만 바뀐다. 아니면 409 CONFIG_VERSION_CONFLICT */
export function putApplicationConfig(uuid: string, body: { sampling_rate: number; expected_version: number }): Promise<ApplicationConfig> {
  return api.put<ApplicationConfig>(`/applications/${encodeURIComponent(uuid)}/config`, body)
}
