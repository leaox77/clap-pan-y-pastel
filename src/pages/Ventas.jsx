import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useSucursal } from '../context/SucursalContext'
import Modal from '../components/Modal'

const MEDIOS = ['efectivo', 'qr']
const BILLETES = [10, 20, 50, 100, 200]
const RAPIDOS = [1, 2, 5, 10, 20, 50]

export default function Ventas() {
  const toast = useToast()
  const [tab, setTab] = useState('pan')
  const [panProducto, setPanProducto] = useState(null)
  const [productos, setProductos] = useState([])
  const [cajaSesionId, setCajaSesionId] = useState(null)
  const [historial, setHistorial] = useState([])
  const [procesando, setProcesando] = useState(false)

  // POS pan
  const [cantPan, setCantPan] = useState(0)
  const [medioPan, setMedioPan] = useState('efectivo')
  const [recibidoPan, setRecibidoPan] = useState(0)

  // POS otros
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])
  const [medioOtros, setMedioOtros] = useState('efectivo')
  const [recibidoOtros, setRecibidoOtros] = useState(0)

  // Modal nuevo producto
  const [modalProd, setModalProd] = useState(false)
  const [formProd, setFormProd] = useState({ nombre: '', precio_venta: '' })

  // Modal reserva
  const [modalReserva, setModalReserva] = useState(false)
  const [reservaDesc, setReservaDesc] = useState('')
  const [reservaItems, setReservaItems] = useState([])
  const [reservaMedio, setReservaMedio] = useState('efectivo')

  const precioUnitarioPan = panProducto?.precio_venta ?? 0
  const totalPan = cantPan * precioUnitarioPan
  const cambioPan = recibidoPan - totalPan
  const totalOtros = carrito.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const cambioOtros = recibidoOtros - totalOtros
  const totalReserva = reservaItems.reduce((s, i) => s + (i.precio_unitario ?? 0) * (i.cantidad ?? 0), 0)

  const { sucursalActivaId } = useSucursal()

  const prodsFiltrados = useMemo(() =>
    productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  , [productos, busqueda])

  useEffect(() => { if (sucursalActivaId) fetchInit() }, [sucursalActivaId])

  async function fetchInit() {
    if (!sucursalActivaId) return
    const hoy = new Date().toISOString().split('T')[0]
    const [{ data: inv, error: invError }, { data: sesion }, { data: hist }] = await Promise.all([
      supabase.from('inventario_sucursal').select('producto_id,stock_actual,stock_minimo,productos!inner(id,nombre,precio_venta,costo_unitario,activo_en_pos,es_pan)').eq('sucursal_id', sucursalActivaId).eq('productos.activo_en_pos', true),
      supabase.from('caja_sesiones').select('id').eq('estado', 'abierta').eq('sucursal_id', sucursalActivaId).limit(1).maybeSingle(),
      supabase.from('ventas').select('id,total,medio_pago,fecha,estado,profiles(full_name)').eq('sucursal_id', sucursalActivaId).gte('fecha', hoy).order('fecha', { ascending: false }).limit(15),
    ])

    if (invError) {
      console.error('Error cargando inventario POS:', invError)
      toast(invError.message, 'err')
      return
    }

    const all = (inv ?? []).map(i => ({ ...i.productos, stock_actual: Number(i.stock_actual ?? 0), stock_minimo: Number(i.stock_minimo ?? 0) })).sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'))

    const panes = all.filter(p => p.es_pan)
    const otros = all.filter(p => !p.es_pan)

    setPanProducto(panes[0] ?? null)
    setProductos(otros)
    setCajaSesionId(sesion?.id ?? null)
    setHistorial(hist ?? [])
  }

  // ── PAN ──
  async function cobrarPan() {
    if (!panProducto || cantPan <= 0 || !cajaSesionId) return
    if (medioPan === 'efectivo' && recibidoPan < totalPan) { toast('Monto insuficiente', 'warn'); return }
    setProcesando(true)
    const { error } = await supabase.rpc('procesar_venta', {
      p_caja_sesion_id: cajaSesionId,
      p_items: [{ producto_id: panProducto.id, cantidad: cantPan }],
      p_medio_pago: medioPan,
      p_monto_recibido: medioPan === 'efectivo' ? recibidoPan : totalPan,
      p_descuento: 0,
    })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    const msg = medioPan === 'efectivo' && cambioPan > 0 ? ` — Cambio: Bs ${cambioPan.toFixed(2)}` : ''
    toast(`✓ ${cantPan} panes Bs ${totalPan.toFixed(2)}${msg}`, 'ok')
    setCantPan(0); setRecibidoPan(0)
    fetchInit()
  }

  // ── OTROS ──
  function agregar(p) {
    if (p.stock_actual <= 0) { toast('Sin stock', 'warn'); return }
    setCarrito(c => {
      const ex = c.find(i => i.id === p.id)
      return ex ? c.map(i => i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i) : [...c, { ...p, cantidad: 1 }]
    })
  }

  async function cobrarOtros() {
    if (carrito.length === 0 || !cajaSesionId) return
    if (medioOtros === 'efectivo' && recibidoOtros < totalOtros) { toast('Monto insuficiente', 'warn'); return }
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

  // ── NUEVO PRODUCTO ──
  async function crearProducto() {
    if (!formProd.nombre || !formProd.precio_venta) return
    const { error } = await supabase.from('productos').insert({
      nombre: formProd.nombre, precio_venta: Number(formProd.precio_venta),
      costo_unitario: 0, stock_actual: 0, stock_minimo: 2,
      activo_en_pos: true, es_pan: false,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Producto agregado', 'ok')
    setModalProd(false); setFormProd({ nombre: '', precio_venta: '' })
    fetchInit()
  }

  // ── RESERVA ──
  async function registrarReserva() {
    if (!cajaSesionId || reservaItems.length === 0) return
    setProcesando(true)
    const { error } = await supabase.rpc('procesar_reserva', {
      p_caja_sesion_id: cajaSesionId,
      p_descripcion: reservaDesc,
      p_items: reservaItems.filter(i => i.producto_id && i.cantidad > 0).map(i => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad) })),
      p_medio_pago: reservaMedio,
      p_total: totalReserva,
    })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    toast('Reserva registrada', 'ok')
    setModalReserva(false); setReservaDesc(''); setReservaItems([])
    fetchInit()
  }

  const todosProductos = panProducto ? [panProducto, ...productos] : productos

  return (
    <div className="page-wrap">
      {!cajaSesionId && (
        <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, border: '1px solid var(--warn)' }}>
          ⚠ No hay caja abierta. Ve a <strong>Caja</strong> para iniciar el turno.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--silver-light)', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
        {[['pan','🍞 Panes'], ['otros','🎂 Productos'], ['historial','📋 Historial']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
            color: tab === k ? 'var(--text)' : 'var(--text-soft)',
            borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent',
            marginBottom: -2,
          }}>{l}</button>
        ))}
        <button onClick={() => setModalReserva(true)} style={{ marginLeft: 'auto', padding: '7px 14px', border: '1.5px solid var(--silver-light)', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          📌 Reserva
        </button>
      </div>

      {/* ─── TAB PAN ─── */}
      {tab === 'pan' && (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          {!panProducto && (
            <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              ⚠ Ningún producto está marcado como <strong>es_pan = true</strong> en la base de datos.
            </div>
          )}

          <div className="card" style={{ padding: 28, textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
              Pan — Bs {precioUnitarioPan.toFixed(2)} c/u
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
              <button onClick={() => setCantPan(c => Math.max(0, c - 1))} style={{ width: 60, height: 60, borderRadius: 16, border: '2px solid var(--silver-light)', background: 'none', fontSize: 30, cursor: 'pointer', fontWeight: 700 }}>−</button>
              <span style={{ fontSize: 80, fontWeight: 900, minWidth: 120, textAlign: 'center', lineHeight: 1 }}>{cantPan}</span>
              <button onClick={() => setCantPan(c => c + 1)} style={{ width: 60, height: 60, borderRadius: 16, border: '2px solid var(--yellow)', background: 'var(--yellow-soft)', fontSize: 30, cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
            {cantPan > 0 && <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--ok)' }}>Bs {totalPan.toFixed(2)}</p>}
          </div>

          {/* Botones rápidos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
            {RAPIDOS.map(n => (
              <button key={n} onClick={() => setCantPan(c => c + n)}
                style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--silver-light)', background: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
                +{n}
              </button>
            ))}
          </div>
          <button onClick={() => setCantPan(0)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--silver-light)', background: 'none', fontSize: 13, color: 'var(--err)', cursor: 'pointer', marginBottom: 20 }}>
            Limpiar
          </button>

          {cantPan > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {MEDIOS.map(m => (
                  <button key={m} onClick={() => setMedioPan(m)}
                    style={{ padding: 14, borderRadius: 12, border: `2px solid ${medioPan === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: medioPan === m ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                    {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                  </button>
                ))}
              </div>

              {medioPan === 'efectivo' && (
                <>
                  <input className="form-input" type="number" value={recibidoPan || ''}
                    onChange={e => setRecibidoPan(+e.target.value)}
                    placeholder="Monto recibido" style={{ marginBottom: 10, fontSize: 18, textAlign: 'center', fontWeight: 700 }} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {BILLETES.map(b => (
                      <button key={b} onClick={() => setRecibidoPan(r => r + b)}
                        style={{ padding: '6px 12px', borderRadius: 20, background: 'var(--silver-light)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Bs {b}
                      </button>
                    ))}
                  </div>
                  {recibidoPan > 0 && recibidoPan < totalPan && <p style={{ color: 'var(--err)', fontWeight: 700, marginBottom: 8 }}>⚠ Monto insuficiente</p>}
                  {recibidoPan >= totalPan && recibidoPan > 0 && (
                    <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 22, textAlign: 'center', marginBottom: 12 }}>
                      Cambio: Bs {cambioPan.toFixed(2)}
                    </div>
                  )}
                </>
              )}

              <button className="btn-primary" onClick={cobrarPan}
                disabled={procesando || cantPan === 0 || !cajaSesionId || (medioPan === 'efectivo' && (recibidoPan < totalPan || recibidoPan <= 0))}
                style={{ width: '100%', padding: 18, fontSize: 18, borderRadius: 14 }}>
                {procesando ? 'Procesando...' : `✓ Cobrar Bs ${totalPan.toFixed(2)}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB OTROS ─── */}
      {tab === 'otros' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Catálogo */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)' }}>🔍</span>
                <input className="form-input" style={{ paddingLeft: 34 }} placeholder="Buscar producto..."
                  value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>
              <button className="btn-secondary" onClick={() => setModalProd(true)} style={{ fontSize: 13, whiteSpace: 'nowrap', padding: '8px 14px' }}>+ Nuevo</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {prodsFiltrados.length === 0 && <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin resultados</p>}
              {prodsFiltrados.map(p => (
                <button key={p.id} onClick={() => agregar(p)} disabled={p.stock_actual <= 0}
                  style={{ background: '#fff', border: `1.5px solid ${carrito.find(i=>i.id===p.id) ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, borderRadius: 12, padding: '12px 10px', textAlign: 'left', cursor: p.stock_actual > 0 ? 'pointer' : 'not-allowed', opacity: p.stock_actual <= 0 ? .45 : 1, transition: 'border-color .15s' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{p.nombre}</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-soft)' }}>Bs {Number(p.precio_venta).toFixed(2)}</p>
                  {carrito.find(i=>i.id===p.id) && (
                    <span className="badge-ok" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                      ×{carrito.find(i=>i.id===p.id).cantidad}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Carrito */}
          <div className="card" style={{ padding: 20, width: 280, flexShrink: 0, alignSelf: 'start', position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 700, flex: 1 }}>Orden ({carrito.length})</span>
              {carrito.length > 0 && <button onClick={() => setCarrito([])} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 12 }}>Limpiar</button>}
            </div>

            {carrito.length === 0
              ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Selecciona productos</p>
              : (
                <>
                  {carrito.map(i => (
                    <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{i.nombre}</p>
                        <p style={{ color: 'var(--text-soft)', fontSize: 11 }}>Bs {Number(i.precio_venta).toFixed(2)}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setCarrito(c => c.map(x => x.id===i.id ? {...x, cantidad: Math.max(1,x.cantidad-1)} : x))} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{i.cantidad}</span>
                        <button onClick={() => setCarrito(c => c.map(x => x.id===i.id ? {...x, cantidad: x.cantidad+1} : x))} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}>+</button>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 48 }}>
                        <p style={{ fontWeight: 700, fontSize: 12 }}>Bs {(i.precio_venta*i.cantidad).toFixed(2)}</p>
                        <button onClick={() => setCarrito(c => c.filter(x=>x.id!==i.id))} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, margin: '14px 0' }}>
                    <span>Total</span><span>Bs {totalOtros.toFixed(2)}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {MEDIOS.map(m => (
                      <button key={m} onClick={() => setMedioOtros(m)}
                        style={{ padding: '10px', borderRadius: 10, border: `2px solid ${medioOtros===m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: medioOtros===m ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                        {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                      </button>
                    ))}
                  </div>

                  {medioOtros === 'efectivo' && (
                    <>
                      <input className="form-input" type="number" value={recibidoOtros||''} onChange={e=>setRecibidoOtros(+e.target.value)} placeholder="Monto recibido" style={{ marginBottom: 8, textAlign: 'center', fontSize: 15, fontWeight: 700 }} />
                      {recibidoOtros >= totalOtros && recibidoOtros > 0 && (
                        <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '8px', borderRadius: 8, fontWeight: 800, textAlign: 'center', marginBottom: 8, fontSize: 16 }}>
                          Cambio: Bs {cambioOtros.toFixed(2)}
                        </div>
                      )}
                    </>
                  )}

                  <button className="btn-primary" onClick={cobrarOtros}
                    disabled={procesando||!cajaSesionId||(medioOtros==='efectivo'&&(recibidoOtros<totalOtros||recibidoOtros<=0))}
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
              <thead><tr><th>Hora</th><th>Total</th><th>Medio</th><th>Vendedor</th><th>Estado</th></tr></thead>
              <tbody>
                {historial.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin ventas hoy</td></tr>
                  : historial.map(v => (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--text-soft)' }}>{new Date(v.fecha).toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})}</td>
                      <td style={{ fontWeight: 700 }}>Bs {Number(v.total).toFixed(2)}</td>
                      <td><span className="badge-info">{v.medio_pago}</span></td>
                      <td style={{ color: 'var(--text-soft)', fontSize: 12 }}>{v.profiles?.full_name ?? '—'}</td>
                      <td><span className={v.estado==='anulada'?'badge-err':'badge-ok'}>{v.estado}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── MODAL NUEVO PRODUCTO ─── */}
      <Modal open={modalProd} onClose={() => setModalProd(false)} title="Agregar producto">
        <label className="form-label">Nombre</label>
        <input className="form-input" style={{ marginBottom: 12 }} value={formProd.nombre} onChange={e=>setFormProd(f=>({...f, nombre:e.target.value}))} placeholder="Ej: Brazo Gitano" />
        <label className="form-label">Precio (Bs)</label>
        <input className="form-input" type="number" style={{ marginBottom: 20 }} value={formProd.precio_venta} onChange={e=>setFormProd(f=>({...f, precio_venta:e.target.value}))} placeholder="0.00" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalProd(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!formProd.nombre||!formProd.precio_venta} onClick={crearProducto}>Guardar</button>
        </div>
      </Modal>

      {/* ─── MODAL RESERVA ─── */}
      <Modal open={modalReserva} onClose={() => setModalReserva(false)} title="📌 Registrar reserva">
        <label className="form-label">Descripción / Cliente</label>
        <input className="form-input" style={{ marginBottom: 14 }} value={reservaDesc} onChange={e=>setReservaDesc(e.target.value)} placeholder="Ej: Reserva María — 10 panes" />

        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Productos</p>
        {reservaItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select className="form-input form-select" style={{ flex: 2 }} value={item.producto_id ?? ''} onChange={e => {
              const prod = todosProductos.find(p=>p.id===e.target.value)
              setReservaItems(r=>r.map((x,i)=>i===idx?{...x, producto_id:e.target.value, precio_unitario:prod?.precio_venta??0}:x))
            }}>
              <option value="">Seleccionar...</option>
              {todosProductos.map(p=><option key={p.id} value={p.id}>{p.nombre} — Bs {p.precio_venta}</option>)}
            </select>
            <input className="form-input" type="number" style={{ width: 70 }} placeholder="Cant." value={item.cantidad||''} onChange={e=>setReservaItems(r=>r.map((x,i)=>i===idx?{...x,cantidad:+e.target.value}:x))} />
            <button onClick={()=>setReservaItems(r=>r.filter((_,i)=>i!==idx))} style={{ background:'none',border:'none',color:'var(--err)',cursor:'pointer',fontSize:18 }}>×</button>
          </div>
        ))}
        <button onClick={()=>setReservaItems(r=>[...r,{producto_id:'',cantidad:0,precio_unitario:0}])} className="btn-secondary" style={{ width:'100%',marginBottom:14,fontSize:13 }}>+ Ítem</button>

        {totalReserva > 0 && (
          <div style={{ background:'var(--yellow-soft)',borderRadius:10,padding:'10px 14px',display:'flex',justifyContent:'space-between',fontWeight:700,marginBottom:14 }}>
            <span>Total</span><span>Bs {totalReserva.toFixed(2)}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {MEDIOS.map(m=>(
            <button key={m} onClick={()=>setReservaMedio(m)}
              style={{ padding:'12px',borderRadius:10,border:`2px solid ${reservaMedio===m?'var(--yellow-dark)':'var(--silver-light)'}`,background:reservaMedio===m?'var(--yellow-soft)':'#fff',fontWeight:700,cursor:'pointer' }}>
              {m==='efectivo'?'💵 Efectivo':'📱 QR'}
            </button>
          ))}
        </div>

        <div style={{ display:'flex',gap:10 }}>
          <button className="btn-secondary" style={{ flex:1 }} onClick={()=>setModalReserva(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex:1 }} disabled={procesando||reservaItems.length===0||!cajaSesionId} onClick={registrarReserva}>
            {procesando?'Guardando...':'Registrar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}