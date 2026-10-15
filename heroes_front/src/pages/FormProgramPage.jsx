import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { ALERT_ERROR, ALERT_OK, FIELD, LABEL, PAGE_TITLE } from '../components/ui/styles'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { cn } from '../lib/cn'

const EVALUATIONS = '/questions/evaluations/'
const SETTINGS = '/questions/settings/'

function EvaluationSearch({ evaluations, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const selected = evaluations.find((evaluation) => String(evaluation.id) === value)
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    return search ? evaluations.filter((evaluation) => evaluation.name.toLowerCase().includes(search)) : evaluations
  }, [evaluations, query])

  useEffect(() => setHighlight(0), [query, open])

  useEffect(() => {
    if (!open) return
    const onOutsideClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [open])

  function choose(evaluation) {
    onChange(String(evaluation.id))
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (filtered[highlight]) choose(filtered[highlight])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="grid gap-1.5" ref={wrapRef}>
      <span className={LABEL}>Evaluación</span>
      <div className="relative">
        {open ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary bg-surface px-3 focus-within:ring-2 focus-within:ring-primary/20">
            <Search size={16} className="shrink-0 text-app-muted" />
            <input
              ref={inputRef}
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="evaluation-search-options"
              aria-label="Buscar evaluación"
              className="w-full bg-transparent py-2.5 text-sm text-app outline-none placeholder:text-app-muted"
              placeholder="Buscar evaluación..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar búsqueda">
              <ChevronDown size={16} className="text-app-muted" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-app bg-surface px-3 py-2.5 text-left text-sm text-app outline-none transition hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/20"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
          >
            <span className="truncate">{selected?.name ?? 'Selecciona una evaluación'}</span>
            <ChevronDown size={16} className="shrink-0 text-app-muted" />
          </button>
        )}
        {open && (
          <div id="evaluation-search-options" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-app bg-surface shadow-lg">
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-xs text-app-muted">Sin coincidencias.</p>
            ) : filtered.map((evaluation, index) => (
              <button
                key={evaluation.id}
                type="button"
                role="option"
                aria-selected={String(evaluation.id) === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(evaluation)}
                className={cn(
                  'flex w-full items-center px-3 py-2.5 text-left text-sm',
                  index === highlight ? 'bg-primary/10 text-primary' : 'text-app hover:bg-app-muted',
                )}
              >
                {evaluation.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// El límite mensual se configura por separado para cada evaluación.
export function FormProgramPage() {
  const [evaluations, setEvaluations] = useState(null)
  const [selected, setSelected] = useState('')
  const [ratingType, setRatingType] = useState('quantitative')
  const [savedRatingType, setSavedRatingType] = useState('quantitative')
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ratingBusy, setRatingBusy] = useState(false)

  const chosen = evaluations?.find((evaluation) => String(evaluation.id) === selected)
  const validLimit = /^\d+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 30

  useEffect(() => {
    const current = chosen?.rating_type ?? 'quantitative'
    setRatingType(current)
    setSavedRatingType(current)
  }, [selected, chosen?.rating_type])

  useEffect(() => {
    api(EVALUATIONS)
      .then((list) => {
        setEvaluations(list)
        setSelected(list.length ? String(list[0].id) : '')
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) {
      setValue('')
      setSaved(null)
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)
    api(`${SETTINGS}?evaluation=${selected}`)
      .then((data) => {
        setValue(String(data.monthly_limit))
        setSaved(data.monthly_limit)
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [selected])

  async function submit(event) {
    event.preventDefault()
    if (!selected || !validLimit) {
      setError('Ingresa un número entero de usuarios entre 1 y 30.')
      return
    }
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const data = await api(SETTINGS, {
        method: 'PUT',
        body: { evaluation: Number(selected), monthly_limit: Number(value) },
      })
      setSaved(data.monthly_limit)
      setMessage(`Listo: cada colaborador podrá evaluar hasta ${data.monthly_limit} ${data.monthly_limit === 1 ? 'usuario' : 'usuarios'} al mes en «${chosen.name}».`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveRatingType() {
    if (!chosen) return
    setError(null)
    setMessage(null)
    setRatingBusy(true)
    try {
      const updated = await api(`${EVALUATIONS}${chosen.id}/`, {
        method: 'PATCH',
        body: { rating_type: ratingType },
      })
      setEvaluations((current) => current.map((evaluation) => evaluation.id === updated.id ? updated : evaluation))
      setSavedRatingType(updated.rating_type)
      setMessage(`Tipo de calificación actualizado para «${updated.name}».`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setRatingBusy(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <h1 className={PAGE_TITLE}>Programar evaluación</h1>
        {evaluations?.length > 0 && <EvaluationSearch evaluations={evaluations} value={selected} onChange={setSelected} />}
        {evaluations?.length === 0 && <p className="text-sm text-app-muted">Primero crea una evaluación para configurar su límite.</p>}
        {chosen && (
          <>
            <label className="grid gap-1.5">
              <span className={LABEL}>Tipo de calificación</span>
              <select className={FIELD} value={ratingType} onChange={(e) => setRatingType(e.target.value)}>
                <option value="quantitative">Cuantitativa: de 1 a 5</option>
                <option value="descriptive">Descriptiva: Malo, Regular, Bueno, Muy bueno, Excelente</option>
              </select>
            </label>
            <Button type="button" variant="secondary" disabled={ratingBusy || loading || ratingType === savedRatingType} onClick={saveRatingType}>
              {ratingBusy ? 'Guardando...' : 'Guardar tipo de calificación'}
            </Button>
            <div className="flex items-end gap-3 border-t border-app pt-4">
              <label className={`${LABEL} w-32`}>
                Usuarios por mes
                <input className={FIELD} type="number" min="1" max="30" step="1" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => ['-', '+', '.', 'e', 'E'].includes(e.key) && e.preventDefault()} required />
              </label>
              <Button type="submit" disabled={loading || busy || !validLimit || Number(value) === saved}>
                {busy ? 'Guardando...' : 'Guardar límite'}
              </Button>
            </div>
          </>
        )}
        {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
        {message && <div className={ALERT_OK}>{message}</div>}
        {loading && <p className="text-sm text-app-muted">Cargando límite...</p>}
      </form>
    </Card>
  )
}
