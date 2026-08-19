import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useSucursal } from '../context/SucursalContext'
import Modal from '../components/Modal'

const MEDIOS = ['efectivo', 'qr']
const BILLETES = [10, 20, 50, 100, 200]
const RAPIDOS = [1, 2, 5, 10, 20, 50]
const PRECIO_PAN_GENERICO = 0.80

export default function Ventas() {
  const toast = useToast()
  const [tab, setTab] = useState('pan')
  const [productos, setProductos] = useState([])
  const [panes, setPanes] = useState([])
  const [cajaSesionId, setCajaSesionId] = useState(null)
  const [historial, setHistorial] = useState([])
  const [procesando, setProcesando] = useState(false)
  const [totalPanStock, setTotalPanStock] = useState(0)

  // Carrito unificado
  const [carrito, setCarrito] = useState([])
  const [medioPago, setMedioPago] = useState('efectivo')
  const [recibido, setRecibido] = useState(0)

  // PAN
  const [cantPan, setCantPan] = useState(0)

  // Cobro rápido de panes
  const [medioPanCobro, setMedioPanCobro] = useState('efectivo')
  const [recibidoPanCobro, setRecibidoPanCobro] = useState(0)
  const [mostrarCobroPan, setMostrarCobroPan] = useState(false)

  // OTROS
  const [busqueda, setBusqueda] = useState('')

  // Modal nuevo producto
  const [modalProd, setModalProd] = useState(false)
  const [formProd, setFormProd] = useState({ nombre: '', precio_venta: '' })

  // Modal reserva
  const [modalReserva, setModalReserva] = useState(false)
  const [reservaDesc, setReservaDesc] = useState('')
  const [reservaItems, setReservaItems] = useState([])
  const [reservaMedio, setReservaMedio] = useState('efectivo')

  // Calcular totales
  const totalCarrito = carrito.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
  const cambio = recibido - totalCarrito

  const totalReserva = reservaItems.reduce((s, i) => s + (i.precio_unitario ?? 0) * (i.cantidad ?? 0), 0)
  const { sucursalActivaId } = useSucursal()

  // Panes en carrito
  const panesEnCarrito = carrito.filter(item => item.es_pan_generico === true)
  const totalPanesEnCarrito = panesEnCarrito.reduce((s, i) => s + i.cantidad, 0)
  const totalPanesAPagar = Number(
    (totalPanesEnCarrito * PRECIO_PAN_GENERICO).toFixed(2)
  )
  const cambioPanCobro = Number(
    (recibidoPanCobro - totalPanesAPagar).toFixed(2)
  )

  const prodsFiltrados = useMemo(() =>
    productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  , [productos, busqueda])

  useEffect(() => { 
    if (sucursalActivaId) fetchInit() 
  }, [sucursalActivaId])

  // ── FETCH INIT ──
  async function fetchInit() {
    if (!sucursalActivaId) return
    const hoy = new Date().toISOString().split('T')[0]
    
    try {
      const [{ data: inv, error: invError }, { data: sesion }, { data: hist, error: histError }] = await Promise.all([
        supabase.from('inventario_sucursal')
          .select('producto_id,stock_actual,stock_minimo,productos!inner(id,nombre,precio_venta,costo_unitario,activo_en_pos,es_pan)')
          .eq('sucursal_id', sucursalActivaId)
          .eq('productos.activo_en_pos', true),
        supabase.from('caja_sesiones')
          .select('id')
          .eq('estado', 'abierta')
          .eq('sucursal_id', sucursalActivaId)
          .limit(1)
          .maybeSingle(),
        supabase.from('ventas')
          .select(`
            id,
            total,
            medio_pago,
            fecha,
            estado,
            usuario_id,
            profiles!ventas_usuario_id_fkey (full_name)
          `)
          .eq('sucursal_id', sucursalActivaId)
          .gte('fecha', hoy)
          .order('fecha', { ascending: false })
          .limit(50)
      ])

      if (invError) {
        console.error('Error cargando inventario POS:', invError)
        toast(invError.message, 'err')
        return
      }

      if (histError) {
        console.error('Error cargando historial:', histError)
      }

      const all = (inv ?? [])
        .map(i => ({ 
          ...i.productos, 
          producto_id: i.producto_id,
          stock_actual: Number(i.stock_actual ?? 0), 
          stock_minimo: Number(i.stock_minimo ?? 0) 
        }))
        .filter(p => p.activo !== false)
        .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'))

      const panesList = all.filter(p => p.es_pan === true)
      const otrosList = all.filter(p => p.es_pan !== true)

      setPanes(panesList)
      setProductos(otrosList)
      
      const total = panesList.reduce((sum, p) => sum + p.stock_actual, 0)
      setTotalPanStock(total)
      
      setCajaSesionId(sesion?.id ?? null)
      
      // Procesar historial
      const historialProcesado = (hist ?? []).map(v => {
        let nombreVendedor = '—'
        if (v.profiles) {
          if (Array.isArray(v.profiles) && v.profiles.length > 0) {
            nombreVendedor = v.profiles[0]?.full_name || '—'
          } else if (typeof v.profiles === 'object') {
            nombreVendedor = v.profiles.full_name || '—'
          }
        }
        return { ...v, vendedor: nombreVendedor }
      })
      
      setHistorial(historialProcesado)
      
    } catch (error) {
      console.error('Error en fetchInit:', error)
      toast('Error al cargar datos', 'err')
    }
  }

  // ── REFRESCAR HISTORIAL ──
  async function refrescarHistorial() {
    if (!sucursalActivaId) return
    const hoy = new Date().toISOString().split('T')[0]
    
    try {
      const { data: hist, error } = await supabase
        .from('ventas')
        .select(`
          id,
          total,
          medio_pago,
          fecha,
          estado,
          usuario_id,
          profiles!ventas_usuario_id_fkey (full_name)
        `)
        .eq('sucursal_id', sucursalActivaId)
        .gte('fecha', hoy)
        .order('fecha', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error refrescando historial:', error)
        return
      }
      
      const historialProcesado = (hist ?? []).map(v => {
        let nombreVendedor = '—'
        if (v.profiles) {
          if (Array.isArray(v.profiles) && v.profiles.length > 0) {
            nombreVendedor = v.profiles[0]?.full_name || '—'
          } else if (typeof v.profiles === 'object') {
            nombreVendedor = v.profiles.full_name || '—'
          }
        }
        return { ...v, vendedor: nombreVendedor }
      })
      
      setHistorial(historialProcesado)
      
    } catch (error) {
      console.error('Error en refrescarHistorial:', error)
    }
  }

  // ── AGREGAR PAN ──
  function agregarPan(cantidad) {
    if (totalPanStock <= 0) {
      toast('No hay pan disponible', 'warn')
      return
    }

    const panEnCarrito = carrito.find(item => item.es_pan_generico === true)
    const panActualEnCarrito = panEnCarrito?.cantidad || 0
    
    const stockRestante = totalPanStock - panActualEnCarrito
    if (cantidad > stockRestante) {
      toast(`Solo quedan ${stockRestante} panes disponibles`, 'warn')
      return
    }

    if (panEnCarrito) {
      setCarrito(carrito.map(item =>
        item.es_pan_generico === true
          ? { 
              ...item, 
              cantidad: item.cantidad + cantidad,
              subtotal: (item.cantidad + cantidad) * PRECIO_PAN_GENERICO
            }
          : item
      ))
    } else {
      setCarrito([...carrito, {
        id: 'pan_generico_' + Date.now(),
        nombre: 'Pan',
        es_pan_generico: true,
        cantidad: cantidad,
        precio_unitario: PRECIO_PAN_GENERICO,
        subtotal: cantidad * PRECIO_PAN_GENERICO
      }])
    }
  }

  // ── AGREGAR PRODUCTO ──
  function agregarProducto(p) {
    if (p.stock_actual <= 0) { 
      toast('Sin stock', 'warn')
      return 
    }

    const itemEnCarrito = carrito.find(item => item.producto_id === p.id)
    const cantidadActual = itemEnCarrito?.cantidad || 0

    if (cantidadActual >= p.stock_actual) {
      toast('Stock insuficiente', 'warn')
      return
    }

    if (itemEnCarrito) {
      setCarrito(carrito.map(item =>
        item.producto_id === p.id
          ? { 
              ...item, 
              cantidad: item.cantidad + 1,
              subtotal: (item.cantidad + 1) * p.precio_venta
            }
          : item
      ))
    } else {
      setCarrito([...carrito, {
        id: p.id,
        producto_id: p.id,
        nombre: p.nombre,
        es_pan_generico: false,
        cantidad: 1,
        precio_unitario: p.precio_venta,
        subtotal: p.precio_venta,
        stock_actual: p.stock_actual
      }])
    }
  }

  // ── ACTUALIZAR CANTIDAD ──
  function actualizarCantidad(index, nuevaCantidad) {
    if (nuevaCantidad <= 0) {
      setCarrito(carrito.filter((_, i) => i !== index))
      return
    }

    const item = carrito[index]
    
    if (item.es_pan_generico) {
      const panEnCarrito = carrito.filter(i => i.es_pan_generico === true)
      const otroPan = panEnCarrito.filter((_, i) => i !== index)
      const otroPanTotal = otroPan.reduce((s, i) => s + i.cantidad, 0)
      
      if (nuevaCantidad + otroPanTotal > totalPanStock) {
        toast(`Solo hay ${totalPanStock - otroPanTotal} panes disponibles`, 'warn')
        return
      }
      
      setCarrito(carrito.map((item, i) =>
        i === index
          ? { ...item, cantidad: nuevaCantidad, subtotal: nuevaCantidad * item.precio_unitario }
          : item
      ))
    } else {
      if (nuevaCantidad > item.stock_actual) {
        toast(`Solo hay ${item.stock_actual} unidades disponibles`, 'warn')
        return
      }
      
      setCarrito(carrito.map((item, i) =>
        i === index
          ? { ...item, cantidad: nuevaCantidad, subtotal: nuevaCantidad * item.precio_unitario }
          : item
      ))
    }
  }

  // ── ELIMINAR DEL CARRITO ──
  function eliminarItem(index) {
    setCarrito(carrito.filter((_, i) => i !== index))
  }

  // ── LIMPIAR CARRITO ──
  function limpiarCarrito() {
    setCarrito([])
    setRecibido(0)
    setCantPan(0)
  }

  // ── LIMPIAR SOLO PANES ──
  function limpiarSoloPanes() {
    setCarrito(carrito.filter(item => !item.es_pan_generico))
    setCantPan(0)
    setRecibidoPanCobro(0)
    setMostrarCobroPan(false)
  }

  // ── COBRAR SOLO PANES ──
  async function cobrarSoloPanes() {
    const panesEnCarrito = carrito.filter(item => item.es_pan_generico === true)
    const totalPanes = panesEnCarrito.reduce((s, i) => s + i.cantidad, 0)
    
    if (totalPanes === 0 || !cajaSesionId) {
      toast('Agrega panes al carrito', 'warn')
      return
    }
    
    const totalAPagar = totalPanes * PRECIO_PAN_GENERICO
    
    if (medioPanCobro === 'efectivo' && (recibidoPanCobro < totalAPagar || recibidoPanCobro <= 0)) {
      toast('Monto insuficiente', 'warn')
      return
    }
    
    setProcesando(true)
    
    const items = panesEnCarrito.map(item => ({
      producto_id: null,
      cantidad: item.cantidad,
      es_pan_generico: true
    }))
    
    const { error } = await supabase.rpc('procesar_venta', {
      p_caja_sesion_id: cajaSesionId,
      p_items: items,
      p_medio_pago: medioPanCobro,
      p_monto_recibido: medioPanCobro === 'efectivo' ? recibidoPanCobro : totalAPagar,
      p_descuento: 0,
    })
    
    setProcesando(false)
    
    if (error) { 
      toast(error.message, 'err')
      return 
    }
    
    const msg = medioPanCobro === 'efectivo' && cambioPanCobro > 0 ? ` — Cambio: Bs ${cambioPanCobro.toFixed(2)}` : ''
    toast(`✓ ${totalPanes} panes Bs ${totalAPagar.toFixed(2)}${msg}`, 'ok')
    
    setCarrito(carrito.filter(item => !item.es_pan_generico))
    setCantPan(0)
    setRecibidoPanCobro(0)
    setMostrarCobroPan(false)
    await fetchInit()
    await refrescarHistorial()
  }

  // ── COBRAR VENTA COMPLETA ──
  async function cobrarVenta() {
    if (carrito.length === 0 || !cajaSesionId) {
      toast('Agrega productos al carrito', 'warn')
      return
    }
    if (medioPago === 'efectivo' && (recibido < totalCarrito || recibido <= 0)) {
      toast('Monto insuficiente', 'warn')
      return
    }
    
    setProcesando(true)
    
    const items = carrito.map(item => ({
      producto_id: item.es_pan_generico ? null : item.producto_id,
      cantidad: item.cantidad,
      es_pan_generico: item.es_pan_generico || false
    }))
    
    const { error } = await supabase.rpc('procesar_venta', {
      p_caja_sesion_id: cajaSesionId,
      p_items: items,
      p_medio_pago: medioPago,
      p_monto_recibido: medioPago === 'efectivo' ? recibido : totalCarrito,
      p_descuento: 0,
    })
    
    setProcesando(false)
    
    if (error) { 
      toast(error.message, 'err')
      return 
    }
    
    const msg = medioPago === 'efectivo' && cambio > 0 ? ` — Cambio: Bs ${cambio.toFixed(2)}` : ''
    toast(`✓ Venta Bs ${totalCarrito.toFixed(2)}${msg}`, 'ok')
    limpiarCarrito()
    await fetchInit()
    await refrescarHistorial()
  }

  // ── NUEVO PRODUCTO ──
  async function crearProducto() {
    if (!formProd.nombre || !formProd.precio_venta) {
      toast('Nombre y precio requeridos', 'warn')
      return
    }
    
    const { data: nuevo, error } = await supabase
      .from('productos')
      .insert({
        nombre: formProd.nombre,
        precio_venta: Number(formProd.precio_venta),
        costo_unitario: 0,
        activo_en_pos: true,
        es_pan: false,
        activo: true,
      })
      .select('id')
      .single()
    
    if (error) { 
      toast(error.message, 'err')
      return 
    }
    
    const { error: invError } = await supabase
      .from('inventario_sucursal')
      .insert({
        producto_id: nuevo.id,
        sucursal_id: sucursalActivaId,
        stock_actual: 0,
        stock_minimo: 2,
      })
    
    if (invError) { 
      toast(invError.message, 'err')
      return 
    }
    
    toast('Producto agregado', 'ok')
    setModalProd(false)
    setFormProd({ nombre: '', precio_venta: '' })
    fetchInit()
  }

  // ── RESERVA ──
  async function registrarReserva() {
    if (!cajaSesionId || reservaItems.length === 0) {
      toast('Agrega items a la reserva', 'warn')
      return
    }
    
    setProcesando(true)
    
    const { error } = await supabase.rpc('procesar_reserva', {
      p_caja_sesion_id: cajaSesionId,
      p_descripcion: reservaDesc,
      p_items: reservaItems
        .filter(i => i.producto_id && i.cantidad > 0)
        .map(i => ({ 
          producto_id: i.producto_id, 
          cantidad: Number(i.cantidad) 
        })),
      p_medio_pago: reservaMedio,
      p_total: totalReserva,
    })
    
    setProcesando(false)
    
    if (error) { 
      toast(error.message, 'err')
      return 
    }
    
    toast('Reserva registrada', 'ok')
    setModalReserva(false)
    setReservaDesc('')
    setReservaItems([])
    fetchInit()
  }

  const todosProductos = [...panes, ...productos]

  return (
    <div className="page-wrap">
      {!cajaSesionId && (
        <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, border: '1px solid var(--warn)' }}>
          ⚠ No hay caja abierta. Ve a <strong>Caja</strong> para iniciar el turno.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--silver-light)', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
        {[
          ['pan', '🍞 Panes'],
          ['otros', '🎂 Productos'],
          ['historial', '📋 Historial']
        ].map(([k, l]) => (
          <button 
            key={k} 
            onClick={() => setTab(k)} 
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color: tab === k ? 'var(--text)' : 'var(--text-soft)',
              borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {l}
            {k === 'pan' && totalPanStock > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-soft)', marginLeft: 6 }}>
                ({totalPanStock})
              </span>
            )}
            {totalPanesEnCarrito > 0 && k === 'pan' && (
              <span className="badge-ok" style={{ fontSize: 10, marginLeft: 4 }}>
                {totalPanesEnCarrito} en carrito
              </span>
            )}
          </button>
        ))}
        <button 
          onClick={() => setModalReserva(true)} 
          style={{ 
            marginLeft: 'auto', 
            padding: '7px 14px', 
            border: '1.5px solid var(--silver-light)', 
            borderRadius: 8, 
            background: 'none', 
            cursor: 'pointer', 
            fontSize: 13, 
            fontWeight: 600, 
            whiteSpace: 'nowrap', 
            flexShrink: 0 
          }}
        >
          📌 Reserva
        </button>
      </div>

      {/* ─── TAB PAN ─── */}
      {tab === 'pan' && (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          {totalPanStock === 0 ? (
            <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              ⚠ No hay pan disponible. Asegúrate de tener productos con <strong>es_pan = true</strong> y stock en inventario.
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: 28, textAlign: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
                  Pan — Bs {PRECIO_PAN_GENERICO.toFixed(2)} c/u
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
                  <button 
                    onClick={() => {
                      if (cantPan > 0) setCantPan(c => c - 1)
                    }} 
                    style={{ width: 60, height: 60, borderRadius: 16, border: '2px solid var(--silver-light)', background: 'none', fontSize: 30, cursor: 'pointer', fontWeight: 700 }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 80, fontWeight: 900, minWidth: 120, textAlign: 'center', lineHeight: 1 }}>
                    {cantPan}
                  </span>
                  <button 
                    onClick={() => {
                      agregarPan(1)
                      setCantPan(c => c + 1)
                    }} 
                    style={{ width: 60, height: 60, borderRadius: 16, border: '2px solid var(--yellow)', background: 'var(--yellow-soft)', fontSize: 30, cursor: 'pointer', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
                {cantPan > 0 && (
                  <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--ok)' }}>
                    Bs {(cantPan * PRECIO_PAN_GENERICO).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Botones rápidos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
                {RAPIDOS.map(n => (
                  <button 
                    key={n} 
                    onClick={() => {
                      agregarPan(n)
                      setCantPan(c => c + n)
                    }}
                    style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--silver-light)', background: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}
                  >
                    +{n}
                  </button>
                ))}
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <button 
                  onClick={limpiarSoloPanes}
                  style={{ 
                    flex: 1,
                    padding: 10, 
                    borderRadius: 10, 
                    border: '1px solid var(--silver-light)', 
                    background: 'none', 
                    fontSize: 13, 
                    color: 'var(--err)', 
                    cursor: 'pointer' 
                  }}
                >
                  Limpiar panes
                </button>
                <button 
                  onClick={() => {
                    if (totalPanesEnCarrito === 0) {
                      toast('Agrega panes primero', 'warn')
                      return
                    }
                    setMostrarCobroPan(!mostrarCobroPan)
                  }}
                  style={{ 
                    flex: 1,
                    padding: 10, 
                    borderRadius: 10, 
                    border: '2px solid var(--yellow-dark)', 
                    background: 'var(--yellow-soft)', 
                    fontSize: 13, 
                    fontWeight: 700, 
                    cursor: 'pointer' 
                  }}
                >
                  {mostrarCobroPan ? 'Ocultar cobro' : '💳 Cobrar panes'}
                </button>
              </div>

              {/* Botón para ir al carrito completo */}
              {carrito.filter(i => !i.es_pan_generico).length > 0 && (
                <button 
                  onClick={() => setTab('otros')}
                  style={{ 
                    width: '100%', 
                    padding: 12, 
                    borderRadius: 10, 
                    border: '2px solid var(--info)', 
                    background: 'var(--info-bg)', 
                    fontSize: 14, 
                    fontWeight: 700, 
                    cursor: 'pointer',
                    marginBottom: 12
                  }}
                >
                  🛒 Ver carrito completo ({carrito.reduce((s, i) => s + i.cantidad, 0)} items)
                </button>
              )}

              {/* ─── COBRO RÁPIDO DE PANES ─── */}
              {mostrarCobroPan && totalPanesEnCarrito > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <p style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
                    💳 Cobrar {totalPanesEnCarrito} panes — Bs {totalPanesAPagar.toFixed(2)}
                  </p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {MEDIOS.map(m => (
                      <button 
                        key={m} 
                        onClick={() => setMedioPanCobro(m)}
                        style={{ 
                          padding: 14, 
                          borderRadius: 12, 
                          border: `2px solid ${medioPanCobro === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, 
                          background: medioPanCobro === m ? 'var(--yellow-soft)' : '#fff', 
                          fontWeight: 700, 
                          fontSize: 15, 
                          cursor: 'pointer' 
                        }}
                      >
                        {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                      </button>
                    ))}
                  </div>

                  {medioPanCobro === 'efectivo' && (
                    <>
                      <input 
                        className="form-input" 
                        type="number" 
                        value={recibidoPanCobro || ''}
                        onChange={e => setRecibidoPanCobro(+e.target.value)}
                        placeholder="Monto recibido" 
                        style={{ marginBottom: 10, fontSize: 18, textAlign: 'center', fontWeight: 700 }} 
                      />
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {BILLETES.map(b => (
                          <button 
                            key={b} 
                            onClick={() => setRecibidoPanCobro(r => r + b)}
                            style={{ padding: '6px 12px', borderRadius: 20, background: 'var(--silver-light)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                          >
                            Bs {b}
                          </button>
                        ))}
                      </div>
                      {recibidoPanCobro > 0 && recibidoPanCobro < totalPanesAPagar && (
                        <p style={{ color: 'var(--err)', fontWeight: 700, marginBottom: 8 }}>⚠ Monto insuficiente</p>
                      )}
                      {recibidoPanCobro >= totalPanesAPagar && recibidoPanCobro > 0 && (
                        <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 22, textAlign: 'center', marginBottom: 12 }}>
                          Cambio: Bs {cambioPanCobro.toFixed(2)}
                        </div>
                      )}
                    </>
                  )}

                  <button 
                    className="btn-primary" 
                    onClick={cobrarSoloPanes}
                    disabled={procesando || !cajaSesionId || (medioPanCobro === 'efectivo' && (recibidoPanCobro < totalPanesAPagar || recibidoPanCobro <= 0))}
                    style={{ width: '100%', padding: 16, fontSize: 16, borderRadius: 12 }}
                  >
                    {procesando ? 'Procesando...' : `✓ Cobrar Bs ${totalPanesAPagar.toFixed(2)}`}
                  </button>
                </div>
              )}

              {/* Mensaje si hay panes en carrito pero no se muestra el cobro */}
              {!mostrarCobroPan && totalPanesEnCarrito > 0 && (
                <div style={{ 
                  background: 'var(--info-bg)', 
                  color: 'var(--info)', 
                  padding: 10, 
                  borderRadius: 8, 
                  fontSize: 13, 
                  textAlign: 'center',
                  marginTop: 8
                }}>
                  💡 Tienes {totalPanesEnCarrito} panes en el carrito. 
                  Haz clic en "Cobrar panes" para finalizar.
                </div>
              )}
            </>
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
                <input 
                  className="form-input" 
                  style={{ paddingLeft: 34 }} 
                  placeholder="Buscar producto..."
                  value={busqueda} 
                  onChange={e => setBusqueda(e.target.value)} 
                />
              </div>
              <button className="btn-secondary" onClick={() => setModalProd(true)} style={{ fontSize: 13, whiteSpace: 'nowrap', padding: '8px 14px' }}>
                + Nuevo
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {prodsFiltrados.length === 0 && <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin resultados</p>}
              {prodsFiltrados.map(p => (
                <button 
                  key={p.id} 
                  onClick={() => agregarProducto(p)} 
                  disabled={p.stock_actual <= 0}
                  style={{ 
                    background: '#fff', 
                    border: `1.5px solid ${carrito.find(i=>i.producto_id === p.id) ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, 
                    borderRadius: 12, 
                    padding: '12px 10px', 
                    textAlign: 'left', 
                    cursor: p.stock_actual > 0 ? 'pointer' : 'not-allowed', 
                    opacity: p.stock_actual <= 0 ? .45 : 1, 
                    transition: 'border-color .15s' 
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{p.nombre}</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-soft)' }}>Bs {Number(p.precio_venta).toFixed(2)}</p>
                  {carrito.find(i=>i.producto_id === p.id) && (
                    <span className="badge-ok" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                      ×{carrito.find(i=>i.producto_id === p.id).cantidad}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Carrito */}
          <div className="card" style={{ padding: 20, width: 280, flexShrink: 0, alignSelf: 'start', position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 700, flex: 1 }}>🛒 Carrito ({carrito.reduce((s, i) => s + i.cantidad, 0)} items)</span>
              {carrito.length > 0 && (
                <button onClick={limpiarCarrito} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 12 }}>
                  Limpiar
                </button>
              )}
            </div>

            {carrito.length === 0
              ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Selecciona productos o agrega panes</p>
              : (
                <>
                  {carrito.map((item, index) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                          {item.es_pan_generico ? '🍞 Pan' : item.nombre}
                        </p>
                        <p style={{ color: 'var(--text-soft)', fontSize: 11 }}>Bs {Number(item.precio_unitario).toFixed(2)}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button 
                          onClick={() => actualizarCantidad(index, item.cantidad - 1)} 
                          style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                        >
                          −
                        </button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{item.cantidad}</span>
                        <button 
                          onClick={() => actualizarCantidad(index, item.cantidad + 1)} 
                          style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                        >
                          +
                        </button>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 48 }}>
                        <p style={{ fontWeight: 700, fontSize: 12 }}>Bs {(item.precio_unitario * item.cantidad).toFixed(2)}</p>
                        <button onClick={() => eliminarItem(index)} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, margin: '14px 0' }}>
                    <span>Total</span><span>Bs {totalCarrito.toFixed(2)}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {MEDIOS.map(m => (
                      <button 
                        key={m} 
                        onClick={() => setMedioPago(m)}
                        style={{ 
                          padding: '10px', 
                          borderRadius: 10, 
                          border: `2px solid ${medioPago === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, 
                          background: medioPago === m ? 'var(--yellow-soft)' : '#fff', 
                          fontWeight: 700, 
                          cursor: 'pointer', 
                          fontSize: 13 
                        }}
                      >
                        {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                      </button>
                    ))}
                  </div>

                  {medioPago === 'efectivo' && (
                    <>
                      <input 
                        className="form-input" 
                        type="number" 
                        value={recibido || ''} 
                        onChange={e => setRecibido(+e.target.value)} 
                        placeholder="Monto recibido" 
                        style={{ marginBottom: 8, textAlign: 'center', fontSize: 15, fontWeight: 700 }} 
                      />
                      {recibido >= totalCarrito && recibido > 0 && (
                        <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '8px', borderRadius: 8, fontWeight: 800, textAlign: 'center', marginBottom: 8, fontSize: 16 }}>
                          Cambio: Bs {cambio.toFixed(2)}
                        </div>
                      )}
                    </>
                  )}

                  <button 
                    className="btn-primary" 
                    onClick={cobrarVenta}
                    disabled={procesando || !cajaSesionId || (medioPago === 'efectivo' && (recibido < totalCarrito || recibido <= 0))}
                    style={{ width: '100%', padding: 14, fontSize: 15 }}
                  >
                    {procesando ? 'Procesando...' : `✓ Cobrar Bs ${totalCarrito.toFixed(2)}`}
                  </button>
                </>
              )}
          </div>
        </div>
      )}

      {/* ─── TAB HISTORIAL ─── */}
      {tab === 'historial' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid var(--silver-light)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: 700 }}>📋 Ventas de hoy</span>
            <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
              {historial.length} venta{historial.length !== 1 ? 's' : ''}
              <button 
                onClick={refrescarHistorial}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-soft)', 
                  cursor: 'pointer',
                  fontSize: 14,
                  marginLeft: 8
                }}
                title="Refrescar historial"
              >
                🔄
              </button>
            </span>
          </div>
          <div className="table-scroll">
            <table className="clap-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Total</th>
                  <th>Medio</th>
                  <th>Vendedor</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 32 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                      Sin ventas registradas hoy
                    </td>
                  </tr>
                ) : (
                  historial.map(v => (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>
                        {new Date(v.fecha).toLocaleTimeString('es-BO', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        Bs {Number(v.total || 0).toFixed(2)}
                      </td>
                      <td>
                        <span className="badge-info" style={{ 
                          background: v.medio_pago === 'efectivo' ? 'var(--ok-bg)' : 'var(--info-bg)',
                          color: v.medio_pago === 'efectivo' ? 'var(--ok)' : 'var(--info)'
                        }}>
                          {v.medio_pago === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-soft)', fontSize: 12 }}>
                        {v.vendedor || '—'}
                      </td>
                      <td>
                        <span className={v.estado === 'anulada' ? 'badge-err' : 'badge-ok'}>
                          {v.estado === 'anulada' ? '❌ Anulada' : '✅ Completada'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {historial.length >= 50 && (
            <div style={{ 
              padding: '8px 16px', 
              textAlign: 'center', 
              fontSize: 11, 
              color: 'var(--text-soft)',
              borderTop: '1px solid var(--silver-light)'
            }}>
              Mostrando últimas 50 ventas
            </div>
          )}
        </div>
      )}

      {/* ─── MODALES ─── */}
      <Modal open={modalProd} onClose={() => setModalProd(false)} title="Agregar producto">
        <label className="form-label">Nombre</label>
        <input 
          className="form-input" 
          style={{ marginBottom: 12 }} 
          value={formProd.nombre} 
          onChange={e=>setFormProd(f=>({...f, nombre:e.target.value}))} 
          placeholder="Ej: Brazo Gitano" 
        />
        <label className="form-label">Precio (Bs)</label>
        <input 
          className="form-input" 
          type="number" 
          style={{ marginBottom: 20 }} 
          value={formProd.precio_venta} 
          onChange={e=>setFormProd(f=>({...f, precio_venta:e.target.value}))} 
          placeholder="0.00" 
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalProd(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!formProd.nombre||!formProd.precio_venta} onClick={crearProducto}>Guardar</button>
        </div>
      </Modal>

      <Modal open={modalReserva} onClose={() => setModalReserva(false)} title="📌 Registrar reserva">
        <label className="form-label">Descripción / Cliente</label>
        <input 
          className="form-input" 
          style={{ marginBottom: 14 }} 
          value={reservaDesc} 
          onChange={e=>setReservaDesc(e.target.value)} 
          placeholder="Ej: Reserva María — 10 panes" 
        />
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Productos</p>
        {reservaItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select 
              className="form-input form-select" 
              style={{ flex: 2 }} 
              value={item.producto_id ?? ''} 
              onChange={e => {
                const prod = todosProductos.find(p=>p.id===e.target.value)
                setReservaItems(r=>r.map((x,i)=>i===idx?{...x, producto_id:e.target.value, precio_unitario:prod?.precio_venta??0}:x))
              }}
            >
              <option value="">Seleccionar...</option>
              {todosProductos.map(p=><option key={p.id} value={p.id}>{p.nombre} — Bs {p.precio_venta}</option>)}
            </select>
            <input 
              className="form-input" 
              type="number" 
              style={{ width: 70 }} 
              placeholder="Cant." 
              value={item.cantidad||''} 
              onChange={e=>setReservaItems(r=>r.map((x,i)=>i===idx?{...x,cantidad:+e.target.value}:x))} 
            />
            <button 
              onClick={()=>setReservaItems(r=>r.filter((_,i)=>i!==idx))} 
              style={{ background:'none',border:'none',color:'var(--err)',cursor:'pointer',fontSize:18 }}
            >
              ×
            </button>
          </div>
        ))}
        <button 
          onClick={() => setReservaItems(r => [
            ...r,
            { producto_id: '', cantidad: 0, precio_unitario: 0 }
          ])} 
          className="btn-secondary" 
          style={{ width:'100%', marginBottom:14, fontSize:13 }}
        >
          + Ítem
        </button>

        <div 
          style={{
            background:'var(--yellow-soft)',
            borderRadius:10,
            padding:'10px 14px',
            display:'flex',
            justifyContent:'space-between',
            fontWeight:700,
            marginBottom:14
          }}
        >
          <span>Total</span>
          <span>Bs {totalReserva.toFixed(2)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {MEDIOS.map(m=>(
            <button 
              key={m} 
              onClick={()=>setReservaMedio(m)}
              style={{ 
                padding:'12px',
                borderRadius:10,
                border:`2px solid ${reservaMedio===m?'var(--yellow-dark)':'var(--silver-light)'}`,
                background:reservaMedio===m?'var(--yellow-soft)':'#fff',
                fontWeight:700,
                cursor:'pointer'
              }}
            >
              {m==='efectivo'?'💵 Efectivo':'📱 QR'}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn-secondary" style={{ flex:1 }} onClick={()=>setModalReserva(false)}>Cancelar</button>
          <button 
            className="btn-primary" 
            style={{ flex:1 }} 
            disabled={procesando || reservaItems.length===0 || !cajaSesionId} 
            onClick={registrarReserva}
          >
            {procesando?'Guardando...':'Registrar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}