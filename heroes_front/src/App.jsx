import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { EvaluationPage } from './pages/EvaluationPage'
import { EvaluationsListPage } from './pages/EvaluationsListPage'
import { FormConfigPage } from './pages/FormConfigPage'
import { LoginPage } from './pages/LoginPage'
import { ResultsPage } from './pages/ResultsPage'
import { ReviewPage } from './pages/ReviewPage'
import { StaffImportPage } from './pages/StaffImportPage'

// El dashboard es solo del jefe; el colaborador entra directo a evaluar.
function Home() {
  const { user } = useAuth()
  return user.role === 'boss' ? <DashboardPage /> : <Navigate to="/evaluations" replace />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/evaluations" element={<EvaluationPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/evaluations-list" element={<EvaluationsListPage />} />
            <Route path="/config" element={<FormConfigPage />} />
            <Route path="/staff" element={<StaffImportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
