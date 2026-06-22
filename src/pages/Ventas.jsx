import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const BILLETES = [10, 20, 50, 100, 200]
const MEDIOS = ['efectivo','qr','transferencia','combinado']
const MERMA_TIPOS = ['merma_danado','merma_vencido','merma_consumo_interno','merma_degustacion','merma_donacion','merma_regalo','merma_diferencia']

export default function Ventas() {
  const toast = useToast()
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [catActiva, setCatActiva] = useState('Todos')
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])
  const [medioPago, setMedioPago] = useState('efectivo')
  const [recibido, setRecibido] = useState(0)
  const [cajaSesionId, setCajaSesionId] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [modalCobro, setModalCobro] = useState(false)
  const [historial, setHistorial] = useState([])

  const total = carrito.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const cambio = recibido - total
  const insuficiente = medioPago === 'efectivo' && recibido > 0 && recibido < total

  useEffect(() => { fetchInit() }, [])

  async function fetchInit() {
    const hoy = new Date().toISOString().split('T')[0]
    const [{ data: prods }, { data: cats }, { data: sesion }, { data: hist }] = await Promise.all([
      supabase.from('productos_pos').select('*').order('nombre'),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('caja_sesiones').select('id').eq('estado', 'abierta').limit(1).maybeSingle(),
      supabase.from('ventas').select('id,total,medio_pago,fecha,estado').gte('fecha', hoy).order('fecha', { ascending: false }).limit(20),
    ])
    setProductos(prods ?? [])
    setCategorias(cats ?? [])
    setCajaSesionId(sesion?.id ?? null)
    setHistorial(hist ?? [])
  }

  function agregar(p) {
    setCarrito(c => {
      const ex = c.find(i => i.id === p.id)
      if (ex) {
        if (ex.cantidad >= p.stock_actual) { toast('Sin stock suficiente', 'warn'); return c }
        return c.map(i => i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      }
      if (p.stock_actual <= 0) { toast('Producto agotado', 'warn'); return c }
      return [...c, { ...p, cantidad: 1 }]
    })
  }

  function cambiarCantidad(id, delta) {
    setCarrito(c => c.map(i => i.id === id ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i))
  }

  function quitar(id) { setCarrito(c => c.filter(i => i.id !== id)) }

  async function confirmarCobro() {
    if (!cajaSesionId) { toast('Primero abre la caja del día', 'warn'); return }
    setProcesando(true)
    const { data, error } = await supabase.rpc('procesar_venta', {
      p_caja_sesion_id: cajaSesionId,
      p_items: carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad })),
      p_medio_pago: medioPago,
      p_monto_recibido: medioPago === 'efectivo' ? recibido : total,
      p_descuento: 0,
    })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    toast(`Venta registrada — Cambio: Bs ${Math.max(0, cambio).toFixed(2)}`, 'ok')
    setCarrito([]); setRecibido(0); setModalCobro(false)
    fetchInit()
  }

  const prodsFiltrados = productos
    .filter(p => catActiva === 'Todos' || p.categoria_id === catActiva)
    .filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Catálogo */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Punto de Venta</h2>

        {!cajaSesionId && (
          <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn)', color: 'var(--warn)', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
            ⚠ No hay caja abierta. Ve a <strong>Caja</strong> para iniciar el turno.
          </div>
        )}

        {/* Búsqueda */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)', fontSize: 16 }}>🔍</span>
          <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>

        {/* Categorías */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[{ id: 'Todos', nombre: 'Todos' }, ...categorias].map(c => (
            <button key={c.id} onClick={() => setCatActiva(c.id)}
              style={{ padding: '5px 14px', borderRadius: 20, border: '1.5px solid', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                background: catActiva === c.id ? 'var(--text)' : 'transparent',
                color: catActiva === c.id ? '#fff' : 'var(--text-soft)',
                borderColor: catActiva === c.id ? 'var(--text)' : 'var(--silver-light)' }}>
              {c.nombre}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {prodsFiltrados.map(p => (
            <button key={p.id} onClick={() => agregar(p)} disabled={p.stock_actual <= 0}
              style={{ background: 'var(--bg)', border: '1.5px solid var(--silver-light)', borderRadius: 12, padding: 14,
                textAlign: 'left', cursor: p.stock_actual > 0 ? 'pointer' : 'not-allowed', transition: 'border-color .15s',
                opacity: p.stock_actual <= 0 ? .5 : 1 }}
              onMouseEnter={e => { if(p.stock_actual > 0) e.currentTarget.style.borderColor = 'var(--yellow)' }}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--silver-light)'}>
              <div style={{ width: '100%', height: 56, background: 'var(--yellow-soft)', borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                🍞
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{p.nombre}</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-soft)', marginBottom: 4 }}>Bs {Number(p.precio_venta).toFixed(2)}</p>
              <span className={p.stock_actual <= p.stock_minimo && p.stock_actual > 0 ? 'badge-warn' : p.stock_actual <= 0 ? 'badge-err' : 'badge-ok'} style={{ fontSize: 10 }}>
                {p.stock_actual <= 0 ? 'Agotado' : `Stock: ${p.stock_actual}`}
              </span>
            </button>
          ))}
          {prodsFiltrados.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-soft)', padding: 40 }}>Sin productos</div>
          )}
        </div>
      </div>

      {/* Panel de orden */}
      <div style={{ width: 300, background: 'var(--bg)', borderLeft: '1px solid var(--silver-light)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--silver-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Orden actual</span>
            {carrito.length > 0 && (
              <button onClick={() => setCarrito([])} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--err)', cursor: 'pointer' }}>Limpiar</button>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{carrito.length} items</span>
        </div>

        {/* Items del carrito */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {carrito.length === 0
            ? <p style={{ color: 'var(--text-soft)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Selecciona productos del catálogo</p>
            : carrito.map(i => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{i.nombre}</p>
                  <p style={{ color: 'var(--text-soft)', fontSize: 12 }}>Bs {Number(i.precio_venta).toFixed(2)} c/u</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => cambiarCantidad(i.id, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontSize: 14 }}>-</button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{i.cantidad}</span>
                  <button onClick={() => cambiarCantidad(i.id, 1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontSize: 14 }}>+</button>
                </div>
                <span style={{ fontWeight: 700, minWidth: 52, textAlign: 'right' }}>Bs {(i.precio_venta * i.cantidad).toFixed(2)}</span>
                <button onClick={() => quitar(i.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)', fontSize: 15 }}>×</button>
              </div>
            ))}
        </div>

        {/* Cobro */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--silver-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>
            <span>Total</span><span>Bs {total.toFixed(2)}</span>
          </div>
          <button className="btn-primary" style={{ width: '100%', padding: 13, fontSize: 15 }}
            disabled={carrito.length === 0 || !cajaSesionId}
            onClick={() => setModalCobro(true)}>
            Cobrar Bs {total.toFixed(2)}
          </button>
        </div>
      </div>

      {/* Modal de cobro */}
      <Modal open={modalCobro} onClose={() => setModalCobro(false)} title="Confirmar cobro">
        <div style={{ marginBottom: 14, background: 'var(--bg-soft)', borderRadius: 10, padding: 14 }}>
          {carrito.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span>{i.nombre} x{i.cantidad}</span>
              <span>Bs {(i.precio_venta * i.cantidad).toFixed(2)}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--silver-light)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>TOTAL</span><span>Bs {total.toFixed(2)}</span>
          </div>
        </div>

        <label className="form-label">Medio de pago</label>
        <select className="form-input form-select" style={{ marginBottom: 14 }} value={medioPago} onChange={e => setMedioPago(e.target.value)}>
          {MEDIOS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
        </select>

        {medioPago === 'efectivo' && (
          <>
            <label className="form-label">Monto recibido</label>
            <input className="form-input" type="number" style={{ marginBottom: 10 }} value={recibido || ''} onChange={e => setRecibido(+e.target.value)} placeholder="0.00" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {BILLETES.map(b => (
                <button key={b} onClick={() => setRecibido(r => r + b)}
                  style={{ padding: '5px 12px', borderRadius: 20, background: 'var(--silver-light)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                  Bs {b}
                </button>
              ))}
            </div>
            {insuficiente && <p style={{ color: 'var(--err)', fontSize: 13, marginBottom: 8 }}>⚠ Monto insuficiente</p>}
            {recibido >= total && recibido > 0 && (
              <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '10px 14px', borderRadius: 8, fontWeight: 700, fontSize: 16, textAlign: 'center', marginBottom: 12 }}>
                Cambio: Bs {cambio.toFixed(2)}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalCobro(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1, fontSize: 14 }}
            disabled={procesando || (medioPago === 'efectivo' && (recibido < total || recibido <= 0))}
            onClick={confirmarCobro}>
            {procesando ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>

        {/* Historial reciente debajo */}
        {historial.length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--silver-light)', paddingTop: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 8, fontWeight: 600 }}>VENTAS DE HOY</p>
            {historial.slice(0, 5).map(v => (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--silver-light)' }}>
                <span style={{ color: 'var(--text-soft)' }}>{new Date(v.fecha).toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit' })}</span>
                <span className={v.estado === 'anulada' ? 'badge-err' : 'badge-ok'}>{v.estado}</span>
                <span style={{ fontWeight: 600 }}>Bs {Number(v.total).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}