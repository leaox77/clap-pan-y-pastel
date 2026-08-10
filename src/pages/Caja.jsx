import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { useSucursal } from '../context/SucursalContext'

const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10]

function totalDenoms(d) {
  return DENOMS.reduce((s, k) => s + (d[k] ?? 0) * k, 0)
}

function DenomInput({ value, onChange }) {
  return (
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
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 44 }}>
            Bs {d}
          </span>

          <input
            type="text"
            inputMode="numeric"
            value={
              value[d] === undefined || value[d] === 0
                ? ''
                : value[d]
            }
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
  )
}

export default function Caja() {
  const toast = useToast()

  const { role } = useAuth()

  const {
    sucursalActivaId,
    sucursalActiva,
  } = useSucursal()

  const esAdmin = ['administrador', 'propietaria'].includes(role)

  const [sesion, setSesion] = useState(null)
  const [sesionAnterior, setSesionAnterior] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [gastos, setGastos] = useState([])
  const [productos, setProductos] = useState([])
  const [sobraantesPendientes, setSobraantesPendientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('idle')

  // Apertura
  const [denom, setDenom] = useState({})
  const [cajasPan, setCajasPan] = useState('')
  const [panesCaja, setPanesCaja] = useState(90)
  const [panSobrAnterior, setPanSobrAnterior] = useState(0)
  const [tipoTurno, setTipoTurno] = useState('manana')
  const [sobraantesConfirmados, setSobraantesConfirmados] = useState([])

  // Cierre
  const [denomCierre, setDenomCierre] = useState({})
  const [panSobrCierre, setPanSobrCierre] = useState('')
  const [perdidasMonto, setPerdidasMonto] = useState('')
  const [perdidasNota, setPerdidasNota] = useState('')
  const [sobraantesCierre, setSobraantesCierre] = useState([])

  // Ajuste fondo
  const [denomAjuste, setDenomAjuste] = useState({})
  const [motivoAjuste, setMotivoAjuste] = useState('')

  /*
   * IMPORTANTE:
   * Cada vez que cambia la sucursal activa,
   * se vuelve a consultar toda la información de Caja.
   */
  useEffect(() => {
    if (!sucursalActivaId) {
      setSesion(null)
      setSesionAnterior(null)
      setMovimientos([])
      setGastos([])
      setProductos([])
      setSobraantesPendientes([])
      setSobraantesConfirmados([])
      setLoading(false)
      return
    }

    setStep('idle')

    setSesion(null)
    setSesionAnterior(null)
    setMovimientos([])
    setGastos([])
    setProductos([])
    setSobraantesPendientes([])
    setSobraantesConfirmados([])

    setDenom({})
    setDenomCierre({})
    setDenomAjuste({})

    fetchData()
  }, [sucursalActivaId])

  async function fetchData() {
    if (!sucursalActivaId) return

    setLoading(true)

    try {
      /*
      * 1. CAJA ABIERTA DE LA SUCURSAL ACTIVA
      */
      const {
        data: s,
        error: sesionError,
      } = await supabase
        .from('caja_sesiones')
        .select('*, profiles!usuario_apertura_id(full_name)')
        .eq('estado', 'abierta')
        .eq('sucursal_id', sucursalActivaId)
        .limit(1)
        .maybeSingle()

      if (sesionError) {
        console.error(
          'Error cargando caja:',
          sesionError
        )
      }

      /*
      * 2. PRODUCTOS DISPONIBLES EN ESTA SUCURSAL
      */
      const {
        data: prods,
        error: productosError,
      } = await supabase
        .from('inventario_sucursal')
        .select(`
          *,
          productos (
            *,
            categorias(nombre)
          )
        `)
        .eq('sucursal_id', sucursalActivaId)
        .order('nombre')

      if (productosError) {
        console.error(
          'Error cargando productos:',
          productosError
        )
      }

      /*
      * Normalizamos el resultado de inventario_sucursal
      * para que Caja pueda seguir usando p.nombre,
      * p.precio_venta, p.es_pan, etc.
      */
      const productosNormalizados = (prods ?? [])
        .map(item => ({
          ...item,
          ...(item.productos ?? {}),
          categoria: item.productos?.categorias ?? null,
        }))
        .filter(p => p.activo !== false)

      setProductos(productosNormalizados)
      setSesion(s ?? null)

      /*
      * =====================================================
      * HAY CAJA ABIERTA
      * =====================================================
      */
      if (s) {
        const [
          { data: movs, error: movError },
          { data: g, error: gastoError },
        ] = await Promise.all([
          supabase
            .from('caja_movimientos')
            .select('*')
            .eq('caja_sesion_id', s.id)
            .order('fecha', {
              ascending: false,
            }),

          supabase
            .from('gastos')
            .select('*')
            .eq('caja_sesion_id', s.id),
        ])

        if (movError) {
          console.error(
            'Error cargando movimientos:',
            movError
          )
        }

        if (gastoError) {
          console.error(
            'Error cargando gastos:',
            gastoError
          )
        }

        setMovimientos(movs ?? [])
        setGastos(g ?? [])

        /*
        * Sesión anterior:
        * SIEMPRE de la misma sucursal.
        */
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

        /*
        * No necesitamos cargar sobrantes para apertura
        * mientras exista una caja abierta.
        */
        setSobraantesPendientes([])
        setSobraantesConfirmados([])

        return
      }

      /*
      * =====================================================
      * NO HAY CAJA ABIERTA
      * =====================================================
      */

      const ayer = new Date()
      ayer.setDate(ayer.getDate() - 1)

      const ayerStr = ayer
        .toISOString()
        .split('T')[0]

      /*
      * Sobrantes pendientes:
      * SOLO de la sucursal activa.
      */
      const {
        data: sob,
        error: sobError,
      } = await supabase
        .from('sobrantes_dia')
        .select('*')
        .eq('confirmado', false)
        .eq('sucursal_id', sucursalActivaId)
        .gte('fecha', ayerStr)
        .order('created_at', {
          ascending: false,
        })

      if (sobError) {
        console.error(
          'Error cargando sobrantes:',
          sobError
        )
      }

      /*
      * Última sesión cerrada:
      * SOLO de la sucursal activa.
      */
      const {
        data: ultima,
        error: ultimaError,
      } = await supabase
        .from('caja_sesiones')
        .select('*')
        .eq('estado', 'cerrada')
        .eq('sucursal_id', sucursalActivaId)
        .gte(
          'fecha_apertura',
          `${ayerStr}T00:00:00`
        )
        .lte(
          'fecha_apertura',
          `${ayerStr}T23:59:59`
        )
        .order('fecha_cierre', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle()

      if (ultimaError) {
        console.error(
          'Error cargando última sesión:',
          ultimaError
        )
      }

      const sobConCantidad = (sob ?? []).map(s => ({
        ...s,
        cantidad_recibida:
          s.cantidad_registrada,
      }))

      setSobraantesPendientes(
        sobConCantidad
      )

      setSobraantesConfirmados(
        sobConCantidad.map(s => ({
          ...s,
          incluir: true,
          esmerma: false,
        }))
      )

      /*
      * Determinar turno.
      */
      if (ultima) {
        setSesionAnterior(ultima)

        if (ultima.tipo_turno === 'manana') {
          setTipoTurno('tarde')

          setPanSobrAnterior(
            Number(
              ultima.pan_sobrante_cierre ?? 0
            )
          )

          setCajasPan('')
        } else {
          setTipoTurno('manana')

          setPanSobrAnterior(0)

          setCajasPan('')
        }
      } else {
        setSesionAnterior(null)

        setTipoTurno('manana')

        setPanSobrAnterior(0)

        setCajasPan('')
      }
    } catch (err) {
      console.error(
        'Error general cargando Caja:',
        err
      )

      toast(
        'No se pudo cargar la información de caja',
        'err'
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * ============================================================
   * ABRIR CAJA
   * ============================================================
   */
  async function abrirCaja() {
    if (!sucursalActivaId) {
      toast(
        'No hay una sucursal seleccionada',
        'err'
      )
      return
    }

    const monto = totalDenoms(denom)

    /*
    * Procesar mermas de sobrantes.
    */
    for (const s of sobraantesConfirmados) {
      if (!s.esmerma) continue

      if (!s.motivo_merma?.trim()) {
        toast(
          `Escribe el motivo de merma para "${s.producto_nombre}"`,
          'warn'
        )
        return
      }

      const { error } =
        await supabase.rpc(
          'sobrante_a_merma',
          {
            p_sobrante_id: s.id,
            p_motivo: s.motivo_merma,
          }
        )

      if (error) {
        console.error(
          'Error procesando merma:',
          error
        )

        toast(
          error.message,
          'err'
        )

        return
      }
    }

    /*
    * Abrir caja.
    */
    const {
      data,
      error,
    } = await supabase.rpc(
      'abrir_caja',
      {
        p_monto: monto,
        p_denominaciones: denom,
        p_tipo_turno: tipoTurno,

        p_cajas_pan:
          Number(cajasPan) || 0,

        p_panes_por_caja:
          Number(panesCaja) || 90,

        p_pan_sobrante_anterior:
          Number(panSobrAnterior) || 0,

        p_sesion_anterior_id:
          sesionAnterior?.id ?? null,

        p_sobrantes_confirmados:
          sobraantesConfirmados
            .filter(
              s =>
                s.incluir !== false &&
                !s.esmerma
            )
            .map(s => ({
              id: s.id,
              producto_id:
                s.producto_id,
              cantidad_recibida:
                Number(
                  s.cantidad_recibida
                ),
            })),

        /*
        * IMPORTANTE:
        * administrador/propietaria utilizan
        * la sucursal seleccionada.
        *
        * cajero será validado nuevamente
        * en el RPC usando su perfil.
        */
        p_sucursal_id:
          sucursalActivaId,
      }
    )

    if (error) {
      console.error(
        'Error abriendo caja:',
        error
      )

      toast(
        error.message,
        'err'
      )

      return
    }

    console.log(
      'Caja abierta:',
      data,
      'Sucursal:',
      sucursalActivaId
    )

    const totalPan =
      (Number(cajasPan) || 0) *
        (Number(panesCaja) || 90)
      +
      (Number(panSobrAnterior) || 0)

    toast(
      `Turno ${
        tipoTurno === 'manana'
          ? '☀️ mañana'
          : '🌙 tarde'
      } iniciado${
        totalPan > 0
          ? ` — ${totalPan} panes`
          : ''
      }`,
      'ok'
    )

    setStep('idle')
    setDenom({})

    await fetchData()
  }

  /*
   * ============================================================
   * CERRAR CAJA
   * ============================================================
   */
  async function cerrarCaja() {
    if (!sesion) {
      toast(
        'No hay una caja abierta',
        'err'
      )
      return
    }

    /*
    * Protección adicional en frontend.
    */
    if (
      sesion.sucursal_id &&
      sesion.sucursal_id !== sucursalActivaId
    ) {
      toast(
        'La caja pertenece a otra sucursal',
        'err'
      )
      return
    }

    const montoFisico =
      totalDenoms(denomCierre)

    const sobFiltrados =
      sobraantesCierre.filter(
        s =>
          s.producto_id &&
          Number(s.cantidad) > 0
      )

    const {
      error,
    } = await supabase.rpc(
      'cerrar_caja',
      {
        p_caja_sesion_id:
          sesion.id,

        p_monto_fisico:
          montoFisico,

        p_denominaciones:
          denomCierre,

        p_pan_sobrante_cierre:
          Number(panSobrCierre) || 0,

        p_perdidas_monto:
          Number(perdidasMonto) || 0,

        p_perdidas_nota:
          perdidasNota,

        p_sobrantes:
          sobFiltrados.map(s => ({
            producto_id:
              s.producto_id,

            producto_nombre:
              productos.find(
                p =>
                  p.id ===
                  s.producto_id
              )?.nombre ??
              s.producto_id,

            cantidad:
              Number(s.cantidad),
          })),
      }
    )

    if (error) {
      console.error(
        'Error cerrando caja:',
        error
      )

      toast(
        error.message,
        'err'
      )

      return
    }

    toast(
      'Turno cerrado correctamente',
      'ok'
    )

    setStep('idle')

    setDenomCierre({})
    setPanSobrCierre('')
    setPerdidasMonto('')
    setPerdidasNota('')
    setSobraantesCierre([])

    await fetchData()
  }

  /*
   * ============================================================
   * AJUSTAR FONDO
   * ============================================================
   */
  async function ajustarFondo() {
    if (!sesion) {
      toast(
        'No hay una caja abierta',
        'err'
      )
      return
    }

    if (
      sesion.sucursal_id &&
      sesion.sucursal_id !== sucursalActivaId
    ) {
      toast(
        'La caja pertenece a otra sucursal',
        'err'
      )
      return
    }

    if (!motivoAjuste.trim()) {
      toast(
        'Debes indicar el motivo del ajuste',
        'warn'
      )
      return
    }

    const nuevoMonto =
      totalDenoms(denomAjuste)

    const {
      error,
    } = await supabase.rpc(
      'ajustar_fondo_caja',
      {
        p_caja_sesion_id:
          sesion.id,

        p_nuevo_monto:
          nuevoMonto,

        p_denominaciones:
          denomAjuste,

        p_motivo:
          motivoAjuste.trim(),
      }
    )

    if (error) {
      console.error(
        'Error ajustando fondo:',
        error
      )

      toast(
        error.message,
        'err'
      )

      return
    }

    toast(
      'Fondo ajustado',
      'ok'
    )

    setStep('idle')
    setDenomAjuste({})
    setMotivoAjuste('')

    await fetchData()
  }

  if (loading) {
    return (
      <div
        className="page-wrap"
        style={{
          color: 'var(--text-soft)'
        }}
      >
        Cargando caja...
      </div>
    )
  }

  /*
   * ============================================================
   * CÁLCULOS
   * ============================================================
   */

  const ef = movimientos
    .filter(
      m =>
        ['venta', 'reserva'].includes(
          m.tipo
        ) &&
        m.medio_pago === 'efectivo'
    )
    .reduce(
      (s, m) => s + Number(m.monto),
      0
    )

  const qr = movimientos
    .filter(
      m =>
        ['venta', 'reserva'].includes(
          m.tipo
        ) &&
        m.medio_pago === 'qr'
    )
    .reduce(
      (s, m) => s + Number(m.monto),
      0
    )

  const tr = movimientos
    .filter(
      m =>
        ['venta', 'reserva'].includes(
          m.tipo
        ) &&
        m.medio_pago === 'transferencia'
    )
    .reduce(
      (s, m) => s + Number(m.monto),
      0
    )

  const gastoTotal = gastos.reduce(
    (s, g) => s + Number(g.monto),
    0
  )

  const cajaTeórica =
    Number(
      sesion?.monto_apertura ?? 0
    ) +
    ef -
    gastoTotal

  const diferenciaCierre =
    totalDenoms(denomCierre) -
    cajaTeórica

  return (
    <div className="page-wrap">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div
        className="toolbar-wrap"
        style={{
          marginBottom: 24
        }}
      >
        <div
          style={{
            flex: 1
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 4
            }}
          >
            Caja
          </h2>

          {sucursalActiva && (
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-soft)'
              }}
            >
              🏪 {sucursalActiva.nombre}
            </p>
          )}
        </div>

        {sesion ? (
          <>
            {esAdmin && (
              <button
                className="btn-secondary"
                onClick={() =>
                  setStep('ajuste')
                }
                style={{
                  fontSize: 13
                }}
              >
                ⚙ Ajustar fondo
              </button>
            )}

            <button
              className="btn-danger"
              onClick={() =>
                setStep('cierre')
              }
            >
              Cerrar turno
            </button>
          </>
        ) : (
          <button
            className="btn-primary"
            onClick={() =>
              setStep('apertura')
            }
          >
            Iniciar turno
          </button>
        )}
      </div>

      {/* ======================================================
          SIN SESIÓN
      ====================================================== */}

      {!sesion &&
        step === 'idle' && (
          <div
            className="card"
            style={{
              padding: 40,
              textAlign: 'center'
            }}
          >
            <div
              style={{
                fontSize: 52,
                marginBottom: 16
              }}
            >
              🏦
            </div>

            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 8
              }}
            >
              Sin turno activo
            </h3>

            <p
              style={{
                color: 'var(--text-soft)',
                fontSize: 13,
                marginBottom: 16
              }}
            >
              No hay una caja abierta en{' '}
              <strong>
                {sucursalActiva?.nombre ??
                  'esta sucursal'}
              </strong>
            </p>

            {sobraantesPendientes.length >
              0 && (
              <div
                style={{
                  background:
                    'var(--warn-bg)',
                  color: 'var(--warn)',
                  borderRadius: 10,
                  padding:
                    '12px 16px',
                  marginBottom: 16,
                  fontSize: 13,
                  textAlign: 'left'
                }}
              >
                <strong>
                  ⚠ Hay{' '}
                  {
                    sobraantesPendientes.length
                  } producto(s)
                  sobrante(s) del turno
                  anterior pendientes
                  de confirmar
                </strong>
              </div>
            )}
          </div>
        )}

      {/* ======================================================
          SESIÓN ACTIVA
      ====================================================== */}

      {sesion && (
        <>
          <div
            className="card"
            style={{
              padding: 20,
              marginBottom: 20
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'flex-start',
                gap: 20,
                flexWrap: 'wrap'
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 11,
                    color:
                      'var(--text-soft)',
                    textTransform:
                      'uppercase',
                    marginBottom: 5
                  }}
                >
                  Turno actual
                </p>

                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 800
                  }}
                >
                  {sesion.tipo_turno ===
                  'manana'
                    ? '☀️ Mañana'
                    : '🌙 Tarde'}
                </p>

                <p
                  style={{
                    fontSize: 12,
                    color:
                      'var(--text-soft)',
                    marginTop: 4
                  }}
                >
                  🏪{' '}
                  {sucursalActiva?.nombre ??
                    'Sucursal'}
                </p>
              </div>

              <div
                style={{
                  textAlign: 'right'
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    color:
                      'var(--text-soft)',
                    marginBottom: 4
                  }}
                >
                  Fondo inicial
                </p>

                <p
                  style={{
                    fontSize: 24,
                    fontWeight: 900
                  }}
                >
                  Bs{' '}
                  {Number(
                    sesion.monto_apertura ??
                      0
                  ).toFixed(2)}
                </p>
              </div>
            </div>

            <div
              className="grid-4"
              style={{
                marginTop: 20
              }}
            >
              {[
                ['Efectivo', ef],
                ['QR', qr],
                ['Transfer.', tr],
                ['Gastos', gastoTotal]
              ].map(
                ([l, v], i) => (
                  <div
                    key={l}
                    className="card"
                    style={{
                      padding:
                        '14px 16px'
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        color:
                          'var(--text-soft)',
                        textTransform:
                          'uppercase',
                        marginBottom: 4
                      }}
                    >
                      {l}
                    </p>

                    <p
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color:
                          i === 3
                            ? 'var(--err)'
                            : 'inherit'
                      }}
                    >
                      Bs{' '}
                      {Number(v).toFixed(
                        2
                      )}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>

          {sesion.tipo_turno ===
            'tarde' &&
            sesionAnterior && (
              <div
                style={{
                  background:
                    'var(--yellow-soft)',
                  borderRadius: 10,
                  padding:
                    '14px 18px',
                  marginBottom: 20,
                  fontSize: 13
                }}
              >
                <p
                  style={{
                    fontWeight: 700,
                    marginBottom: 6
                  }}
                >
                  ☀️ Turno mañana
                </p>

                <div
                  style={{
                    display: 'flex',
                    gap: 20,
                    flexWrap: 'wrap'
                  }}
                >
                  <span>
                    Ventas:{' '}
                    <strong>
                      Bs{' '}
                      {Number(
                        sesionAnterior
                          .resumen_turno
                          ?.total_ventas ??
                          0
                      ).toFixed(2)}
                    </strong>
                  </span>

                  <span>
                    Pan sobrante:{' '}
                    <strong>
                      {sesionAnterior
                        .pan_sobrante_cierre ??
                        0}
                    </strong>
                  </span>
                </div>
              </div>
            )}

          <div
            className="card"
            style={{
              padding: 20,
              marginBottom: 20
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(3, 1fr)',
                gap: 20
              }}
            >
              {[
                [
                  'Total panes',
                  `${
                    Number(
                      sesion.cajas_pan ??
                        0
                    ) *
                      Number(
                        sesion
                          .panes_por_caja ??
                          90
                      ) +
                    Number(
                      sesion
                        .pan_sobrante_anterior ??
                        0
                    )
                  }`
                ],
                [
                  'Ventas totales',
                  `Bs ${(
                    ef +
                    qr +
                    tr
                  ).toFixed(2)}`
                ],
                [
                  'Caja teórica',
                  `Bs ${cajaTeórica.toFixed(
                    2
                  )}`
                ]
              ].map(
                ([l, v]) => (
                  <div
                    key={l}
                    style={{
                      textAlign:
                        'center'
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        color:
                          'var(--text-soft)',
                        textTransform:
                          'uppercase',
                        marginBottom: 4
                      }}
                    >
                      {l}
                    </p>

                    <p
                      style={{
                        fontSize: 26,
                        fontWeight: 900
                      }}
                    >
                      {v}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* MOVIMIENTOS */}

          <div
            className="card"
            style={{
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding:
                  '14px 20px',
                borderBottom:
                  '1px solid var(--silver-light)',
                fontWeight: 700
              }}
            >
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
                  {movimientos.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          textAlign:
                            'center',
                          color:
                            'var(--text-soft)',
                          padding: 24
                        }}
                      >
                        Sin movimientos
                      </td>
                    </tr>
                  ) : (
                    movimientos.map(
                      m => (
                        <tr
                          key={m.id}
                        >
                          <td
                            style={{
                              color:
                                'var(--text-soft)',
                              whiteSpace:
                                'nowrap'
                            }}
                          >
                            {new Date(
                              m.fecha
                            ).toLocaleTimeString(
                              'es-BO',
                              {
                                hour:
                                  '2-digit',
                                minute:
                                  '2-digit'
                              }
                            )}
                          </td>

                          <td>
                            <span
                              className={
                                m.tipo ===
                                'gasto'
                                  ? 'badge-err'
                                  : m.tipo ===
                                    'reserva'
                                  ? 'badge-warn'
                                  : 'badge-ok'
                              }
                            >
                              {m.tipo}
                            </span>
                          </td>

                          <td>
                            {m.medio_pago ??
                              '—'}
                          </td>

                          <td
                            style={{
                              fontWeight: 700
                            }}
                          >
                            Bs{' '}
                            {Number(
                              m.monto
                            ).toFixed(2)}
                          </td>
                        </tr>
                      )
                    )
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
        onClose={() =>
          setStep('idle')
        }
        title={`Iniciar turno ${
          sucursalActiva
            ? `— ${sucursalActiva.nombre}`
            : ''
        }`}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              '1fr 1fr',
            gap: 10,
            marginBottom: 20
          }}
        >
          {[
            ['manana', '☀️ Mañana'],
            ['tarde', '🌙 Tarde']
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() =>
                setTipoTurno(k)
              }
              style={{
                padding: 14,
                borderRadius: 12,
                border: `2px solid ${
                  tipoTurno === k
                    ? 'var(--yellow-dark)'
                    : 'var(--silver-light)'
                }`,
                background:
                  tipoTurno === k
                    ? 'var(--yellow-soft)'
                    : '#fff',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {sobraantesConfirmados.length >
          0 && (
          <div
            className="card"
            style={{
              padding: 14,
              marginBottom: 16,
              borderLeft:
                '3px solid var(--warn)'
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 10
              }}
            >
              📦 Sobrantes del turno
              anterior
            </p>

            {sobraantesConfirmados.map(
              (s, idx) => (
                <div
                  key={s.id}
                  style={{
                    marginBottom: 10,
                    padding: 8,
                    background:
                      'var(--bg-soft)',
                    borderRadius: 8
                  }}
                >
                  <div
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 8,
                      marginBottom: 6,
                      flexWrap:
                        'wrap'
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        flex: 1
                      }}
                    >
                      {
                        s.producto_nombre
                      }
                    </span>

                    <span
                      style={{
                        fontSize: 12,
                        color:
                          'var(--text-soft)'
                      }}
                    >
                      Registrado:{' '}
                      {
                        s.cantidad_registrada
                      }{' '}
                      unid.
                    </span>
                  </div>

                  <div
                    style={{
                      display:
                        'flex',
                      gap: 6
                    }}
                  >
                    <button
                      onClick={() =>
                        setSobraantesConfirmados(
                          arr =>
                            arr.map(
                              (x, i) =>
                                i ===
                                idx
                                  ? {
                                      ...x,
                                      incluir:
                                        true,
                                      esmerma:
                                        false
                                    }
                                  : x
                            )
                        )
                      }
                      style={{
                        flex: 1,
                        padding: 7,
                        borderRadius: 8,
                        border: `2px solid ${
                          s.incluir &&
                          !s.esmerma
                            ? 'var(--ok)'
                            : 'var(--silver-light)'
                        }`,
                        background:
                          s.incluir &&
                          !s.esmerma
                            ? 'var(--ok-bg)'
                            : '#fff',
                        cursor:
                          'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        color:
                          s.incluir &&
                          !s.esmerma
                            ? 'var(--ok)'
                            : 'var(--text-soft)'
                      }}
                    >
                      ✓ Ingresan hoy
                    </button>

                    <button
                      onClick={() =>
                        setSobraantesConfirmados(
                          arr =>
                            arr.map(
                              (x, i) =>
                                i ===
                                idx
                                  ? {
                                      ...x,
                                      incluir:
                                        false,
                                      esmerma:
                                        true
                                    }
                                  : x
                            )
                        )
                      }
                      style={{
                        flex: 1,
                        padding: 7,
                        borderRadius: 8,
                        border: `2px solid ${
                          s.esmerma
                            ? 'var(--err)'
                            : 'var(--silver-light)'
                        }`,
                        background:
                          s.esmerma
                            ? 'var(--err-bg)'
                            : '#fff',
                        cursor:
                          'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        color:
                          s.esmerma
                            ? 'var(--err)'
                            : 'var(--text-soft)'
                      }}
                    >
                      ✕ Es merma
                    </button>
                  </div>

                  {s.esmerma && (
                    <input
                      className="form-input"
                      style={{
                        marginTop: 6,
                        fontSize: 12
                      }}
                      placeholder="Motivo de la merma (requerido)"
                      value={
                        s.motivo_merma ??
                        ''
                      }
                      onChange={e =>
                        setSobraantesConfirmados(
                          arr =>
                            arr.map(
                              (x, i) =>
                                i ===
                                idx
                                  ? {
                                      ...x,
                                      motivo_merma:
                                        e
                                          .target
                                          .value
                                    }
                                  : x
                            )
                        )
                      }
                    />
                  )}

                  {s.incluir &&
                    !s.esmerma && (
                      <div
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: 8,
                          marginTop: 6
                        }}
                      >
                        <button
                          onClick={() =>
                            setSobraantesConfirmados(
                              arr =>
                                arr.map(
                                  (
                                    x,
                                    i
                                  ) =>
                                    i ===
                                    idx
                                      ? {
                                          ...x,
                                          cantidad_recibida:
                                            Math.max(
                                              0,
                                              x.cantidad_recibida -
                                                1
                                            )
                                        }
                                      : x
                                )
                            )
                          }
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border:
                              '1px solid var(--silver)',
                            background:
                              'none',
                            cursor:
                              'pointer',
                            fontWeight: 700
                          }}
                        >
                          −
                        </button>

                        <span
                          style={{
                            minWidth: 36,
                            textAlign:
                              'center',
                            fontWeight: 800,
                            fontSize: 16
                          }}
                        >
                          {
                            s.cantidad_recibida
                          }
                        </span>

                        <button
                          onClick={() =>
                            setSobraantesConfirmados(
                              arr =>
                                arr.map(
                                  (
                                    x,
                                    i
                                  ) =>
                                    i ===
                                    idx
                                      ? {
                                          ...x,
                                          cantidad_recibida:
                                            x.cantidad_recibida +
                                            1
                                        }
                                      : x
                                )
                            )
                          }
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border:
                              '1px solid var(--silver)',
                            background:
                              'none',
                            cursor:
                              'pointer',
                            fontWeight: 700
                          }}
                        >
                          +
                        </button>

                        <span
                          style={{
                            fontSize: 11,
                            color:
                              'var(--text-soft)'
                          }}
                        >
                          que pasan hoy
                        </span>
                      </div>
                    )}
                </div>
              )
            )}
          </div>
        )}

        {/* PAN */}

        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 16
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 12
            }}
          >
            🍞 Pan recibido hoy
          </p>

          <div
            className="grid-3"
            style={{
              gap: 10,
              marginBottom: 10
            }}
          >
            <div>
              <label className="form-label">
                Cajas recibidas
              </label>

              <input
                className="form-input"
                type="number"
                value={cajasPan}
                onChange={e =>
                  setCajasPan(
                    e.target.value
                  )
                }
                placeholder="0"
                style={{
                  textAlign:
                    'center',
                  fontWeight: 700,
                  fontSize: 18
                }}
              />
            </div>

            <div>
              <label className="form-label">
                Panes / caja
              </label>

              <input
                className="form-input"
                type="number"
                value={panesCaja}
                onChange={e =>
                  setPanesCaja(
                    e.target.value
                  )
                }
                style={{
                  textAlign:
                    'center',
                  fontWeight: 700,
                  fontSize: 18
                }}
              />
            </div>

            <div>
              <label className="form-label">
                Pan sobrante
              </label>

              <input
                className="form-input"
                type="number"
                value={panSobrAnterior}
                onChange={e =>
                  setPanSobrAnterior(
                    e.target.value
                  )
                }
                style={{
                  textAlign:
                    'center',
                  fontWeight: 700,
                  fontSize: 18
                }}
              />
            </div>
          </div>

          {(Number(cajasPan) > 0 ||
            Number(
              panSobrAnterior
            ) > 0) && (
            <div
              style={{
                background:
                  'var(--yellow-soft)',
                borderRadius: 8,
                padding:
                  '8px 12px',
                display:
                  'flex',
                justifyContent:
                  'space-between',
                fontWeight: 800,
                fontSize: 16
              }}
            >
              <span>
                Total panes
              </span>

              <span>
                {(Number(
                  cajasPan
                ) || 0) *
                  (Number(
                    panesCaja
                  ) || 90) +
                  (Number(
                    panSobrAnterior
                  ) || 0)}
              </span>
            </div>
          )}
        </div>

        {/* DENOMINACIONES */}

        <div
          style={{
            marginBottom: 14
          }}
        >
          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              marginBottom: 8
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 700
              }}
            >
              💰 Conteo de caja
            </p>

            <span
              style={{
                fontSize: 18,
                fontWeight: 800
              }}
            >
              Bs{' '}
              {totalDenoms(
                denom
              ).toFixed(2)}
            </span>
          </div>

          {totalDenoms(denom) >
            0 &&
            totalDenoms(denom) <
              200 && (
              <div
                style={{
                  background:
                    'var(--warn-bg)',
                  color:
                    'var(--warn)',
                  padding:
                    '6px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  marginBottom: 8
                }}
              >
                ⚠ El fondo está
                por debajo de Bs
                200. Puedes
                continuar pero
                quedará registrado.
              </div>
            )}

          {totalDenoms(denom) ===
            0 && (
            <p
              style={{
                fontSize: 12,
                color:
                  'var(--text-soft)',
                marginBottom: 8
              }}
            >
              Si no hay
              billetes, ingresa
              solo monedas.
            </p>
          )}

          <DenomInput
            value={denom}
            onChange={setDenom}
          />
        </div>

        <div
          style={{
            display:
              'flex',
            gap: 10
          }}
        >
          <button
            className="btn-secondary"
            style={{
              flex: 1
            }}
            onClick={() =>
              setStep('idle')
            }
          >
            Cancelar
          </button>

          <button
            className="btn-primary"
            style={{
              flex: 1
            }}
            disabled={
              totalDenoms(
                denom
              ) <= 0
            }
            onClick={
              abrirCaja
            }
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
        onClose={() =>
          setStep('idle')
        }
        title={`Cerrar turno ${
          sesion?.tipo_turno ===
          'manana'
            ? '☀️ mañana'
            : '🌙 tarde'
        }`}
      >
        <div
          style={{
            background:
              'var(--bg-soft)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
            fontSize: 13
          }}
        >
          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              marginBottom: 3
            }}
          >
            <span>
              Fondo inicial
            </span>

            <span>
              Bs{' '}
              {Number(
                sesion?.monto_apertura ??
                  0
              ).toFixed(2)}
            </span>
          </div>

          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              marginBottom: 3
            }}
          >
            <span>
              Ventas efectivo
            </span>

            <span>
              Bs {ef.toFixed(2)}
            </span>
          </div>

          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              marginBottom: 3
            }}
          >
            <span>
              Ventas QR
            </span>

            <span>
              Bs {qr.toFixed(2)}
            </span>
          </div>

          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              marginBottom: 3,
              color: 'var(--err)'
            }}
          >
            <span>
              Gastos
            </span>

            <span>
              - Bs{' '}
              {gastoTotal.toFixed(
                2
              )}
            </span>
          </div>

          <div
            style={{
              borderTop:
                '1px solid var(--silver)',
              paddingTop: 8,
              marginTop: 6,
              display:
                'flex',
              justifyContent:
                'space-between',
              fontWeight: 800,
              fontSize: 15
            }}
          >
            <span>
              Caja teórica
            </span>

            <span>
              Bs{' '}
              {cajaTeórica.toFixed(
                2
              )}
            </span>
          </div>
        </div>

        {/* PAN SOBRANTE */}

        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12
          }}
        >
          <label className="form-label">
            🍞 Panes sobrantes al
            cerrar
          </label>

          <input
            className="form-input"
            type="number"
            value={panSobrCierre}
            onChange={e =>
              setPanSobrCierre(
                e.target.value
              )
            }
            placeholder="0"
            style={{
              textAlign:
                'center',
              fontWeight: 800,
              fontSize: 22,
              marginBottom: 6
            }}
          />

          <p
            style={{
              fontSize: 11,
              color:
                'var(--text-soft)'
            }}
          >
            {sesion?.tipo_turno ===
            'tarde'
              ? 'Pasarán al turno mañana del próximo día'
              : 'Pasarán al turno tarde de hoy'}
          </p>
        </div>

        {/* SOBRANTES */}

        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 10
            }}
          >
            📦 ¿Sobran otros
            productos? (opcional)
          </p>

          {sobraantesCierre.map(
            (s, idx) => (
              <div
                key={idx}
                style={{
                  display:
                    'flex',
                  gap: 8,
                  marginBottom: 8,
                  alignItems:
                    'center'
                }}
              >
                <select
                  className="form-input form-select"
                  style={{
                    flex: 2
                  }}
                  value={
                    s.producto_id ??
                    ''
                  }
                  onChange={e =>
                    setSobraantesCierre(
                      arr =>
                        arr.map(
                          (
                            x,
                            i
                          ) =>
                            i ===
                            idx
                              ? {
                                  ...x,
                                  producto_id:
                                    e
                                      .target
                                      .value
                                }
                              : x
                        )
                    )
                  }
                >
                  <option value="">
                    Seleccionar...
                  </option>

                  {productos
                    .filter(
                      p => !p.es_pan
                    )
                    .map(p => (
                      <option
                        key={p.id}
                        value={p.id}
                      >
                        {p.nombre}
                      </option>
                    ))}
                </select>

                <input
                  className="form-input"
                  type="number"
                  style={{
                    width: 70
                  }}
                  placeholder="Cant."
                  value={
                    s.cantidad ??
                    ''
                  }
                  onChange={e =>
                    setSobraantesCierre(
                      arr =>
                        arr.map(
                          (
                            x,
                            i
                          ) =>
                            i ===
                            idx
                              ? {
                                  ...x,
                                  cantidad:
                                    e
                                      .target
                                      .value
                                }
                              : x
                        )
                    )
                  }
                />

                <button
                  className="btn-secondary"
                  onClick={() =>
                    setSobraantesCierre(
                      arr =>
                        arr.filter(
                          (_, i) =>
                            i !==
                            idx
                        )
                    )
                  }
                >
                  ×
                </button>
              </div>
            )
          )}

          <button
            className="btn-secondary"
            style={{
              width: '100%',
              marginTop: 4
            }}
            onClick={() =>
              setSobraantesCierre(
                arr => [
                  ...arr,
                  {
                    producto_id:
                      '',
                    cantidad: ''
                  }
                ]
              )
            }
          >
            + Agregar producto
          </button>
        </div>

        {/* PÉRDIDAS */}

        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 10
            }}
          >
            ⚠ Pérdidas / faltantes
          </p>

          <input
            className="form-input"
            type="number"
            value={perdidasMonto}
            onChange={e =>
              setPerdidasMonto(
                e.target.value
              )
            }
            placeholder="Monto de pérdida"
            style={{
              marginBottom: 8
            }}
          />

          <input
            className="form-input"
            value={perdidasNota}
            onChange={e =>
              setPerdidasNota(
                e.target.value
              )
            }
            placeholder="Descripción (si hubo pérdidas, justifica aquí)"
          />
        </div>

        {/* CONTEO FÍSICO */}

        <div
          style={{
            marginBottom: 12
          }}
        >
          <div
            style={{
              display:
                'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              marginBottom: 8
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 700
              }}
            >
              💰 Conteo físico
            </p>

            <span
              style={{
                fontSize: 18,
                fontWeight: 800
              }}
            >
              Bs{' '}
              {totalDenoms(
                denomCierre
              ).toFixed(2)}
            </span>
          </div>

          {totalDenoms(
            denomCierre
          ) === 0 && (
            <p
              style={{
                fontSize: 12,
                color:
                  'var(--text-soft)',
                marginBottom: 8
              }}
            >
              Si solo hay
              monedas, ingresalas
              en las denominaciones
              correspondientes.
            </p>
          )}

          <DenomInput
            value={denomCierre}
            onChange={
              setDenomCierre
            }
          />
        </div>

        {totalDenoms(
          denomCierre
        ) > 0 && (
          <div
            style={{
              background:
                diferenciaCierre <
                -0.5
                  ? 'var(--err-bg)'
                  : 'var(--ok-bg)',
              color:
                diferenciaCierre <
                -0.5
                  ? 'var(--err)'
                  : 'var(--ok)',
              borderRadius: 10,
              padding:
                '10px 14px',
              fontWeight: 800,
              fontSize: 16,
              textAlign:
                'center',
              marginBottom: 12
            }}
          >
            Diferencia:{' '}
            {diferenciaCierre >= 0
              ? '+'
              : ''}
            Bs{' '}
            {diferenciaCierre.toFixed(
              2
            )}
          </div>
        )}

        <div
          style={{
            display:
              'flex',
            gap: 10
          }}
        >
          <button
            className="btn-secondary"
            style={{
              flex: 1
            }}
            onClick={() =>
              setStep('idle')
            }
          >
            Cancelar
          </button>

          <button
            className="btn-primary"
            style={{
              flex: 1
            }}
            disabled={
              totalDenoms(
                denomCierre
              ) <= 0
            }
            onClick={
              cerrarCaja
            }
          >
            Confirmar cierre
          </button>
        </div>
      </Modal>

      {/* ======================================================
          MODAL AJUSTE
      ====================================================== */}

      <Modal
        open={step === 'ajuste'}
        onClose={() =>
          setStep('idle')
        }
        title="⚙ Ajustar fondo de caja"
      >
        <div
          style={{
            background:
              'var(--warn-bg)',
            color: 'var(--warn)',
            padding:
              '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            marginBottom: 14
          }}
        >
          ⚠ Queda registrado en
          auditoría con usuario,
          hora y motivo.
        </div>

        <div
          style={{
            background:
              'var(--bg-soft)',
            borderRadius: 8,
            padding:
              '10px 12px',
            marginBottom: 14,
            fontSize: 13,
            display:
              'flex',
            justifyContent:
              'space-between'
          }}
        >
          <span>
            Fondo actual
          </span>

          <span
            style={{
              fontWeight: 700
            }}
          >
            Bs{' '}
            {Number(
              sesion?.monto_apertura ??
                0
            ).toFixed(2)}
          </span>
        </div>

        <div
          style={{
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            marginBottom: 8
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 700
            }}
          >
            💰 Nuevo conteo
          </p>

          <span
            style={{
              fontSize: 18,
              fontWeight: 800
            }}
          >
            Bs{' '}
            {totalDenoms(
              denomAjuste
            ).toFixed(2)}
          </span>
        </div>

        <DenomInput
          value={denomAjuste}
          onChange={
            setDenomAjuste
          }
        />

        <label
          className="form-label"
          style={{
            marginTop: 14
          }}
        >
          Motivo
        </label>

        <textarea
          className="form-input"
          rows={3}
          value={motivoAjuste}
          onChange={e =>
            setMotivoAjuste(
              e.target.value
            )
          }
          placeholder="Motivo del ajuste..."
          style={{
            resize: 'vertical'
          }}
        />

        <div
          style={{
            display:
              'flex',
            gap: 10,
            marginTop: 14
          }}
        >
          <button
            className="btn-secondary"
            style={{
              flex: 1
            }}
            onClick={() =>
              setStep('idle')
            }
          >
            Cancelar
          </button>

          <button
            className="btn-primary"
            style={{
              flex: 1
            }}
            disabled={
              totalDenoms(
                denomAjuste
              ) <= 0 ||
              !motivoAjuste.trim()
            }
            onClick={
              ajustarFondo
            }
          >
            Guardar ajuste
          </button>
        </div>
      </Modal>
    </div>
  )
}
