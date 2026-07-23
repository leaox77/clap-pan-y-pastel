import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const hoy = new Date().toISOString().split('T')[0]

    const [{ data: ventas }, { data: productos }, { data: sesion }, { data: gastos }] = await Promise.all([
      supabase.from('ventas').select('total, medio_pago, estado').gte('fecha', hoy).eq('estado', 'completada'),
      supabase.from('productos').select('id, nombre, stock_actual, stock_minimo, es_pan').eq('activo', true),
      supabase.from('caja_sesiones').select('*, profiles!usuario_apertura_id(full_name)').eq('estado', 'abierta').limit(1).maybeSingle(),
      supabase.from('gastos').select('monto').gte('fecha', hoy),
    ])

    const { data: ultimas } = await supabase.from('ventas')
      .select('id, total, medio_pago, fecha, profiles(full_name)')
      .gte('fecha', hoy).eq('estado', 'completada')
      .order('fecha', { ascending: false }).limit(6)

    const totalHoy = (ventas ?? []).reduce((s, v) => s + Number(v.total), 0)
    const gastoTotal = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0)
    const bajo = (productos ?? []).filter(p => p.stock_actual <= p.stock_minimo)
    const panInfo = sesion ? { inicial: Number(sesion.total_pan_inicial ?? 0), sobrante: Number(sesion.pan_sobrante_anterior ?? 0) } : null

    setData({ ventas: ventas ?? [], totalHoy, gastoTotal, bajo, sesion, ultimas: ultimas ?? [], panInfo })
    setLoading(false)
  }

  if (loading) return <div className="page-wrap" style={{ color: 'var(--text-soft)' }}>Cargando...</div>

  const { ventas, totalHoy, gastoTotal, bajo, sesion, ultimas, panInfo } = data
  const hoy = new Date().toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const ventasEfectivo = ventas.filter(v => v.medio_pago === 'efectivo').reduce((s, v) => s + Number(v.total), 0)
  const ventasQR = ventas.filter(v => v.medio_pago === 'qr').reduce((s, v) => s + Number(v.total), 0)

  return (
    <div className="page-wrap">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, textTransform: 'capitalize' }}>{hoy}</p>
      </div>

      {/* Estado del turno */}
      {sesion ? (
        <div style={{ background: 'var(--ok-bg)', borderLeft: '4px solid var(--ok)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>✓ Turno {sesion.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'} activo</span>
          {panInfo && <span>— {panInfo.inicial} panes registrados</span>}
          <button onClick={() => navigate('/caja')} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--ok)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: 'var(--ok)', fontWeight: 600, fontSize: 12 }}>Ver caja →</button>
        </div>
      ) : (
        <div style={{ background: 'var(--warn-bg)', borderLeft: '4px solid var(--warn)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>⚠ No hay turno activo</span>
          <button onClick={() => navigate('/caja')} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--warn)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: 'var(--warn)', fontWeight: 600, fontSize: 12 }}>Iniciar turno →</button>
        </div>
      )}

      {bajo.length > 0 && (
        <div style={{ background: 'var(--err-bg)', borderLeft: '4px solid var(--err)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--err)' }}>
          ⚠ <strong>Stock bajo:</strong> {bajo.map(p => `${p.nombre} (${p.stock_actual})`).join(' · ')}
        </div>
      )}

      {/* Métricas */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[
          ['Ventas hoy', ventas.length, '', 'info'],
          ['Total del día', `Bs ${totalHoy.toFixed(2)}`, '', 'ok'],
          ['Efectivo', `Bs ${ventasEfectivo.toFixed(2)}`, '', 'ok'],
          ['QR', `Bs ${ventasQR.toFixed(2)}`, '', 'info'],
        ].map(([l, v, b, t]) => (
          <div key={l} className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{l}</p>
            <p style={{ fontSize: 22, fontWeight: 700 }}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Acciones rápidas */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Acciones rápidas</h3>
          <div className="grid-2" style={{ gap: 10 }}>
            {[
              { label: '🍞 Vender panes', path: '/ventas' },
              { label: '📦 Inventario', path: '/inventario' },
              { label: '💵 Gastos', path: '/gastos' },
              { label: '📊 Reportes', path: '/reportes', adminOnly: true },
            ].filter(a => !a.adminOnly || role !== 'cajero').map((a, idx) => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className={idx === 0 ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '13px', fontSize: 13, width: '100%' }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stock bajo */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Stock bajo</h3>
          {bajo.length === 0
            ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>✓ Todo el stock OK</p>
            : bajo.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13, gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                <span className="badge-warn" style={{ flexShrink: 0 }}>{p.stock_actual}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Últimas ventas */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700, fontSize: 15 }}>Últimas ventas del día</div>
        <div className="table-scroll">
          <table className="clap-table">
            <thead><tr><th>Hora</th><th>Total</th><th>Medio</th><th>Vendedor</th></tr></thead>
            <tbody>
              {ultimas.length === 0
                ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin ventas hoy</td></tr>
                : ultimas.map(v => (
                  <tr key={v.id}>
                    <td style={{ color: 'var(--text-soft)' }}>{new Date(v.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ fontWeight: 700 }}>Bs {Number(v.total).toFixed(2)}</td>
                    <td><span className="badge-info">{v.medio_pago}</span></td>
                    <td style={{ color: 'var(--text-soft)' }}>{v.profiles?.full_name ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}