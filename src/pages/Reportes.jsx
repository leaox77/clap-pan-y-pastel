import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useSucursal } from '../context/SucursalContext'

const PERIODOS = [{ key: 'hoy', label: 'Hoy' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }, { key: 'trimestre', label: 'Trimestre' }, { key: 'custom', label: 'Personalizado' }]
const HORAS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]
const HORA_LABELS = { 6:'6am', 8:'8am', 10:'10', 12:'12', 14:'2pm', 16:'4', 18:'6pm', 20:'8', 21:'9pm' }

function fechaLocal(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function rangoParaPeriodo(p) { const ahora = new Date(); const hoy = fechaLocal(ahora); if (p === 'hoy') return { desde: hoy, hasta: hoy }; if (p === 'semana') { const inicio = new Date(ahora); const dia = inicio.getDay(); inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1)); return { desde: fechaLocal(inicio), hasta: hoy } } if (p === 'mes') return { desde: `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`, hasta: hoy }; if (p === 'trimestre') { const inicio = new Date(ahora); inicio.setMonth(inicio.getMonth() - 3); return { desde: fechaLocal(inicio), hasta: hoy } } return null }

export default function Reportes() {
  const { sucursalActivaId, sucursales, setSucursalActivaId } = useSucursal()
  const [periodo, setPeriodo] = useState('hoy')
  const [custom, setCustom] = useState({ desde: '', hasta: '' })
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  useEffect(() => { if (periodo !== 'custom' && sucursalActivaId) cargarDatos() }, [periodo, sucursalActivaId, verTodas])

  async function cargarDatos() {
    const rango = periodo === 'custom' ? custom : rangoParaPeriodo(periodo)
    if (!rango?.desde || !rango?.hasta) return
    setLoading(true)
    try {
      let qVentas = supabase.from('ventas').select('id,total,medio_pago,fecha,estado,usuario_id,sucursal_id').gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`).eq('estado', 'completada').order('fecha', { ascending: false })
      let qGastos = supabase.from('gastos').select('monto,categoria,fecha,sucursal_id').gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`)
      let qMermas = supabase.from('inventario_movimientos').select('cantidad,tipo,fecha,sucursal_id').in('tipo', ['merma_danado','merma_vencido','merma_consumo_interno','merma_degustacion','merma_donacion','merma_regalo','merma_diferencia']).gte('fecha', `${rango.desde}T00:00:00`).lte('fecha', `${rango.hasta}T23:59:59`)
      let qReservas = supabase.from('vista_reservas').select('total,estado,medio_pago,created_at,sucursal_id').gte('created_at', `${rango.desde}T00:00:00`).lte('created_at', `${rango.hasta}T23:59:59`)
      if (!verTodas && sucursalActivaId) { qVentas = qVentas.eq('sucursal_id', sucursalActivaId); qGastos = qGastos.eq('sucursal_id', sucursalActivaId); qMermas = qMermas.eq('sucursal_id', sucursalActivaId); qReservas = qReservas.eq('sucursal_id', sucursalActivaId) }
      const [ventasResult, gastosResult, mermasResult, reservasResult] = await Promise.all([qVentas, qGastos, qMermas, qReservas])
      const errores = [ventasResult, gastosResult, mermasResult, reservasResult].filter(r => r.error)
      if (errores.length) { console.error('Errores Reportes:', errores); setDatos(null); setLoading(false); return }
      const ventas = ventasResult.data ?? []
      const ventaIds = ventas.map(v => v.id)
      let items = []
      if (ventaIds.length) {
        // 🔥 MODIFICADO: Traer ganancia
        const { data, error } = await supabase.from('venta_items').select('venta_id,cantidad,subtotal,costo_unitario_snapshot,ganancia,productos(nombre)').in('venta_id', ventaIds)
        if (error) throw error
        items = data ?? []
      }
      let sucursalesMap = {}
      const sucIds = [...new Set(ventas.map(v => v.sucursal_id).filter(Boolean))]
      if (sucIds.length) { const { data } = await supabase.from('sucursales').select('id,nombre').in('id', sucIds); sucursalesMap = Object.fromEntries((data ?? []).map(s => [s.id, s.nombre])) }
      let perfilesMap = {}
      const userIds = [...new Set(ventas.map(v => v.usuario_id).filter(Boolean))]
      if (userIds.length) { const { data } = await supabase.from('profiles').select('id,full_name').in('id', userIds); perfilesMap = Object.fromEntries((data ?? []).map(p => [p.id, p.full_name])) }
      const gastos = gastosResult.data ?? []
      const mermas = mermasResult.data ?? []
      const reservas = reservasResult.data ?? []
      const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0)
      const costo = items.reduce((s, i) => s + Number(i.costo_unitario_snapshot || 0) * Number(i.cantidad || 0), 0)
      const totalGastos = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)
      const utilidadBruta = totalVentas - costo
      const utilidadNeta = utilidadBruta - totalGastos
      const porMedio = ventas.reduce((acc, v) => { acc[v.medio_pago] = (acc[v.medio_pago] ?? 0) + Number(v.total || 0); return acc }, {})
      const topProd = {}
      items.forEach(i => { 
        const n = i.productos?.nombre ?? 'Desconocido'
        if (!topProd[n]) topProd[n] = { cantidad: 0, total: 0, costo: 0, ganancia: 0 } // 🔥 NUEVO: agregar ganancia
        topProd[n].cantidad += Number(i.cantidad || 0)
        topProd[n].total += Number(i.subtotal || 0)
        topProd[n].costo += Number(i.costo_unitario_snapshot || 0) * Number(i.cantidad || 0)
        topProd[n].ganancia += Number(i.ganancia || 0) // 🔥 NUEVO
      })
      const topSorted = Object.entries(topProd).sort((a, b) => b[1].total - a[1].total).slice(0, 10)
      const porHora = {}
      ventas.forEach(v => { const h = new Date(v.fecha).getHours(); porHora[h] = (porHora[h] ?? 0) + Number(v.total || 0) })
      const porDia = {}
      ventas.forEach(v => { const d = fechaLocal(new Date(v.fecha)); if (!porDia[d]) porDia[d] = { ventas: 0, transacciones: 0 }; porDia[d].ventas += Number(v.total || 0); porDia[d].transacciones += 1 })
      
      // 🔥 NUEVO: Calcular ganancia total
      const gananciaTotal = items.reduce((s, i) => s + Number(i.ganancia || 0), 0)
      
      setDatos({ 
        totalVentas, 
        totalTx: ventas.length, 
        costo, 
        totalGastos, 
        utilidadBruta, 
        utilidadNeta, 
        porMedio, 
        topSorted, 
        porHora, 
        porDia, 
        mermasTotales: mermas.reduce((s, m) => s + Math.abs(Number(m.cantidad || 0)), 0), 
        ultimasVentas: ventas.slice(0, 15).map(v => ({ 
          ...v, 
          vendedor: perfilesMap[v.usuario_id] ?? '—', 
          sucursal: sucursalesMap[v.sucursal_id] ?? '—',
          ganancia: items.filter(i => i.venta_id === v.id).reduce((s, i) => s + Number(i.ganancia || 0), 0) // 🔥 NUEVO
        })),
        reservasEntregadas: reservas.filter(r => r.estado === 'entregada').length,
        reservasPendientes: reservas.filter(r => r.estado === 'pendiente').length,
        reservasCanceladas: reservas.filter(r => r.estado === 'cancelada').length,
        gananciaTotal // 🔥 NUEVO
      })
    } catch (error) { console.error('Error Reportes:', error); setDatos(null) } finally { setLoading(false) }
  }

  const maxHora = datos ? Math.max(...Object.values(datos.porHora), 1) : 1
  const diasOrdenados = datos ? Object.entries(datos.porDia).sort((a,b) => a[0].localeCompare(b[0])) : []

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 20 }}><h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Reportes gerenciales</h2><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{PERIODOS.map(p => <button key={p.key} onClick={() => setPeriodo(p.key)} style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid', fontSize: 12, cursor: 'pointer', fontWeight: 500, background: periodo === p.key ? 'var(--text)' : 'transparent', color: periodo === p.key ? '#fff' : 'var(--text-soft)', borderColor: periodo === p.key ? 'var(--text)' : 'var(--silver-light)' }}>{p.label}</button>)}</div></div>
      <div className="toolbar-wrap" style={{ marginBottom: 16, flexWrap: 'wrap' }}>{sucursales.length > 1 && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={verTodas} onChange={e => setVerTodas(e.target.checked)} style={{ accentColor: 'var(--yellow-dark)', width: 16, height: 16 }} />Ver todas las sucursales</label>{!verTodas && <select className="form-input form-select" style={{ width: 'auto', fontSize: 12 }} value={sucursalActivaId ?? ''} onChange={e => setSucursalActivaId(e.target.value)}>{sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>}</div>}{periodo === 'custom' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><input type="date" className="form-input" style={{ width: 'auto' }} value={custom.desde} onChange={e => setCustom(c => ({ ...c, desde: e.target.value }))} /><span>—</span><input type="date" className="form-input" style={{ width: 'auto' }} value={custom.hasta} onChange={e => setCustom(c => ({ ...c, hasta: e.target.value }))} /><button className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={cargarDatos}>Aplicar</button></div>}</div>
      {loading && <div style={{ color: 'var(--text-soft)', padding: 20 }}>Cargando...</div>}
      {datos && !loading && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }} className="grid-4">
          {[
            ['Ventas',`Bs ${datos.totalVentas.toFixed(2)}`],
            ['Transacciones',datos.totalTx],
            ['Costo',`Bs ${datos.costo.toFixed(2)}`],
            ['Utilidad bruta',`Bs ${datos.utilidadBruta.toFixed(2)}`],
            ['Gastos',`Bs ${datos.totalGastos.toFixed(2)}`],
            ['Utilidad neta',`Bs ${datos.utilidadNeta.toFixed(2)}`]
          ].map(([l,v],i) => <div key={l} className="card" style={{ padding: '12px 16px' }}><p style={{ fontSize: 10, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p><p style={{ fontSize: 18, fontWeight: 700, color: l.includes('Utilidad') ? (l === 'Utilidad bruta' ? (datos.utilidadBruta >= 0 ? 'var(--ok)' : 'var(--err)') : (datos.utilidadNeta >= 0 ? 'var(--ok)' : 'var(--err)')) : 'var(--text)' }}>{v}</p></div>)}
        </div>
        
        {/* 🔥 NUEVO: Tarjeta de Ganancia Total */}
        <div className="card" style={{ padding: '12px 16px', marginBottom: 20, background: 'var(--ok-bg)', borderLeft: '4px solid var(--ok)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>💰 Ganancia Total</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--ok)' }}>Bs {datos.gananciaTotal.toFixed(2)}</p>
        </div>
        
        <div className="grid-3" style={{ marginBottom: 20 }}>{[['📌 Reservas entregadas',datos.reservasEntregadas],['⏳ Reservas pendientes',datos.reservasPendientes],['❌ Reservas canceladas',datos.reservasCanceladas]].map(([l,v]) => <div key={l} className="card" style={{ padding: '12px 16px' }}><p style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 4 }}>{l}</p><p style={{ fontSize: 22, fontWeight: 700 }}>{v}</p></div>)}</div>
        <div className="grid-2" style={{ marginBottom: 20 }}><div className="card" style={{ padding: 20 }}><h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Ventas por hora</h3><div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, borderBottom: '1px solid var(--silver-light)', paddingBottom: 2 }}>{HORAS.map(h => { const v = datos.porHora[h] ?? 0; const pct = Math.round((v / maxHora) * 100); return <div key={h} title={`${h}:00 — Bs ${v.toFixed(2)}`} style={{ flex: 1, background: v > 0 ? 'var(--yellow-dark)' : 'var(--silver-light)', borderRadius: '3px 3px 0 0', height: `${Math.max(v > 0 ? pct : 0, v > 0 ? 3 : 0)}%`, minHeight: v > 0 ? 3 : 0 }} /> })}</div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-soft)', marginTop: 4 }}>{HORAS.map(h => <span key={h}>{HORA_LABELS[h] ?? ''}</span>)}</div></div><div className="card" style={{ padding: 20 }}><h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Por medio de pago</h3>{Object.entries(datos.porMedio).length === 0 ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin datos</p> : Object.entries(datos.porMedio).map(([m,v]) => { const pct = datos.totalVentas > 0 ? v / datos.totalVentas * 100 : 0; return <div key={m} style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ textTransform: 'capitalize' }}>{m}</span><span style={{ fontWeight: 600 }}>Bs {v.toFixed(2)} ({pct.toFixed(1)}%)</span></div><div style={{ height: 6, background: 'var(--silver-light)', borderRadius: 3 }}><div style={{ height: '100%', width: `${pct}%`, background: 'var(--yellow-dark)', borderRadius: 3 }} /></div></div> })}</div></div>
        {diasOrdenados.length > 1 && <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}><div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700 }}>Resumen diario</div><div className="table-scroll"><table className="clap-table"><thead><tr><th>Fecha</th><th>Ventas</th><th>Transacciones</th></tr></thead><tbody>{diasOrdenados.map(([d,v]) => <tr key={d}><td>{new Date(`${d}T12:00:00`).toLocaleDateString('es-BO')}</td><td style={{ fontWeight: 700 }}>Bs {v.ventas.toFixed(2)}</td><td>{v.transacciones}</td></tr>)}</tbody></table></div></div>}
        
        {/* 🔥 MODIFICADO: Productos más vendidos con columna de ganancia */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}><div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700 }}>Productos más vendidos</div><div className="table-scroll"><table className="clap-table"><thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Total vendido</th><th>Costo</th><th>💰 Ganancia</th></tr></thead><tbody>{datos.topSorted.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin datos</td></tr> : datos.topSorted.map(([nombre,d],idx) => <tr key={nombre}><td>{idx + 1}</td><td style={{ fontWeight: 600 }}>{nombre}</td><td>{d.cantidad}</td><td style={{ fontWeight: 700 }}>Bs {d.total.toFixed(2)}</td><td>Bs {d.costo.toFixed(2)}</td><td style={{ fontWeight: 700, color: 'var(--ok)' }}>Bs {d.ganancia.toFixed(2)}</td></tr>)}</tbody></table></div></div>
        
        {/* 🔥 MODIFICADO: Últimas ventas con columna de ganancia */}
        <div className="card" style={{ overflow: 'hidden' }}><div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700 }}>Últimas ventas</div><div className="table-scroll"><table className="clap-table"><thead><tr><th>Hora</th><th>Total</th><th>Medio</th><th>Vendedor</th><th>Sucursal</th><th>💰 Ganancia</th></tr></thead><tbody>{datos.ultimasVentas.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin datos</td></tr> : datos.ultimasVentas.map(v => <tr key={v.id}><td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>{new Date(v.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td><td style={{ fontWeight: 700 }}>Bs {Number(v.total).toFixed(2)}</td><td><span className="badge-info">{v.medio_pago}</span></td><td style={{ color: 'var(--text-soft)', fontSize: 12 }}>{v.vendedor}</td><td style={{ fontSize: 12 }}>{v.sucursal}</td><td style={{ fontWeight: 700, color: 'var(--ok)' }}>Bs {v.ganancia.toFixed(2)}</td></tr>)}</tbody></table></div></div>
      </>}
    </div>
  )
}