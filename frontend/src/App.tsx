import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { TripPlannerPage } from './pages/TripPlannerPage'
import { LogbookPage } from './pages/LogbookPage'
import { useAuth } from './auth/AuthContext'

type PrivateRouteProps = {
  children: React.ReactElement
}

function PrivateRoute({ children }: PrivateRouteProps) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return children
}

function DefaultRoute() {
  const { isAuthenticated } = useAuth()
  return <Navigate to={isAuthenticated ? "/planner" : "/login"} replace />
}

function PublicRoute({ children }: PrivateRouteProps) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) {
    return <Navigate to="/planner" replace />
  }
  return children
}

function App() {
  const location = useLocation()
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register'

  return (
    <div className="app-shell">
      <main className={`app-main ${isAuthPage ? 'app-main-auth' : ''}`}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/planner"
            element={
              <PrivateRoute>
                <TripPlannerPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/logbook"
            element={
              <PrivateRoute>
                <LogbookPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<DefaultRoute />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
