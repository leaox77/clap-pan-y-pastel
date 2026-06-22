import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Ventas from './pages/Ventas'
import Inventario from './pages/Inventario'
import Caja from './pages/Caja'
import Gastos from './pages/Gastos'
import Mermas from './pages/Mermas'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'

function Layout({ children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-soft)' }}>
        {children}
      </main>
    </div>
  )
}

export default function App() {
  const { loading } = useAuth()
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>👏</div>
        <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>Cargando...</p>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/ventas" element={<ProtectedRoute><Layout><Ventas /></Layout></ProtectedRoute>} />
      <Route path="/inventario" element={<ProtectedRoute><Layout><Inventario /></Layout></ProtectedRoute>} />
      <Route path="/caja" element={<ProtectedRoute><Layout><Caja /></Layout></ProtectedRoute>} />
      <Route path="/gastos" element={<ProtectedRoute><Layout><Gastos /></Layout></ProtectedRoute>} />
      <Route path="/mermas" element={<ProtectedRoute><Layout><Mermas /></Layout></ProtectedRoute>} />
      <Route path="/reportes" element={<ProtectedRoute roles={['administrador','propietaria']}><Layout><Reportes /></Layout></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute roles={['administrador','propietaria']}><Layout><Usuarios /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}