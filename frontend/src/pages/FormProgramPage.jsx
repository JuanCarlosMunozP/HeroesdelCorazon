import { useEffect, useState } from 'react'
import { AutocompleteSelect } from '../components/ui/AutocompleteSelect'
import { EvaluationProgramEditor } from '../components/EvaluationProgramFields'
import { api, errorMessage } from '../lib/api'
import { ALERT_ERROR, LABEL, PAGE_TITLE } from '../components/ui/styles'
import { Card } from '../components/ui/Card'

const EVALUATIONS = '/questions/evaluations/'

// Cada envío crea una copia independiente del formulario seleccionado. La edición de una
// programación existente se realiza desde EvaluationsListPage y nunca reutiliza este flujo.
export function FormProgramPage() {
  const [evaluations, setEvaluations] = useState(null)
  const [staff, setStaff] = useState([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState(null)

  // Evaluaciones existentes + personal candidato (para elegir personas a evaluar al programar).
  useEffect(() => {
    Promise.all([api(EVALUATIONS), api('/users/staff-candidates/')])
      .then(([list, candidates]) => {
        setEvaluations(list)
        setStaff(candidates)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [])

  // `selected` es string ('' = ninguna) porque lo maneja AutocompleteSelect; por eso se compara con String(id).
  const chosen = evaluations?.find((evaluation) => String(evaluation.id) === selected) ?? null

  // Al programar se crea una evaluación NUEVA (id distinto), así que se agrega a la lista en vez de reemplazar.
  function handleSaved(updated) {
    setEvaluations((current) => current.some((evaluation) => evaluation.id === updated.id)
      ? current.map((evaluation) => evaluation.id === updated.id ? updated : evaluation)
      : [...current, updated])
  }

  return (
    <Card className="max-w-2xl">
      <div className="space-y-4">
        <h1 className={PAGE_TITLE}>Programar evaluación</h1>
        {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
        <p className="text-sm text-app-muted">
          Cada vez que guardes se creará una evaluación nueva, con identificador, áreas y periodo propios. El formulario seleccionado no se modifica.
        </p>
        {evaluations?.length > 0 && (
          <label className={`${LABEL} grid gap-1.5`}>
            Evaluación
            <AutocompleteSelect
              value={selected}
              onChange={setSelected}
              placeholder="Selecciona una evaluación"
              options={[
                { value: '', label: 'Selecciona una evaluación' },
                ...evaluations.map((evaluation) => ({
                  value: String(evaluation.id),
                  label: `${evaluation.name} (#${evaluation.id})`,
                })),
              ]}
            />
          </label>
        )}
        {evaluations?.length === 0 && <p className="text-sm text-app-muted">Primero crea una evaluación para programarla.</p>}
        {evaluations?.length > 0 && (
          <div className="border-t border-app pt-4">
            <EvaluationProgramEditor
              // key: reinicia el formulario interno al cambiar la evaluación base.
              key={chosen?.id ?? 'none'}
              evaluation={chosen}
              staff={staff}
              onSaved={handleSaved}
              disabled={!chosen}
              createNew
            />
          </div>
        )}
      </div>
    </Card>
  )
}
