import { Building2, CheckCircle2, Users } from 'lucide-react'
import * as XLSX from 'xlsx';
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { AutocompleteSelect } from '../components/ui/AutocompleteSelect'
import { ALERT_ERROR, LABEL, PAGE_SUBTITLE, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'
import { ratingScale } from '../lib/ratingScales'
import { DateGrain } from "@/types/dashboard/charts";


// Color de marca (rojo corporativo). Fallback del color de barra cuando no hay evaluación elegida.
const RED = '#d71920'
// Paleta cíclica: cada evaluación conserva siempre el mismo color según su posición en la lista.
const EVALUATION_COLORS = ['#eab308', '#2563eb', '#16a34a', '#f97316', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f']

// Tarjeta de indicador (icono + etiqueta + valor) usada en la fila superior del dashboard.
function Kpi({ icon: Icon, label, value }) {
  return (
    <Card className="flex items-center gap-4">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={20} /></span>
      <div className="flex flex-col">
        <small className="text-xs text-app-muted">{label}</small>
        <strong className="text-2xl font-bold text-app">{value}</strong>
      </div>
    </Card>
  )
}

// WIP: exporta un arreglo de objetos a .xlsx (hoja "Data"). Ojo: `saveAs` no está importado
// (falta `file-saver`) y ninguna UI la llama todavía; no funcionará hasta completarlo.
function descargarExcel(data,filename) {
  const hoja = XLSX.utils.json_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,hoja,"Data");

  const excelBuffer = XLSX.write(book,{
    bookType:"xlsx",
    type:"array"
  })

  const blob = new Blob([excelBuffer],{
    type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  saveAs(blob,"reporte.xlsx");
} 

// Contenedor de gráfica con título/subtítulo; ResponsiveContainer exige que el padre tenga alto fijo (h-72).
function ChartCard({ title, subtitle, children }) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-app">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-app-muted sm:text-sm">{subtitle}</p>}
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </Card>
  )
}

/**
 * Promedio de calificaciones del jefe, filtrable por evaluación y persona evaluada.
 * Los datos vienen de /questions/category-averages/ con `mine=1` (solo evaluaciones del propio jefe).
 * NOTA: los filtros de fecha/granularidad (borradores *Draft vs. aplicados) son trabajo en curso:
 * hay sintaxis TypeScript (`useState<DateGrain>`), `useState` sin llamar en toDraft y componentes
 * (Input, Select, Button, showDateFilter) sin importar/definir; el archivo no compila hasta resolverlo.
 * Los estados *Draft guardan lo que el usuario escribe y solo pasan a los aplicados con `applyFilters`.
 */
