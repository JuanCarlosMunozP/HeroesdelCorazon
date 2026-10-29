import { useEffect, useState } from 'react'
import { api, errorMessage } from './api'

const EVALUATIONS = '/questions/evaluations/'
const SETTINGS = '/questions/settings/'
// Área técnica heredada que no debe ofrecerse como destinatario.
const REMOVED_AREA = 'sistema'

function isRemovedArea(area) {
  return area.trim().toLocaleLowerCase() === REMOVED_AREA
}

// Búsqueda sin tildes ni mayúsculas (el rango ̀-ͯ son las marcas diacríticas tras NFD).
function normalizeSearch(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase()
}

// Estado y lógica de la "programación" de una evaluación (áreas, personas, fecha de cierre
// y límite mensual). FormProgramPage crea una copia independiente; EvaluationsListPage edita
// una programación existente sin cambiar su identidad.
export function useEvaluationProgram({ evaluation, staff, onSaved, createNew = false }) {
  const evaluationId = evaluation?.id ?? null
  // `selectedAreas === null` significa "todas las áreas" (se envía null al backend); un array vacío, ninguna.
  const availableAreas = [...new Set(staff.map((person) => person.area).filter((area) => area && !isRemovedArea(area)))].sort()

  // El estado parte directamente de `evaluation` (closes_on/areas/personal_ids). Cuando cambia
  // qué evaluación se está programando, el componente que usa este hook debe remontarlo con
  // `key={evaluationId}` (ver FormProgramPage/EvaluationsListPage) en vez de resetear el estado
  // a mano aquí: así no hace falta un efecto que llame a setState de forma síncrona al cambiar.
  const [value, setValue] = useState(createNew ? String(3) : '')
  const [saved, setSaved] = useState(null)
  const [selectedAreas, setSelectedAreas] = useState(() => createNew ? null : evaluation ? evaluation.areas : null)
  const [savedAreas, setSavedAreas] = useState(() => createNew ? undefined : evaluation ? evaluation.areas : undefined)
  const [selectedPersonalIds, setSelectedPersonalIds] = useState(() => createNew ? [] : evaluation?.personal_ids ?? [])
  const [savedPersonalIds, setSavedPersonalIds] = useState(() => createNew ? null : evaluation ? evaluation.personal_ids ?? [] : null)
  const [specificPeople, setSpecificPeople] = useState(() => !createNew && (evaluation?.personal_ids ?? []).length > 0)
  const [nameFilter, setNameFilter] = useState('')
  const [closeDate, setCloseDate] = useState(() => createNew ? '' : evaluation?.closes_on ?? '')
  const [savedCloseDate, setSavedCloseDate] = useState(() => createNew ? null : evaluation ? evaluation.closes_on ?? '' : null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // El límite mensual todavía no llegó mientras `saved` sigue en null y no hubo error.
  const loading = !createNew && evaluationId != null && saved === null && error === null

  // Trae el límite mensual vigente de la evaluación (se guarda aparte, no viene en `evaluation`).
  useEffect(() => {
    if (!evaluationId || createNew) return
    let current = true
    api(`${SETTINGS}?evaluation=${evaluationId}`)
      .then((data) => {
        if (!current) return
        setValue(String(data.monthly_limit))
        setSaved(data.monthly_limit)
      })
      .catch((e) => current && setError(errorMessage(e)))
    return () => { current = false }
  }, [createNew, evaluationId])

  // Límite mensual: entero entre 1 y 30 (mismo rango que valida el backend).
  const validLimit = /^\d+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 30
  // Los *Changed comparan contra lo último guardado; sirven para enviar solo lo modificado y activar el botón Guardar.
  const limitChanged = saved !== null && Number(value) !== saved
  const closeDateChanged = savedCloseDate !== null && closeDate !== savedCloseDate
  const areasChanged = savedAreas !== undefined && (
    selectedAreas === null || savedAreas === null
      ? selectedAreas !== savedAreas
      : [...selectedAreas].sort().join('\0') !== [...savedAreas].sort().join('\0')
  )
  const personalChanged = savedPersonalIds !== null && (
    specificPeople !== (savedPersonalIds.length > 0)
    || (specificPeople
      && [...selectedPersonalIds].sort((a, b) => a - b).join('\0') !== [...savedPersonalIds].sort((a, b) => a - b).join('\0'))
  )
  const allAreasSelected = selectedAreas === null
    || (availableAreas.length > 0 && selectedAreas.length === availableAreas.length)
  const scopedStaff = staff.filter((person) => selectedAreas === null || selectedAreas.includes(person.area))
  const normalizedName = normalizeSearch(nameFilter)
  const visibleStaff = scopedStaff.filter((person) =>
    normalizeSearch(`${person.first_name} ${person.last_name}`).includes(normalizedName),
  )
  // "Personas específicas" sin ninguna marcada no tiene sentido: el backend lo interpretaría como todas.
  const peopleSelectionInvalid = specificPeople && selectedPersonalIds.length === 0
  const hasChanges = createNew || limitChanged || closeDateChanged || areasChanged || personalChanged

  // Al cambiar áreas se descartan las personas que ya no pertenecen a ellas.
  function toggleArea(area) {
    const currentAreas = selectedAreas ?? availableAreas
    const nextAreas = currentAreas.includes(area)
      ? currentAreas.filter((item) => item !== area)
      : [...currentAreas, area]
    setSelectedAreas(nextAreas)
    setSelectedPersonalIds((current) => current.filter((id) => {
      const person = staff.find((item) => item.id === id)
      return person && (!nextAreas.length || nextAreas.includes(person.area))
    }))
  }

  function selectAllAreas() {
    if (allAreasSelected) {
      setSelectedAreas([])
      setSelectedPersonalIds([])
      setSpecificPeople(false)
      return
    }
    setSelectedAreas(null)
  }

  function setAllPeople(allSelected) {
    setSpecificPeople(!allSelected)
    if (allSelected) setSelectedPersonalIds([])
  }

  // Primer clic en una persona con "todas" activo: pasa a selección específica partiendo de todas menos esa.
  function togglePerson(personId) {
    setSpecificPeople(true)
    setSelectedPersonalIds((current) => {
      const next = !specificPeople
        ? scopedStaff.map((person) => person.id).filter((id) => id !== personId)
        : current.includes(personId)
          ? current.filter((id) => id !== personId)
          : [...current, personId]
      return next
    })
  }

  // Crear: POST a /programs/ (copia nueva de la evaluación). Editar: PATCH de fecha/áreas/personas y PUT aparte
  // del límite mensual (vive en otro recurso), cada uno solo si cambió. personal_ids vacío = todas las personas.
  async function submit(event) {
    event?.preventDefault?.()
    if (!evaluationId || !validLimit) {
      setError('Ingresa un número entero de usuarios entre 1 y 30.')
      return
    }
    if (!closeDate) {
      setError('Selecciona la fecha de cierre.')
      return
    }
    if (!hasChanges) return
    if (peopleSelectionInvalid) {
      setError('Selecciona al menos una persona o marca todas las personas de las áreas.')
      return
    }
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      if (createNew) {
        const created = await api(`${EVALUATIONS}${evaluationId}/programs/`, {
          method: 'POST',
          body: {
            closes_on: closeDate,
            areas: selectedAreas,
            personal_ids: specificPeople ? selectedPersonalIds : [],
            monthly_limit: Number(value),
          },
        })
        setMessage(`Nueva evaluación programada: «${created.name}».`)
        onSaved?.(created)
        return
      }

      let updated = evaluation
      if (closeDateChanged || areasChanged || personalChanged) {
        updated = await api(`${EVALUATIONS}${evaluationId}/`, {
          method: 'PATCH',
          body: { closes_on: closeDate, areas: selectedAreas, personal_ids: specificPeople ? selectedPersonalIds : [] },
        })
        setSavedCloseDate(closeDate)
        setSavedAreas(selectedAreas)
        setSavedPersonalIds(specificPeople ? selectedPersonalIds : [])
      }
      if (limitChanged) {
        await api(SETTINGS, {
          method: 'PUT',
          body: { evaluation: Number(evaluationId), monthly_limit: Number(value) },
        })
        setSaved(Number(value))
      }
      setMessage(`Programación guardada para «${evaluation.name}».`)
      onSaved?.(updated)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return {
    availableAreas,
    value, setValue,
    closeDate, setCloseDate,
    selectedAreas, toggleArea, selectAllAreas,
    selectedPersonalIds, specificPeople, togglePerson, setAllPeople,
    nameFilter, setNameFilter,
    scopedStaff, visibleStaff, allAreasSelected,
    peopleSelectionInvalid, validLimit, hasChanges,
    loading, busy, error, message,
    submit,
  }
}
