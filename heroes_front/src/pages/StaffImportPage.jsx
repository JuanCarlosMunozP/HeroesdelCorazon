import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, FIELD, LABEL, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'

// Tarjeta para subir un archivo y mostrar el resultado de la carga. `children` son campos extra del formulario.
function UploadCard({ title, hint, accept, path, extra = {}, unit, children }) {
  const input = useRef(null)
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      Object.entries(extra).forEach(([key, value]) => value && body.append(key, value))
      setResult(await api(path, { method: 'POST', body }))
      setFile(null)
      if (input.current) input.current.value = ''
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-app">{title}</h3>
          <p className="mt-0.5 text-sm text-app-muted">{hint}</p>
        </div>
        {children}
        <label className={LABEL}>
          Archivo
          <input
            ref={input}
            className={`${FIELD} cursor-pointer file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-dark`}
            type="file"
            accept={accept}
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" disabled={!file || busy}>{busy ? 'Cargando...' : 'Cargar'}</Button>
        </div>

        {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}

        {result && (
          <div className="space-y-1 text-sm text-app">
            <h4 className="text-sm font-semibold">Resultado de la carga</h4>
            <p>{unit} creados: <strong>{result.created}</strong></p>
            <p>
              Ya existían (no se duplicaron): <strong>{result.skipped}</strong>
              {result.skipped_documents?.length > 0 && <span className="text-app-muted"> — {result.skipped_documents.join(', ')}</span>}
            </p>
            {result.errors.length > 0 && (
              <>
                <p>Filas con problemas (no se cargaron): <strong>{result.errors.length}</strong></p>
                <ul className="list-disc pl-5 text-red-700 dark:text-red-300">
                  {result.errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </form>
    </Card>
  )
}

export function StaffImportPage() {
  const [evaluations, setEvaluations] = useState([])
  const [evaluation, setEvaluation] = useState('')

  useEffect(() => {
    api('/questions/evaluations/')
      .then(setEvaluations)
      .catch(() => setEvaluations([]))
  }, [])

  return (
    <div className="space-y-6">
      <h1 className={PAGE_TITLE}>Cargar datos</h1>

      <UploadCard
        title="Cargar personal"
        accept=".xlsx"
        path="/users/import/"
        unit="Personas"
        hint="Excel (.xlsx) con las columnas: Número de documento, Nombres, Apellidos (opcional), Área y Cargo. Si un documento ya existe, no se duplica ni se modifica. El documento es el usuario y la contraseña inicial de cada persona."
      />

      <UploadCard
        title="Cargar respuestas de evaluaciones"
        accept=".xlsx,.csv"
        path="/questions/import/"
        extra={{ evaluation }}
        unit="Evaluaciones"
        hint="Excel (.xlsx) o CSV con una fila por colaborador y compañero evaluado. Columnas: evaluation (id o nombre), collaborator y personal (número de documento) y una columna por cada pregunta de esa evaluación, con una nota de 1 a 5. Si un colaborador ya evaluó a esa persona en esa evaluación, la fila se omite."
      >
        <label className={`${LABEL} max-w-sm`}>
          Evaluación por defecto (para las filas sin evaluación)
          <select className={FIELD} value={evaluation} onChange={(e) => setEvaluation(e.target.value)}>
            <option value="">Ninguna</option>
            {evaluations.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      </UploadCard>
    </div>
  )
}
