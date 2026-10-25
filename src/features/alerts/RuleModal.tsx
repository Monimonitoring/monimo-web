import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  createAlertRule,
  getAlertRule,
  listAlertChannels,
  listApplications,
  setAlertRuleChannels,
  setAlertRuleEnabled,
  updateAlertRule,
  type AlertRule,
  type Application,
  type MetricKind,
} from '@/api'
import { useAuth } from '@/auth'
import { Badge, Banner, Button, channelTypeTone, Checkbox, Field, Input, Modal, Segmented, Select, shortId, Switch } from '@/design-system'
import { useServiceName } from '@/stores'
import { UNIT } from './metric'
import { errorText, SaveError } from './saveError'
import {
  bodyOf,
  changesOf,
  emptyForm,
  formOf,
  METRIC_HELP,
  METRIC_KINDS,
  OPERATORS,
  previewText,
  SEVERITIES,
  validate,
  windowLabel,
  WINDOWS,
  type RuleForm,
} from './ruleForm'

type Props = {
  /** 'new' 면 만들기, uuid 면 수정(VIEWER 는 보기), null 이면 닫힘 */
  ruleId: string | null
  onClose: () => void
}

/** 규칙 만들기 · 수정 모달. 주소 rule= 로 열린다 */
export function RuleModal({ ruleId, onClose }: Props) {
  return ruleId ? <Loader key={ruleId} ruleId={ruleId} onClose={onClose} /> : null
}

/** 수정이면 규칙을, 둘 다 서비스 목록을 먼저 받아 온 뒤 폼을 연다 (폼 첫 값을 받아 온 값으로 채우려고) */
function Loader({ ruleId, onClose }: { ruleId: string; onClose: () => void }) {
  const isNew = ruleId === 'new'
  const rule = useQuery({ queryKey: ['alert-rule', ruleId], queryFn: ({ signal }) => getAlertRule(ruleId, signal), enabled: !isNew })
  const apps = useQuery({ queryKey: ['applications'], queryFn: listApplications, staleTime: 5 * 60_000 })

  if (apps.data && (isNew || rule.data)) return <Editor rule={isNew ? null : rule.data!} apps={apps.data} onClose={onClose} />

  const failed = apps.isError || rule.isError
  const code = rule.error instanceof ApiError ? rule.error.code : ''
  return (
    <Modal open onClose={onClose} title={isNew ? '규칙 만들기' : '규칙'}>
      {failed ? (
        <p className="al-empty text-body-13" role="alert">
          {code === 'NOT_FOUND' ? '이 규칙을 찾을 수 없습니다.' : `규칙을 불러오지 못했습니다. ${code ? `(${code})` : ''}`}
        </p>
      ) : (
        <p className="al-empty text-body-13" role="status">불러오는 중…</p>
      )}
    </Modal>
  )
}

