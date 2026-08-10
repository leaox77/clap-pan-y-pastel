import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useSucursal } from '../context/SucursalContext'
import Modal from '../components/Modal'

const ESTADO_BADGE = { pendiente: 'badge-warn', entregada: 'badge-ok', cancelada: 'badge-err' }
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
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { if (sucursalActivaId) fetchData() }, [tab, sucursalActivaId, filtroFecha])

  async function fetchData() {
    setLoading(true)
    let q = supabase.from('vista_reservas').select('*')
      .eq('estado', tab)
      .gte('created_at', `${filtroFecha}T00:00:00`)
      .lte('created_at', `${filtroFecha}T23:59:59`)
      .order('created_at', { ascending: false })

    if (sucursalActivaId) q = q.eq('sucursal_id', sucursalActivaId)

    const { data } = await q
    setReservas(data ?? [])
    setLoading(false)
  }

  async function entregar() {
    if (!modalEntregar) return
    if (medioPago === 'efectivo' && recibido < modalEntregar.total) { toast('Monto insuficiente', 'warn'); return }
    setProcesando(true)
    const { error } = await supabase.rpc('entregar_reserva', {
      p_reserva_id: modalEntregar.id,
      p_medio_pago: medioPago,
      p_monto_recibido: medioPago === 'efectivo' ? recibido : modalEntregar.total,
    })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    toast('Reserva entregada — venta registrada ✓', 'ok')
    setModalEntregar(null); setRecibido(0); setMedioPago('efectivo')
    fetchData()
  }

  async function cancelar() {
    if (!motivo.trim()) { toast('Escribe el motivo', 'warn'); return }
    setProcesando(true)
    const { error } = await supabase.rpc('cancelar_reserva', { p_reserva_id: modalCancelar.id, p_motivo: motivo })
    setProcesando(false)
    if (error) { toast(error.message, 'err'); return }
    toast('Reserva cancelada — stock restaurado', 'ok')
    setModalCancelar(null); setMotivo('')
    fetchData()
  }

  const cambio = recibido - (modalEntregar?.total ?? 0)

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>📌 Reservas</h2>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--silver-light)', marginBottom: 0, overflowX: 'auto' }}>
        {[['pendiente','⏳ Pendientes'], ['entregada','✅ Entregadas'], ['cancelada','❌ Canceladas']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            color: tab === k ? 'var(--text)' : 'var(--text-soft)',
            borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent',
            marginBottom: -2,
          }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {loading ? (
          <p style={{ padding: 24, color: 'var(--text-soft)' }}>Cargando...</p>
        ) : reservas.length === 0 ? (
          <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-soft)' }}>Sin reservas {tab}s en esta fecha</p>
        ) : (
          <div>
            {reservas.map(r => (
              <div key={r.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{r.descripcion || 'Sin descripción'}</span>
                    <span className={ESTADO_BADGE[r.estado]}>{r.estado}</span>
                    <span className="badge-info" style={{ fontSize: 10 }}>{r.medio_pago}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 6 }}>
                    {new Date(r.created_at).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {r.usuario_nombre && <> · {r.usuario_nombre}</>}
                    {r.sucursal_nombre && <> · 🏪 {r.sucursal_nombre}</>}
                  </div>
                  {/* Items */}
                  <div style={{ fontSize: 12 }}>
                    {(r.items ?? []).filter(i => i.producto_nombre).map((i, idx) => (
                      <span key={idx} style={{ marginRight: 8, background: 'var(--bg-soft)', padding: '1px 6px', borderRadius: 4 }}>
                        {i.producto_nombre} ×{i.cantidad}
                      </span>
                    ))}
                  </div>
                  {r.motivo_cancelacion && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--err)', background: 'var(--err-bg)', padding: '4px 8px', borderRadius: 6 }}>
                      Motivo: {r.motivo_cancelacion}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Bs {Number(r.total).toFixed(2)}</p>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {r.estado === 'pendiente' && (
                      <>
                        <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => { setModalEntregar(r); setMedioPago(r.medio_pago) }}>
                          ✓ Entregar
                        </button>
                        <button className="btn-danger" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setModalCancelar(r)}>
                          ✕ Cancelar
                        </button>
                      </>
                    )}
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setDetalle(r)}>
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
              <span className={ESTADO_BADGE[detalle.estado]}>{detalle.estado}</span>
              <span className="badge-info">{detalle.medio_pago}</span>
              {detalle.sucursal_nombre && <span className="badge-info">🏪 {detalle.sucursal_nombre}</span>}
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{detalle.descripcion || 'Sin descripción'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 14 }}>
              Creada: {new Date(detalle.created_at).toLocaleString('es-BO')}
              {detalle.usuario_nombre && <> · por {detalle.usuario_nombre}</>}
            </p>
            <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              {(detalle.items ?? []).filter(i => i.producto_nombre).map((i, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span>{i.producto_nombre} ×{i.cantidad}</span>
                  <span style={{ fontWeight: 600 }}>Bs {Number(i.subtotal).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--silver)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}>
                <span>Total</span><span>Bs {Number(detalle.total).toFixed(2)}</span>
              </div>
            </div>
            {detalle.motivo_cancelacion && (
              <div style={{ background: 'var(--err-bg)', color: 'var(--err)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
                <strong>Motivo cancelación:</strong> {detalle.motivo_cancelacion}
              </div>
            )}
            {detalle.entregada_at && <p style={{ fontSize: 12, color: 'var(--ok)', marginTop: 8 }}>✓ Entregada: {new Date(detalle.entregada_at).toLocaleString('es-BO')}</p>}
          </>
        )}
      </Modal>

      {/* Modal entregar */}
      <Modal open={!!modalEntregar} onClose={() => setModalEntregar(null)} title={`✓ Entregar reserva — Bs ${Number(modalEntregar?.total ?? 0).toFixed(2)}`}>
        {modalEntregar && (
          <>
            <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
              {(modalEntregar.items ?? []).filter(i => i.producto_nombre).map((i, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>{i.producto_nombre} ×{i.cantidad}</span>
                  <span>Bs {Number(i.subtotal).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <label className="form-label">Medio de pago</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {MEDIOS.map(m => (
                <button key={m} onClick={() => setMedioPago(m)}
                  style={{ padding: 12, borderRadius: 10, border: `2px solid ${medioPago === m ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: medioPago === m ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {m === 'efectivo' ? '💵 Efectivo' : '📱 QR'}
                </button>
              ))}
            </div>
            {medioPago === 'efectivo' && (
              <>
                <label className="form-label">Monto recibido</label>
                <input className="form-input" type="number" value={recibido || ''} onChange={e => setRecibido(+e.target.value)} placeholder="0.00" style={{ marginBottom: 10, textAlign: 'center', fontSize: 18, fontWeight: 700 }} />
                {recibido >= modalEntregar.total && recibido > 0 && (
                  <div style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: 10, borderRadius: 8, fontWeight: 800, fontSize: 18, textAlign: 'center', marginBottom: 10 }}>
                    Cambio: Bs {cambio.toFixed(2)}
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalEntregar(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} disabled={procesando || (medioPago === 'efectivo' && (recibido < modalEntregar.total || recibido <= 0))} onClick={entregar}>
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
        <input className="form-input" style={{ marginBottom: 20 }} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Cliente no se presentó, pedido incorrecto..." />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalCancelar(null)}>Volver</button>
          <button className="btn-danger" style={{ flex: 1 }} disabled={procesando || !motivo.trim()} onClick={cancelar}>
            {procesando ? 'Cancelando...' : 'Confirmar cancelación'}
          </button>
        </div>
      </Modal>
    </div>
  )
}