import { Button } from './ui/Button'
import { ALERT_ERROR, ALERT_OK, FIELD, LABEL } from './ui/styles'
import { useEvaluationProgram } from '../lib/useEvaluationProgram'

// Envuelve useEvaluationProgram + EvaluationProgramFields para una evaluación concreta.
// Se usa con `key={evaluation?.id ?? 'none'}` desde quien la llama: al cambiar de evaluación
// este componente se remonta entero, así el hook arranca con el estado de la nueva evaluación
// sin necesitar un efecto que resetee los campos a mano.
export function EvaluationProgramEditor({ evaluation, staff, onSaved, disabled = false, createNew = false }) {
  const program = useEvaluationProgram({ evaluation, staff, onSaved, createNew })
  return <EvaluationProgramFields program={program} disabled={disabled} createNew={createNew} />
}

// Campos de la "programación" de una evaluación (áreas, personas, fecha de cierre y límite
// mensual). `program` viene de useEvaluationProgram. `disabled` deshabilita todo el bloque,
// por ejemplo mientras no se ha elegido ninguna evaluación en el formulario de creación.
export function EvaluationProgramFields({ program, disabled = false, createNew = false }) {
  const {
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
  } = program

  // Se bloquea todo mientras carga el límite mensual o se guarda, para evitar ediciones sobre datos a medias.
  const fieldsDisabled = disabled || loading || busy

  return (
    <form onSubmit={submit} className="grid gap-4">
      <fieldset className="grid gap-2" disabled={fieldsDisabled}>
        <legend className={LABEL}>Área(s) a evaluar</legend>
        <label className="flex items-center gap-2 rounded-lg border border-app px-3 py-2.5 text-sm text-app">
          <input
            className="accent-primary"
            type="checkbox"
            checked={allAreasSelected}
            onChange={selectAllAreas}
          />
          Todas las áreas
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {availableAreas.map((area) => (
            <label key={area} className="flex items-center gap-2 rounded-lg border border-app px-3 py-2.5 text-sm text-app">
              <input
                className="accent-primary"
                type="checkbox"
                checked={selectedAreas === null || selectedAreas.includes(area)}
                onChange={() => toggleArea(area)}
              />
              {area}
            </label>
          ))}
        </div>
        <p className="text-xs text-app-muted">
          Cada colaborador solo podrá evaluar personas de su propia área. «Todas las áreas» habilita la evaluación en todas.
        </p>
      </fieldset>

      <fieldset className="grid gap-2" disabled={fieldsDisabled}>
        <legend className={LABEL}>Personas a evaluar</legend>
        <label className={`${LABEL} grid gap-1.5`}>
          Filtrar por nombre
          <input
            className={FIELD}
            type="search"
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder="Escribe un nombre"
          />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-app px-3 py-2.5 text-sm text-app">
          <input
            className="accent-primary"
            type="checkbox"
            checked={!specificPeople}
            onChange={(event) => setAllPeople(event.target.checked)}
          />
          Todas las personas de las áreas seleccionadas
        </label>
        <p className="text-xs text-app-muted">
          {specificPeople
            ? 'Selecciona una o varias personas de la lista.'
            : 'Desmarca esta opción para elegir personas específicas por nombre.'}
        </p>
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {visibleStaff.map((person) => (
            <label key={person.id} className="flex items-center gap-2 rounded-lg border border-app px-3 py-2.5 text-sm text-app">
              <input
                className="accent-primary"
                type="checkbox"
                checked={!specificPeople || selectedPersonalIds.includes(person.id)}
                onChange={() => togglePerson(person.id)}
              />
              <span>{person.first_name} {person.last_name}</span>
              <span className="ml-auto text-xs text-app-muted">{person.area}</span>
            </label>
          ))}
        </div>
        {visibleStaff.length === 0 && <p className="text-sm text-app-muted">No hay personas que coincidan con ese nombre en las áreas seleccionadas.</p>}
        <p className="text-xs text-app-muted">
          {!specificPeople
            ? `Se podrá evaluar a todas las personas de las áreas seleccionadas (${scopedStaff.length}).`
            : `${selectedPersonalIds.length} persona(s) seleccionada(s).`}
        </p>
      </fieldset>

      <label className={`${LABEL} w-full max-w-xs`}>
        Fecha de cierre
        <input
          className={FIELD}
          type="date"
          value={closeDate}
          disabled={fieldsDisabled}
          onChange={(event) => setCloseDate(event.target.value)}
          required
        />
        <span className="text-xs font-normal text-app-muted">La evaluación se cerrará al finalizar ese día.</span>
      </label>

      <label className={`${LABEL} w-full max-w-xs`}>
        Usuarios
        <input
          className={FIELD}
          type="number"
          min="1"
          max="30"
          step="1"
          value={value}
          placeholder={disabled ? 'Selecciona una evaluación primero' : ''}
          disabled={fieldsDisabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => ['-', '+', '.', 'e', 'E'].includes(e.key) && e.preventDefault()}
          required
        />
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={fieldsDisabled || !validLimit || peopleSelectionInvalid || !hasChanges}>
          {busy ? 'Guardando...' : createNew ? 'Crear evaluación programada' : 'Guardar programación'}
        </Button>
      </div>

      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {message && <div className={ALERT_OK}>{message}</div>}
      {loading && <p className="text-sm text-app-muted">Cargando programación...</p>}
    </form>
  )
}
