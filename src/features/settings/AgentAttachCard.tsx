import { useEffect, useRef, useState } from 'react'
import { Button, Card, CodeBlock, IconCopy } from '@/design-system'

/** Collector 주소. 배포마다 다르므로 .env 로 바꿀 수 있게 둔다 */
const COLLECTOR = import.meta.env.VITE_COLLECTOR_ENDPOINT || 'https://collector.monimo.dev:4317'

/** 에이전트 부착 — 이 서비스의 JVM 에 붙일 명령. otel.service.name 이 서비스 이름과 같아야 신호가 이 서비스로 모인다 */
export function AgentAttachCard({ serviceName }: { serviceName: string }) {
  const cmd = [
    'java -javaagent:opentelemetry-javaagent.jar \\',
    `     -Dotel.service.name=${serviceName} \\`,
    '     -Dotel.resource.attributes=service.instance.id=$(hostname) \\',
    `     -Dotel.exporter.otlp.endpoint=${COLLECTOR} \\`,
    '     -Dotel.javaagent.extensions=monimo-ext.jar \\',
    '     -jar app.jar',
  ].join('\n')
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <Card
      title="에이전트 부착"
      actions={
        <Button
          icon={<IconCopy size={14} />}
          onClick={() =>
            navigator.clipboard.writeText(cmd).then(
              () => {
                clearTimeout(timer.current)
                setCopied(true)
                timer.current = setTimeout(() => setCopied(false), 2000)
              },
              // 권한이 없거나 보안 연결(https)이 아니면 복사가 막힌다 — 명령을 직접 골라 복사하도록 안내
              () => setFailed(true),
            )
          }
        >
          {copied ? '복사됨' : '복사'}
        </Button>
      }
    >
      <div className="st-attach">
        <CodeBlock aria-label="에이전트 부착 명령">{cmd}</CodeBlock>
        {failed ? (
          <span className="text-caption-12 st-crit" role="alert">
            복사하지 못했습니다. 명령을 직접 골라 복사하세요.
          </span>
        ) : null}
        <span className="text-caption-12 st-muted">
          Java 17 + Spring Boot 3.x · service.instance.id = 파드 이름(없으면 재시작마다 UUID) · mTLS 는 COLLECTOR_TLS_CLIENT_AUTH 켠 수집기만
        </span>
      </div>
    </Card>
  )
}
