import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ConfirmProvider } from './components/ui/ConfirmProvider'
import Login from './pages/Login'
import routes from './routes'

function HomeRedirect() {
  const { user } = useAuth()

  return (
    <Navigate
      to={user?.role === 'admin' ? '/gestion' : '/contactos'}
      replace
    />
  )
}

function App() {
  return (
    <ConfirmProvider><AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {routes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <ProtectedRoute>
                  {route.element}
                </ProtectedRoute>
              }
            >
              {route.path === '/' && (
                <Route index element={<HomeRedirect />} />
              )}

              {route.children?.map((child) => (
                <Route
                  key={child.path}
                  path={child.path}
                  element={child.element}
                />
              ))}
            </Route>
          ))}
        </Routes>
      </BrowserRouter>
    </AuthProvider></ConfirmProvider>
  )
}

export default App