import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useSucursal } from '../context/SucursalContext'
import Modal from '../components/Modal'

const ESTADO_BADGE = { 
    pendiente: 'badge-warn', 
    entregada: 'badge-ok', 
    cancelada: 'badge-err' 
}
const MEDIOS = ['efectivo', 'qr']

export default function Reservas() {
    const toast = useToast()
    const { sucursalActivaId } = useSucursal()
    const [reservas, setReservas] = useState([])
    const [tab, setTab] = useState('pendiente')
    const [loading, setLoading] = useState(true)
    const [detalle, setDetalle] = useState(null)
    const [modalEntregar, setModalEntregar] = useState(null)
    const [modalCancelar, setModalCancelar] = useState(null)
    const [medioPago, setMedioPago] = useState('efectivo')
    const [recibido, setRecibido] = useState(0)
    const [motivo, setMotivo] = useState('')
    const [procesando, setProcesando] = useState(false)
    // Función para obtener fecha de Bolivia
function getBoliviaDateString() {
  const now = new Date()
  const boliviaTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - 4 * 3600000)
  return boliviaTime.toISOString().split('T')[0]
}

const [filtroFecha, setFiltroFecha] = useState(getBoliviaDateString())
    const [error, setError] = useState(null)

    useEffect(() => { 
        if (sucursalActivaId) {
            fetchData() 
        }
    }, [tab, sucursalActivaId, filtroFecha])

    // ==================== FETCH DATA CORREGIDO ====================
    async function fetchData() {
        if (!sucursalActivaId) {
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)
        
        try {
            console.log('🔍 Buscando reservas...')
            console.log('📅 Fecha:', filtroFecha)
            console.log('🏪 Sucursal:', sucursalActivaId)
            console.log('📌 Estado:', tab)
            
            // 1. Obtener reservas con JOIN a sucursales y profiles
            const { data: reservas, error: errorReservas } = await supabase
                .from('reservas')
                .select(`
                    id,
                    descripcion,
                    estado,
                    medio_pago,
                    total,
                    created_at,
                    entregada_at,
                    motivo_cancelacion,
                    caja_sesion_id,
                    usuario_id,
                    sucursal_id,
                    sucursales (
                        nombre
                    ),
                    profiles (
                        full_name
                    )
                `)
                .eq('estado', tab)
                .eq('sucursal_id', sucursalActivaId)
                .gte('created_at', `${filtroFecha}T00:00:00`)
                .lte('created_at', `${filtroFecha}T23:59:59`)
                .order('created_at', { ascending: false })
            
            if (errorReservas) {
                console.error('❌ Error reservas:', errorReservas)
                setError(errorReservas.message)
                toast('Error al cargar reservas: ' + errorReservas.message, 'err')
                setReservas([])
                setLoading(false)
                return
            }
            
            console.log('✅ Reservas encontradas:', reservas?.length || 0)
            
            if (!reservas || reservas.length === 0) {
                console.log('ℹ️ No hay reservas para estos filtros')
                setReservas([])
                setLoading(false)
                return
            }

            // 2. Obtener los IDs de las reservas para buscar sus items
            const reservaIds = reservas.map(r => r.id)
            console.log('📦 IDs de reservas:', reservaIds)

            // 3. Obtener items de todas las reservas
            const { data: items, error: errorItems } = await supabase
                .from('reserva_items')
                .select(`
                    reserva_id,
                    cantidad,
                    precio_unitario,
                    productos (
                        nombre
                    )
                `)
                .in('reserva_id', reservaIds)
            
            if (errorItems) {
                console.error('❌ Error items:', errorItems)
            }
            
            console.log('📦 Items encontrados:', items?.length || 0)

            // 4. Agrupar items por reserva_id
            const itemsMap = {}
            if (items) {
                items.forEach(item => {
                    if (!itemsMap[item.reserva_id]) {
                        itemsMap[item.reserva_id] = []
                    }
                    itemsMap[item.reserva_id].push({
                        producto_nombre: item.productos?.nombre || 'Producto',
                        cantidad: item.cantidad,
                        subtotal: item.cantidad * item.precio_unitario
                    })
                })
            }

            // 5. Formatear datos finales
            const reservasFormateadas = reservas.map(r => ({
                id: r.id,
                descripcion: r.descripcion || 'Sin descripción',
                estado: r.estado || 'pendiente',
                medio_pago: r.medio_pago || 'efectivo',
                total: r.total || 0,
                created_at: r.created_at,
                entregada_at: r.entregada_at,
                motivo_cancelacion: r.motivo_cancelacion,
                caja_sesion_id: r.caja_sesion_id,
                usuario_id: r.usuario_id,
                sucursal_id: r.sucursal_id,
                sucursal_nombre: r.sucursales?.nombre || '',
                usuario_nombre: r.profiles?.full_name || '',
                items: itemsMap[r.id] || []
            }))

            console.log('✅ Reservas formateadas:', reservasFormateadas.length)
            if (reservasFormateadas.length > 0) {
                console.log('📦 Primera reserva:', reservasFormateadas[0])
            }

            setReservas(reservasFormateadas)
            
        } catch (err) {
            console.error('💥 Error inesperado:', err)
            setError(err.message || 'Error desconocido')
            toast('Error inesperado al cargar reservas', 'err')
            setReservas([])
        } finally {
            setLoading(false)
        }
    }

    // ==================== ENTREGAR RESERVA ====================
    async function entregar() {
        if (!modalEntregar) return
        
        if (medioPago === 'efectivo' && recibido < modalEntregar.total) {
            toast('Monto insuficiente', 'warn')
            return
        }
        
        setProcesando(true)
        try {
            const { data, error } = await supabase.rpc('entregar_reserva', {
                p_reserva_id: modalEntregar.id,
                p_medio_pago: medioPago,
                p_monto_recibido: medioPago === 'efectivo' ? recibido : modalEntregar.total,
            })
            
            if (error) {
                console.error('❌ Error entregar:', error)
                toast(error.message, 'err')
                setProcesando(false)
                return
            }
            
            toast('✅ Reserva entregada — venta registrada', 'ok')
            setModalEntregar(null)
            setRecibido(0)
            setMedioPago('efectivo')
            fetchData()
        } catch (err) {
            console.error('💥 Error inesperado entregar:', err)
            toast('Error al entregar reserva', 'err')
        } finally {
            setProcesando(false)
        }
    }

    // ==================== CANCELAR RESERVA ====================
    async function cancelar() {
        if (!motivo.trim()) {
            toast('Escribe el motivo', 'warn')
            return
        }
        
        setProcesando(true)
        try {
            const { data, error } = await supabase.rpc('cancelar_reserva', { 
                p_reserva_id: modalCancelar.id, 
                p_motivo: motivo 
            })
            
            if (error) {
                console.error('❌ Error cancelar:', error)
                toast(error.message, 'err')
                setProcesando(false)
                return
            }
            
            toast('✅ Reserva cancelada — stock restaurado', 'ok')
            setModalCancelar(null)
            setMotivo('')
            fetchData()
        } catch (err) {
            console.error('💥 Error inesperado cancelar:', err)
            toast('Error al cancelar reserva', 'err')
        } finally {
            setProcesando(false)
        }
    }

    const cambio = recibido - (modalEntregar?.total ?? 0)

    // ==================== RENDER ====================
    return (
        <div className="page-wrap">
            <div className="toolbar-wrap" style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>📌 Reservas</h2>
                <input 
                    type="date" 
                    className="form-input" 
                    style={{ width: 'auto' }} 
                    value={filtroFecha} 
                    onChange={e => setFiltroFecha(e.target.value)} 
                />
                <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={fetchData}
                >
                    🔄 Actualizar
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--silver-light)', marginBottom: 0, overflowX: 'auto' }}>
                {[
                    ['pendiente','⏳ Pendientes'], 
                    ['entregada','✅ Entregadas'], 
                    ['cancelada','❌ Canceladas']
                ].map(([k, l]) => (
                    <button 
                        key={k} 
                        onClick={() => setTab(k)}
                        style={{
                            padding: '9px 20px',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            color: tab === k ? 'var(--text)' : 'var(--text-soft)',
                            borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent',
                            marginBottom: -2,
                        }}
                    >
                        {l}
                    </button>
                ))}
            </div>

            <div className="card" style={{ overflow: 'hidden', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                {loading ? (
                    <p style={{ padding: 24, color: 'var(--text-soft)' }}>Cargando...</p>
                ) : error ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--err)' }}>
                        <p>Error al cargar reservas</p>
                        <p style={{ fontSize: 12 }}>{error}</p>
                        <button className="btn-primary" onClick={fetchData} style={{ marginTop: 10 }}>
                            Reintentar
                        </button>
                    </div>
                ) : reservas.length === 0 ? (
                    <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-soft)' }}>
                        Sin reservas {tab}s en esta fecha
                    </p>
                ) : (
                    <div>
                        {reservas.map(r => (
                            <div key={r.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                                            {r.descripcion}
                                        </span>
                                        <span className={ESTADO_BADGE[r.estado] || 'badge-info'}>
                                            {r.estado}
                                        </span>
                                        {r.medio_pago && (
                                            <span className="badge-info" style={{ fontSize: 10 }}>
                                                {r.medio_pago}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 6 }}>
                                        {r.created_at && new Date(r.created_at).toLocaleString('es-BO', { 
                                            day: '2-digit', 
                                            month: '2-digit', 
                                            hour: '2-digit', 
                                            minute: '2-digit' 
                                        })}
                                        {r.usuario_nombre && <> · {r.usuario_nombre}</>}
                                        {r.sucursal_nombre && <> · 🏪 {r.sucursal_nombre}</>}
                                    </div>
                                    {r.items && r.items.length > 0 ? (
                                        <div style={{ fontSize: 12 }}>
                                            {r.items.filter(i => i.producto_nombre).map((i, idx) => (
                                                <span key={idx} style={{ marginRight: 8, background: 'var(--bg-soft)', padding: '1px 6px', borderRadius: 4 }}>
                                                    {i.producto_nombre} ×{i.cantidad}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 12, color: 'var(--text-soft)', fontStyle: 'italic' }}>
                                            Sin productos
                                        </div>
                                    )}
                                    {r.motivo_cancelacion && (
                                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--err)', background: 'var(--err-bg)', padding: '4px 8px', borderRadius: 6 }}>
                                            Motivo: {r.motivo_cancelacion}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                                        Bs {Number(r.total || 0).toFixed(2)}
                                    </p>
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                        {r.estado === 'pendiente' && (
                                            <>
                                                <button 
                                                    className="btn-primary" 
                                                    style={{ padding: '6px 12px', fontSize: 12 }} 
                                                    onClick={() => { 
                                                        setModalEntregar(r)
                                                        setMedioPago(r.medio_pago || 'efectivo')
                                                    }}
                                                >
                                                    ✓ Entregar
                                                </button>
                                                <button 
                                                    className="btn-danger" 
                                                    style={{ padding: '6px 10px', fontSize: 12 }} 
                                                    onClick={() => setModalCancelar(r)}
                                                >
                                                    ✕ Cancelar
                                                </button>
                                            </>
                                        )}
                                        <button 
                                            className="btn-secondary" 
                                            style={{ padding: '6px 10px', fontSize: 12 }} 
                                            onClick={() => setDetalle(r)}
                                        >
                                            Ver
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal detalle */}
            <Modal open={!!detalle} onClose={() => setDetalle(null)} title="Detalle de reserva">
                {detalle && (
                    <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                            <span className={ESTADO_BADGE[detalle.estado] || 'badge-info'}>
                                {detalle.estado || 'pendiente'}
                            </span>
                            {detalle.medio_pago && (
                                <span className="badge-info">{detalle.medio_pago}</span>
                            )}
                            {detalle.sucursal_nombre && (
                                <span className="badge-info">🏪 {detalle.sucursal_nombre}</span>
                            )}
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                            {detalle.descripcion || 'Sin descripción'}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 14 }}>
                            Creada: {detalle.created_at && new Date(detalle.created_at).toLocaleString('es-BO')}
                            {detalle.usuario_nombre && <> · por {detalle.usuario_nombre}</>}
                        </p>
                        <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                            {detalle.items && detalle.items.filter(i => i.producto_nombre).map((i, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                                    <span>{i.producto_nombre} ×{i.cantidad}</span>
                                    <span style={{ fontWeight: 600 }}>Bs {Number(i.subtotal || 0).toFixed(2)}</span>
                                </div>
                            ))}
                            {(!detalle.items || detalle.items.length === 0) && (
                                <div style={{ color: 'var(--text-soft)', fontStyle: 'italic' }}>
                                    No hay productos en esta reserva
                                </div>
                            )}
                            <div style={{ borderTop: '1px solid var(--silver)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}>
                                <span>Total</span>
                                <span>Bs {Number(detalle.total || 0).toFixed(2)}</span>
                            </div>
                        </div>
                        {detalle.motivo_cancelacion && (
                            <div style={{ background: 'var(--err-bg)', color: 'var(--err)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
                                <strong>Motivo cancelación:</strong> {detalle.motivo_cancelacion}
                            </div>
                        )}
                        {detalle.entregada_at && (
                            <p style={{ fontSize: 12, color: 'var(--ok)', marginTop: 8 }}>
                                ✓ Entregada: {new Date(detalle.entregada_at).toLocaleString('es-BO')}
                            </p>
                        )}
                    </>
                )}
            </Modal>

            {/* Modal entregar */}
            <Modal 
                open={!!modalEntregar} 
                onClose={() => {
                    setModalEntregar(null)
                    setRecibido(0)
                    setMedioPago('efectivo')
                }} 
                title={`✓ Entregar reserva — Bs ${Number(modalEntregar?.total ?? 0).toFixed(2)}`}
            >
                {modalEntregar && (
                    <>
                        <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
                            {modalEntregar.items && modalEntregar.items.filter(i => i.producto_nombre).map((i, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <span>{i.producto_nombre} ×{i.cantidad}</span>
                                    <span>Bs {Number(i.subtotal || 0).toFixed(2)}</span>
                                </div>
                            ))}
                            {(!modalEntregar.items || modalEntregar.items.length === 0) && (
                                <div style={{ color: 'var(--text-soft)', fontStyle: 'italic' }}>
                                    No hay productos en esta reserva
                                </div>
                            )}
                        </div>
                        <label className="form-label">Medio de pago</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                            {MEDIOS.map(m => (
                                <button 
                                    key={m} 
                                    onClick={() => setMedioPago(m)}
                                    style={{ 
                                        padding: 12, 
                                        borderRadius: 10, 
                                        border: `2px solid ${medioPago === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`,
                                        background: medioPago === m ? 'var(--yellow-soft)' : '#fff',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                                </button>
                            ))}
                        </div>
                        {medioPago === 'efectivo' && (
                            <>
                                <label className="form-label">Monto recibido</label>
                                <input 
                                    className="form-input" 
                                    type="number" 
                                    value={recibido || ''} 
                                    onChange={e => setRecibido(+e.target.value)} 
                                    placeholder="0.00" 
                                    style={{ marginBottom: 10, textAlign: 'center', fontSize: 18, fontWeight: 700 }} 
                                />
                                {recibido >= modalEntregar.total && recibido > 0 && (
                                    <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: 10, borderRadius: 8, fontWeight: 800, fontSize: 18, textAlign: 'center', marginBottom: 10 }}>
                                        Cambio: Bs {cambio.toFixed(2)}
                                    </div>
                                )}
                            </>
                        )}
                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                            <button 
                                className="btn-secondary" 
                                style={{ flex: 1 }} 
                                onClick={() => {
                                    setModalEntregar(null)
                                    setRecibido(0)
                                    setMedioPago('efectivo')
                                }}
                            >
                                Cancelar
                            </button>
                            <button 
                                className="btn-primary" 
                                style={{ flex: 1 }} 
                                disabled={procesando || (medioPago === 'efectivo' && (recibido < modalEntregar.total || recibido <= 0))} 
                                onClick={entregar}
                            >
                                {procesando ? 'Procesando...' : 'Confirmar entrega'}
                            </button>
                        </div>
                    </>
                )}
            </Modal>

            {/* Modal cancelar */}
            <Modal open={!!modalCancelar} onClose={() => setModalCancelar(null)} title="✕ Cancelar reserva">
                <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                    ⚠ Se restaurará el stock de los productos y quedará registrado en auditoría.
                </div>
                <label className="form-label">Motivo de la cancelación</label>
                <input 
                    className="form-input" 
                    style={{ marginBottom: 20 }} 
                    value={motivo} 
                    onChange={e => setMotivo(e.target.value)} 
                    placeholder="Ej: Cliente no se presentó, pedido incorrecto..." 
                />
                <div style={{ display: 'flex', gap: 10 }}>
                    <button 
                        className="btn-secondary" 
                        style={{ flex: 1 }} 
                        onClick={() => {
                            setModalCancelar(null)
                            setMotivo('')
                        }}
                    >
                        Volver
                    </button>
                    <button 
                        className="btn-danger" 
                        style={{ flex: 1 }} 
                        disabled={procesando || !motivo.trim()} 
                        onClick={cancelar}
                    >
                        {procesando ? 'Cancelando...' : 'Confirmar cancelación'}
                    </button>
                </div>
            </Modal>
        </div>
    )
}