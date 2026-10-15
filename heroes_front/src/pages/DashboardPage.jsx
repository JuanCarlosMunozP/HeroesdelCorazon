import { Building2, CheckCircle2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { ALERT_ERROR, FIELD, LABEL, PAGE_SUBTITLE, PAGE_TITLE } from '../components/ui/styles'
import { api, errorMessage } from '../lib/api'

const RED = '#d71920'
const CATEGORY_COLORS = [RED, '#2563eb', '#16a34a', '#f59e0b']

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

// Etiqueta del eje X en varias líneas, para que ningún nombre largo se oculte por solaparse
function WrappedTick({ x, y, payload }) {
  const lines = []
  let line = ''
  for (const word of String(payload.value).split(' ')) {
    if (line && `${line} ${word}`.length > 14) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  lines.push(line)

  return (
    <text x={x} y={y} textAnchor="middle" fill="#6b7280" fontSize={12}>
      {lines.map((text, i) => (
        <tspan key={text} x={x} dy={i === 0 ? 14 : 15}>{text}</tspan>
      ))}
    </text>
  )
}

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

function BossCategories({ people, evaluations }) {
  const [personal, setPersonal] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Cada evaluación es independiente: por defecto se muestra la primera; "Todas" junta las categorías de todas.
  const [chosenEvaluation, setChosenEvaluation] = useState(null)
  const evaluation = chosenEvaluation ?? String(evaluations[0]?.id ?? '')

  useEffect(() => {
    const params = new URLSearchParams()
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} min-w-56`}>
          Evaluación
          <select className={FIELD} value={evaluation} onChange={(e) => setChosenEvaluation(e.target.value)}>
            <option value="">Todas</option>
            {evaluations.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className={`${LABEL} min-w-56`}>
          Persona
          <select className={FIELD} value={personal} onChange={(e) => setPersonal(e.target.value)}>
            <option value="">Todas</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <div role="alert" className={ALERT_ERROR}>{error}</div>}
      {result && (
        <ChartCard
          title="Promedio por categoría"
          subtitle={`${evaluations.find((e) => String(e.id) === evaluation)?.name ?? 'Todas las evaluaciones'} · ${person ? `${person.first_name} ${person.last_name}` : 'Todas las personas'} · Promedio general: ${result.average ?? '—'}`}
        >
          <BarChart data={result.by_category}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" interval={0} height={50} tick={<WrappedTick />} />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Bar dataKey="average" name="Promedio" radius={[4, 4, 0, 0]}>
              {result.by_category.map((c, i) => (
                <Cell key={c.code} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>
      )}
    </div>
  )
}

function BossDashboard() {
  const [people, setPeople] = useState([])
  const [evaluations, setEvaluations] = useState(null)
  const [kpis, setKpis] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api('/users/collaborators/'), api('/questions/dashboard/'), api('/questions/evaluations/')])
      .then(([collaborators, dashboard, list]) => {
        setPeople(collaborators)
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
      {evaluations && <BossCategories people={people} evaluations={evaluations} />}
    </div>
  )
}

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
