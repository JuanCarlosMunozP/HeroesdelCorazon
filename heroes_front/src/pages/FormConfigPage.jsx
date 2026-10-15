import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ScoreTable } from '../components/ScoreTable'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, ALERT_OK, CELL_INPUT, FIELD, LABEL, PAGE_SUBTITLE, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDay } from '../lib/dates'

const URL = '/questions/categories/'
const EVALUATIONS = '/questions/evaluations/'

// La categoría nueva arranca en blanco, con 3 filas de preguntas (como las categorías actuales).
const blankDraft = () => ({ name: '', questions: ['', '', ''] })

// Cuadro de texto que crece con lo que se escribe: el texto nunca queda cortado.
function AutoTextarea({ value, ...props }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const box = ref.current
    box.style.height = 'auto'
    box.style.height = `${box.scrollHeight}px`
  }, [value])

  return <textarea ref={ref} className={CELL_INPUT} rows={1} value={value} {...props} />
}

// Cuántos compañeros puede evaluar cada colaborador al mes (por defecto 3; el máximo permitido es 30). El botón "Enviar" guarda el valor.
function MonthlyLimit() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/questions/settings/')
      .then((data) => {
        setValue(String(data.monthly_limit))
        setSaved(data.monthly_limit)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [])

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const data = await api('/questions/settings/', { method: 'PUT', body: { monthly_limit: Number(value) } })
      setSaved(data.monthly_limit)
      setMessage(`Listo: cada colaborador podrá evaluar hasta ${data.monthly_limit} ${data.monthly_limit === 1 ? 'usuario' : 'usuarios'} al mes.`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-app">Configuración usuarios a evaluar</h3>
          <p className="mt-0.5 text-sm text-app-muted">Define cuántos compañeros puede evaluar cada colaborador durante el mes.</p>
        </div>
        <div className="flex items-end gap-3">
          <label className={`${LABEL} w-32`}>
            Cantidad
            <input className={FIELD} type="number" min="1" max="30" step="1" value={value} onChange={(e) => setValue(e.target.value)} required />
          </label>
          <Button type="submit" disabled={busy || value === '' || Number(value) === saved}>
            {busy ? 'Enviando...' : 'Enviar'}
          </Button>
        </div>
        {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
        {message && <div className={ALERT_OK}>{message}</div>}
      </form>
    </Card>
  )
}

// Fila final: el cuadro de la nueva pregunta ocupa la columna de criterio (igual que los demás) y el botón va en acciones.
function AddQuestion({ onAdd }) {
  const [text, setText] = useState('')

  function add() {
    if (!text.trim()) return
    onAdd(text)
    setText('')
  }

  return (
    <>
      <td className="border border-app bg-app-muted px-2.5 py-2 align-middle">
        <input
          className={CELL_INPUT}
          value={text}
          placeholder="Escribe otra pregunta"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
      </td>
      <td colSpan={5} className="border border-app bg-app-muted" />
      <td className="w-32 border border-app bg-app-muted px-2.5 py-2 align-middle">
        <Button type="button" variant="secondary" size="sm" disabled={!text.trim()} onClick={add}>
          + Agregar
        </Button>
      </td>
    </>
  )
}

// Lista de evaluaciones: cada una es un formulario aparte. El jefe crea nuevas, las abre o cierra y elige a cuál agregarle categorías.
function EvaluationsManager({ evaluations, selected, onSelect, onChanged, onError }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function act(path, options) {
    onError(null)
    setBusy(true)
    try {
      const result = await api(path, options)
      await onChanged(result)
      return true
    } catch (e) {
      onError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function create(event) {
    event.preventDefault()
    if (await act(EVALUATIONS, { method: 'POST', body: { name } })) setName('')
  }

  return (
    <Card>
      <h3 className="text-base font-semibold text-app">Evaluaciones</h3>
      <p className="mt-0.5 text-sm text-app-muted">
        Cada evaluación es un formulario independiente: lo que agregues a una no cambia las demás. Al crearla se cierra sola al terminar el
        mes (12:00 de la noche del último día) y los colaboradores solo ven las abiertas.
      </p>

      <ul className="mt-3 grid gap-2">
        {evaluations.map((evaluation) => (
          <li
            key={evaluation.id}
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5',
              evaluation.id === selected ? 'border-primary bg-primary/5' : 'border-app',
            )}
          >
            <label className="flex min-w-56 flex-1 cursor-pointer items-center gap-2.5">
              <input
                className="accent-primary"
                type="radio"
                name="evaluation"
                checked={evaluation.id === selected}
                disabled={evaluation.used}
                onChange={() => onSelect(evaluation.id)}
              />
              <span>
                <strong>{evaluation.name}</strong>{' '}
                <small className="text-xs text-app-muted">
                  {evaluation.categories} {evaluation.categories === 1 ? 'categoría' : 'categorías'} · {evaluation.criteria} preguntas ·{' '}
                  {{ open: 'Abierta', expired: 'Vencida', closed: 'Cerrada' }[evaluation.status]}
                  {evaluation.closes_on && ` · cierra el ${formatDay(evaluation.closes_on)}`}
                  {evaluation.used && ' · con respuestas: ya no admite más categorías ni preguntas'}
                </small>
              </span>
            </label>
            <span className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => act(`${EVALUATIONS}${evaluation.id}/`, { method: 'PATCH', body: { is_open: !evaluation.is_open } })}
              >
                {evaluation.is_open ? 'Cerrar' : 'Abrir'}
              </Button>
              {!evaluation.used && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    window.confirm(`¿Borrar "${evaluation.name}" con todas sus categorías y preguntas?`) &&
                    act(`${EVALUATIONS}${evaluation.id}/`, { method: 'DELETE' })
                  }
                >
                  Borrar
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form className="mt-3 flex items-center gap-2" onSubmit={create}>
        <input
          className={CELL_INPUT}
          value={name}
          placeholder="Nombre de la nueva evaluación"
          aria-label="Nombre de la nueva evaluación"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" className="shrink-0" disabled={busy || !name.trim()}>Crear evaluación</Button>
      </form>
    </Card>
  )
}

export function FormConfigPage() {
  const [evaluations, setEvaluations] = useState(null)
  const [selected, setSelected] = useState(null)
  const [example, setExample] = useState('Nombre de la categoría')
  const [draft, setDraft] = useState(blankDraft)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const chosen = evaluations?.find((e) => e.id === selected)

  // Solo se le pueden agregar categorías a una evaluación sin respuestas; las que ya tienen quedan fijas.
  function show(list, pick) {
    const editable = list.filter((e) => !e.used)
    setEvaluations(list)
    setSelected((current) => [pick, current].map((id) => editable.find((e) => e.id === id)).find(Boolean)?.id ?? editable[0]?.id ?? null)
  }
  const reload = (pick) => api(EVALUATIONS).then((list) => show(list, pick))

  useEffect(() => {
    api(EVALUATIONS)
      .then(show)
      .catch((e) => setError(errorMessage(e)))
  }, [])

  // Ejemplo en el nombre de la categoría: la primera que ya existe en la evaluación elegida.
  useEffect(() => {
    if (!selected) return
    api(`${URL}?evaluation=${selected}`)
      .then((categories) => setExample(categories.length ? `Ej: ${categories[0].name}` : 'Nombre de la categoría'))
      .catch(() => {})
  }, [selected, evaluations])

  const ready = selected && draft.name.trim() && draft.questions.some((q) => q.trim())

  async function create() {
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      await api(URL, { method: 'POST', body: { evaluation: selected, name: draft.name, criteria: draft.questions } })
      setMessage(`Categoría "${draft.name.trim()}" creada en "${chosen.name}". Las demás evaluaciones no cambian.`)
      await reload()
      setDraft(blankDraft())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const setQuestion = (index, value) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((q, i) => (i === index ? value : q)) }))
  const indexOf = (criterion) => Number(criterion.code.split('-')[1])

  const category = {
    code: 'draft',
    name: draft.name,
    criteria: draft.questions.map((name, i) => ({ code: `draft-${i}`, name })),
  }

  const editor = {
    renderCategory: () => (
      <div className="grid gap-2">
        <AutoTextarea placeholder={example} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Button type="button" size="sm" disabled={busy || !ready} onClick={create}>
          {busy ? 'Creando...' : 'Crear categoría'}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setDraft(blankDraft())}>Limpiar</Button>
      </div>
    ),

    renderCriterion: (criterion) => (
      <AutoTextarea
        aria-label={`Pregunta ${indexOf(criterion) + 1}`}
        value={criterion.name}
        onChange={(e) => setQuestion(indexOf(criterion), e.target.value)}
      />
    ),

    renderActions: (criterion) =>
      draft.questions.length > 1 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== indexOf(criterion)) }))}
        >
          Quitar
        </Button>
      ),

    renderAdd: () => <AddQuestion onAdd={(text) => setDraft((d) => ({ ...d, questions: [...d.questions, text] }))} />,
  }

  return (
    <div className="space-y-6">
      <h1 className={PAGE_TITLE}>Configurar evaluación</h1>

      <MonthlyLimit />

      {evaluations && (
        <EvaluationsManager
          evaluations={evaluations}
          selected={selected}
          onSelect={setSelected}
          onChanged={(result) => reload(result?.id)}
          onError={setError}
        />
      )}

      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {message && <div className={ALERT_OK}>{message}</div>}

      {evaluations && !chosen && (
        <Card className="text-app-muted">
          Todas las evaluaciones ya tienen respuestas, así que no se les pueden agregar categorías ni preguntas. Crea una evaluación
          nueva arriba y agrégale las categorías.
        </Card>
      )}

      {chosen && (
        <>
          <p className={PAGE_SUBTITLE}>
            Escribe la nueva categoría y sus preguntas en la tabla; si necesitas más preguntas, escríbelas en la última fila. Se agrega solo a
            <strong> {chosen.name}</strong>. Cada pregunta se califica de 1 a 5.
          </p>
          <Card>
            <h3 className="text-base font-semibold text-app">Nueva categoría en «{chosen.name}»</h3>
            <ScoreTable categories={[category]} editor={editor} />
          </Card>
        </>
      )}
    </div>
  )
}
