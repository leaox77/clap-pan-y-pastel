import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const PERIODOS = [
  { key: 'hoy', label: 'Hoy' }, { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' }, { key: 'trimestre', label: 'Trimestre' },
  { key: 'custom', label: 'Personalizado' },
]

function rangoParaPeriodo(periodo) {
  const ahora = new Date(); const hoy = ahora.toISOString().split('T')[0]
  if (periodo === 'hoy') return { desde: hoy, hasta: hoy }
  if (periodo === 'semana') { const lunes = new Date(ahora); lunes.setDate(ahora.getDate() - ahora.getDay() + 1); return { desde: lunes.toISOString().split('T')[0], hasta: hoy } }
  if (periodo === 'mes') return { desde: `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-01`, hasta: hoy }
  if (periodo === 'trimestre') { const inicio = new Date(ahora); inicio.setMonth(ahora.getMonth() - 3); return { desde: inicio.toISOString().split('T')[0], hasta: hoy } }
  return null
}

export default function Reportes() {
  const [periodo, setPeriodo] = useState('hoy')
  const [custom, setCustom] = useState({ desde: '', hasta: '' })
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (periodo !== 'custom') cargarDatos() }, [periodo])

  async function cargarDatos() {
    const rango = periodo === 'custom' ? custom : rangoParaPeriodo(periodo)
    if (!rango?.desde) return
    setLoading(true)

    const [{ data: ventas }, { data: items }, { data: gastos }, { data: mermas }] = await Promise.all([
      supabase.from('ventas').select('id,total,medio_pago,fecha,estado').gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`).eq('estado', 'completada'),
      supabase.from('venta_items').select('cantidad,subtotal,costo_unitario_snapshot,created_at,productos(nombre)').gte('created_at', `${rango.desde}T00:00:00`).lte('created_at', `${rango.hasta}T23:59:59`),
      supabase.from('gastos').select('monto,categoria').gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`),
      supabase.from('inventario_movimientos').select('cantidad,tipo').like('tipo', 'merma%').gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`),
    ])

    const totalVentas = (ventas ?? []).reduce((s, v) => s + Number(v.total), 0)
    const totalGastos = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0)
    const costo = (items ?? []).reduce((s, i) => s + Number(i.costo_unitario_snapshot) * Number(i.cantidad), 0)
    const utilidad = totalVentas - costo

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

    setDatos({ totalVentas, totalTx: ventas?.length ?? 0, totalGastos, costo, utilidad, porMedio, topSorted, porHora, mermasTotales: (mermas ?? []).reduce((s, m) => s + Math.abs(Number(m.cantidad)), 0) })
    setLoading(false)
  }

  const maxHora = datos ? Math.max(...Object.values(datos.porHora), 1) : 1

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1, minWidth: 200 }}>Reportes gerenciales</h2>
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
        {periodo === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" className="form-input" style={{ width: 'auto' }} value={custom.desde} onChange={e => setCustom(c => ({ ...c, desde: e.target.value }))} />
            <span style={{ color: 'var(--text-soft)', fontSize: 13 }}>—</span>
            <input type="date" className="form-input" style={{ width: 'auto' }} value={custom.hasta} onChange={e => setCustom(c => ({ ...c, hasta: e.target.value }))} />
            <button className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={cargarDatos}>Aplicar</button>
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-soft)', padding: 20 }}>Cargando datos...</div>}

      {datos && !loading && (
        <>
          <div className="grid-4" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(5,1fr)' }}>
            {[
              ['Ventas totales', `Bs ${datos.totalVentas.toFixed(2)}`],
              ['Transacciones', datos.totalTx],
              ['Costo', `Bs ${datos.costo.toFixed(2)}`],
              ['Utilidad bruta', `Bs ${datos.utilidad.toFixed(2)}`],
              ['Mermas (unid.)', datos.mermasTotales],
            ].map(([l, v], i) => (
              <div key={l} className="card" style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: 10, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{l}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: i === 3 ? 'var(--ok)' : i === 4 ? 'var(--err)' : 'var(--text)' }}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Ventas por hora</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, borderBottom: '1px solid var(--silver-light)', paddingBottom: 2, overflowX: 'auto' }}>
                {Array.from({ length: 16 }, (_, i) => i + 6).map(h => {
                  const v = datos.porHora[h] ?? 0
                  const h2 = Math.round((v / maxHora) * 100)
                  return <div key={h} title={`${h}:00 — Bs ${v.toFixed(2)}`} style={{ flex: 1, minWidth: 8, background: h2 === 100 ? 'var(--yellow-dark)' : 'var(--silver-light)', borderRadius: '3px 3px 0 0', height: `${Math.max(h2, 2)}%`, cursor: 'help' }} />
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-soft)', marginTop: 4 }}>
                {['6am','8','10','12','2pm','4','6','8','9pm'].map(l => <span key={l}>{l}</span>)}
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Por medio de pago</h3>
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

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Productos más vendidos</h3>
            </div>
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
        </>
      )}
    </div>
  )
}