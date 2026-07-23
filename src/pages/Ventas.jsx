import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const MEDIOS = ['efectivo', 'qr']
const BILLETES = [10, 20, 50, 100, 200]
const RAPIDOS_PAN = [1, 2, 5, 10, 20, 50]

export default function Ventas() {
  const toast = useToast()
  const [tab, setTab] = useState('pan') // 'pan' | 'otros' | 'reserva'
  const [productos, setProductos] = useState([])
  const [panProducto, setPanProducto] = useState(null)
  const [cajaSesionId, setCajaSesionId] = useState(null)
  const [modalCobro, setModalCobro] = useState(false)
  const [modalReserva, setModalReserva] = useState(false)
  const [procesando, setProcesando] = useState(false)

  // Estado POS pan
  const [cantPan, setCantPan] = useState(0)
  const [medioPanPago, setMedioPanPago] = useState('efectivo')
  const [recibidoPan, setRecibidoPan] = useState(0)

  // Estado otros productos
  const [carrito, setCarrito] = useState([])
  const [medioOtros, setMedioOtros] = useState('efectivo')
  const [recibidoOtros, setRecibidoOtros] = useState(0)

  // Reserva
  const [reservaDesc, setReservaDesc] = useState('')
  const [reservaItems, setReservaItems] = useState([])
  const [reservaMedio, setReservaMedio] = useState('efectivo')

  const [historial, setHistorial] = useState([])

  const precioUnitarioPan = panProducto?.precio_venta ?? 0
  const totalPan = cantPan * precioUnitarioPan
  const cambioPan = recibidoPan - totalPan

  const totalOtros = carrito.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const cambioOtros = recibidoOtros - totalOtros

  const totalReserva = reservaItems.reduce((s, i) => s + (i.precio_unitario ?? 0) * (i.cantidad ?? 0), 0)

  useEffect(() => { fetchInit() }, [])

  async function fetchInit() {
    const hoy = new Date().toISOString().split('T')[0]
    const [{ data: prods }, { data: sesion }, { data: hist }] = await Promise.all([
      supabase.from('productos_pos').select('*').eq('activo_en_pos', true).order('es_pan', { ascending: false }).order('nombre'),
      supabase.from('caja_sesiones').select('id').eq('estado', 'abierta').limit(1).maybeSingle(),
      supabase.from('ventas').select('id,total,medio_pago,fecha,estado').gte('fecha', hoy).order('fecha', { ascending: false }).limit(10),
    ])
    const all = prods ?? []
    const pan = all.find(p => p.es_pan)
    setPanProducto(pan ?? null)
    setProductos(all.filter(p => !p.es_pan))
    setCajaSesionId(sesion?.id ?? null)
    setHistorial(hist ?? [])
  }

  // ─── PAN ───
  function ajustarPan(delta) {
    setCantPan(c => Math.max(0, c + delta))
  }

  async function cobrarPan() {
    if (!panProducto) { toast('No hay producto "Pan" configurado como es_pan=true', 'warn'); return }
    if (!cajaSesionId) { toast('Abre la caja primero', 'warn'); return }
    if (cantPan <= 0) { toast('Ingresa la cantidad de panes', 'warn'); return }
    setProcesando(true)
    const { error } = await supabase.rpc('procesar_venta', {
      p_caja_sesion_id: cajaSesionId,
      p_items: [{ producto_id: panProducto.id, cantidad: cantPan }],
      p_medio_pago: medioPanPago,
      p_monto_recibido: medioPanPago === 'efectivo' ? recibidoPan : totalPan,
      p_descuento: 0,
    })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    toast(`✓ ${cantPan} panes — Bs ${totalPan.toFixed(2)}${medioPanPago === 'efectivo' && cambioPan > 0 ? ` — Cambio: Bs ${cambioPan.toFixed(2)}` : ''}`, 'ok')
    setCantPan(0); setRecibidoPan(0); setMedioPanPago('efectivo')
    fetchInit()
  }

  // ─── OTROS ───
  function agregarOtro(p) {
    setCarrito(c => {
      const ex = c.find(i => i.id === p.id)
      if (ex) return c.map(i => i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...c, { ...p, cantidad: 1 }]
    })
  }

  async function cobrarOtros() {
    if (!cajaSesionId) { toast('Abre la caja primero', 'warn'); return }
    if (carrito.length === 0) { toast('Agrega productos', 'warn'); return }
    setProcesando(true)
    const { error } = await supabase.rpc('procesar_venta', {
      p_caja_sesion_id: cajaSesionId,
      p_items: carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad })),
      p_medio_pago: medioOtros,
      p_monto_recibido: medioOtros === 'efectivo' ? recibidoOtros : totalOtros,
      p_descuento: 0,
    })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    toast(`✓ Venta Bs ${totalOtros.toFixed(2)}`, 'ok')
    setCarrito([]); setRecibidoOtros(0)
    fetchInit()
  }

  // ─── RESERVA ───
  async function registrarReserva() {
    if (!cajaSesionId) { toast('Abre la caja primero', 'warn'); return }
    setProcesando(true)
    const { error } = await supabase.rpc('procesar_reserva', {
      p_caja_sesion_id: cajaSesionId,
      p_descripcion: reservaDesc,
      p_items: reservaItems.filter(i => i.producto_id && i.cantidad > 0).map(i => ({
        producto_id: i.producto_id, cantidad: Number(i.cantidad)
      })),
      p_medio_pago: reservaMedio,
      p_total: totalReserva,
    })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    toast('Reserva registrada', 'ok')
    setModalReserva(false)
    setReservaDesc(''); setReservaItems([]); setReservaMedio('efectivo')
    fetchInit()
  }

  return (
    <div className="page-wrap">
      {!cajaSesionId && (
        <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn)', color: 'var(--warn)', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          ⚠ No hay caja abierta. Ve a <strong>Caja</strong> para iniciar el turno.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--silver-light)', marginBottom: 20, overflowX: 'auto' }}>
        {[['pan','🍞 Panes'], ['otros','🎂 Otros'], ['historial','📋 Historial']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 22px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            fontWeight: 700, whiteSpace: 'nowrap',
            color: tab === k ? 'var(--text)' : 'var(--text-soft)',
            borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent',
            marginBottom: -2,
          }}>{l}</button>
        ))}
        <button onClick={() => setModalReserva(true)} style={{ marginLeft: 'auto', padding: '8px 16px', border: '1.5px solid var(--silver-light)', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', alignSelf: 'center' }}>
          📌 Reserva
        </button>
      </div>

      {/* ─── TAB PAN ─── */}
      {tab === 'pan' && (
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          {!panProducto && (
            <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              ⚠ Marca un producto como "es_pan = true" en Inventario para habilitar este modo.
            </div>
          )}

          {/* Display cantidad */}
          <div className="card" style={{ padding: 28, textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Cantidad de panes</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 12 }}>
              <button onClick={() => ajustarPan(-1)} style={{ width: 56, height: 56, borderRadius: 16, border: '2px solid var(--silver-light)', background: 'none', fontSize: 28, cursor: 'pointer', fontWeight: 700 }}>−</button>
              <span style={{ fontSize: 72, fontWeight: 900, minWidth: 120, textAlign: 'center', lineHeight: 1 }}>{cantPan}</span>
              <button onClick={() => ajustarPan(1)} style={{ width: 56, height: 56, borderRadius: 16, border: '2px solid var(--yellow)', background: 'var(--yellow-soft)', fontSize: 28, cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-soft)' }}>Bs {precioUnitarioPan.toFixed(2)} c/u</p>
          </div>

          {/* Botones rápidos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {RAPIDOS_PAN.map(n => (
              <button key={n} onClick={() => ajustarPan(n)}
                style={{ padding: '14px 0', borderRadius: 12, border: '1.5px solid var(--silver-light)', background: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                +{n}
              </button>
            ))}
          </div>
          <button onClick={() => setCantPan(0)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--silver-light)', background: 'none', fontSize: 13, color: 'var(--err)', cursor: 'pointer', marginBottom: 20 }}>
            Limpiar
          </button>

          {/* Total */}
          {cantPan > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 800, marginBottom: 16 }}>
                <span>TOTAL</span><span style={{ color: 'var(--ok)' }}>Bs {totalPan.toFixed(2)}</span>
              </div>

              {/* Medio de pago */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {MEDIOS.map(m => (
                  <button key={m} onClick={() => setMedioPanPago(m)}
                    style={{ padding: '14px', borderRadius: 12, border: `2px solid ${medioPanPago === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: medioPanPago === m ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', textTransform: 'uppercase' }}>
                    {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                  </button>
                ))}
              </div>

              {/* Monto recibido (solo efectivo) */}
              {medioPanPago === 'efectivo' && (
                <>
                  <label className="form-label">Monto recibido</label>
                  <input className="form-input" type="number" value={recibidoPan || ''} onChange={e => setRecibidoPan(+e.target.value)}
                    placeholder="0.00" style={{ marginBottom: 10, fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {BILLETES.map(b => (
                      <button key={b} onClick={() => setRecibidoPan(r => r + b)}
                        style={{ padding: '6px 14px', borderRadius: 20, background: 'var(--silver-light)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Bs {b}
                      </button>
                    ))}
                  </div>
                  {recibidoPan > 0 && recibidoPan < totalPan && (
                    <p style={{ color: 'var(--err)', fontWeight: 700, marginBottom: 8 }}>⚠ Monto insuficiente</p>
                  )}
                  {recibidoPan >= totalPan && recibidoPan > 0 && (
                    <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '12px', borderRadius: 10, fontWeight: 800, fontSize: 20, textAlign: 'center', marginBottom: 10 }}>
                      Cambio: Bs {cambioPan.toFixed(2)}
                    </div>
                  )}
                </>
              )}

              <button className="btn-primary" onClick={cobrarPan} disabled={procesando || cantPan === 0 || !cajaSesionId || (medioPanPago === 'efectivo' && recibidoPan < totalPan)}
                style={{ width: '100%', padding: 18, fontSize: 18, borderRadius: 14 }}>
                {procesando ? 'Procesando...' : `✓ Cobrar Bs ${totalPan.toFixed(2)}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB OTROS ─── */}
      {tab === 'otros' && (
        <div className="grid-2">
          {/* Catálogo */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
              {productos.length === 0 && <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin otros productos activos en POS</p>}
              {productos.map(p => (
                <button key={p.id} onClick={() => agregarOtro(p)} disabled={p.stock_actual <= 0}
                  style={{ background: '#fff', border: '1.5px solid var(--silver-light)', borderRadius: 12, padding: 14, textAlign: 'left', cursor: p.stock_actual > 0 ? 'pointer' : 'not-allowed', opacity: p.stock_actual <= 0 ? .5 : 1 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🎂</div>
                  <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{p.nombre}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)' }}>
                    Bs {Number(p.precio_venta).toFixed(2)}{p.venta_por_docena ? '/doc' : ''}
                  </p>
                  <span className={p.stock_actual <= 0 ? 'badge-err' : 'badge-ok'} style={{ fontSize: 10 }}>
                    {p.stock_actual <= 0 ? 'Agotado' : p.venta_por_docena ? `${p.stock_actual} doc` : `${p.stock_actual} unid`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Carrito */}
          <div className="card" style={{ padding: 20, alignSelf: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 700, flex: 1 }}>Orden</span>
              {carrito.length > 0 && <button onClick={() => setCarrito([])} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 12 }}>Limpiar</button>}
            </div>
            {carrito.length === 0
              ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Selecciona productos</p>
              : carrito.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>{i.nombre}</p>
                    <p style={{ color: 'var(--text-soft)', fontSize: 11 }}>Bs {Number(i.precio_venta).toFixed(2)} c/u</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setCarrito(c => c.map(x => x.id === i.id ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x))}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}>−</button>
                    <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700 }}>{i.cantidad}</span>
                    <button onClick={() => setCarrito(c => c.map(x => x.id === i.id ? { ...x, cantidad: x.cantidad + 1 } : x))}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}>+</button>
                  </div>
                  <span style={{ fontWeight: 700, minWidth: 52, textAlign: 'right' }}>Bs {(i.precio_venta * i.cantidad).toFixed(2)}</span>
                  <button onClick={() => setCarrito(c => c.filter(x => x.id !== i.id))} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            {carrito.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, margin: '14px 0 14px' }}>
                  <span>Total</span><span>Bs {totalOtros.toFixed(2)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {MEDIOS.map(m => (
                    <button key={m} onClick={() => setMedioOtros(m)}
                      style={{ padding: '10px', borderRadius: 10, border: `2px solid ${medioOtros === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: medioOtros === m ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      {m === 'efectivo' ? '💵' : '📱'} {m}
                    </button>
                  ))}
                </div>
                {medioOtros === 'efectivo' && (
                  <>
                    <input className="form-input" type="number" value={recibidoOtros || ''} onChange={e => setRecibidoOtros(+e.target.value)} placeholder="Monto recibido" style={{ marginBottom: 8, textAlign: 'center', fontSize: 16 }} />
                    {recibidoOtros >= totalOtros && recibidoOtros > 0 && (
                      <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '8px', borderRadius: 8, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>
                        Cambio: Bs {cambioOtros.toFixed(2)}
                      </div>
                    )}
                  </>
                )}
                <button className="btn-primary" onClick={cobrarOtros}
                  disabled={procesando || !cajaSesionId || (medioOtros === 'efectivo' && recibidoOtros < totalOtros)}
                  style={{ width: '100%', padding: 14, fontSize: 15 }}>
                  {procesando ? 'Procesando...' : `✓ Cobrar Bs ${totalOtros.toFixed(2)}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB HISTORIAL ─── */}
      {tab === 'historial' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-scroll">
            <table className="clap-table">
              <thead><tr><th>Hora</th><th>Total</th><th>Medio</th><th>Estado</th></tr></thead>
              <tbody>
                {historial.length === 0
                  ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin ventas hoy</td></tr>
                  : historial.map(v => (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--text-soft)' }}>{new Date(v.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ fontWeight: 700 }}>Bs {Number(v.total).toFixed(2)}</td>
                      <td><span className="badge-info">{v.medio_pago}</span></td>
                      <td><span className={v.estado === 'anulada' ? 'badge-err' : 'badge-ok'}>{v.estado}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── MODAL RESERVA ─── */}
      <Modal open={modalReserva} onClose={() => setModalReserva(false)} title="📌 Registrar reserva">
        <label className="form-label">Descripción / Cliente</label>
        <input className="form-input" style={{ marginBottom: 14 }} value={reservaDesc} onChange={e => setReservaDesc(e.target.value)} placeholder="Ej: Reserva de María — 10 panes" />

        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Productos reservados</p>
        {reservaItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select className="form-input form-select" style={{ flex: 2 }} value={item.producto_id ?? ''} onChange={e => setReservaItems(r => r.map((x, i) => i === idx ? { ...x, producto_id: e.target.value, precio_unitario: [...(productos ?? []), panProducto].find(p => p?.id === e.target.value)?.precio_venta ?? 0 } : x))}>
              <option value="">Seleccionar...</option>
              {panProducto && <option value={panProducto.id}>Pan (Bs {panProducto.precio_venta})</option>}
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (Bs {p.precio_venta})</option>)}
            </select>
            <input className="form-input" type="number" style={{ width: 70 }} placeholder="Cant." value={item.cantidad ?? ''} onChange={e => setReservaItems(r => r.map((x, i) => i === idx ? { ...x, cantidad: +e.target.value } : x))} />
            <button onClick={() => setReservaItems(r => r.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
          </div>
        ))}
        <button onClick={() => setReservaItems(r => [...r, { producto_id: '', cantidad: 0, precio_unitario: 0 }])}
          className="btn-secondary" style={{ width: '100%', marginBottom: 14, fontSize: 13 }}>+ Agregar ítem</button>

        <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 14 }}>
          <span>Total reserva</span><span>Bs {totalReserva.toFixed(2)}</span>
        </div>

        <label className="form-label">Medio de pago</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {MEDIOS.map(m => (
            <button key={m} onClick={() => setReservaMedio(m)}
              style={{ padding: '12px', borderRadius: 10, border: `2px solid ${reservaMedio === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: reservaMedio === m ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalReserva(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={procesando || reservaItems.length === 0 || !cajaSesionId} onClick={registrarReserva}>
            {procesando ? 'Guardando...' : 'Registrar reserva'}
          </button>
        </div>
      </Modal>
    </div>
  )
}