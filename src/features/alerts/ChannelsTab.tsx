import { useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, listAlertChannels, setAlertChannelEnabled, testAlertChannel, type AlertChannelSummary, type ChannelTest } from '@/api'
import { useAuth } from '@/auth'
import {
  Badge,
  Banner,
  Button,
  Card,
  channelTypeTone,
  Chip,
  CursorPager,
  formatTime,
  IconLock,
  IconSend,
  Segmented,
  Switch,
  Toast,
  ToastViewport,
} from '@/design-system'
import { ChannelModal } from './ChannelModal'
import { CHANNEL_TYPES } from './channelForm'
import { useAlertParams } from './useAlertParams'

const LIMIT = 50
type EnabledFilter = 'ALL' | 'on' | 'off'
type ToastState = { tone: 'ok' | 'crit'; title: string; lines: string[] }

/** 「채널」 탭 — 필터 · 채널 카드(켜기/끄기 · 테스트 발송 · 수정) · 등록/수정 모달 · 테스트 결과 토스트.
 * 목록(42번)에는 설정(config)이 없다 — 설정은 수정 모달(상세, ADMIN)에서 본다 */
export function ChannelsTab() {
  const { isAdmin } = useAuth()
  const { enabled, channelType, channelId, setEnabled, setChannelType, resetChannelFilters, openChannel } = useAlertParams()
  const qc = useQueryClient()

  const key = JSON.stringify([enabled, channelType])
  const [pages, setPages] = useState<{ key: string; cursors: (string | null)[] }>({ key, cursors: [null] })
  const cursors = pages.key === key ? pages.cursors : [null]
  const cursor = cursors[cursors.length - 1]

  const list = useQuery({
    queryKey: ['alert-channels', 'list', enabled, channelType, cursor],
    queryFn: ({ signal }) => listAlertChannels({ enabled: enabled ?? undefined, type: channelType ?? undefined, cursor, limit: LIMIT }, signal),
    placeholderData: keepPreviousData,
  })
  const rows = list.data?.items ?? []

  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setAlertChannelEnabled(id, on),
    // 규칙 모달의 채널 고르기도 꺼짐 표시를 따라가게 채널 쿼리 전부 다시 받는다
    onSettled: () => qc.invalidateQueries({ queryKey: ['alert-channels'] }),
  })
  const pendingId = toggle.isPending ? toggle.variables.id : null
  const toggleError = !toggle.isError
    ? null
    : toggle.error instanceof ApiError && toggle.error.code === 'FORBIDDEN'
      ? '관리자(ADMIN)만 채널을 켜고 끌 수 있습니다.'
      : `채널을 ${toggle.variables?.on ? '켜지' : '끄지'} 못했습니다.${toggle.error instanceof ApiError ? ` (${toggle.error.code})` : ''}`

  // 테스트 결과는 몇 초 뒤 사라지는 토스트로
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const showToast = (t: ToastState) => {
    clearTimeout(timer.current)
    setToast(t)
    timer.current = setTimeout(() => setToast(null), 6000)
  }
  const test = useMutation({
    mutationFn: (c: AlertChannelSummary) => testAlertChannel(c.alert_channel_uuid),
    onSuccess: (r: ChannelTest, c) =>
      showToast(
        r.result === 'SUCCESS'
          ? {
              tone: 'ok',
              title: `시험 메시지 전송 완료 — ${c.name} · SUCCESS`,
              lines: [`response: ${r.response} · ${formatTime(r.tested_at).slice(0, 8)}`, 'Notifier POST /internal/channels/test (#50)가 대행해 실제로 보냈습니다.'],
            }
          : {
              tone: 'crit',
              title: `시험 메시지 전송 실패 — ${c.name} · FAILED`,
              lines: [`response: ${r.response} · ${formatTime(r.tested_at).slice(0, 8)}`, '주소 · 키를 확인해 고친 뒤 다시 보내 보세요.'],
            },
      ),
    onError: (e, c) =>
      showToast({
        tone: 'crit',
        title: `시험 메시지를 보내지 못했습니다 — ${c.name}`,
        lines: [e instanceof ApiError ? (e.code === 'FORBIDDEN' ? '관리자(ADMIN)만 보낼 수 있습니다.' : `${e.message} (${e.code})`) : '요청이 실패했습니다.'],
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['alert-channels'] }),
  })
  const testingId = test.isPending ? test.variables.alert_channel_uuid : null

  const filtered = enabled !== null || channelType !== null

  return (
    <div className="al-events">
      <Card>
        <div className="al-filters" role="group" aria-label="채널 필터">
          <div className="al-field">
            <span className="text-caption-12-medium">type</span>
            {/* 명세(42번)의 type 은 하나만 받는다 — 칩을 다시 누르면 풀린다 */}
            <div className="al-chips">
              {CHANNEL_TYPES.map((t) => (
                <Chip key={t} selected={channelType === t} onChange={(on) => setChannelType(on ? t : null)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>
          <div className="al-field">
            <span className="text-caption-12-medium">enabled</span>
            <Segmented<EnabledFilter>
              aria-label="enabled"
              value={enabled === null ? 'ALL' : enabled ? 'on' : 'off'}
              onChange={(v) => setEnabled(v === 'ALL' ? null : v === 'on')}
              options={[
                { value: 'ALL', label: '전체' },
                { value: 'on', label: '켜짐' },
                { value: 'off', label: '꺼짐' },
              ]}
            />
          </div>
          <p className="al-note text-caption-12">
            <span className="text-mono-12">GET /alert-channels</span>
            {list.data ? ` · ${rows.length}${list.data.nextCursor ? '+' : ''}개` : ''}
          </p>
          <Button onClick={resetChannelFilters} disabled={!filtered}>
            필터 초기화
          </Button>
        </div>
      </Card>

      {isAdmin ? null : (
        <Banner tone="info">
          <span className="al-lock">
            <IconLock size={12} /> VIEWER 는 읽기만 합니다 · 채널 등록 · 수정 · 테스트 발송은 ADMIN
          </span>
        </Banner>
      )}
      {toggleError ? <Banner tone="crit">{toggleError}</Banner> : null}

      {list.isError && !list.data ? (
        <Card>
          <p className="al-empty text-body-13" role="alert">채널 목록을 불러오지 못했습니다.</p>
        </Card>
      ) : !list.data ? (
        <Card>
          <p className="al-empty text-body-13" role="status">불러오는 중…</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="al-empty text-body-13" role="status">
            {filtered ? '조건에 맞는 채널이 없습니다.' : '등록된 채널이 없습니다.'}
            {isAdmin && !filtered ? ' 「채널 등록」으로 추가하세요.' : ''}
          </p>
        </Card>
      ) : (
        <ul className={list.isFetching ? 'al-channel-grid is-loading' : 'al-channel-grid'} aria-label="알림 채널">
          {rows.map((c) => {
            const on = pendingId === c.alert_channel_uuid ? toggle.variables!.on : c.enabled
            const testing = testingId === c.alert_channel_uuid
            return (
              <li key={c.alert_channel_uuid}>
                <Card className={c.enabled ? 'al-channel-card' : 'al-channel-card is-off'}>
                  <header className="al-channel-card__head">
                    <div className="al-channel-card__name">
                      <Badge tone={channelTypeTone(c.type)} className="text-mono-11">
                        {c.type}
                      </Badge>
                      <h3 className="text-section-15">{c.name}</h3>
                    </div>
                    <span className="text-caption-12 al-muted">{on ? '켜짐' : '꺼짐'}</span>
                    <Switch checked={on} disabled={!isAdmin || toggle.isPending} aria-label={`${c.name} 켜짐`} onChange={(v) => toggle.mutate({ id: c.alert_channel_uuid, on: v })} />
                  </header>

                  <p className="al-last-test text-caption-12 al-muted">등록 {new Date(c.created_at).toLocaleDateString('sv-SE')} · 설정은 수정에서</p>

                  {isAdmin ? (
                    <div className="al-channel-card__actions">
                      <Button icon={<IconSend size={16} />} disabled={test.isPending} onClick={() => test.mutate(c)}>
                        {testing ? '보내는 중…' : '테스트 발송'}
                      </Button>
                      <Button onClick={() => openChannel(c.alert_channel_uuid)}>수정</Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {cursors.length > 1 || list.data?.nextCursor ? (
        <CursorPager
          hasPrev={cursors.length > 1}
          hasNext={!!list.data?.nextCursor}
          onPrev={() => setPages({ key, cursors: cursors.slice(0, -1) })}
          onNext={() => list.data?.nextCursor && setPages({ key, cursors: [...cursors, list.data.nextCursor] })}
        />
      ) : null}

      <ChannelModal channelId={isAdmin ? channelId : null} onClose={() => openChannel(null)} onTest={(c) => test.mutate(c)} testingId={testingId} />

      {toast ? (
        <ToastViewport>
          <Toast tone={toast.tone} onClose={() => setToast(null)}>
            <div className="text-body-13-strong">{toast.title}</div>
            {toast.lines.map((l, i) => (
              <div key={i} className={i === 0 ? 'text-mono-11' : 'text-caption-12 al-muted'}>
                {l}
              </div>
            ))}
          </Toast>
        </ToastViewport>
      ) : null}
    </div>
  )
}