function BossCategories({ people, evaluations }) {
  const [personal, setPersonal] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [fromDraft,setFromDraft] = useState("");
  const [toDraft,setToDraft] = useState
  const [grainDraft,setGrainDraft] = useState<DateGrain>('month');
  const [fromDate,setFromDate] = useState("");
  const [toDate,setToDate] = useState("");
  const [grain,setGrain] = useState<DateGrain>('month');
  // chartKey se incrementa al aplicar filtros para forzar el remontaje de la gráfica.
  const [chartKey,setChartKey] = useState(0);

  // Por defecto se muestra la primera evaluación; "Todas" calcula el promedio conjunto.
  const [chosenEvaluation, setChosenEvaluation] = useState(null)
  const evaluation = chosenEvaluation ?? String(evaluations[0]?.id ?? '')

  const grainText = grain === 'year' ? 'por año' : grain === 'month' ? 'por mes' : 'por día';

  // Si el rango viene invertido (desde > hasta) se intercambia en vez de mostrar error.
  const applyFilters = () => {
    let from = fromDraft;
    let to = toDraft;
    if (from && to && from > to) {
      const swap = from;
      from = to;
      to = swap;
      setFromDraft(from);
      setToDraft(to);
    }
    setFromDate(from);
    setToDate(to);
    setGrain(grainDraft);
    setChartKey((k) => k + 1);
  };

  // Recarga el promedio cada vez que cambia la persona o la evaluación. Sin `evaluation` el backend
  // promedia todas las evaluaciones del jefe.
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('mine', '1')
    if (personal) params.set('personal', personal)
    if (evaluation) params.set('evaluation', evaluation)
    const query = params.toString()
    api(`/questions/category-averages/${query ? `?${query}` : ''}`)
      .then((data) => {
        setError(null)
        setResult(data)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [personal, evaluation])

  const person = people.find((p) => String(p.id) === personal)
  const selectedEvaluation = evaluations.find((item) => String(item.id) === evaluation)
  const evaluationColor = selectedEvaluation
    ? EVALUATION_COLORS[evaluations.findIndex((item) => item.id === selectedEvaluation.id) % EVALUATION_COLORS.length]
    : '#d71920'
  const averageLabel = selectedEvaluation ? `Promedio ${selectedEvaluation.name}` : 'Promedio general'
  const averageData = result?.average == null ? [] : [{ name: averageLabel, average: result.average }]
  // El eje Y depende de la escala de la evaluación (rating_type); con "Todas" se usa la mayor escala presente.
  const maxRating = evaluation
    ? ratingScale(evaluations.find((item) => String(item.id) === evaluation)?.rating_type).max
    : Math.max(5, ...evaluations.map((item) => ratingScale(item.rating_type).max))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} min-w-56`}>
          Evaluación
          <AutocompleteSelect
            value={evaluation}
            // Al cambiar de evaluación se limpia la persona para no consultar una combinación sin respuestas.
            onChange={(value) => { setPersonal(''); setChosenEvaluation(value) }}
            options={[
              { value: '', label: 'Todas' },
              ...evaluations.map((item) => ({ value: String(item.id), label: item.name })),
            ]}
          />
        </label>
        <label className={`${LABEL} min-w-56`}>
          Persona Evaluada
          <AutocompleteSelect
            value={personal}
            onChange={setPersonal}
            options={[
              { value: '', label: 'Todas' },
              // Solo se puede evaluar a colaboradores; los jefes no aparecen como persona evaluada.
              ...people.filter((p) => p.role === 'collaborator').map((p) => ({
                value: String(p.id),
                label: `${p.first_name} ${p.last_name}`,
              })),
            ]}
          />
        </label>
        {showDateFilter && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Input
            type="date"
            label="Desde"
            value={fromDraft}
            max={toDraft || undefined}
            onChange={(e) => setFromDraft(e.target.value)}
          />
          <Input
            type="date"
            label="Hasta"
            value={toDraft}
            min={fromDraft || undefined}
            onChange={(e) => setToDraft(e.target.value)}
          />
          <Select
            label="Fechas"
            value={grainDraft}
            onChange={(e) => setGrainDraft(DateGrain(e.target.value))}
            options={[
              { value: "day", label: "Día" },
              { value: "month", label: "Mes" },
              { value: "year", label: "Año" },
            ]}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              onClick={applyFilters}
              className="w-full"
            >
              Aplicar filtros
            </Button>
          </div>
        </div>
      )}
      </div>
      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {result && (
        <ChartCard
          title={averageLabel}
          subtitle={`${selectedEvaluation?.name ?? 'Todas las evaluaciones'} · ${person ? `${person.first_name} ${person.last_name}` : 'Todas las personas'} · ${averageLabel}: ${result.average ?? '—'}`}
        >
          <BarChart data={averageData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[-0.25, maxRating]} ticks={Array.from({ length: maxRating + 1 }, (_, index) => index)} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="average" name={averageLabel} fill={evaluationColor} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      )}
    </div>
  )
}

// Carga en paralelo los KPIs (/dashboard/) y las evaluaciones del jefe; un fallo de cualquiera muestra un único error.
function BossDashboard() {
  const [people, setPeople] = useState([])
  const [evaluations, setEvaluations] = useState(null)
  const [kpis, setKpis] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api('/questions/dashboard/'), api('/questions/evaluations/?mine=1')])
      .then(([dashboard, list]) => {
        setPeople(dashboard.people || [])
        setKpis(dashboard)
        setEvaluations(list)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [])

  if (error) return <div role="alert" className={ALERT_ERROR}>{error}</div>

  return (
    <div className="space-y-6">
      {kpis && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi icon={Users} label="Personal" value={kpis.staff} />
          <Kpi icon={Building2} label="Áreas" value={kpis.areas} />
          <Kpi icon={CheckCircle2} label="Personas evaluadas" value={kpis.evaluated} />
        </div>
      )}
      {evaluations?.length > 0 && <BossCategories people={people} evaluations={evaluations} />}
      {/* evaluations es null mientras carga; solo con lista vacía real se muestra el aviso */}
      {evaluations?.length === 0 && <Card className="text-app-muted">Aún no hay respuestas para tus evaluaciones.</Card>}
    </div>
  )
}

// Solo se monta para rol `boss` (ver Home en App.jsx); el colaborador es redirigido a /evaluations.
export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className={PAGE_TITLE}>Hola, {user.first_name}</h1>
        <p className={PAGE_SUBTITLE}>{user.area ? `Área: ${user.area}` : 'Resumen general'}</p>
      </div>
      <BossDashboard />
    </div>
  )
}
