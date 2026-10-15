import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, PAGE_SUBTITLE, PAGE_TITLE, TH } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { formatDay } from '../lib/dates'

const URL = '/questions/evaluations/'
const PAGE_SIZE = 4
const SCORE_LABELS = { 1: 'Malo', 2: 'Regular', 3: 'Bueno', 4: 'Muy bueno', 5: 'Excelente' }
const STATUS = {
  open: { label: 'Abierta', tone: 'success' },
  expired: { label: 'Vencida', tone: 'warning' },
  closed: { label: 'Cerrada', tone: 'neutral' },
}

function EvaluationDetails({ evaluation }) {
  const [details, setDetails] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let current = true
    Promise.all([
      api(`/questions/form/?evaluation=${evaluation.id}&include_inactive=1`),
      api(`/questions/submissions/?evaluation=${evaluation.id}`),
    ])
      .then(([categories, submissions]) => {
        if (current) setDetails({ categories, submissions })
      })
      .catch((e) => {
        if (current) setError(errorMessage(e))
      })
    return () => { current = false }
  }, [evaluation.id])

  if (error) return <div role="alert" className={ALERT_ERROR}>{error}</div>
  if (!details) return <p className="p-4 text-sm text-app-muted">Cargando categorías, preguntas y respuestas...</p>

  const criterionNames = Object.fromEntries(details.categories.flatMap((category) => category.criteria.map((criterion) => [criterion.code, criterion.name])))

  return (
    <div className="grid gap-5 p-4">
      <section>
        <h3 className="font-semibold text-app">Categorías y preguntas</h3>
        {details.categories.length === 0 ? <p className="mt-2 text-sm text-app-muted">Esta evaluación aún no tiene categorías.</p> : (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {details.categories.map((category) => (
              <div key={category.code} className="rounded-lg border border-app bg-surface p-3">
                <h4 className="font-medium text-app">{category.name}</h4>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-app-muted">
                  {category.criteria.map((criterion) => <li key={criterion.code}>{criterion.name}</li>)}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-semibold text-app">Respuestas recibidas ({details.submissions.length})</h3>
        {details.submissions.length === 0 ? <p className="mt-2 text-sm text-app-muted">Aún no hay respuestas para esta evaluación.</p> : (
          <div className="mt-2 grid gap-2">
            {details.submissions.map((submission) => {
              const byCategory = submission.answers.reduce((groups, answer) => {
                const group = groups.get(answer.category) ?? []
                group.push(answer)
                groups.set(answer.category, group)
                return groups
              }, new Map())
              return (
                <details key={`${submission.collaborator}-${submission.personal}-${submission.created_at}`} className="rounded-lg border border-app bg-surface">
                  <summary className="cursor-pointer px-3 py-2.5 text-sm text-app">
                    <strong>{submission.collaborator_name}</strong> evaluó a <strong>{submission.personal_name}</strong>
                    <span className="ml-2 text-app-muted">· {new Date(submission.created_at).toLocaleDateString('es-CO')} · Promedio {submission.average ?? '—'}</span>
                  </summary>
                  <div className="grid gap-3 border-t border-app px-3 py-3">
                    {[...byCategory.entries()].map(([categoryCode, answers]) => {
                      const categoryName = details.categories.find((category) => category.code === categoryCode)?.name ?? categoryCode
                      return (
                        <div key={categoryCode}>
                          <h4 className="text-sm font-medium text-app">{categoryName}</h4>
                          <ul className="mt-1 grid gap-1 text-sm text-app-muted">
                            {answers.map((answer) => (
                              <li key={answer.criterion} className="flex flex-wrap justify-between gap-2">
                                <span>{criterionNames[answer.criterion] ?? answer.criterion}</span>
                                <span className="font-medium text-app">{SCORE_LABELS[answer.score]} ({answer.score})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Row({ evaluation, onSave, busy, expanded, onToggle }) {
  const status = STATUS[evaluation.status]

  return (
    <>
      <tr>
        <td className="px-3 py-3 font-semibold text-app">{evaluation.name}</td>
        <td className="px-3 py-3 text-center">{evaluation.categories}</td>
        <td className="px-3 py-3 text-center">{evaluation.criteria}</td>
        <td className="px-3 py-3 text-center">{evaluation.answers}</td>
        <td className="px-3 py-3">
          {evaluation.closes_on ? formatDay(evaluation.closes_on) : 'Sin fecha'}
          <br />
          <small className="text-xs text-app-muted">Se cierra al terminar ese día (12:00 de la noche)</small>
        </td>
        <td className="px-3 py-3"><Badge tone={status.tone}>{status.label}</Badge></td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onToggle}>{expanded ? 'Ocultar' : 'Ver detalle'}</Button>
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => onSave(evaluation, { is_open: !evaluation.is_open })}>
              {evaluation.is_open ? 'Cerrar' : 'Abrir'}
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-app-muted/40">
            <EvaluationDetails key={evaluation.id} evaluation={evaluation} />
          </td>
        </tr>
      )}
    </>
  )
}

export function EvaluationsListPage() {
  const [evaluations, setEvaluations] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api(URL)
      .then(setEvaluations)
      .catch((e) => setError(errorMessage(e)))
  }, [])

  async function save(evaluation, body) {
    setError(null)
    setBusy(true)
    try {
      await api(`${URL}${evaluation.id}/`, { method: 'PATCH', body })
      setEvaluations(await api(URL))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil((evaluations?.length ?? 0) / PAGE_SIZE))
  const pageEvaluations = (evaluations ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function changePage(nextPage) {
    setPage(nextPage)
    setExpanded(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={PAGE_TITLE}>Lista de evaluaciones</h1>
        <p className={PAGE_SUBTITLE}>
          Consulta las categorías, preguntas y respuestas de cada evaluación. La fecha de cierre se pone sola al crearla (último día del mes); los colaboradores pueden responder hasta el final de ese día.
        </p>
      </div>

      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {!evaluations && !error && <p className="text-sm text-app-muted">Cargando...</p>}
      {evaluations && evaluations.length === 0 && <Card className="text-app-muted">Aún no hay evaluaciones. Crea la primera en «Configurar».</Card>}

      {evaluations && evaluations.length > 0 && (
        <>
          <Card padding="sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app">
                    <th className={TH}>Evaluación</th>
                    <th className={`${TH} text-center`}>Categorías</th>
                    <th className={`${TH} text-center`}>Preguntas</th>
                    <th className={`${TH} text-center`}>Respuestas</th>
                    <th className={TH}>Fecha de cierre</th>
                    <th className={TH}>Estado</th>
                    <th className={TH}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--border)">
                  {pageEvaluations.map((evaluation) => (
                    <Row
                      key={evaluation.id}
                      evaluation={evaluation}
                      onSave={save}
                      busy={busy}
                      expanded={expanded === evaluation.id}
                      onToggle={() => setExpanded((current) => current === evaluation.id ? null : evaluation.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button type="button" variant="secondary" size="sm" disabled={page === 1} onClick={() => changePage(page - 1)}>Anterior</Button>
              <span className="text-sm text-app-muted">Página {page} de {pageCount} · {evaluations.length} evaluaciones</span>
              <Button type="button" variant="secondary" size="sm" disabled={page === pageCount} onClick={() => changePage(page + 1)}>Siguiente</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
