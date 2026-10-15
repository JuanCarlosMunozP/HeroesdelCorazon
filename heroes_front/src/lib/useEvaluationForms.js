import { useEffect, useState } from 'react'
import { api } from './api'

// Formulario (categorías y preguntas) de cada evaluación que aparece en `items`, para dibujar sus tablas de solo lectura.
// Incluye lo desactivado y las evaluaciones cerradas, para mostrar los envíos antiguos. Devuelve { [idDeEvaluación]: categorías }.
export function useEvaluationForms(items) {
  const [forms, setForms] = useState({})
  const ids = [...new Set((items || []).map((item) => item.evaluation))].sort().join(',')

  useEffect(() => {
    if (!ids) return
    Promise.all(
      ids.split(',').map((id) =>
        api(`/questions/form/?evaluation=${id}&include_inactive=1`)
          .then((form) => [id, form])
          .catch(() => [id, []]),
      ),
    ).then((entries) => setForms(Object.fromEntries(entries)))
  }, [ids])

  return forms
}
