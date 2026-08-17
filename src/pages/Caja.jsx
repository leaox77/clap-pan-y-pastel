import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { useSucursal } from '../context/SucursalContext'

// ============================================================
// FUNCIONES DE FECHA PARA BOLIVIA (UTC-4)
// ============================================================

// Obtener la fecha actual de Bolivia en formato Date
function getBoliviaDate() {
  const now = new Date()
  // Bolivia está en UTC-4
  const boliviaTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) - 4 * 3600000)
  return boliviaTime
}

// Obtener la fecha de Bolivia en formato YYYY-MM-DD
function getBoliviaDateString() {
  const boliviaDate = getBoliviaDate()
  return boliviaDate.toISOString().split('T')[0]
}

// Obtener el timestamp de Bolivia en formato ISO
// Obtener timestamp de Bolivia en formato para PostgreSQL
// Función que obtiene la hora actual de Bolivia como string para PostgreSQL
function getBoliviaTimestampForDB() {
  // Crear fecha en Bolivia usando la zona horaria del navegador
  const now = new Date()
  // Obtener el offset actual del navegador y ajustar a UTC-4
  const offset = now.getTimezoneOffset() // en minutos
  const boliviaOffset = -240 // UTC-4 en minutos
  const diffMinutes = boliviaOffset - offset
  const boliviaTime = new Date(now.getTime() + diffMinutes * 60000)
  
  // Formatear para PostgreSQL
  return boliviaTime.toISOString().replace('T', ' ').slice(0, 19)
}

function formatBoliviaTime(timestamp) {
  if (!timestamp) return '--:--'
  const date = new Date(timestamp)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// ============================================================

const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10]

function totalDenoms(d) {
  return DENOMS.reduce((s, k) => s + (d[k] ?? 0) * k, 0)
}

