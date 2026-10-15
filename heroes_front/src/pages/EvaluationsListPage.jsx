import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, PAGE_SUBTITLE, PAGE_TITLE, TH } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { formatDay } from '../lib/dates'

const URL = '/questions/evaluations/'
const STATUS = {
  open: { label: 'Abierta', tone: 'success' },
  expired: { label: 'Vencida', tone: 'warning' },
  closed: { label: 'Cerrada', tone: 'neutral' },
}

function Row({ evaluation, onSave, busy }) {
  const status = STATUS[evaluation.status]

  return (
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
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => onSave(evaluation, { is_open: !evaluation.is_open })}>
          {evaluation.is_open ? 'Cerrar' : 'Abrir'}
        </Button>
      </td>
    </tr>
  )
}

export function EvaluationsListPage() {
  const [evaluations, setEvaluations] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className={PAGE_TITLE}>Lista de evaluaciones</h1>
        <p className={PAGE_SUBTITLE}>
          Las evaluaciones que creas en «Configurar». La fecha de cierre se pone sola al crearlas (último día del mes); los colaboradores
          pueden responder hasta el final de ese día y después la evaluación se vence sola.
        </p>
      </div>

      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {!evaluations && !error && <p className="text-sm text-app-muted">Cargando...</p>}
      {evaluations && evaluations.length === 0 && <Card className="text-app-muted">Aún no hay evaluaciones. Crea la primera en «Configurar».</Card>}

      {evaluations && evaluations.length > 0 && (
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
                {evaluations.map((evaluation) => (
                  <Row key={evaluation.id} evaluation={evaluation} onSave={save} busy={busy} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
