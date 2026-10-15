import { useEffect, useState } from 'react'
import { ScoreTable } from '../components/ScoreTable'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, PAGE_SUBTITLE, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { useEvaluationForms } from '../lib/useEvaluationForms'

export function ReviewPagination({count,start,end,page,totalPages,loading,setPage}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app px-4 py-3 text-app-muted">
      <p>
        {count === 0} 
          ? "Sin resultados"
          : ``Mostrando ${start}-${end} de ${count}``
      </p>
      <div className="flex-items-center gap-1">
        <button
        disabled={page <= 1 || loading}
        onClick={() => setPage((p) => Math.max(1,p -1))}
        >
          Anterior
        </button>
        <span className="px-2 text-app">
          {page} / {totalPages}
        </span>
        <button 
        disable={page >= totalPages || loading}
        onClick={() => setPage((p) => Math.min(totalPages, p +1))}
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

  useEffect(() => {
    api('/questions/submissions/')
      .then(setSubmissions)
      .catch((e) => setError(errorMessage(e)))
  }, [])

  const forms = useEvaluationForms(submissions)

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

      {(submissions || []).map((item) => (
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
      <ReviewPagination
      count={count}
      start={start}
      end={end}
      page={page}
      loading={loading}
      setPage={setPage}
      />
    </div>
  )
}
