import { useEffect, useState } from 'react'
import { ScoreTable } from '../components/ScoreTable'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, ALERT_OK, PAGE_SUBTITLE, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDay } from '../lib/dates'

// Formulario de UNA evaluación: el colaborador elige los compañeros de su área que el jefe habilita cada mes y los califica.
function EvaluationForm({ evaluation, onBack }) {
  const q = `?evaluation=${evaluation.id}`
  const [quota, setQuota] = useState(null)
  const [categories, setCategories] = useState([])
  const [people, setPeople] = useState([])
  const [selected, setSelected] = useState([])
  const [scores, setScores] = useState({})
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api(`/questions/form/${q}`), api('/users/collaborators/'), api(`/questions/quota/${q}`)])
      .then(([form, users, monthly]) => {
        setCategories(form)
        setPeople(users)
        setQuota(monthly)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [q])

  // Cupo mensual: lo define el jefe; los ya calificados este mes no se pueden repetir.
  const max = quota ? quota.limit - quota.used : 0
  const available = quota ? people.filter((p) => !quota.personal.includes(p.id)) : []

  const criteria = categories.flatMap((c) => c.criteria)
  const key = (personId, code) => `${personId}:${code}`
  const isComplete = (personId) => criteria.every((c) => scores[key(personId, c.code)])
  const ready = max > 0 && selected.length === max && selected.every(isComplete)
  const full = max > 0 && selected.length >= max // ya elegiste todos: el resto queda bloqueado

  function toggle(personId) {
    setSaved(false)
    setSelected((current) => {
      if (current.includes(personId)) return current.filter((id) => id !== personId)
      return current.length < max ? [...current, personId] : current
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      for (const personId of selected) {
        await api('/questions/', {
          method: 'POST',
          body: {
            evaluation: evaluation.id,
            personal: personId,
            answers: criteria.map((c) => ({ criterion: c.code, score: Number(scores[key(personId, c.code)]) })),
          },
        })
      }
      setSaved(true)
      setSelected([])
      setScores({})
      setQuota(await api(`/questions/quota/${q}`))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la evaluación'))
      setQuota(await api(`/questions/quota/${q}`).catch(() => quota))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {onBack && <Button type="button" variant="secondary" size="sm" onClick={onBack}>← Otras evaluaciones</Button>}
      <div>
        <h1 className={PAGE_TITLE}>{evaluation.name}</h1>
        {evaluation.closes_on && <p className={PAGE_SUBTITLE}>Puedes responder hasta el {formatDay(evaluation.closes_on)}.</p>}
      </div>
      <p className="text-sm text-app-muted">
        Elige {max || quota?.limit} compañeros de tu área  y marca con una X la nota de 1 a 5 de cada criterio en la cual cada valor representa el nivel de cumplimiento o desempeño observado. El valor 5 corresponde al nivel más alto de valoración y el valor 1 al nivel más bajo.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
        {saved && <div className={ALERT_OK}>Evaluaciones enviadas al jefe de área.</div>}

        <Card>
          <h3 className="text-base font-semibold text-app">Usuarios a evaluar ({selected.length}/{max})</h3>
          {quota && max === 0 && <p className="mt-2 text-sm text-app-muted">Ya enviaste tus {quota.limit} {quota.limit === 1 ? 'evaluación' : 'evaluaciones'} de este mes. Podrás volver a evaluar el próximo mes.</p>}
          {quota && max > 0 && available.length === 0 && <p className="mt-2 text-sm text-app-muted">No hay usuarios disponibles para evaluar.</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(max > 0 ? available : []).map((p) => {
              const checked = selected.includes(p.id)
              const locked = full && !checked
              return (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition',
                    checked ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-app bg-surface text-app',
                    locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-app-muted',
                  )}
                >
                  <input
                    className="accent-primary"
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggle(p.id)}
                  />
                  {p.first_name} {p.last_name}
                </label>
              )
            })}
          </div>
          {full && <p className="mt-2.5 text-xs text-app-muted">Ya elegiste a los {max} compañeros. Desmarca uno si quieres cambiarlo.</p>}
        </Card>

        {selected.map((personId) => {
          const person = people.find((p) => p.id === personId)
          return (
            <Card key={personId}>
              <h3 className="text-base font-semibold text-app">{person.first_name} {person.last_name}</h3>
              <ScoreTable
                name={`person-${personId}`}
                categories={categories}
                scores={Object.fromEntries(criteria.map((c) => [c.code, scores[key(personId, c.code)]]))}
                onChange={(code, n) => setScores((s) => ({ ...s, [key(personId, code)]: n }))}
              />
            </Card>
          )
        })}

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-app-muted">Seleccionados {selected.length}/{max}</span>
          <Button type="submit" disabled={saving || !ready}>
            {saving ? 'Enviando...' : 'Enviar al jefe'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// El colaborador solo responde las evaluaciones que el jefe dejó abiertas: si hay varias, elige cuál.
export function EvaluationPage() {
  const [evaluations, setEvaluations] = useState(null)
  const [chosen, setChosen] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api('/questions/evaluations/')
      .then(setEvaluations)
      .catch((e) => setError(errorMessage(e)))
  }, [])

  if (error) return <div role="alert" className={ALERT_ERROR}>{error}</div>
  if (!evaluations) return <p className="text-sm text-app-muted">Cargando...</p>

  if (evaluations.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className={PAGE_TITLE}>ESCALA DE VALORACIÓN</h1>
        <Card className="text-app-muted">No hay evaluaciones abiertas en este momento.</Card>
      </div>
    )
  }

  const current = evaluations.length === 1 ? evaluations[0] : evaluations.find((e) => e.id === chosen)
  if (current) {
    return <EvaluationForm key={current.id} evaluation={current} onBack={evaluations.length > 1 ? () => setChosen(null) : null} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={PAGE_TITLE}>ESCALA DE VALORACIÓN</h1>
        <p className={PAGE_SUBTITLE}>Hay varias evaluaciones abiertas. Elige la que vas a responder.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {evaluations.map((evaluation) => (
          <button
            key={evaluation.id}
            type="button"
            className="grid cursor-pointer gap-1.5 rounded-xl border border-l-4 border-app border-l-primary bg-surface p-5 text-left transition hover:shadow-md"
            onClick={() => setChosen(evaluation.id)}
          >
            <strong className="text-base text-app">{evaluation.name}</strong>
            <small className="text-xs text-app-muted">{evaluation.categories} {evaluation.categories === 1 ? 'categoría' : 'categorías'} · {evaluation.criteria} preguntas</small>
            {evaluation.closes_on && <small className="text-xs text-app-muted">Cierra el {formatDay(evaluation.closes_on)}</small>}
          </button>
        ))}
      </div>
    </div>
  )
}
