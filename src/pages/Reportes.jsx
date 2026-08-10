import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useSucursal } from '../context/SucursalContext'

const PERIODOS = [
  { key: 'hoy', label: 'Hoy' }, { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' }, { key: 'trimestre', label: 'Trimestre' },
  { key: 'custom', label: 'Personalizado' },
]

function rangoParaPeriodo(p) {
  const ahora = new Date(); const hoy = ahora.toISOString().split('T')[0]
  if (p === 'hoy') return { desde: hoy, hasta: hoy }
  if (p === 'semana') { const l = new Date(ahora); l.setDate(ahora.getDate() - ahora.getDay() + 1); return { desde: l.toISOString().split('T')[0], hasta: hoy } }
  if (p === 'mes') return { desde: `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-01`, hasta: hoy }
  if (p === 'trimestre') { const i = new Date(ahora); i.setMonth(ahora.getMonth() - 3); return { desde: i.toISOString().split('T')[0], hasta: hoy } }
  return null
}

export default function Reportes() {
  const { sucursalActivaId, sucursalActiva, sucursales, setSucursalActivaId } = useSucursal()
  const [periodo, setPeriodo] = useState('hoy')
  const [custom, setCustom] = useState({ desde: '', hasta: '' })
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  useEffect(() => { if (periodo !== 'custom' && sucursalActivaId) cargarDatos() }, [periodo, sucursalActivaId, verTodas])

  async function cargarDatos() {
    const rango = periodo === 'custom' ? custom : rangoParaPeriodo(periodo)
    if (!rango?.desde) return
    setLoading(true)

    const filtroSuc = verTodas ? {} : { sucursal_id: sucursalActivaId }

    let qVentas = supabase.from('ventas').select('id,total,medio_pago,fecha,estado,sucursales(nombre),profiles(full_name)')
      .gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`).eq('estado', 'completada')
    let qItems = supabase.from('venta_items').select('cantidad,subtotal,costo_unitario_snapshot,created_at,productos(nombre)')
      .gte('created_at', `${rango.desde}T00:00:00`).lte('created_at', `${rango.hasta}T23:59:59`)
    let qGastos = supabase.from('gastos').select('monto,categoria').gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`)
    let qMermas = supabase.from('inventario_movimientos').select('cantidad,tipo').in('tipo', [
  'merma_danado',
  'merma_vencido',
  'merma_consumo_interno',
  'merma_degustacion',
  'merma_donacion',
  'merma_regalo',
  'merma_diferencia',
])
      .gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`)
    let qReservas = supabase.from('vista_reservas').select('total,estado,medio_pago,created_at,sucursal_id')
      .gte('created_at', `${rango.desde}T00:00:00`).lte('created_at', `${rango.hasta}T23:59:59`)

    if (!verTodas && sucursalActivaId) {
      qVentas = qVentas.eq('sucursal_id', sucursalActivaId)
      qGastos = qGastos.eq('sucursal_id', sucursalActivaId)
      qMermas = qMermas.eq('sucursal_id', sucursalActivaId)
      qReservas = qReservas.eq('sucursal_id', sucursalActivaId)
    }

    const [{ data: ventas }, { data: items }, { data: gastos }, { data: mermas }, { data: reservas }] = await Promise.all([qVentas, qItems, qGastos, qMermas, qReservas])

    const totalVentas = (ventas ?? []).reduce((s, v) => s + Number(v.total), 0)
    const costo = (items ?? []).reduce((s, i) => s + Number(i.costo_unitario_snapshot) * Number(i.cantidad), 0)
    const reservasEntregadas = (reservas ?? []).filter(r => r.estado === 'entregada')
    const reservasPendientes = (reservas ?? []).filter(r => r.estado === 'pendiente')
    const reservasCanceladas = (reservas ?? []).filter(r => r.estado === 'cancelada')

    const porMedio = (ventas ?? []).reduce((acc, v) => { acc[v.medio_pago] = (acc[v.medio_pago] ?? 0) + Number(v.total); return acc }, {})

    const topProd = {}
    ;(items ?? []).forEach(i => {
      const n = i.productos?.nombre ?? 'Desconocido'
      if (!topProd[n]) topProd[n] = { cantidad: 0, total: 0 }
      topProd[n].cantidad += Number(i.cantidad); topProd[n].total += Number(i.subtotal)
    })
    const topSorted = Object.entries(topProd).sort((a, b) => b[1].total - a[1].total).slice(0, 8)

    const porHora = {}
    ;(ventas ?? []).forEach(v => { const h = new Date(v.fecha).getHours(); porHora[h] = (porHora[h] ?? 0) + Number(v.total) })

    setDatos({
      totalVentas, totalTx: ventas?.length ?? 0, costo, utilidad: totalVentas - costo,
      porMedio, topSorted, porHora,
      mermasTotales: (mermas ?? []).reduce((s, m) => s + Math.abs(Number(m.cantidad)), 0),
      ultimasVentas: (ventas ?? []).slice(0, 15),
      reservasEntregadas: reservasEntregadas.length,
      reservasPendientes: reservasPendientes.length,
      reservasCanceladas: reservasCanceladas.length,
    })
    setLoading(false)
  }

  const maxHora = datos ? Math.max(...Object.values(datos.porHora), 1) : 1
  const HORAS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]
  const HORA_LABELS = { 6:'6am', 8:'8am', 10:'10', 12:'12', 14:'2pm', 16:'4', 18:'6pm', 20:'8', 21:'9pm' }

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Reportes gerenciales</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                background: periodo === p.key ? 'var(--text)' : 'transparent',
                color: periodo === p.key ? '#fff' : 'var(--text-soft)',
                borderColor: periodo === p.key ? 'var(--text)' : 'var(--silver-light)' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros de sucursal + fecha custom */}
      <div className="toolbar-wrap" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {sucursales.length > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={verTodas} onChange={e => setVerTodas(e.target.checked)}
                style={{ accentColor: 'var(--yellow-dark)', width: 16, height: 16 }} />
              Ver todas las sucursales
            </label>
            {!verTodas && (
              <select className="form-input form-select" style={{ width: 'auto', fontSize: 12 }}
                value={sucursalActivaId ?? ''} onChange={e => setSucursalActivaId(e.target.value)}>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            )}
          </div>
        )}
        {periodo === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" className="form-input" style={{ width: 'auto' }} value={custom.desde} onChange={e => setCustom(c => ({ ...c, desde: e.target.value }))} />
            <span style={{ color: 'var(--text-soft)' }}>—</span>
            <input type="date" className="form-input" style={{ width: 'auto' }} value={custom.hasta} onChange={e => setCustom(c => ({ ...c, hasta: e.target.value }))} />
            <button className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={cargarDatos}>Aplicar</button>
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-soft)', padding: 20 }}>Cargando...</div>}

      {datos && !loading && (
        <>
          {/* KPIs ventas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }} className="grid-4">
            {[
              ['Ventas', `Bs ${datos.totalVentas.toFixed(2)}`],
              ['Transacciones', datos.totalTx],
              ['Costo', `Bs ${datos.costo.toFixed(2)}`],
              ['Utilidad', `Bs ${datos.utilidad.toFixed(2)}`],
              ['Mermas', datos.mermasTotales],
            ].map(([l, v], i) => (
              <div key={l} className="card" style={{ padding: '12px 16px' }}>
                <p style={{ fontSize: 10, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{l}</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: i === 3 ? 'var(--ok)' : i === 4 ? 'var(--err)' : 'var(--text)' }}>{v}</p>
              </div>
            ))}
          </div>

          {/* KPIs reservas */}
          <div className="grid-3" style={{ marginBottom: 20 }}>
            {[
              ['📌 Reservas entregadas', datos.reservasEntregadas, 'ok'],
              ['⏳ Reservas pendientes', datos.reservasPendientes, 'warn'],
              ['❌ Reservas canceladas', datos.reservasCanceladas, 'err'],
            ].map(([l, v, t]) => (
              <div key={l} className="card" style={{ padding: '12px 16px' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 4 }}>{l}</p>
                <p style={{ fontSize: 22, fontWeight: 700 }}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            {/* Gráfico por hora */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Ventas por hora</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, borderBottom: '1px solid var(--silver-light)', paddingBottom: 2 }}>
                {HORAS.map(h => {
                  const v = datos.porHora[h] ?? 0
                  const pct = Math.round((v / maxHora) * 100)
                  return (
                    <div key={`hora-${h}`} title={`${h}:00 — Bs ${v.toFixed(2)}`}
                      style={{ flex: 1, background: pct === 100 ? 'var(--yellow-dark)' : 'var(--silver-light)', borderRadius: '3px 3px 0 0', height: `${Math.max(pct, 2)}%`, cursor: 'help' }} />
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-soft)', marginTop: 4 }}>
                {HORAS.map(h => <span key={`lbl-${h}`}>{HORA_LABELS[h] ?? ''}</span>)}
              </div>
            </div>

            {/* Por medio de pago */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Por medio de pago</h3>
              {Object.entries(datos.porMedio).length === 0
                ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin datos</p>
                : Object.entries(datos.porMedio).map(([m, v]) => {
                  const pct = datos.totalVentas > 0 ? (v / datos.totalVentas * 100) : 0
                  return (
                    <div key={m} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ textTransform: 'capitalize' }}>{m}</span>
                        <span style={{ fontWeight: 600 }}>Bs {v.toFixed(2)} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--silver-light)', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--yellow-dark)', borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Top productos */}
          <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700 }}>Productos más vendidos</div>
            <div className="table-scroll">
              <table className="clap-table">
                <thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Total vendido</th></tr></thead>
                <tbody>
                  {datos.topSorted.length === 0
                    ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin datos</td></tr>
                    : datos.topSorted.map(([nombre, d], idx) => (
                      <tr key={nombre}>
                        <td style={{ color: 'var(--text-soft)', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{nombre}</td>
                        <td>{d.cantidad}</td>
                        <td style={{ fontWeight: 700, color: 'var(--ok)' }}>Bs {d.total.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Últimas ventas con sucursal y vendedor */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700 }}>Últimas ventas</div>
            <div className="table-scroll">
              <table className="clap-table">
                <thead><tr><th>Hora</th><th>Total</th><th>Medio</th><th>Vendedor</th><th>Sucursal</th></tr></thead>
                <tbody>
                  {datos.ultimasVentas.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin datos</td></tr>
                    : datos.ultimasVentas.map(v => (
                      <tr key={v.id}>
                        <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>{new Date(v.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ fontWeight: 700 }}>Bs {Number(v.total).toFixed(2)}</td>
                        <td><span className="badge-info">{v.medio_pago}</span></td>
                        <td style={{ color: 'var(--text-soft)', fontSize: 12 }}>{v.profiles?.full_name ?? '—'}</td>
                        <td style={{ fontSize: 12 }}>{v.sucursales?.nombre ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}