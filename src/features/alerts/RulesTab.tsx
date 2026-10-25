import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, listAlertRules, setAlertRuleEnabled, type Severity } from '@/api'
import { useAuth } from '@/auth'
import {
  Badge,
  Banner,
  Button,
  Card,
  CursorPager,
  formatTime,
  IconLock,
  Segmented,
  severityTone,
  Switch,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/design-system'
import { useServiceName } from '@/stores'
import { RuleModal } from './RuleModal'
import { conditionText, SEVERITIES } from './ruleForm'
import { useAlertParams } from './useAlertParams'

const LIMIT = 50
type EnabledFilter = 'ALL' | 'on' | 'off'

/** 「규칙」 탭 — 필터 · 규칙 표(켜기/끄기 스위치) · 만들기/수정 모달 */
export function RulesTab() {
  const serviceName = useServiceName()
  const { isAdmin } = useAuth()
  const { severity, enabled, ruleId, setSeverity, setEnabled, resetRuleFilters, openRule } = useAlertParams()
  const qc = useQueryClient()

  const key = JSON.stringify([serviceName, enabled, severity])
  const [pages, setPages] = useState<{ key: string; cursors: (string | null)[] }>({ key, cursors: [null] })
  const cursors = pages.key === key ? pages.cursors : [null]
  const cursor = cursors[cursors.length - 1]

  const list = useQuery({
    queryKey: ['alert-rules', 'list', serviceName, enabled, severity, cursor],
    queryFn: ({ signal }) => listAlertRules({ serviceName, enabled: enabled ?? undefined, severity: severity ?? undefined, cursor, limit: LIMIT }, signal),
    placeholderData: keepPreviousData,
  })
  const rows = list.data?.items ?? []

  // 스위치는 저장 버튼 없이 바로 PATCH. 응답이 오기 전에는 누른 값으로 보여 준다
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setAlertRuleEnabled(id, on),
    onSettled: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })
  const pendingId = toggle.isPending ? toggle.variables.id : null
  const toggleError =
    toggle.isError && toggle.error instanceof ApiError
      ? toggle.error.code === 'FORBIDDEN'
        ? '관리자(ADMIN)만 규칙을 켜고 끌 수 있습니다.'
        : `규칙을 ${toggle.variables?.on ? '켜지' : '끄지'} 못했습니다. (${toggle.error.code})`
      : toggle.isError
        ? '규칙을 켜고 끄지 못했습니다.'
        : null

  const filtered = enabled !== null || severity !== null

  return (
    <div className="al-events">
      <Card>
        <div className="al-filters" role="group" aria-label="규칙 필터">
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
          <div className="al-field">
            <span className="text-caption-12-medium">severity</span>
            <Segmented<Severity | 'ALL'>
              aria-label="severity"
              value={severity ?? 'ALL'}
              onChange={(v) => setSeverity(v === 'ALL' ? null : v)}
              options={[{ value: 'ALL', label: '전체' }, ...SEVERITIES.map((s) => ({ value: s, label: s }))]}
            />
          </div>
          <p className="al-note text-caption-12">서비스는 상단바에서 고릅니다.</p>
          <Button onClick={resetRuleFilters} disabled={!filtered}>
            필터 초기화
          </Button>
        </div>
      </Card>

      {toggleError ? <Banner tone="crit">{toggleError}</Banner> : null}

      <TableCard
        title={
          <span className="al-title">
            경보 규칙
            {isAdmin ? null : (
              <Badge tone="muted" className="al-lock">
                <IconLock size={12} /> VIEWER 는 읽기만 · 변경은 ADMIN
              </Badge>
            )}
            <span className="text-mono-12 al-muted">GET /alert-rules</span>
          </span>
        }
        className={list.isFetching ? 'al-table is-loading' : 'al-table'}
        summary="꺼진 규칙은 Detector 가 건너뛴다. 스위치는 PATCH /alert-rules/{uuid}/enabled 를 바로 호출한다."
        pager={
          <CursorPager
            hasPrev={cursors.length > 1}
            hasNext={!!list.data?.nextCursor}
            onPrev={() => setPages({ key, cursors: cursors.slice(0, -1) })}
            onNext={() => list.data?.nextCursor && setPages({ key, cursors: [...cursors, list.data.nextCursor] })}
          />
        }
      >
        {list.isError && !list.data ? (
          <p className="al-empty text-body-13" role="alert">규칙 목록을 불러오지 못했습니다.</p>
        ) : !list.data ? (
          <p className="al-empty text-body-13" role="status">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="al-empty text-body-13" role="status">
            {filtered || serviceName ? '조건에 맞는 규칙이 없습니다.' : '아직 규칙이 없습니다.'}
            {isAdmin ? ' 「규칙 만들기」로 추가하세요.' : ''}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>enabled</TableHeaderCell>
                <TableHeaderCell>service_name</TableHeaderCell>
                <TableHeaderCell>metric_kind</TableHeaderCell>
                <TableHeaderCell>조건</TableHeaderCell>
                <TableHeaderCell>name</TableHeaderCell>
                <TableHeaderCell>severity</TableHeaderCell>
                <TableHeaderCell align="right">채널</TableHeaderCell>
                <TableHeaderCell align="right">updated_at</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const on = pendingId === r.alert_rule_uuid ? toggle.variables!.on : r.enabled
                return (
                  <TableRow
                    key={r.alert_rule_uuid}
                    onClick={() => openRule(r.alert_rule_uuid)}
                    selected={ruleId === r.alert_rule_uuid}
                    aria-label={`${r.name} ${isAdmin ? '수정' : '보기'}`}
                    className={r.enabled ? undefined : 'al-off'}
                  >
                    {/* 스위치 클릭 · Enter · Space 가 행(모달 열기)으로 번지지 않게 막는다 */}
                    <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Switch
                        checked={on}
                        disabled={!isAdmin || toggle.isPending}
                        aria-label={`${r.name} 켜짐`}
                        onChange={(v) => toggle.mutate({ id: r.alert_rule_uuid, on: v })}
                      />
                    </TableCell>
                    <TableCell>{r.service_name}</TableCell>
                    <TableCell type="badge">
                      <Badge tone="accent" className="text-mono-11">{r.metric_kind}</Badge>
                    </TableCell>
                    <TableCell type="mono">{conditionText(r)}</TableCell>
                    <TableCell className="al-rule">{r.name}</TableCell>
                    <TableCell type="badge">
                      <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>
                    </TableCell>
                    {/* 목록 응답에는 channels 가 없다. 상세(모달)에서 본다 */}
                    <TableCell type="number" title={r.channels ? r.channels.map((c) => c.name).join(', ') || '연결된 채널 없음' : '상세에서 확인'}>
                      {r.channels ? (r.channels.length ? `${r.channels.length}개` : <span className="al-muted">없음</span>) : <span className="al-muted">—</span>}
                    </TableCell>
                    <TableCell type="mono" className="al-right al-muted">
                      {new Date(r.updated_at).toLocaleDateString('sv-SE')} {formatTime(r.updated_at).slice(0, 8)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <RuleModal ruleId={ruleId} onClose={() => openRule(null)} />
    </div>
  )
}
