import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, getAlertEvent, listAlertNotifications } from '@/api'
import {
  alertStateTone,
  Badge,
  Banner,
  channelTypeTone,
  Drawer,
  formatTime,
  notifyResultTone,
  severityTone,
  shortId,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/design-system'
import { useFilterHref } from '@/stores'
import { fmtDuration, fmtValue, OPERATOR, UNIT } from './metric'

type Props = { eventId: string | null; now: number; onClose: () => void }

/** 경보 하나의 상세 — 규칙 조건 · 실측값, 알림을 어디로 몇 번 보냈는지 */
export function EventDrawer({ eventId, now, onClose }: Props) {
  return (
    <Drawer open={!!eventId} onClose={onClose} title="경보 상세" className="al-drawer">
      {eventId ? <Body key={eventId} eventId={eventId} now={now} /> : null}
    </Drawer>
  )
}

function Body({ eventId, now }: { eventId: string; now: number }) {
  const href = useFilterHref()
  const detail = useQuery({ queryKey: ['alert-event', eventId], queryFn: ({ signal }) => getAlertEvent(eventId, signal) })
  const sent = useQuery({ queryKey: ['alert-notifications', eventId], queryFn: ({ signal }) => listAlertNotifications(eventId, {}, signal) })
  const e = detail.data

  if (detail.isPending) return <p className="al-empty text-body-13" role="status">불러오는 중…</p>
  if (!e) {
    const code = detail.error instanceof ApiError ? detail.error.code : ''
    return (
      <p className="al-empty text-body-13" role="alert">
        {code === 'NOT_FOUND' ? '이 경보를 찾을 수 없습니다.' : `경보를 불러오지 못했습니다. ${code ? `(${code})` : ''}`}
      </p>
    )
  }

  const unit = UNIT[e.metric_kind]
  const firing = e.state === 'FIRING'
  const fields: [string, ReactNode][] = [
    ['alert_event_uuid', <span key="id" className="text-mono-12" title={e.alert_event_uuid}>{shortId(e.alert_event_uuid)}</span>],
    ['service_name', e.service_name],
    ['agent_key', e.agent_key ?? <span key="agent" className="al-muted">— (서비스 단위 규칙)</span>],
    ['metric_kind', <Badge key="kind" tone="accent" className="text-mono-11">{e.metric_kind}</Badge>],
    ['조건', <span key="cond" className="text-mono-12">{`operator ${e.operator} (${OPERATOR[e.operator]}) · threshold ${fmtValue(e.threshold)} ${unit} · window_sec ${e.window_sec}`}</span>],
    ['observed_value', <span key="obs" className={`text-mono-12-strong${firing ? ' al-crit' : ''}`}>{`${fmtValue(e.observed_value)} ${unit}`}</span>],
    ['fingerprint', <span key="fp" className="text-mono-12" title={e.fingerprint}>{e.fingerprint}</span>],
    ['fired_at', <span key="fa" className="text-mono-12">{new Date(e.fired_at).toLocaleString('sv-SE')}</span>],
    ['resolved_at', e.resolved_at ? <span key="ra" className="text-mono-12">{new Date(e.resolved_at).toLocaleString('sv-SE')}</span> : '—'],
  ]

  return (
    <div className="al-detail">
      <header className="al-detail__head">
        <h3 className="text-section-15">{e.rule_name}</h3>
        <div className="al-detail__badges">
          <Badge tone={alertStateTone(e.state)}>{e.state}</Badge>
          <Badge tone={severityTone(e.severity)}>{e.severity}</Badge>
          <span className="text-caption-12 al-muted">
            {firing ? `${fmtDuration(now - Date.parse(e.fired_at))}째 진행 중` : `${fmtDuration(Date.parse(e.resolved_at!) - Date.parse(e.fired_at))} 만에 해소`}
          </span>
        </div>
        <span className="text-mono-11 al-muted" title={e.alert_rule_uuid}>alert_rule_uuid {shortId(e.alert_rule_uuid)}</span>
      </header>

      <dl className="al-fields">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt className="text-caption-12-medium">{k}</dt>
            <dd className="text-body-13">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="al-links">
        <Link className="al-link text-caption-12-medium" to={href('/server-map', { serviceName: e.service_name })}>
          Service map 에서 보기 →
        </Link>
        <Link className="al-link text-caption-12-medium" to={href('/alerts', undefined, { tab: 'rules', rule: e.alert_rule_uuid })}>
          규칙 보기 →
        </Link>
      </div>

      <section aria-labelledby="al-sent-title" className="al-sent">
        <h3 id="al-sent-title" className="text-section-15">알림 발송 이력</h3>
        {sent.isPending ? (
          <p className="al-empty text-caption-12" role="status">불러오는 중…</p>
        ) : !sent.data ? (
          <p className="al-empty text-caption-12" role="alert">발송 이력을 불러오지 못했습니다.</p>
        ) : sent.data.items.length === 0 ? (
          <p className="al-empty text-caption-12">이 경보로 보낸 알림이 없습니다 (규칙에 연결된 채널이 없을 수 있습니다).</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>channel_name · response</TableHeaderCell>
                <TableHeaderCell>type</TableHeaderCell>
                <TableHeaderCell>result</TableHeaderCell>
                <TableHeaderCell align="right">재시도</TableHeaderCell>
                <TableHeaderCell align="right">sent_at</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sent.data.items.map((n) => (
                <TableRow key={n.notification_uuid}>
                  <TableCell>
                    <div className="text-body-13-strong">{n.channel_name}</div>
                    <div className={`text-mono-11 ${n.result === 'FAIL' ? 'al-crit' : 'al-muted'}`}>{n.response}</div>
                  </TableCell>
                  <TableCell type="badge"><Badge tone={channelTypeTone(n.type)} className="text-mono-11">{n.type}</Badge></TableCell>
                  <TableCell type="badge"><Badge tone={notifyResultTone(n.result)}>{n.result}</Badge></TableCell>
                  <TableCell type="number">{n.retry_count}</TableCell>
                  <TableCell type="mono" className="al-right">{formatTime(n.sent_at).slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Banner tone="info">observed_value 는 Detector 가 GET /internal/service-health 로 계산한 값입니다.</Banner>
    </div>
  )
}
