import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, createApplication, deleteApplication, updateApplication, type Application } from '@/api'
import { Banner, Button, Field, Input, Modal, Textarea } from '@/design-system'
import { useFilters } from '@/stores'

const NAME = /^[a-z][a-z0-9-]{1,98}[a-z0-9]$/
const DEFAULT_SYSTEM = 'shop'

/** 서비스 목록을 쓰는 곳(상단바 서비스 고르기 · 설정 표 · 트레이스 상세)을 모두 다시 받는다 */
const invalidateApps = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([qc.invalidateQueries({ queryKey: ['applications'] }), qc.invalidateQueries({ queryKey: ['application'] })])

/** 서비스 등록(13번) · 수정(8번) 모달. app 이 있으면 수정 — name 은 잠근다 */
export function AppFormModal({ app, onClose, onSaved }: { app: Application | null; onClose: () => void; onSaved: (a: Application) => void }) {
  const qc = useQueryClient()
  const id = useId()
  const [name, setName] = useState(app?.name ?? '')
  const [displayName, setDisplayName] = useState(app?.display_name ?? '')
  const [description, setDescription] = useState(app?.description ?? '')
  const [system, setSystem] = useState(app?.system ?? DEFAULT_SYSTEM)
  const [showErrors, setShowErrors] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      app
        ? updateApplication(app.application_uuid, { display_name: displayName.trim(), description: description.trim(), system: system.trim() })
        : createApplication({ name: name.trim(), display_name: displayName.trim(), description: description.trim(), system: system.trim() }),
    onSuccess: async (a) => {
      await invalidateApps(qc)
      onSaved(a)
    },
  })

  const taken = save.error instanceof ApiError && save.error.code === 'APPLICATION_NAME_TAKEN'
  const nameError = app
    ? null
    : taken
      ? `${(save.error as ApiError).message} (409 APPLICATION_NAME_TAKEN)`
      : showErrors && !NAME.test(name.trim())
        ? '영문 소문자로 시작하고 소문자 · 숫자 · - 만 써서 3~100자로 적으세요.'
        : null
  const systemOk = system.trim().length >= 1 && system.trim().length <= 50
  const systemError = showErrors && !systemOk ? '1~50자로 적으세요. 비워 둘 수 없습니다.' : null
  const otherError = save.isError && !taken ? (save.error instanceof ApiError ? (save.error.code === 'FORBIDDEN' ? '관리자(ADMIN)만 바꿀 수 있습니다.' : `${save.error.message} (${save.error.code})`) : '저장하지 못했습니다.') : null

  const submit = () => {
    setShowErrors(true)
    if ((app || NAME.test(name.trim())) && systemOk) save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="st-modal-title">
          {app ? `서비스 수정 — ${app.name}` : '서비스 등록'}
          <span className="text-caption-12 st-muted">
            {app
              ? 'PATCH /applications/{uuid} · name 은 바꿀 수 없습니다'
              : 'name 은 Collector 가 받는 otel.service.name 과 같은 글자여야 합니다 · 등록 시 샘플링 설정 1줄(1 %, v1) 이 함께 생깁니다'}
          </span>
        </span>
      }
      footer={
        <div className="st-modal-footer">
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" type="submit" form={`${id}-form`} disabled={save.isPending}>
            {save.isPending ? '저장 중…' : app ? '저장' : '등록'}
          </Button>
        </div>
      }
    >
      <form
        id={`${id}-form`}
        className="st-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {otherError ? <Banner tone="crit">{otherError}</Banner> : null}
        <fieldset disabled={save.isPending}>
          <Field label="name" htmlFor={`${id}-name`} error={nameError} help={app ? '모든 신호(트레이스 · 로그 · 지표)가 이 이름으로 묶여 바꿀 수 없습니다' : undefined}>
            <Input
              id={`${id}-name`}
              className="text-mono-12"
              value={name}
              readOnly={!!app}
              maxLength={100}
              placeholder="shop-order"
              aria-invalid={!!nameError}
              onChange={(e) => {
                setName(e.target.value)
                if (taken) save.reset()
              }}
            />
          </Field>
          <Field label="display_name" htmlFor={`${id}-display`}>
            <Input id={`${id}-display`} value={displayName} maxLength={200} placeholder="주문" onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="system" htmlFor={`${id}-system`} error={systemError} help="같은 System 은 샘플링 비율의 최댓값 하나를 같이 씁니다. 쇼핑몰은 shop, 모니모 Self-monitoring 은 monimo">
            <Input id={`${id}-system`} className="text-mono-12" value={system} maxLength={50} placeholder={DEFAULT_SYSTEM} aria-invalid={!!systemError} onChange={(e) => setSystem(e.target.value)} />
          </Field>
          <Field label="description" htmlFor={`${id}-desc`}>
            <Textarea id={`${id}-desc`} rows={4} value={description} placeholder="이 서비스가 하는 일" onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </fieldset>
      </form>
    </Modal>
  )
}

/** 감시 대상에서 제외 확인 모달. 논리 삭제(deleted_at)라 규칙 · 파드 · 이력은 남고 목록 · 조회에서만 빠진다. 같은 name 재등록은 409 */
export function AppDeleteModal({ app, onClose, onDeleted }: { app: Application; onClose: () => void; onDeleted: () => void }) {
  const qc = useQueryClient()
  const { serviceName, setServiceName } = useFilters()
  const del = useMutation({
    mutationFn: () => deleteApplication(app.application_uuid),
    onSuccess: async () => {
      // 상단바가 지운 서비스를 고르고 있었으면 「전체」로 되돌린다
      if (serviceName === app.name) setServiceName(null)
      await invalidateApps(qc)
      onDeleted()
    },
  })
  const e = del.error instanceof ApiError ? del.error : null

  return (
    <Modal
      open
      onClose={onClose}
      title={`감시 대상에서 제외 — ${app.name}`}
      footer={
        <div className="st-modal-footer">
          <Button onClick={onClose}>취소</Button>
          <Button variant="danger" disabled={del.isPending} onClick={() => del.mutate()}>
            {del.isPending ? '제외 중…' : '제외'}
          </Button>
        </div>
      }
    >
      <div className="st-form">
        <p className="text-body-13">
          <span className="text-mono-12-strong">{app.name}</span> 을(를) 감시 대상에서 뺍니다. 서비스 목록 · 상단바에서 사라지고, 이미 쌓인 신호는 보관 기간까지 남습니다.
        </p>
        <p className="text-caption-12 st-muted">
          deleted_at 만 찍는 논리 삭제라 딸린 경보 규칙 · 파드 기록 · 설정은 그대로 둡니다. 같은 이름으로 다시 등록하면 409 APPLICATION_NAME_TAKEN 입니다.
        </p>
        {del.isError ? (
          <Banner tone="crit">
            {e?.code === 'FORBIDDEN' ? '관리자(ADMIN)만 제외할 수 있습니다.' : e ? `${e.message} (${e.code})` : '제외하지 못했습니다.'}
          </Banner>
        ) : null}
      </div>
    </Modal>
  )
}