function DenomInput({ value, onChange, label }) {
  return (
    <div>
      {label && <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}</p>}
      <div className="grid-2" style={{ gap: 6 }}>
        {DENOMS.map(d => (
          <div
            key={d}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-soft)',
              borderRadius: 8,
              padding: '5px 8px'
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 44 }}>Bs {d}</span>
            <input
              type="text"
              inputMode="numeric"
              value={value[d] === undefined || value[d] === 0 ? '' : value[d]}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '')
                const n = { ...value }
                if (raw === '') {
                  delete n[d]
                } else {
                  n[d] = Number(raw)
                }
                onChange(n)
              }}
              placeholder="0"
              style={{
                width: '100%',
                border: '1px solid var(--silver-light)',
                borderRadius: 6,
                padding: '4px 6px',
                fontSize: 13
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-soft)',
                minWidth: 46,
                textAlign: 'right'
              }}
            >
              {((value[d] ?? 0) * d).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Caja() {
  const toast = useToast()
  const { role } = useAuth()
  const { sucursalActivaId, sucursalActiva } = useSucursal()
  const esAdmin = ['administrador', 'propietaria'].includes(role)

  const [sesion, setSesion] = useState(null)
  const [sesionAnterior, setSesionAnterior] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [gastos, setGastos] = useState([])
  const [productos, setProductos] = useState([])
  const [sobraantesPendientes, setSobraantesPendientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('idle')
  const [turnoBloqueado, setTurnoBloqueado] = useState(false)

  // Apertura
  const [denom, setDenom] = useState({})
  const [cajasPan, setCajasPan] = useState([])
  const [numCajas, setNumCajas] = useState('')
  const [panSobrAnterior, setPanSobrAnterior] = useState(0)
  const [tipoTurno, setTipoTurno] = useState('manana')
  const [sobraantesConfirmados, setSobraantesConfirmados] = useState([])
  const [productosPan, setProductosPan] = useState([])

  // Cierre
  const [denomCierre, setDenomCierre] = useState({})
  const [panSobrCierre, setPanSobrCierre] = useState('')
  const [perdidasMonto, setPerdidasMonto] = useState('')
  const [perdidasNota, setPerdidasNota] = useState('')
  const [sobraantesCierre, setSobraantesCierre] = useState([])
  const [ventasTurno, setVentasTurno] = useState([])

  // Ingreso extra
  const [modalIngresoExtra, setModalIngresoExtra] = useState(false)
  const [ingresoExtra, setIngresoExtra] = useState({ producto_id: '', cantidad: '', nota: '' })

  // Ajuste fondo
  const [denomAjuste, setDenomAjuste] = useState({})
  const [motivoAjuste, setMotivoAjuste] = useState('')

  useEffect(() => {
    if (!sucursalActivaId) {
      setSesion(null)
      setSesionAnterior(null)
      setMovimientos([])
      setGastos([])
      setProductos([])
      setProductosPan([])
      setSobraantesPendientes([])
      setSobraantesConfirmados([])
      setVentasTurno([])
      setLoading(false)
      return
    }

    setStep('idle')
    setSesion(null)
    setSesionAnterior(null)
    setMovimientos([])
    setGastos([])
    setProductos([])
    setProductosPan([])
    setSobraantesPendientes([])
    setSobraantesConfirmados([])
    setDenom({})
    setDenomCierre({})
    setDenomAjuste({})
    setTurnoBloqueado(false)
    setCajasPan([])
    setNumCajas('')

    fetchData()
  }, [sucursalActivaId])

  async function fetchData() {
    if (!sucursalActivaId) return

    setLoading(true)

    try {
      // 1. CAJA ABIERTA
      const { data: s, error: sesionError } = await supabase
        .from('caja_sesiones')
        .select('*, profiles!usuario_apertura_id(full_name)')
        .eq('estado', 'abierta')
        .eq('sucursal_id', sucursalActivaId)
        .limit(1)
        .maybeSingle()

      if (sesionError) {
        console.error('Error cargando caja:', sesionError)
      }

      // 2. PRODUCTOS
      const { data: prods, error: productosError } = await supabase
        .from('inventario_sucursal')
        .select(`
          *,
          productos (
            *,
            categorias(nombre)
          )
        `)
        .eq('sucursal_id', sucursalActivaId)

      if (productosError) {
        console.error('Error cargando productos:', productosError)
      }

      const productosNormalizados = (prods ?? [])
        .map(item => ({
          ...item,
          ...(item.productos ?? {}),
          categoria: item.productos?.categorias ?? null,
        }))
        .filter(p => p.activo !== false)

      setProductos(productosNormalizados)
      
      const panes = productosNormalizados.filter(p => p.es_pan === true)
      setProductosPan(panes)

      setSesion(s ?? null)

      // 3. SI HAY CAJA ABIERTA
      if (s) {
        const [{ data: movs, error: movError }, { data: g, error: gastoError }] = await Promise.all([
          supabase
            .from('caja_movimientos')
            .select('*')
            .eq('caja_sesion_id', s.id)
            .order('fecha', { ascending: false }),
          supabase
            .from('gastos')
            .select('*')
            .eq('caja_sesion_id', s.id)
        ])

        if (movError) console.error('Error cargando movimientos:', movError)
        if (gastoError) console.error('Error cargando gastos:', gastoError)

        setMovimientos(movs ?? [])
        setGastos(g ?? [])

        // Ventas del turno
        const { data: ventasSesion, error: ventasSesionError } = await supabase
          .from('ventas')
          .select(`
            id,
            total,
            medio_pago,
            fecha,
            estado,
            venta_items (
              ganancia,
              subtotal,
              cantidad,
              producto_id,
              productos (
                nombre,
                es_pan
              )
            )
          `)
          .eq('caja_sesion_id', s.id)
          .eq('estado', 'completada')
          .order('fecha', { ascending: false })

        if (ventasSesionError) console.error('Error cargando ventas del turno:', ventasSesionError)

        const idsVentas = (ventasSesion ?? []).map(v => v.id)
        if (idsVentas.length) {
          const { data: itemsSesion, error: itemsSesionError } = await supabase
            .from('venta_items')
            .select('venta_id,producto_id,cantidad,subtotal,ganancia,productos(nombre,es_pan)')
            .in('venta_id', idsVentas)

          if (itemsSesionError) console.error('Error cargando detalle de ventas:', itemsSesionError)
          setVentasTurno((ventasSesion ?? []).map(v => ({
            ...v,
            items: (itemsSesion ?? []).filter(i => i.venta_id === v.id)
          })))
        } else {
          setVentasTurno([])
        }

        // Sesión anterior
        if (s.sesion_anterior_id) {
          const { data: ant } = await supabase
            .from('caja_sesiones')
            .select('*')
            .eq('id', s.sesion_anterior_id)
            .eq('sucursal_id', sucursalActivaId)
            .maybeSingle()
          setSesionAnterior(ant ?? null)
        } else {
          setSesionAnterior(null)
        }

        setSobraantesPendientes([])
        setSobraantesConfirmados([])
        setTurnoBloqueado(false)
        return
      }

      // 4. NO HAY CAJA ABIERTA - Usar fechas de Bolivia
      const hoyStr = getBoliviaDateString()
      
      // Calcular ayer en Bolivia
      const ayerDate = getBoliviaDate()
      ayerDate.setDate(ayerDate.getDate() - 1)
      const ayerStr = ayerDate.toISOString().split('T')[0]

      // Sobrantes pendientes
      const { data: sob, error: sobError } = await supabase
        .from('sobrantes_dia')
        .select('*')
        .eq('confirmado', false)
        .eq('sucursal_id', sucursalActivaId)
        .gte('fecha', ayerStr)
        .order('created_at', { ascending: false })

      if (sobError) {
        console.error('Error cargando sobrantes:', sobError)
      }

      // Última sesión cerrada
      const { data: ultima, error: ultimaError } = await supabase
        .from('caja_sesiones')
        .select('*')
        .eq('estado', 'cerrada')
        .eq('sucursal_id', sucursalActivaId)
        .order('fecha_cierre', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (ultimaError) {
        console.error('Error cargando última sesión:', ultimaError)
      }

      const sobConCantidad = (sob ?? []).map(s => ({
        ...s,
        cantidad_recibida: s.cantidad_registrada,
      }))

      setSobraantesPendientes(sobConCantidad)
      setSobraantesConfirmados(
        sobConCantidad.map(s => ({
          ...s,
          incluir: true,
          esmerma: false,
        }))
      )

      // DETERMINAR TURNO AUTOMÁTICAMENTE usando fechas de Bolivia
      if (ultima) {
        setSesionAnterior(ultima)

        const panSobrante = Number(ultima.pan_sobrante_cierre ?? 0)
        setPanSobrAnterior(panSobrante)

        // Convertir fecha de cierre a Bolivia para comparar
        const fechaCierre = ultima.fecha_cierre 
          ? new Date(ultima.fecha_cierre).toISOString().split('T')[0] 
          : null

        if (ultima.tipo_turno === 'manana') {
          if (fechaCierre === hoyStr) {
            // Turno mañana cerrado hoy → solo se puede abrir tarde
            setTipoTurno('tarde')
            setTurnoBloqueado(false)
          } else {
            // Turno mañana cerrado en día anterior → se puede abrir mañana
            setTipoTurno('manana')
            setTurnoBloqueado(false)
          }
        } else if (ultima.tipo_turno === 'tarde') {
          //if (fechaCierre === hoyStr) {
            // Turno tarde cerrado hoy → se puede abrir mañana
            setTipoTurno('manana')
            setTurnoBloqueado(false)
          /*} else {
            // Turno tarde cerrado en día anterior → hay problema
            setTipoTurno('manana')
            setTurnoBloqueado(true)
            toast('El turno tarde del día anterior no fue cerrado. Revisa la caja.', 'warn')
          }*/
        }
      } else {
        // No hay sesión anterior → comenzar con mañana
        setSesionAnterior(null)
        setTipoTurno('manana')
        setPanSobrAnterior(0)
        setTurnoBloqueado(false)
      }
    } catch (err) {
      console.error('Error general cargando Caja:', err)
      toast('No se pudo cargar la información de caja', 'err')
    } finally {
      setLoading(false)
    }
  }

  // Función para agregar cajas de pan
  const agregarCajasPan = () => {
    const num = Number(numCajas)
    if (num <= 0 || !num) {
      toast('Ingresa un número válido de cajas', 'warn')
      return
    }

    const nuevasCajas = []
    for (let i = 0; i < num; i++) {
      nuevasCajas.push({
        producto_id: '',
        cantidad: '',
        index: cajasPan.length + i
      })
    }

    setCajasPan([...cajasPan, ...nuevasCajas])
    setNumCajas('')
  }

  // Función para eliminar una caja
  const eliminarCaja = (index) => {
    setCajasPan(cajasPan.filter((_, i) => i !== index))
  }

  // Función para actualizar una caja
  const actualizarCaja = (index, field, value) => {
    setCajasPan(cajasPan.map((c, i) => 
      i === index ? { ...c, [field]: value } : c
    ))
  }

  // Calcular total de panes
  const totalPanes = cajasPan.reduce((sum, c) => sum + (Number(c.cantidad) || 0), 0) + Number(panSobrAnterior || 0)

  async function abrirCaja() {
    if (!sucursalActivaId) {
        toast('No hay una sucursal seleccionada', 'err')
        return
    }

    const monto = totalDenoms(denom)

    // Validar que todas las cajas tengan producto y cantidad
    for (const caja of cajasPan) {
        if (!caja.producto_id) {
            toast('Todos los tipos de pan deben estar seleccionados', 'warn')
            return
        }
        if (!caja.cantidad || Number(caja.cantidad) <= 0) {
            toast('Todas las cajas deben tener una cantidad válida', 'warn')
            return
        }
    }

    // Procesar mermas de sobrantes
    for (const s of sobraantesConfirmados) {
        if (!s.esmerma) continue

        if (!s.motivo_merma?.trim()) {
            toast(`Escribe el motivo de merma para "${s.producto_nombre}"`, 'warn')
            return
        }

        const { error } = await supabase.rpc('sobrante_a_merma', {
            p_sobrante_id: s.id,
            p_motivo: s.motivo_merma,
        })

        if (error) {
            console.error('Error procesando merma:', error)
            toast(error.message, 'err')
            return
        }
    }

    // Preparar datos de cajas de pan (para stock)
    const cajasPanData = cajasPan.map(c => ({
        producto_id: c.producto_id,
        cantidad: Number(c.cantidad)
    }))

    // Preparar datos de panes por caja (para registro/detalle)
    const panesPorCajaData = cajasPan.map((c, index) => ({
        caja_numero: index + 1,
        producto_id: c.producto_id,
        producto_nombre: productosPan.find(p => p.id === c.producto_id)?.nombre || 'Desconocido',
        cantidad: Number(c.cantidad)
    }))

    // 🔥 CORRECCIÓN: Obtener timestamp de Bolivia para la apertura
    const timestampBolivia = getBoliviaTimestampForDB() 

    // Abrir caja - AHORA CON TODOS LOS PARÁMETROS
    const { data, error } = await supabase.rpc('abrir_caja', {
        p_cajas_pan: cajasPanData,
        p_denominaciones: denom,
        p_monto: monto,
        p_pan_sobrante_anterior: Number(panSobrAnterior) || 0,
        p_panes_por_caja: panesPorCajaData,
        p_sesion_anterior_id: sesionAnterior?.id ?? null,
        p_sobrantes_confirmados: sobraantesConfirmados
            .filter(s => s.incluir !== false && !s.esmerma)
            .map(s => ({
                id: s.id,
                producto_id: s.producto_id,
                cantidad_recibida: Number(s.cantidad_recibida),
            })),
        p_sucursal_id: sucursalActivaId,
        p_tipo_turno: tipoTurno,
        p_fecha_apertura: timestampBolivia, // 🔥 NUEVO: pasar la fecha de Bolivia
    })

    if (error) {
        console.error('Error abriendo caja:', error)
        toast(error.message, 'err')
        return
    }

    toast(`Turno ${tipoTurno === 'manana' ? '☀️ mañana' : '🌙 tarde'} iniciado — ${totalPanes} panes`, 'ok')

    setStep('idle')
    setDenom({})
    setCajasPan([])
    setNumCajas('')
    await fetchData()
  }

  async function cerrarCaja() {
    if (!sesion) {
      toast('No hay una caja abierta', 'err')
      return
    }

    if (sesion.sucursal_id && sesion.sucursal_id !== sucursalActivaId) {
      toast('La caja pertenece a otra sucursal', 'err')
      return
    }

    const montoFisico = totalDenoms(denomCierre)

    const sobFiltrados = sobraantesCierre.filter(s => s.producto_id && Number(s.cantidad) > 0)

    // 🔥 CORRECCIÓN: Obtener timestamp de Bolivia para el cierre
    const timestampBolivia = getBoliviaTimestampForDB() 

    const { data, error } = await supabase.rpc('cerrar_caja', {
      p_caja_sesion_id: sesion.id,
      p_monto_fisico: montoFisico,
      p_denominaciones: denomCierre,
      p_pan_sobrante_cierre: Number(panSobrCierre) || 0,
      p_perdidas_monto: Number(perdidasMonto) || 0,
      p_perdidas_nota: perdidasNota,
      p_sobrantes: sobFiltrados.map(s => ({
        producto_id: s.producto_id,
        producto_nombre: productos.find(p => p.id === s.producto_id)?.nombre ?? s.producto_id,
        cantidad: Number(s.cantidad),
      })),
      p_fecha_cierre: timestampBolivia, // 🔥 NUEVO: pasar la fecha de Bolivia
    })

    if (error) {
      console.error('Error cerrando caja:', error)
      toast(error.message, 'err')
      return
    }

    toast(`Turno ${sesion.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'} cerrado correctamente`, 'ok')

    setStep('idle')
    setDenomCierre({})
    setPanSobrCierre('')
    setPerdidasMonto('')
    setPerdidasNota('')
    setSobraantesCierre([])

    await fetchData()
  }

  async function registrarIngresoExtra() {
    if (!sesion || !ingresoExtra.producto_id || Number(ingresoExtra.cantidad) <= 0) {
      toast('Selecciona un producto y una cantidad válida', 'warn')
      return
    }

    const { error } = await supabase.rpc('registrar_ingreso_inventario', {
      p_producto_id: ingresoExtra.producto_id,
      p_sucursal_id: sucursalActivaId,
      p_cantidad: Number(ingresoExtra.cantidad),
      p_nota: ingresoExtra.nota.trim() || 'Ingreso adicional durante el turno',
    })

    if (error) {
      toast(error.message, 'err')
      return
    }

    toast('Ingreso adicional registrado', 'ok')
    setModalIngresoExtra(false)
    setIngresoExtra({ producto_id: '', cantidad: '', nota: '' })
    await fetchData()
  }

  async function ajustarFondo() {
    if (!sesion) {
      toast('No hay una caja abierta', 'err')
      return
    }

    if (sesion.sucursal_id && sesion.sucursal_id !== sucursalActivaId) {
      toast('La caja pertenece a otra sucursal', 'err')
      return
    }

    if (!motivoAjuste.trim()) {
      toast('Debes indicar el motivo del ajuste', 'warn')
      return
    }

    const nuevoMonto = totalDenoms(denomAjuste)

    const { error } = await supabase.rpc('ajustar_fondo_caja', {
      p_caja_sesion_id: sesion.id,
      p_nuevo_monto: nuevoMonto,
      p_denominaciones: denomAjuste,
      p_motivo: motivoAjuste.trim(),
    })

    if (error) {
      console.error('Error ajustando fondo:', error)
      toast(error.message, 'err')
      return
    }

    toast('Fondo ajustado correctamente', 'ok')
    setStep('idle')
    setDenomAjuste({})
    setMotivoAjuste('')
    await fetchData()
  }

  if (loading) {
    return (
      <div className="page-wrap" style={{ color: 'var(--text-soft)' }}>
        Cargando caja...
      </div>
    )
  }

  // CÁLCULOS
  const ef = movimientos
    .filter(m => ['venta', 'reserva'].includes(m.tipo) && m.medio_pago === 'efectivo')
    .reduce((s, m) => s + Number(m.monto), 0)

  const qr = movimientos
    .filter(m => ['venta', 'reserva'].includes(m.tipo) && m.medio_pago === 'qr')
    .reduce((s, m) => s + Number(m.monto), 0)

  const tr = movimientos
    .filter(m => ['venta', 'reserva'].includes(m.tipo) && m.medio_pago === 'transferencia')
    .reduce((s, m) => s + Number(m.monto), 0)

  const gastoTotal = gastos.reduce((s, g) => s + Number(g.monto), 0)

  const cajaTeórica = Number(sesion?.monto_apertura ?? 0) + ef - gastoTotal

  const diferenciaCierre = totalDenoms(denomCierre) - cajaTeórica

  return (
    <div className="page-wrap">
      {/* HEADER */}
      <div className="toolbar-wrap" style={{ marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Caja</h2>
          {sucursalActiva && (
            <p style={{ fontSize: 12, color: 'var(--text-soft)' }}>🏪 {sucursalActiva.nombre}</p>
          )}
        </div>

        {sesion ? (
          <>
            {esAdmin && (
              <button className="btn-secondary" onClick={() => setStep('ajuste')} style={{ fontSize: 13 }}>
                ⚙ Ajustar fondo
              </button>
            )}
            <button className="btn-secondary" onClick={() => setModalIngresoExtra(true)} style={{ fontSize: 13 }}>
              ＋ Ingreso adicional
            </button>
            <button className="btn-danger" onClick={() => setStep('cierre')}>
              Cerrar turno
            </button>
          </>
        ) : (
          <button
            className="btn-primary"
            onClick={() => setStep('apertura')}
            disabled={turnoBloqueado}
          >
            Iniciar turno
          </button>
        )}
      </div>

      {/* SIN SESIÓN */}
      {!sesion && step === 'idle' && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🏦</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sin turno activo</h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 16 }}>
            No hay una caja abierta en <strong>{sucursalActiva?.nombre ?? 'esta sucursal'}</strong>
          </p>

          {turnoBloqueado && (
            <div style={{ background: 'var(--err-bg)', color: 'var(--err)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              ⚠ Hay un problema con el turno anterior. Contacta al administrador.
            </div>
          )}

          {sobraantesPendientes.length > 0 && (
            <div
              style={{
                background: 'var(--warn-bg)',
                color: 'var(--warn)',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 16,
                fontSize: 13,
                textAlign: 'left'
              }}
            >
              <strong>⚠ Hay {sobraantesPendientes.length} producto(s) sobrante(s) del turno anterior pendientes de confirmar</strong>
            </div>
          )}
        </div>
      )}

      {/* SESIÓN ACTIVA */}
      {sesion && (
        <>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 5 }}>
                  Turno actual
                </p>
                <p style={{ fontSize: 20, fontWeight: 800 }}>
                  {sesion.tipo_turno === 'manana' ? '☀️ Mañana' : '🌙 Tarde'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                  🏪 {sucursalActiva?.nombre ?? 'Sucursal'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 4 }}>Fondo inicial</p>
                <p style={{ fontSize: 24, fontWeight: 900 }}>Bs {Number(sesion.monto_apertura ?? 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="grid-4" style={{ marginTop: 20 }}>
              {[
                ['Efectivo', ef],
                ['QR', qr],
                ['Transfer.', tr],
                ['Gastos', gastoTotal]
              ].map(([l, v], i) => (
                <div key={l} className="card" style={{ padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>
                    {l}
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: i === 3 ? 'var(--err)' : 'inherit' }}>
                    Bs {Number(v).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* RESUMEN VENTAS */}
          {ventasTurno.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>Resumen de ventas del turno</h3>
                <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{ventasTurno.length} venta(s)</span>
              </div>
              {Object.entries(
                ventasTurno.flatMap(v => v.items || []).reduce((acc, i) => {
                  const n = i.productos?.nombre ?? 'Producto'
                  if (!acc[n]) acc[n] = { 
                    cantidad: 0, 
                    total: 0, 
                    ganancia: 0,  // 👈 NUEV
                    es_pan: !!i.productos?.es_pan 
                  }
                  acc[n].cantidad += Number(i.cantidad || 0)
                  acc[n].total += Number(i.subtotal || 0)
                  acc[n].ganancia += Number(i.ganancia || 0)  
                  return acc
                }, {})
              )
                .sort((a, b) => b[1].total - a[1].total)
                .map(([nombre, d]) => (
                  <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                    <span>{d.es_pan ? '🍞 ' : ''}{nombre}</span>
                    <span style={{ fontWeight: 700 }}>
                      {d.cantidad} unid. · Bs {d.total.toFixed(2)}
                      <span style={{ color: 'var(--ok)', fontSize: 11, marginLeft: 8 }}>
                        (ganancia: Bs {d.ganancia.toFixed(2)}) 
                      </span>
                    </span>
                  </div>
                ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontWeight: 800 }}>
                <span>Total vendido</span>
                <span>Bs {ventasTurno.reduce((s, v) => s + Number(v.total || 0), 0).toFixed(2)}</span>
              </div>
              {/* 👈 NUEVO BLOQUE: Ganancia total del turno */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 800, color: 'var(--ok)' }}>
                <span>💰 Ganancia total del turno</span>
                <span>Bs {ventasTurno.reduce((s, v) => {
                  const gananciaVenta = (v.venta_items || []).reduce((sum, item) => sum + Number(item.ganancia || 0), 0)
                  return s + gananciaVenta
                }, 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* INFO TURNO ANTERIOR */}
          {sesion.tipo_turno === 'tarde' && sesionAnterior && (
            <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13 }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>☀️ Turno mañana</p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <span>Ventas: <strong>Bs {Number(sesionAnterior.resumen_turno?.total_ventas ?? 0).toFixed(2)}</strong></span>
                <span>Pan sobrante: <strong>{sesionAnterior.pan_sobrante_cierre ?? 0}</strong></span>
              </div>
            </div>
          )}

          {/* RESÚMENES */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                ['Total panes', `${Number(sesion.total_pan_inicial ?? 0)}`],
                ['Ventas totales', `Bs ${(ef + qr + tr).toFixed(2)}`],
                ['Caja teórica', `Bs ${cajaTeórica.toFixed(2)}`]
              ].map(([l, v]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>
                    {l}
                  </p>
                  <p style={{ fontSize: 26, fontWeight: 900 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* MOVIMIENTOS */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700 }}>
              Movimientos del turno
            </div>
            <div className="table-scroll">
              <table className="clap-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Tipo</th>
                    <th>Medio</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>
                        Sin movimientos
                      </td>
                    </tr>
                  ) : (
                    movimientos.map(m => (
                      <tr key={m.id}>
                        <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>
                          {formatBoliviaTime(m.fecha)}
                        </td>
                        <td>
                          <span className={m.tipo === 'gasto' ? 'badge-err' : m.tipo === 'reserva' ? 'badge-warn' : 'badge-ok'}>
                            {m.tipo}
                          </span>
                        </td>
                        <td>{m.medio_pago ?? '—'}</td>
                        <td style={{ fontWeight: 700 }}>Bs {Number(m.monto).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ======================================================
          MODAL APERTURA
      ====================================================== */}
      <Modal
        open={step === 'apertura'}
        onClose={() => setStep('idle')}
        title={`Iniciar turno ${sucursalActiva ? `— ${sucursalActiva.nombre}` : ''}`}
      >
        {/* Selección de turno - solo si no hay sesión anterior o es nuevo día */}
        {!sesionAnterior && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[
              ['manana', '☀️ Mañana'],
              ['tarde', '🌙 Tarde']
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTipoTurno(k)}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: `2px solid ${tipoTurno === k ? 'var(--yellow-dark)' : 'var(--silver-light)'}`,
                  background: tipoTurno === k ? 'var(--yellow-soft)' : '#fff',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        {/* Turno forzado */}
        {sesionAnterior && (
          <div style={{ background: 'var(--bg-soft)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              Turno a abrir: <strong>{tipoTurno === 'manana' ? '☀️ Mañana' : '🌙 Tarde'}</strong>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-soft)' }}>
              {tipoTurno === 'tarde'
                ? 'El turno mañana ya fue cerrado. Solo puedes abrir el turno tarde.'
                : 'El turno anterior fue cerrado. Puedes abrir el turno mañana del nuevo día.'}
            </p>
          </div>
        )}

        {/* Sobrantes pendientes */}
        {sobraantesConfirmados.length > 0 && (
          <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: '3px solid var(--warn)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📦 Sobrantes del turno anterior</p>
            {sobraantesConfirmados.map((s, idx) => (
              <div key={s.id} style={{ marginBottom: 10, padding: 8, background: 'var(--bg-soft)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{s.producto_nombre}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                    Registrado: {s.cantidad_registrada} unid.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() =>
                      setSobraantesConfirmados(arr =>
                        arr.map((x, i) =>
                          i === idx ? { ...x, incluir: true, esmerma: false } : x
                        )
                      )
                    }
                    style={{
                      flex: 1,
                      padding: 7,
                      borderRadius: 8,
                      border: `2px solid ${s.incluir && !s.esmerma ? 'var(--ok)' : 'var(--silver-light)'}`,
                      background: s.incluir && !s.esmerma ? 'var(--ok-bg)' : '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      color: s.incluir && !s.esmerma ? 'var(--ok)' : 'var(--text-soft)'
                    }}
                  >
                    ✓ Ingresan hoy
                  </button>
                  <button
                    onClick={() =>
                      setSobraantesConfirmados(arr =>
                        arr.map((x, i) =>
                          i === idx ? { ...x, incluir: false, esmerma: true } : x
                        )
                      )
                    }
                    style={{
                      flex: 1,
                      padding: 7,
                      borderRadius: 8,
                      border: `2px solid ${s.esmerma ? 'var(--err)' : 'var(--silver-light)'}`,
                      background: s.esmerma ? 'var(--err-bg)' : '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      color: s.esmerma ? 'var(--err)' : 'var(--text-soft)'
                    }}
                  >
                    ✕ Es merma
                  </button>
                </div>
                {s.esmerma && (
                  <input
                    className="form-input"
                    style={{ marginTop: 6, fontSize: 12 }}
                    placeholder="Motivo de la merma (requerido)"
                    value={s.motivo_merma ?? ''}
                    onChange={e =>
                      setSobraantesConfirmados(arr =>
                        arr.map((x, i) =>
                          i === idx ? { ...x, motivo_merma: e.target.value } : x
                        )
                      )
                    }
                  />
                )}
                {s.incluir && !s.esmerma && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() =>
                        setSobraantesConfirmados(arr =>
                          arr.map((x, i) =>
                            i === idx
                              ? { ...x, cantidad_recibida: Math.max(0, x.cantidad_recibida - 1) }
                              : x
                          )
                        )
                      }
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>
                      {s.cantidad_recibida}
                    </span>
                    <button
                      onClick={() =>
                        setSobraantesConfirmados(arr =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, cantidad_recibida: x.cantidad_recibida + 1 } : x
                          )
                        )
                      }
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}
                    >
                      +
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>que pasan hoy</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* PAN - CAJAS DETALLADAS */}
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🍞 Pan recibido hoy</p>
          
          {/* Input para agregar cajas */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              className="form-input"
              type="number"
              min="1"
              value={numCajas}
              onChange={e => setNumCajas(e.target.value)}
              placeholder="N° de cajas"
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" onClick={agregarCajasPan}>
              Agregar cajas
            </button>
          </div>

          {/* Lista de cajas */}
          {cajasPan.map((caja, index) => (
            <div key={index} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 70 }}>Caja {index + 1}</span>
              <select
                className="form-input form-select"
                style={{ flex: 2 }}
                value={caja.producto_id}
                onChange={e => actualizarCaja(index, 'producto_id', e.target.value)}
              >
                <option value="">Seleccionar tipo...</option>
                {productosPan.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <input
                className="form-input"
                type="number"
                min="1"
                placeholder="Cant."
                style={{ width: 80, textAlign: 'center' }}
                value={caja.cantidad}
                onChange={e => actualizarCaja(index, 'cantidad', e.target.value)}
              />
              <button
                className="btn-secondary"
                style={{ padding: '4px 8px' }}
                onClick={() => eliminarCaja(index)}
              >
                ×
              </button>
            </div>
          ))}

          {/* Total de panes */}
          {cajasPan.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ background: 'var(--yellow-soft)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
                <span>Total panes en cajas</span>
                <span>{cajasPan.reduce((sum, c) => sum + (Number(c.cantidad) || 0), 0)}</span>
              </div>
            </div>
          )}

          {/* Pan sobrante del día anterior */}
          {panSobrAnterior > 0 && (
            <div style={{ marginTop: 8, background: 'var(--info-bg)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
              <span>🍞 Pan sobrante del día anterior</span>
              <span>{panSobrAnterior}</span>
            </div>
          )}

          {/* Total general */}
          {(cajasPan.length > 0 || panSobrAnterior > 0) && (
            <div style={{ marginTop: 8, background: 'var(--ok-bg)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
              <span>Total panes</span>
              <span>{totalPanes}</span>
            </div>
          )}
        </div>

        {/* DENOMINACIONES APERTURA */}
        <DenomInput
          value={denom}
          onChange={setDenom}
          label={`💰 Conteo de caja — Bs ${totalDenoms(denom).toFixed(2)}`}
        />

        {totalDenoms(denom) > 0 && totalDenoms(denom) < 200 && (
          <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '6px 10px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
            ⚠ El fondo está por debajo de Bs 200. Puedes continuar pero quedará registrado.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            disabled={totalDenoms(denom) <= 0 || cajasPan.length === 0 || cajasPan.some(c => !c.producto_id || !c.cantidad)}
            onClick={abrirCaja}
          >
            Iniciar turno
          </button>
        </div>
      </Modal>

      {/* ======================================================
          MODAL CIERRE
      ====================================================== */}
      <Modal
        open={step === 'cierre'}
        onClose={() => setStep('idle')}
        title={`Cerrar turno ${sesion?.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'}`}
      >
        <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Fondo inicial</span>
            <span>Bs {Number(sesion?.monto_apertura ?? 0).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Ventas efectivo</span>
            <span>Bs {ef.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Ventas QR</span>
            <span>Bs {qr.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: 'var(--err)' }}>
            <span>Gastos</span>
            <span>- Bs {gastoTotal.toFixed(2)}</span>
          </div>
          <div style={{ borderTop: '1px solid var(--silver)', paddingTop: 8, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}>
            <span>Caja teórica</span>
            <span>Bs {cajaTeórica.toFixed(2)}</span>
          </div>
        </div>

        {/* PAN SOBRANTE */}
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <label className="form-label">🍞 Panes sobrantes al cerrar (total)</label>
          <input
            className="form-input"
            type="number"
            value={panSobrCierre}
            onChange={e => setPanSobrCierre(e.target.value)}
            placeholder="0"
            style={{ textAlign: 'center', fontWeight: 800, fontSize: 22, marginBottom: 10 }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 6 }}>
            {sesion?.tipo_turno === 'tarde' ? 'Estos panes pasarán al turno mañana del próximo día' : 'Estos panes pasarán al turno tarde de hoy'}
          </p>
        </div>

        {/* SOBRANTES OTROS PRODUCTOS */}
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📦 ¿Sobran otros productos? (opcional)</p>
          {sobraantesCierre.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select
                className="form-input form-select"
                style={{ flex: 2 }}
                value={s.producto_id ?? ''}
                onChange={e =>
                  setSobraantesCierre(arr =>
                    arr.map((x, i) =>
                      i === idx ? { ...x, producto_id: e.target.value } : x
                    )
                  )
                }
              >
                <option value="">Seleccionar...</option>
                {productos.filter(p => !p.es_pan).map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <input
                className="form-input"
                type="number"
                style={{ width: 70 }}
                placeholder="Cant."
                value={s.cantidad ?? ''}
                onChange={e =>
                  setSobraantesCierre(arr =>
                    arr.map((x, i) =>
                      i === idx ? { ...x, cantidad: e.target.value } : x
                    )
                  )
                }
              />
              <button
                className="btn-secondary"
                onClick={() =>
                  setSobraantesCierre(arr => arr.filter((_, i) => i !== idx))
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="btn-secondary"
            style={{ width: '100%', marginTop: 4 }}
            onClick={() =>
              setSobraantesCierre(arr => [...arr, { producto_id: '', cantidad: '' }])
            }
          >
            + Agregar producto
          </button>
        </div>

        {/* PÉRDIDAS */}
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>⚠ Pérdidas / faltantes</p>
          <input
            className="form-input"
            type="number"
            value={perdidasMonto}
            onChange={e => setPerdidasMonto(e.target.value)}
            placeholder="Monto de pérdida"
            style={{ marginBottom: 8 }}
          />
          <input
            className="form-input"
            value={perdidasNota}
            onChange={e => setPerdidasNota(e.target.value)}
            placeholder="Descripción (si hubo pérdidas, justifica aquí)"
          />
        </div>

        {/* CONTEO FÍSICO */}
        <DenomInput
          value={denomCierre}
          onChange={setDenomCierre}
          label={`💰 Conteo físico — Bs ${totalDenoms(denomCierre).toFixed(2)}`}
        />

        {totalDenoms(denomCierre) > 0 && (
          <div
            style={{
              background: diferenciaCierre < -0.5 ? 'var(--err-bg)' : 'var(--ok-bg)',
              color: diferenciaCierre < -0.5 ? 'var(--err)' : 'var(--ok)',
              borderRadius: 10,
              padding: '10px 14px',
              fontWeight: 800,
              fontSize: 16,
              textAlign: 'center',
              marginBottom: 12
            }}
          >
            Diferencia: {diferenciaCierre >= 0 ? '+' : ''}Bs {diferenciaCierre.toFixed(2)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            disabled={totalDenoms(denomCierre) <= 0}
            onClick={cerrarCaja}
          >
            Confirmar cierre
          </button>
        </div>
      </Modal>

      {/* ======================================================
          MODAL INGRESO EXTRA
      ====================================================== */}
      <Modal
        open={modalIngresoExtra}
        onClose={() => setModalIngresoExtra(false)}
        title="＋ Ingreso adicional durante el turno"
      >
        <p style={{ color: 'var(--text-soft)', fontSize: 12, marginBottom: 14 }}>
          Sirve para registrar productos que llegan después de abrir la caja. El stock queda asociado a esta sucursal.
        </p>
        <label className="form-label">Producto</label>
        <select
          className="form-input form-select"
          style={{ marginBottom: 12 }}
          value={ingresoExtra.producto_id}
          onChange={e => setIngresoExtra(f => ({ ...f, producto_id: e.target.value }))}
        >
          <option value="">Seleccionar...</option>
          {productos
            .filter(p => p.activo !== false)
            .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.es_pan ? '🍞 ' : ''}{p.nombre} — stock {p.stock_actual}
              </option>
            ))}
        </select>
        <label className="form-label">Cantidad</label>
        <input
          className="form-input"
          type="number"
          min="1"
          style={{ marginBottom: 12 }}
          value={ingresoExtra.cantidad}
          onChange={e => setIngresoExtra(f => ({ ...f, cantidad: e.target.value }))}
          placeholder="0"
        />
        <label className="form-label">Nota</label>
        <input
          className="form-input"
          style={{ marginBottom: 20 }}
          value={ingresoExtra.nota}
          onChange={e => setIngresoExtra(f => ({ ...f, nota: e.target.value }))}
          placeholder="Llegaron más unidades durante el turno"
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalIngresoExtra(false)}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            disabled={!ingresoExtra.producto_id || Number(ingresoExtra.cantidad) <= 0}
            onClick={registrarIngresoExtra}
          >
            Registrar ingreso
          </button>
        </div>
      </Modal>

      {/* ======================================================
          MODAL AJUSTE
      ====================================================== */}
      <Modal
        open={step === 'ajuste'}
        onClose={() => setStep('idle')}
        title="⚙ Ajustar fondo de caja"
      >
        <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
          ⚠ Queda registrado en auditoría con usuario, hora y motivo.
        </div>

        <div style={{ background: 'var(--bg-soft)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          <span>Fondo actual</span>
          <span style={{ fontWeight: 700 }}>Bs {Number(sesion?.monto_apertura ?? 0).toFixed(2)}</span>
        </div>

        <DenomInput
          value={denomAjuste}
          onChange={setDenomAjuste}
          label={`💰 Nuevo conteo — Bs ${totalDenoms(denomAjuste).toFixed(2)}`}
        />

        <label className="form-label" style={{ marginTop: 14 }}>Motivo</label>
        <textarea
          className="form-input"
          rows={3}
          value={motivoAjuste}
          onChange={e => setMotivoAjuste(e.target.value)}
          placeholder="Motivo del ajuste..."
          style={{ resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            disabled={totalDenoms(denomAjuste) <= 0 || !motivoAjuste.trim()}
            onClick={ajustarFondo}
          >
            Guardar ajuste
          </button>
        </div>
      </Modal>
    </div>
  )
}