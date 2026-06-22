import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) { setError('Credenciales incorrectas. Intenta nuevamente.'); return }
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-soft)' }}>
      {/* Panel izquierdo */}
      <div style={{ width: '42%', background: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>👏</div>
        <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>CLAP</h1>
        <p style={{ color: 'var(--silver)', fontSize: 13, textAlign: 'center', letterSpacing: '.06em', marginBottom: 32 }}>PAN Y PASTEL — GESTIÓN</p>
        <div style={{ width: '100%', background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Control de ventas en tiempo real','Inventario y stock diario','Caja y arqueo automático','Reportes gerenciales','Gestión de mermas y gastos'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--silver-light)' }}>
              <div style={{ width: 20, height: 20, background: 'var(--yellow)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text)', flexShrink: 0 }}>✓</div>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Panel derecho */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Iniciar sesión</h2>
          <p style={{ color: 'var(--text-soft)', fontSize: 14, marginBottom: 28 }}>Ingresa tus credenciales para acceder al sistema</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">Correo electrónico</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@panaderia.com" required autoComplete="email" />
            </div>
            <div>
              <label className="form-label">Contraseña</label>
              <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && (
              <div style={{ background: 'var(--err-bg)', color: 'var(--err)', padding: '10px 14px', borderRadius: 8, fontSize: 13, borderLeft: '3px solid var(--err)' }}>
                {error}
              </div>
            )}
            <button className="btn-primary" type="submit" disabled={loading} style={{ padding: '13px', fontSize: 15, marginTop: 4 }}>
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}