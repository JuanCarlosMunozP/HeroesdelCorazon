import { useEffect, useState } from 'react'
import { ScoreTable } from '../components/ScoreTable'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, PAGE_SUBTITLE, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { useEvaluationForms } from '../lib/useEvaluationForms'

const PAGE_SIZE = 10

export function ReviewPagination({ count, start, end, page, totalPages, loading, setPage }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app px-4 py-3 text-app-muted">
      <p>{count === 0 ? 'Sin resultados' : `Mostrando ${start}-${end} de ${count}`}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-app px-3 py-1.5 text-sm text-app disabled:opacity-50"
        disabled={page <= 1 || loading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Anterior
        </button>
        <span className="px-2 text-app">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="rounded-md border border-app px-3 py-1.5 text-sm text-app disabled:opacity-50"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}


export function ReviewPage() {
  const [submissions, setSubmissions] = useState(null)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    api('/questions/submissions/')
      .then(setSubmissions)
      .catch((e) => setError(errorMessage(e)))
  }, [])

  const forms = useEvaluationForms(submissions)
  const count = submissions?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const start = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, count)
  const pageSubmissions = (submissions || []).slice(start - (count ? 1 : 0), end)

  const keyOf = (item) => `${item.evaluation}:${item.collaborator}:${item.personal}:${item.created_at}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className={PAGE_TITLE}>Revisar evaluaciones</h1>
        <p className={PAGE_SUBTITLE}>Los colaboradores califican a sus compañeros; aquí consultas lo que enviaron. La puntuación final es el promedio de las notas.</p>
      </div>

      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {!submissions && !error && <p className="text-sm text-app-muted">Cargando...</p>}
      {submissions && submissions.length === 0 && <Card className="text-app-muted">Aún no hay evaluaciones enviadas.</Card>}

      {pageSubmissions.map((item) => (
        <Card key={keyOf(item)} className="border-l-4 border-l-primary shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge tone="primary" className="mb-1.5">{item.evaluation_name}</Badge>
              <h3 className="text-base font-semibold text-app">{item.collaborator_name} → {item.personal_name}</h3>
              <p className="text-sm text-app-muted">{item.area} · {new Date(item.created_at).toLocaleDateString('es-CO')}</p>
            </div>
            <div className="flex flex-col items-end">
              <small className="text-xs text-app-muted">Promedio</small>
              <strong className="text-3xl font-bold text-primary">{item.average}</strong>
            </div>
          </div>

          <ScoreTable
            name={keyOf(item)}
            categories={forms[item.evaluation] || []}
            scores={Object.fromEntries(item.answers.map((a) => [a.criterion, a.score]))}
          />
        </Card>
      ))}
      {submissions?.length > PAGE_SIZE && (
        <ReviewPagination
          count={count}
          start={start}
          end={end}
          page={page}
          totalPages={totalPages}
          loading={!submissions && !error}
          setPage={setPage}
        />
      )}
    </div>
  )
}
