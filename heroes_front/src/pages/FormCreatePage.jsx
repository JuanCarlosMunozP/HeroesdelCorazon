import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ScoreTable } from '../components/ScoreTable'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, CELL_INPUT, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDay } from '../lib/dates'

const URL = '/questions/categories/'
const EVALUATIONS = '/questions/evaluations/'

// La categoría nueva arranca en blanco, con 3 filas de preguntas (como las categorías actuales).
const blankCategory = () => ({ name: '', questions: ['', '', ''] })

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl bg-app p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-app">{title}</h2>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} aria-label="Cerrar">Cerrar</Button>
        </div>
        {children}
      </section>
    </div>
  )
}

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

// Lista de evaluaciones: cada una es un formulario aparte. El jefe crea nuevas, las abre o cierra y agrega las categorías que necesite.
function EvaluationsManager({ evaluations, selected, onSelect, onChanged, onError }) {
  const [name, setName] = useState('')
  const [categories, setCategories] = useState([blankCategory()])
  const [editName, setEditName] = useState('')
  const [editCategories, setEditCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

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
    const payloadCategories = categories.map((category) => ({
      name: category.name.trim(),
      criteria: category.questions.map((question) => question.trim()).filter(Boolean),
    }))
    if (await act(EVALUATIONS, { method: 'POST', body: { name, categories: payloadCategories } })) {
      setName('')
      setCategories([blankCategory()])
      setModalOpen(false)
    }
  }

  const formReady = name.trim() && categories.every((category) =>
    category.name.trim() && category.questions.some((question) => question.trim()),
  )

  function categoryEditor(categoryIndex) {
    const category = categories[categoryIndex]
    const updateCategory = (updater) => setCategories((current) => current.map((item, index) => index === categoryIndex ? updater(item) : item))
    return {
      renderCategory: () => (
        <AutoTextarea
          placeholder={`Nombre de categoría ${categoryIndex + 1}`}
          value={category.name}
          onChange={(e) => updateCategory((item) => ({ ...item, name: e.target.value }))}
        />
      ),
      renderCriterion: (criterion) => {
        const questionIndex = Number(criterion.code.split('-').at(-1))
        return <AutoTextarea value={category.questions[questionIndex]} aria-label={`Pregunta ${questionIndex + 1}`} onChange={(e) => updateCategory((item) => ({
          ...item,
          questions: item.questions.map((question, index) => index === questionIndex ? e.target.value : question),
        }))} />
      },
      renderActions: (criterion) => {
        if (category.questions.length <= 1) return null
        const questionIndex = Number(criterion.code.split('-').at(-1))
        return <Button type="button" variant="secondary" size="sm" onClick={() => updateCategory((item) => ({ ...item, questions: item.questions.filter((_, index) => index !== questionIndex) }))}>Quitar</Button>
      },
      renderAdd: () => <AddQuestion onAdd={(text) => updateCategory((item) => ({ ...item, questions: [...item.questions, text] }))} />,
    }
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (!editing || !editName.trim() || !editCategories.every((category) =>
      category.name.trim() && category.criteria.length > 0 && category.criteria.every((criterion) => criterion.name.trim()),
    )) return
    onError(null)
    setBusy(true)
    try {
      await api(`${EVALUATIONS}${editing.id}/`, { method: 'PATCH', body: { name: editName } })
      for (const category of editCategories) {
        const criteria = category.criteria.map((criterion) => criterion.name.trim()).filter(Boolean)
        if (!category.id) {
          await api(URL, { method: 'POST', body: { evaluation: editing.id, name: category.name, criteria } })
          continue
        }
        await api(`${URL}${category.id}/`, { method: 'PATCH', body: { name: category.name } })
        for (const criterion of category.criteria) {
          if (!criterion.name.trim()) continue
          if (criterion.id) {
            await api(`/questions/criteria/${criterion.id}/`, { method: 'PATCH', body: { name: criterion.name } })
          } else {
            await api(`${URL}${category.id}/criteria/`, { method: 'POST', body: { name: criterion.name } })
          }
        }
      }
      await onChanged({ id: editing.id })
      setEditing(null)
      setEditName('')
      setEditCategories([])
    } catch (e) {
      onError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function openEdit(evaluation) {
    setEditing(evaluation)
    setEditName(evaluation.name)
    setEditCategories([])
    setEditLoading(true)
    onError(null)
    try {
      const categories = await api(`${URL}?evaluation=${evaluation.id}`)
      setEditCategories(categories.map((category) => ({
        id: category.id,
        name: category.name,
        used: category.used,
        criteria: category.criteria.map((criterion) => ({ id: criterion.id, name: criterion.name })),
      })))
    } catch (e) {
      onError(errorMessage(e))
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <Card>
      <h3 className="text-base font-semibold text-app">Evaluaciones</h3>
      <p className="mt-0.5 text-sm text-app-muted">
        Cada evaluación es independiente y puede tener las categorías que necesites. Al crearla, se cierra sola al terminar el mes; los
        colaboradores pueden responder hasta el último día y solo ven las evaluaciones abiertas.
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
                onChange={() => onSelect(evaluation.id)}
              />
              <span>
                <strong>{evaluation.name}</strong>{' '}
                <small className="text-xs text-app-muted">
                  {evaluation.categories} {evaluation.categories === 1 ? 'categoría' : 'categorías'} · {evaluation.criteria} preguntas ·{' '}
                  {{ open: 'Abierta', expired: 'Vencida', closed: 'Cerrada' }[evaluation.status]}
                  {evaluation.closes_on && ` · cierra el ${formatDay(evaluation.closes_on)}`}
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => openEdit(evaluation)}
              >
                Editar
              </Button>
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
                Eliminar
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <Button type="button" className="mt-3" onClick={() => setModalOpen(true)}>Crear evaluación</Button>
      {modalOpen && (
        <Modal title="Crear evaluación" onClose={() => { setModalOpen(false); setName(''); setCategories([blankCategory()]) }}>
          <form className="grid gap-4" onSubmit={create}>
            <input
              autoFocus
              className={CELL_INPUT}
              value={name}
              placeholder="Nombre de la nueva evaluación"
              aria-label="Nombre de la nueva evaluación"
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-sm text-app-muted">Agrega las categorías y preguntas que necesites{name.trim() ? ` a ${name.trim()}` : ' a esta evaluación'}. Cada pregunta se califica de 1 a 5.</p>
            {categories.map((category, categoryIndex) => {
              const tableCategory = {
                code: `draft-category-${categoryIndex}`,
                name: category.name,
                criteria: category.questions.map((question, questionIndex) => ({ code: `draft-${categoryIndex}-${questionIndex}`, name: question })),
              }
              return (
                <Card key={categoryIndex}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-app">Categoría {categoryIndex + 1}</h3>
                    {categories.length > 1 && <Button type="button" variant="secondary" size="sm" onClick={() => setCategories((current) => current.filter((_, index) => index !== categoryIndex))}>Quitar categoría</Button>}
                  </div>
                  <ScoreTable categories={[tableCategory]} editor={categoryEditor(categoryIndex)} />
                </Card>
              )
            })}
            <Button type="button" variant="secondary" onClick={() => setCategories((current) => [...current, blankCategory()])}>+ Añadir categoría</Button>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !formReady}>{busy ? 'Guardando...' : 'Guardar evaluación'}</Button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="Editar evaluación" onClose={() => { setEditing(null); setEditName(''); setEditCategories([]) }}>
          {editLoading ? <p className="text-sm text-app-muted">Cargando evaluación...</p> : (
            <form className="grid gap-4" onSubmit={saveEdit}>
              <p className="text-sm text-app-muted">Edita el nombre, las categorías y sus preguntas. Cada pregunta se califica de 1 a 5.</p>
              <label className="grid gap-1.5 text-sm font-medium text-app">
                Nombre de la evaluación
                <input autoFocus className={CELL_INPUT} value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              {editCategories.map((category, categoryIndex) => (
                <Card key={category.id ?? `new-${categoryIndex}`}>
                  <div className="flex items-end gap-3">
                    <label className="grid flex-1 gap-1.5 text-sm font-medium text-app">
                      Categoría {categoryIndex + 1}
                      <input className={CELL_INPUT} value={category.name} onChange={(e) => setEditCategories((current) => current.map((item, index) => index === categoryIndex ? { ...item, name: e.target.value } : item))} />
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        if (!category.id) {
                          setEditCategories((current) => current.filter((_, index) => index !== categoryIndex))
                          return
                        }
                        const action = category.used ? 'desactivar' : 'eliminar'
                        if (!window.confirm(`¿Deseas ${action} la categoría «${category.name}»?`)) return
                        const result = await act(
                          `${URL}${category.id}/`,
                          category.used ? { method: 'PATCH', body: { is_active: false } } : { method: 'DELETE' },
                        )
                        if (result) setEditCategories((current) => current.filter((item) => item.id !== category.id))
                      }}
                    >
                      Quitar categoría
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {category.criteria.map((criterion, criterionIndex) => (
                      <label key={criterion.id ?? `new-criterion-${criterionIndex}`} className="grid gap-1 text-sm text-app-muted">
                        Pregunta {criterionIndex + 1}
                        <input className={CELL_INPUT} value={criterion.name} onChange={(e) => setEditCategories((current) => current.map((item, index) => index === categoryIndex ? {
                          ...item,
                          criteria: item.criteria.map((question, questionIndex) => questionIndex === criterionIndex ? { ...question, name: e.target.value } : question),
                        } : item))} />
                      </label>
                    ))}
                    <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => setEditCategories((current) => current.map((item, index) => index === categoryIndex ? { ...item, criteria: [...item.criteria, { name: '' }] } : item))}>+ Añadir pregunta</Button>
                  </div>
                </Card>
              ))}
              <Button type="button" variant="secondary" onClick={() => setEditCategories((current) => [...current, { name: '', criteria: [{ name: '' }] }])}>+ Añadir categoría</Button>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy || !editName.trim() || !editCategories.every((category) => category.name.trim() && category.criteria.length > 0 && category.criteria.every((criterion) => criterion.name.trim()))}>{busy ? 'Guardando...' : 'Guardar cambios'}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </Card>
  )
}

export function FormCreatePage() {
  const [evaluations, setEvaluations] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  const chosen = evaluations?.find((e) => e.id === selected)

  function show(list, pick) {
    setEvaluations(list)
    setSelected((current) => [pick, current].map((id) => list.find((e) => e.id === id)).find(Boolean)?.id ?? list[0]?.id ?? null)
  }
  const reload = (pick) => api(EVALUATIONS).then((list) => show(list, pick))

  useEffect(() => {
    api(EVALUATIONS)
      .then(show)
      .catch((e) => setError(errorMessage(e)))
  }, [])

  return (
    <div className="space-y-6">
      <h1 className={PAGE_TITLE}>Configurar evaluación</h1>


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
      {chosen && <p className="text-sm text-app-muted">Seleccionada: <strong>{chosen.name}</strong>.</p>}
    </div>
  )
}
