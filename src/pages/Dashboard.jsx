import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const MetricCard = ({ label, value, badge, badgeType = 'ok', sub }) => (
  <div className="card" style={{ padding: '18px 20px' }}>
    <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</p>
    <p style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{value}</p>
    {badge && <span className={`badge-${badgeType}`}>{badge}</span>}
    {sub && <p style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 4 }}>{sub}</p>}
  </div>
)

export default function Dashboard() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState({ ventasHoy: 0, totalHoy: 0, stockBajo: [], ultimasVentas: [], gastoHoy: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const hoy = new Date().toISOString().split('T')[0]

    const [{ data: ventas }, { data: productos }, { data: gastos }] = await Promise.all([
      supabase.from('ventas').select('total, fecha, estado').gte('fecha', hoy).eq('estado', 'completada'),
      supabase.from('productos').select('id, nombre, stock_actual, stock_minimo').eq('activo', true),
      supabase.from('gastos').select('monto').gte('fecha', hoy),
    ])

    const { data: ultimas } = await supabase.from('ventas')
      .select('id, total, medio_pago, fecha, profiles(full_name)')
      .gte('fecha', hoy).eq('estado', 'completada')
      .order('fecha', { ascending: false }).limit(8)

    const bajo = (productos ?? []).filter(p => p.stock_actual <= p.stock_minimo)
    const totalHoy = (ventas ?? []).reduce((s, v) => s + Number(v.total), 0)
    const gastoTotal = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0)

    setData({ ventasHoy: ventas?.length ?? 0, totalHoy, stockBajo: bajo, ultimasVentas: ultimas ?? [], gastoHoy: gastoTotal })
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-soft)' }}>Cargando dashboard...</div>

  const { ventasHoy, totalHoy, stockBajo, ultimasVentas, gastoHoy } = data
  const hoy = new Date().toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ padding: 28, maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, textTransform: 'capitalize' }}>{hoy}</p>
      </div>

      {stockBajo.length > 0 && (
        <div style={{ background: 'var(--warn-bg)', borderLeft: '4px solid var(--warn)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--warn)' }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span><strong>Stock bajo:</strong> {stockBajo.map(p => `${p.nombre} (${p.stock_actual})`).join(' · ')}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        <MetricCard label="Ventas del día" value={ventasHoy} badge={ventasHoy > 0 ? 'Activo' : 'Sin ventas'} badgeType="ok" />
        <MetricCard label="Total del día" value={`Bs ${totalHoy.toFixed(2)}`} badge="Acumulado" badgeType="info" />
        <MetricCard label="Stock bajo" value={stockBajo.length} badge={stockBajo.length > 0 ? 'Revisar' : 'OK'} badgeType={stockBajo.length > 0 ? 'warn' : 'ok'} />
        {role !== 'cajero' && <MetricCard label="Gastos hoy" value={`Bs ${gastoHoy.toFixed(2)}`} badge="Caja chica" badgeType="warn" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Acciones rápidas */}
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Acciones rápidas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: '+ Nueva venta', path: '/ventas', color: 'var(--yellow)' },
              { label: 'Inventario', path: '/inventario', color: 'var(--silver-light)' },
              { label: 'Registrar gasto', path: '/gastos', color: 'var(--silver-light)' },
              { label: 'Ver reportes', path: '/reportes', color: 'var(--silver-light)', adminOnly: true },
            ].filter(a => !a.adminOnly || role !== 'cajero').map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className={a.color === 'var(--yellow)' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '12px', fontSize: 13, width: '100%' }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stock bajo */}
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Productos con stock bajo</h3>
          {stockBajo.length === 0
            ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>✓ Todos los productos tienen stock suficiente</p>
            : stockBajo.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                <span>{p.nombre}</span>
                <span className="badge-warn">{p.stock_actual} unid.</span>
              </div>
            ))}
        </div>
      </div>

      {/* Últimas ventas */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--silver-light)', display: 'flex', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Últimas ventas del día</h3>
        </div>
        <table className="clap-table">
          <thead><tr><th>Hora</th><th>Total</th><th>Medio de pago</th><th>Vendedor</th></tr></thead>
          <tbody>
            {ultimasVentas.length === 0
              ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin ventas registradas hoy</td></tr>
              : ultimasVentas.map(v => (
                <tr key={v.id}>
                  <td>{new Date(v.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ fontWeight: 600 }}>Bs {Number(v.total).toFixed(2)}</td>
                  <td><span className="badge-info">{v.medio_pago}</span></td>
                  <td style={{ color: 'var(--text-soft)' }}>{v.profiles?.full_name ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}