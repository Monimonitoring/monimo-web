/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** api-server 주소 앞부분. 기본 /api/v1 (개발 서버가 localhost:8080 으로 넘김) */
  readonly VITE_API_BASE?: string
  /** 'true' 면 개발 서버에서 가짜 응답(MSW)을 켠다. 빌드 결과물에서는 항상 꺼져 있다 */
  readonly VITE_API_MOCK?: string
  /** 설정 화면 「에이전트 부착」 명령에 넣을 Collector OTLP 주소. 기본 https://collector.monimo.dev:4317 */
  readonly VITE_COLLECTOR_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
