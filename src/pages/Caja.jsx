import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10]

function DenomInput({ value, onChange }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Conteo de denominaciones</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {DENOMS.map(d => (
          <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-soft)', borderRadius: 8, padding: '6px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 44 }}>Bs {d}</span>
            <input type="number" min="0" value={value[d] ?? 0}
              onChange={e => onChange({ ...value, [d]: Number(e.target.value) })}
              style={{ width: '100%', border: '1px solid var(--silver-light)', borderRadius: 6, padding: '4px 8px', fontSize: 13 }} />
            <span style={{ fontSize: 11, color: 'var(--text-soft)', minWidth: 52, textAlign: 'right' }}>
              = Bs {((value[d] ?? 0) * d).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function totalDenoms(denoms) {
  return DENOMS.reduce((s, d) => s + (denoms[d] ?? 0) * d, 0)
}

export default function Caja() {
  const toast = useToast()
  const [sesion, setSesion] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalApertura, setModalApertura] = useState(false)
  const [modalCierre, setModalCierre] = useState(false)

  const [denomApertura, setDenomApertura] = useState({})
  const [denomCierre, setDenomCierre] = useState({})

  useEffect(() => { fetchSesion() }, [])

  async function fetchSesion() {
    const { data: s } = await supabase.from('caja_sesiones').select('*, profiles!usuario_apertura_id(full_name)')
      .eq('estado', 'abierta').limit(1).maybeSingle()
    setSesion(s)
    if (s) {
      const { data: movs } = await supabase.from('caja_movimientos')
        .select('*').eq('caja_sesion_id', s.id).order('fecha', { ascending: false })
      setMovimientos(movs ?? [])
    }
    setLoading(false)
  }

  async function abrirCaja() {
    const monto = totalDenoms(denomApertura)
    const { error } = await supabase.rpc('abrir_caja', {
      p_monto: monto, p_denominaciones: denomApertura,
    })
    if (error) { toast(error.message, 'err'); return }
    toast(`Caja abierta con Bs ${monto.toFixed(2)}`, 'ok')
    setModalApertura(false); setDenomApertura({})
    fetchSesion()
  }

  async function cerrarCaja() {
    const montoFisico = totalDenoms(denomCierre)
    const { error } = await supabase.rpc('cerrar_caja', {
      p_caja_sesion_id: sesion.id,
      p_monto_fisico: montoFisico,
      p_denominaciones: denomCierre,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Caja cerrada correctamente', 'ok')
    setModalCierre(false); setDenomCierre({})
    fetchSesion()
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-soft)' }}>Cargando caja...</div>

  const totalEfectivo = movimientos.filter(m => m.tipo === 'venta' && m.medio_pago === 'efectivo').reduce((s, m) => s + Number(m.monto), 0)
  const totalQR = movimientos.filter(m => m.tipo === 'venta' && m.medio_pago === 'qr').reduce((s, m) => s + Number(m.monto), 0)
  const totalTransfer = movimientos.filter(m => m.tipo === 'venta' && m.medio_pago === 'transferencia').reduce((s, m) => s + Number(m.monto), 0)
  const totalGastos = movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto), 0)

  return (
    <div style={{ padding: 28, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Caja</h2>
        {sesion
          ? <button className="btn-danger" onClick={() => setModalCierre(true)}>Cerrar caja</button>
          : <button className="btn-primary" onClick={() => setModalApertura(true)}>Abrir caja</button>}
      </div>

      {!sesion ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏦</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Caja cerrada</h3>
          <p style={{ color: 'var(--text-soft)', marginBottom: 20 }}>No hay una sesión de caja activa. Abre la caja para comenzar el turno.</p>
          <button className="btn-primary" onClick={() => setModalApertura(true)} style={{ padding: '12px 28px' }}>Abrir caja del día</button>
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--ok-bg)', borderLeft: '4px solid var(--ok)', borderRadius: 10, padding: '12px 16px', marginBottom: 22, fontSize: 13, color: 'var(--ok)' }}>
            ✓ <strong>Caja abierta</strong> por {sesion.profiles?.full_name} — desde {new Date(sesion.fecha_apertura).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })} — Fondo inicial: <strong>Bs {Number(sesion.monto_apertura).toFixed(2)}</strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
            {[['Efectivo', totalEfectivo, 'ok'], ['QR', totalQR, 'info'], ['Transferencia', totalTransfer, 'info'], ['Gastos', totalGastos, 'err']].map(([l, v, t]) => (
              <div key={l} className="card" style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{l}</p>
                <p style={{ fontSize: 22, fontWeight: 700 }}>Bs {Number(v).toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Movimientos de la sesión</h3>
            </div>
            <table className="clap-table">
              <thead><tr><th>Hora</th><th>Tipo</th><th>Medio</th><th>Monto</th></tr></thead>
              <tbody>
                {movimientos.length === 0
                  ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin movimientos</td></tr>
                  : movimientos.map(m => (
                    <tr key={m.id}>
                      <td style={{ color: 'var(--text-soft)' }}>{new Date(m.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td><span className={m.tipo === 'gasto' ? 'badge-err' : 'badge-ok'}>{m.tipo}</span></td>
                      <td>{m.medio_pago ?? '—'}</td>
                      <td style={{ fontWeight: 700 }}>Bs {Number(m.monto).toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal apertura */}
      <Modal open={modalApertura} onClose={() => setModalApertura(false)} title="Apertura de caja">
        <div style={{ marginBottom: 16, background: 'var(--yellow-soft)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Fondo inicial</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Bs {totalDenoms(denomApertura).toFixed(2)}</span>
        </div>
        <DenomInput value={denomApertura} onChange={setDenomApertura} />
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalApertura(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={totalDenoms(denomApertura) <= 0} onClick={abrirCaja}>Abrir caja</button>
        </div>
      </Modal>

      {/* Modal cierre */}
      <Modal open={modalCierre} onClose={() => setModalCierre(false)} title="Cierre y arqueo de caja">
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: '12px 14px', marginBottom: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Fondo inicial</span><span>Bs {Number(sesion?.monto_apertura ?? 0).toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Ventas efectivo</span><span>Bs {totalEfectivo.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Gastos</span><span style={{ color: 'var(--err)' }}>- Bs {totalGastos.toFixed(2)}</span></div>
            <div style={{ borderTop: '1px solid var(--silver)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Caja teórica</span>
              <span>Bs {(Number(sesion?.monto_apertura ?? 0) + totalEfectivo - totalGastos).toFixed(2)}</span>
            </div>
          </div>
          <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>Caja física (conteo)</span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Bs {totalDenoms(denomCierre).toFixed(2)}</span>
          </div>
          {totalDenoms(denomCierre) > 0 && (() => {
            const teorico = Number(sesion?.monto_apertura ?? 0) + totalEfectivo - totalGastos
            const diferencia = totalDenoms(denomCierre) - teorico
            return (
              <div style={{ background: diferencia < 0 ? 'var(--err-bg)' : 'var(--ok-bg)', color: diferencia < 0 ? 'var(--err)' : 'var(--ok)', borderRadius: 8, padding: '8px 14px', fontSize: 14, fontWeight: 700, textAlign: 'center', marginBottom: 14 }}>
                Diferencia: {diferencia >= 0 ? '+' : ''}Bs {diferencia.toFixed(2)}
              </div>
            )
          })()}
        </div>
        <DenomInput value={denomCierre} onChange={setDenomCierre} />
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalCierre(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={totalDenoms(denomCierre) <= 0} onClick={cerrarCaja}>Confirmar cierre</button>
        </div>
      </Modal>
    </div>
  )
}