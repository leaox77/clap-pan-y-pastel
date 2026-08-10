import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSucursal } from '../context/SucursalContext'

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d={d} />
  </svg>
)

const ICONS = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  ventas: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  inventario: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  caja: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  gastos: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  mermas: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  reservas: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  reportes: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  usuarios: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  sucursales: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  auditoria: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
}

const ALL_LINKS = [
  { to: '/', label: 'Dashboard', key: 'dashboard', roles: ['cajero','administrador','propietaria'] },
  { to: '/ventas', label: 'Ventas / POS', key: 'ventas', roles: ['cajero','administrador','propietaria'] },
  { to: '/reservas', label: 'Reservas', key: 'reservas', roles: ['cajero','administrador','propietaria'] },
  { to: '/inventario', label: 'Inventario', key: 'inventario', roles: ['cajero','administrador','propietaria'] },
  { to: '/caja', label: 'Caja', key: 'caja', roles: ['cajero','administrador','propietaria'] },
  { to: '/gastos', label: 'Gastos', key: 'gastos', roles: ['cajero','administrador','propietaria'] },
  { to: '/mermas', label: 'Mermas', key: 'mermas', roles: ['cajero','administrador','propietaria'] },
  { to: '/reportes', label: 'Reportes', key: 'reportes', roles: ['administrador','propietaria'] },
  { to: '/sucursales', label: 'Sucursales', key: 'sucursales', roles: ['administrador','propietaria'] },
  { to: '/usuarios', label: 'Usuarios', key: 'usuarios', roles: ['administrador','propietaria'] },
  { to: '/auditoria', label: 'Auditoría', key: 'auditoria', roles: ['administrador','propietaria'] },
]

export default function Sidebar() {
  const { user, role, fullName, signOut } = useAuth()
  const { sucursalActiva, sucursales, setSucursalActivaId } = useSucursal()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const links = ALL_LINKS.filter(l => l.roles.includes(role))
  const esAdmin = ['administrador', 'propietaria'].includes(role)
  const initials = (fullName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()

  async function handleSignOut() { await signOut(); navigate('/login') }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} className="mobile-menu-btn" aria-label="Menú">
        {open ? '×' : '☰'}
      </button>
      {open && <div onClick={() => setOpen(false)} className="mobile-overlay" />}

      <aside className={`clap-sidebar ${open ? 'open' : ''}`} style={{ width: 220, background: 'var(--bg)', borderRight: '1px solid var(--silver-light)', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--silver-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--yellow)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👏</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>CLAP</div>
              <div style={{ fontSize: 10, color: 'var(--text-soft)', letterSpacing: '.06em' }}>PAN Y PASTEL</div>
            </div>
          </div>
        </div>

        {/* Sucursal activa — solo admin ve el toggle */}
        {esAdmin && sucursales.length > 0 && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--silver-light)', background: 'var(--yellow-soft)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Viendo sucursal</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sucursales.map(s => (
                <button key={s.id} onClick={() => setSucursalActivaId(s.id)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left', transition: 'all .15s',
                    background: sucursalActiva?.id === s.id ? 'var(--yellow-dark)' : 'transparent',
                    color: sucursalActiva?.id === s.id ? '#fff' : 'var(--text-soft)' }}>
                  🏪 {s.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sucursal fija — cajero */}
        {role === 'cajero' && sucursalActiva && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--silver-light)', background: 'var(--bg-soft)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-soft)', marginBottom: 2 }}>Sucursal</p>
            <p style={{ fontSize: 12, fontWeight: 700 }}>🏪 {sucursalActiva.nombre}</p>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} onClick={() => setOpen(false)}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px',
                textDecoration: 'none', fontSize: 13, fontWeight: 500,
                color: isActive ? 'var(--text)' : 'var(--text-soft)',
                background: isActive ? 'var(--yellow-soft)' : 'transparent',
                borderRight: isActive ? '3px solid var(--yellow-dark)' : '3px solid transparent',
                transition: 'all .15s',
              })}>
              <Icon d={ICONS[l.key]} />
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--silver-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName ?? user?.email}</div>
              <div style={{ fontSize: 10, color: 'var(--text-soft)' }}>{role}</div>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-secondary" style={{ width: '100%', fontSize: 12, padding: '7px 12px' }}>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  )
}