function Editor({ rule, apps, onClose }: { rule: AlertRule | null; apps: Application[]; onClose: () => void }) {
  const { isAdmin } = useAuth()
  const readOnly = !isAdmin
  const serviceName = useServiceName()
  const qc = useQueryClient()
  const id = useId()
  const [form, setForm] = useState<RuleForm>(() =>
    rule ? formOf(rule) : emptyForm(apps.find((a) => a.name === serviceName)?.application_uuid ?? ''),
  )
  const [showErrors, setShowErrors] = useState(false)
  const set = (patch: Partial<RuleForm>) => setForm((f) => ({ ...f, ...patch }))

  const channels = useQuery({
    queryKey: ['alert-channels', 'all'],
    queryFn: ({ signal }) => listAlertChannels({ limit: 500 }, signal),
    staleTime: 60_000,
  })

  const errors = validate(form)
  const changes = rule ? changesOf(rule, form) : null
  const dirty = !changes || changes.rule || changes.channels || changes.enabled

  const save = useMutation({
    mutationFn: async (f: RuleForm) => {
      if (!rule) return createAlertRule({ ...bodyOf(f), application_uuid: f.application_uuid, enabled: f.enabled, channel_uuids: f.channel_uuids })
      const c = changesOf(rule, f)
      const done: string[] = []
      try {
        if (c.rule) {
          await updateAlertRule(rule.alert_rule_uuid, bodyOf(f))
          done.push('규칙 값')
        }
        if (c.channels) {
          await setAlertRuleChannels(rule.alert_rule_uuid, f.channel_uuids)
          done.push('채널 연결')
        }
        if (c.enabled) await setAlertRuleEnabled(rule.alert_rule_uuid, f.enabled)
      } catch (err) {
        throw new SaveError(err, done)
      }
    },
    // 일부만 저장됐어도 표가 서버 값을 따라가게 성공 · 실패 모두 다시 받는다. 경보 상세도 규칙 이름 · 조건을 보여 준다
    onSettled: () => Promise.all(['alert-rules', 'alert-rule', 'alert-events', 'alert-event'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
    onSuccess: onClose,
  })

  const submit = () => {
    setShowErrors(true)
    if (Object.keys(errors).length === 0 && dirty) save.mutate(form)
  }

  const err = showErrors ? errors : {}
  const unit = UNIT[form.metric_kind]
  const preview = previewText(form)
  const allChannels = channels.data?.items ?? []
  const picked = allChannels.filter((c) => form.channel_uuids.includes(c.alert_channel_uuid))
  // 목록에 없는 기존 창(예: 120초)도 고를 수 있게 넣는다
  const windows = WINDOWS.includes(form.window_sec) ? WINDOWS : [...WINDOWS, form.window_sec].sort((a, b) => a - b)

  const title = !rule ? '규칙 만들기' : `${readOnly ? '규칙 보기' : '규칙 수정'} — ${rule.name}`

  return (
    <Modal
      open
      onClose={onClose}
      className="al-rule-modal"
      title={
        <span className="al-rule-modal__title">
          {title}
          {rule ? (
            <span className="text-mono-11 al-muted" title={rule.alert_rule_uuid}>
              alert_rule_uuid {shortId(rule.alert_rule_uuid)} · {readOnly ? 'GET' : 'PUT'} /alert-rules/{'{uuid}'}
            </span>
          ) : (
            <span className="text-mono-11 al-muted">POST /alert-rules</span>
          )}
        </span>
      }
      footer={
        <div className="al-rule-modal__footer">
          <span className="text-caption-12 al-muted">
            {readOnly ? 'VIEWER 는 읽기만 합니다 · 변경은 ADMIN' : '재배포 없이 즉시 적용 · Detector 가 10~30초 주기로 다시 읽음'}
          </span>
          {readOnly ? (
            <Button onClick={onClose}>닫기</Button>
          ) : (
            <>
              <Button onClick={onClose}>취소</Button>
              <Button variant="primary" type="submit" form={`${id}-form`} disabled={save.isPending || !dirty}>
                {save.isPending ? '저장 중…' : rule ? '저장' : '만들기'}
              </Button>
            </>
          )}
        </div>
      }
    >
      <form
        id={`${id}-form`}
        className="al-rule-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {save.isError ? (
          <Banner tone="crit" className="al-rule-form__error">
            {errorText(save.error)}
          </Banner>
        ) : null}

        {/* 읽기 전용이면 fieldset 이 안의 입력 · 버튼을 한꺼번에 잠근다 */}
        <fieldset className="al-rule-form__fields" disabled={readOnly || save.isPending}>
          <Field
            label="application"
            htmlFor={`${id}-app`}
            help={rule ? '서비스는 만든 뒤 바꿀 수 없습니다 (수정 문에 없음).' : undefined}
            error={err.application_uuid}
          >
            <Select
              id={`${id}-app`}
              value={form.application_uuid}
              disabled={!!rule}
              aria-invalid={!!err.application_uuid}
              onChange={(e) => set({ application_uuid: e.target.value })}
            >
              {form.application_uuid ? null : <option value="">서비스 고르기</option>}
              {apps.map((a) => (
                <option key={a.application_uuid} value={a.application_uuid}>
                  {a.display_name || a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="name" htmlFor={`${id}-name`} error={err.name}>
            <Input
              id={`${id}-name`}
              value={form.name}
              maxLength={200}
              placeholder="예: shop-payment 5xx 비율 초과"
              aria-invalid={!!err.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>

          <Field label="metric_kind" htmlFor={`${id}-kind`} help={METRIC_HELP[form.metric_kind]}>
            <Select id={`${id}-kind`} value={form.metric_kind} onChange={(e) => set({ metric_kind: e.target.value as MetricKind })}>
              {METRIC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>

          <div className="al-rule-form__row">
            <div className="al-field">
              <span className="text-caption-12-medium">operator</span>
              <Segmented
                aria-label="operator"
                value={form.operator}
                onChange={(v) => set({ operator: v })}
                options={OPERATORS.map((o) => ({ value: o, label: o }))}
              />
              <span className="text-caption-12 al-muted">GT 초과 · GTE 이상 · LT 미만 · LTE 이하</span>
            </div>
            <Field label="threshold" htmlFor={`${id}-threshold`} error={err.threshold}>
              <span className="al-unit-input">
                <Input
                  id={`${id}-threshold`}
                  inputMode="decimal"
                  value={form.threshold}
                  aria-invalid={!!err.threshold}
                  aria-describedby={`${id}-unit`}
                  onChange={(e) => set({ threshold: e.target.value })}
                />
                <span id={`${id}-unit`} className="al-unit-input__unit text-mono-12">
                  {unit}
                </span>
              </span>
            </Field>
          </div>

          <Field label="window_sec" htmlFor={`${id}-window`} help="이 구간 동안의 값을 모아 비교합니다.">
            <Select id={`${id}-window`} value={form.window_sec} onChange={(e) => set({ window_sec: Number(e.target.value) })}>
              {windows.map((w) => (
                <option key={w} value={w}>
                  {w} ({windowLabel(w)})
                </option>
              ))}
            </Select>
          </Field>

          <div className="al-field">
            <span className="text-caption-12-medium">severity</span>
            <Segmented aria-label="severity" value={form.severity} onChange={(v) => set({ severity: v })} options={SEVERITIES.map((s) => ({ value: s, label: s }))} />
          </div>

          <div className="al-rule-form__switch">
            <span id={`${id}-enabled`} className="text-caption-12-medium">
              enabled
            </span>
            <span className="text-caption-12 al-muted">{form.enabled ? '켜짐' : '꺼짐 — Detector 가 건너뜁니다'}</span>
            <Switch aria-labelledby={`${id}-enabled`} checked={form.enabled} onChange={(v) => set({ enabled: v })} />
          </div>
        </fieldset>

        <div className="al-rule-form__side">
          <section className="al-preview" aria-label="알림 문구 미리보기">
            <span className="text-caption-12-medium al-muted">미리보기 · 알림 문구</span>
            <p className="al-preview__text text-mono-12">
              <span className="al-crit">{preview.tag}</span> {preview.text}
            </p>
            <span className="text-caption-12 al-muted">
              {!channels.data
                ? ''
                : picked.length === 0
                  ? '채널을 고르지 않으면 경보는 기록만 되고 알림은 나가지 않습니다.'
                  : `채널 ${allChannels.length}곳 중 ${picked.length}곳으로 나갑니다.`}
            </span>
          </section>

          <fieldset className="al-channels" disabled={readOnly || save.isPending}>
            <legend className="al-channels__legend">
              <span className="text-caption-12-medium">채널 (다중선택)</span>
              <span className="text-mono-11 al-muted">GET /alert-channels</span>
            </legend>
            {channels.isError ? (
              <p className="al-empty text-caption-12" role="alert">채널 목록을 불러오지 못했습니다.</p>
            ) : !channels.data ? (
              <p className="al-empty text-caption-12" role="status">불러오는 중…</p>
            ) : allChannels.length === 0 ? (
              <p className="al-empty text-caption-12">등록된 채널이 없습니다. 「채널」 탭에서 먼저 등록하세요.</p>
            ) : (
              allChannels.map((c) => (
                <div key={c.alert_channel_uuid} className="al-channel">
                  <Checkbox
                    checked={form.channel_uuids.includes(c.alert_channel_uuid)}
                    onChange={(e) =>
                      set({
                        channel_uuids: e.target.checked
                          ? [...form.channel_uuids, c.alert_channel_uuid]
                          : form.channel_uuids.filter((x) => x !== c.alert_channel_uuid),
                      })
                    }
                  >
                    {c.name}
                  </Checkbox>
                  {c.enabled ? null : <Badge tone="muted">꺼짐</Badge>}
                  <Badge tone={channelTypeTone(c.type)} className="text-mono-11">
                    {c.type}
                  </Badge>
                </div>
              ))
            )}
            {rule && !readOnly ? <span className="text-caption-12 al-muted">저장 시 전체 교체 — PUT /alert-rules/{'{uuid}'}/channels</span> : null}
          </fieldset>
        </div>
      </form>
    </Modal>
  )
}
