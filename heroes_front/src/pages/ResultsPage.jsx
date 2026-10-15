import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, FIELD, LABEL, PAGE_SUBTITLE, PAGE_TITLE, TH } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'

const URL = '/questions/results-summary/'

// Resultados (solo jefe): lo que obtuvo cada persona en una evaluación, por categoría y en promedio general.
export function ResultsPage() {
  const [evaluations, setEvaluations] = useState(null)
  const [evaluation, setEvaluation] = useState('')
  const [area, setArea] = useState('')
  const [person, setPerson] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api('/questions/evaluations/')
      .then(setEvaluations)
      .catch((e) => setError(errorMessage(e)))
  }, [])

  useEffect(() => {
    api(`${URL}${evaluation ? `?evaluation=${evaluation}` : ''}`)
      .then((result) => {
        setError(null)
        setData(result)
        if (!evaluation && result.evaluation) setEvaluation(String(result.evaluation.id))
      })
      .catch((e) => setError(errorMessage(e)))
  }, [evaluation])

  // Las áreas salen de las personas que tienen resultados en la evaluación elegida.
  const areas = [...new Set((data?.rows || []).map((row) => row.area).filter(Boolean))].sort()
  const inArea = (data?.rows || []).filter((row) => !area || row.area === area) // las personas que ofrece el filtro de persona
  const rows = inArea.filter((row) => !person || String(row.personal) === person)

  return (
    <div className="space-y-6">
      <div>
        <h1 className={PAGE_TITLE}>Resultados</h1>
        <p className={PAGE_SUBTITLE}>Lo que obtuvo cada persona en la evaluación elegida: promedio por categoría y promedio general (escala de 1 a 5).</p>
      </div>

      {evaluations && evaluations.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${LABEL} min-w-56`}>
            Evaluación
            <select className={FIELD} value={evaluation} onChange={(e) => { setEvaluation(e.target.value); setArea(''); setPerson('') }}>
              {evaluations.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className={`${LABEL} min-w-56`}>
            Área
            <select className={FIELD} value={area} onChange={(e) => { setArea(e.target.value); setPerson('') }}>
              <option value="">Todas</option>
              {areas.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className={`${LABEL} min-w-56`}>
            Persona
            <select className={FIELD} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Todas</option>
              {inArea.map((row) => (
                <option key={row.personal} value={row.personal}>{row.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {!data && !error && <p className="text-sm text-app-muted">Cargando...</p>}
      {data && data.rows.length === 0 && <Card className="text-app-muted">Aún no hay resultados en esta evaluación.</Card>}

      {data && data.rows.length > 0 && rows.length === 0 && <Card className="text-app-muted">No hay resultados con esos filtros.</Card>}

      {data && rows.length > 0 && (
        <Card padding="sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app">
                  <th className={TH}>Persona</th>
                  <th className={TH}>Área</th>
                  {data.categories.map((c) => <th key={c.code} className={`${TH} text-center`}>{c.name}</th>)}
                  <th className={`${TH} text-center`}>Promedio general</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--border)">
                {rows.map((row) => (
                  <tr key={row.personal}>
                    <td className="px-3 py-3">
                      <strong className="font-semibold text-app">{row.name}</strong>
                      {row.position && <><br /><small className="text-xs text-app-muted">{row.position}</small></>}
                    </td>
                    <td className="px-3 py-3">{row.area || '—'}</td>
                    {data.categories.map((c) => (
                      <td key={c.code} className="px-3 py-3 text-center">{row.by_category[c.code] ?? '—'}</td>
                    ))}
                    <td className="px-3 py-3 text-center"><strong className="text-lg font-bold text-primary">{row.average}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
