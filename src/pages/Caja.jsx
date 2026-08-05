import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'

const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10]

function totalDenoms(d) { return DENOMS.reduce((s, k) => s + (d[k] ?? 0) * k, 0) }

function DenomInput({ value, onChange }) {
  return (
    <div className="grid-2" style={{ gap: 6 }}>
      {DENOMS.map(d => (
        <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-soft)', borderRadius: 8, padding: '6px 10px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 48 }}>Bs {d}</span>
          <input type="text" inputMode="numeric"
            value={value[d] === undefined || value[d] === 0 ? '' : value[d]}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, '')
              const n = { ...value }
              if (raw === '') delete n[d]; else n[d] = Number(raw)
              onChange(n)
            }}
            placeholder="0"
            style={{ width: '100%', border: '1px solid var(--silver-light)', borderRadius: 6, padding: '5px 8px', fontSize: 13 }} />
          <span style={{ fontSize: 11, color: 'var(--text-soft)', minWidth: 52, textAlign: 'right' }}>
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
  const esAdmin = ['administrador', 'propietaria'].includes(role)

  const [sesion, setSesion] = useState(null)
  const [sesionAnterior, setSesionAnterior] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('idle') // idle | apertura | cierre | ajuste

  // Apertura
  const [denom, setDenom] = useState({})
  const [cajasPan, setCajasPan] = useState(0)
  const [panesCaja, setPanesCaja] = useState(90)
  const [panSobrAnterior, setPanSobrAnterior] = useState(0)
  const [tipoTurno, setTipoTurno] = useState('manana')

  // Cierre
  const [denomCierre, setDenomCierre] = useState({})
  const [panSobrCierre, setPanSobrCierre] = useState(0)
  const [perdidasMonto, setPerdidasMonto] = useState(0)
  const [perdidasNota, setPerdidasNota] = useState('')

  // Ajuste de fondo
  const [denomAjuste, setDenomAjuste] = useState({})
  const [motivoAjuste, setMotivoAjuste] = useState('')

  useEffect(() => { fetchSesion() }, [])

  async function fetchSesion() {
    setLoading(true)
    const { data: s } = await supabase
      .from('caja_sesiones')
      .select('*, profiles!usuario_apertura_id(full_name)')
      .eq('estado', 'abierta').limit(1).maybeSingle()

    setSesion(s)

    if (s) {
      const [{ data: movs }, { data: g }] = await Promise.all([
        supabase.from('caja_movimientos').select('*').eq('caja_sesion_id', s.id).order('fecha', { ascending: false }),
        supabase.from('gastos').select('*').eq('caja_sesion_id', s.id),
      ])
      setMovimientos(movs ?? [])
      setGastos(g ?? [])

      if (s.sesion_anterior_id) {
        const { data: ant } = await supabase.from('caja_sesiones').select('*').eq('id', s.sesion_anterior_id).single()
        setSesionAnterior(ant)
      } else {
        setSesionAnterior(null)
      }
    } else {
      // Buscar última sesión cerrada para pre-cargar datos
      const hoy = new Date().toISOString().split('T')[0]
      const { data: ultima } = await supabase
        .from('caja_sesiones').select('*').eq('estado', 'cerrada')
        .gte('fecha_apertura', hoy)
        .order('fecha_cierre', { ascending: false }).limit(1).maybeSingle()

      if (ultima) {
        setSesionAnterior(ultima)
        if (ultima.tipo_turno === 'manana') {
          setTipoTurno('tarde')
          setPanSobrAnterior(ultima.pan_sobrante_cierre ?? 0)
          setCajasPan(0)
        } else {
          setTipoTurno('manana')
          // Pan sobrante del día anterior
          const ayer = new Date(); ayer.setDate(ayer.getDate() - 1)
          const ayerStr = ayer.toISOString().split('T')[0]
          const { data: ult2 } = await supabase
            .from('caja_sesiones').select('pan_sobrante_cierre')
            .eq('estado', 'cerrada')
            .gte('fecha_apertura', ayerStr).lte('fecha_apertura', `${ayerStr}T23:59:59`)
            .order('fecha_cierre', { ascending: false }).limit(1).maybeSingle()
          setPanSobrAnterior(ult2?.pan_sobrante_cierre ?? 0)
        }
      } else {
        setTipoTurno('manana')
        setPanSobrAnterior(0)
      }
    }
    setLoading(false)
  }

  async function abrirCaja() {
    const monto = totalDenoms(denom)
    if (monto < 200) { toast('El fondo mínimo es Bs 200', 'warn'); return }
    const { error } = await supabase.rpc('abrir_caja', {
      p_monto: monto, p_denominaciones: denom,
      p_tipo_turno: tipoTurno,
      p_cajas_pan: cajasPan, p_panes_por_caja: panesCaja,
      p_pan_sobrante_anterior: panSobrAnterior,
      p_sesion_anterior_id: sesionAnterior?.id ?? null,
    })
    if (error) { toast(error.message, 'err'); return }
    const totalPan = cajasPan * panesCaja + panSobrAnterior
    toast(`Turno ${tipoTurno === 'manana' ? 'mañana' : 'tarde'} iniciado — ${totalPan} panes`, 'ok')
    setStep('idle'); setDenom({})
    fetchSesion()
  }

  async function cerrarCaja() {
    const montoFisico = totalDenoms(denomCierre)
    const { error } = await supabase.rpc('cerrar_caja', {
      p_caja_sesion_id: sesion.id,
      p_monto_fisico: montoFisico, p_denominaciones: denomCierre,
      p_pan_sobrante_cierre: panSobrCierre,
      p_perdidas_monto: perdidasMonto,
      p_perdidas_nota: perdidasNota,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Turno cerrado correctamente', 'ok')
    setStep('idle')
    setDenomCierre({}); setPanSobrCierre(0); setPerdidasMonto(0); setPerdidasNota('')
    fetchSesion()
  }

  async function ajustarFondo() {
    const nuevoMonto = totalDenoms(denomAjuste)
    if (nuevoMonto <= 0) { toast('Ingresa el conteo', 'warn'); return }
    if (!motivoAjuste) { toast('Ingresa el motivo', 'warn'); return }
    const { error } = await supabase.rpc('ajustar_fondo_caja', {
      p_caja_sesion_id: sesion.id,
      p_nuevo_monto: nuevoMonto,
      p_denominaciones: denomAjuste,
      p_motivo: motivoAjuste,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Fondo ajustado correctamente', 'ok')
    setStep('idle'); setDenomAjuste({}); setMotivoAjuste('')
    fetchSesion()
  }

  if (loading) return <div className="page-wrap" style={{ color: 'var(--text-soft)' }}>Cargando caja...</div>

  // Cálculos
  const ef = movimientos.filter(m => ['venta','reserva'].includes(m.tipo) && m.medio_pago === 'efectivo').reduce((s, m) => s + Number(m.monto), 0)
  const qr = movimientos.filter(m => ['venta','reserva'].includes(m.tipo) && m.medio_pago === 'qr').reduce((s, m) => s + Number(m.monto), 0)
  const tr = movimientos.filter(m => ['venta','reserva'].includes(m.tipo) && m.medio_pago === 'transferencia').reduce((s, m) => s + Number(m.monto), 0)
  const gastoTotal = gastos.reduce((s, g) => s + Number(g.monto), 0)
  const totalVentas = ef + qr + tr
  const cajaTeórica = Number(sesion?.monto_apertura ?? 0) + ef - gastoTotal
  const diferenciaCierre = totalDenoms(denomCierre) - cajaTeórica
  const totalPanInicial = Number(sesion?.total_pan_inicial ?? 0)

  return (
    <div className="page-wrap">
      {/* Toolbar */}
      <div className="toolbar-wrap" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Caja</h2>
        {sesion ? (
          <>
            {esAdmin && (
              <button className="btn-secondary" onClick={() => setStep('ajuste')} style={{ fontSize: 13 }}>
                ⚙ Ajustar fondo
              </button>
            )}
            <button className="btn-danger" onClick={() => setStep('cierre')}>Cerrar turno</button>
          </>
        ) : (
          <button className="btn-primary" onClick={() => setStep('apertura')}>Iniciar turno</button>
        )}
      </div>

      {/* ─── SIN SESIÓN ─── */}
      {!sesion && step === 'idle' && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🏦</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sin turno activo</h3>
          {sesionAnterior && (
            <div style={{ background: 'var(--info-bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--info)' }}>
              <strong>Último turno ({sesionAnterior.tipo_turno}):</strong> pan sobrante <strong>{sesionAnterior.pan_sobrante_cierre ?? 0} panes</strong>
            </div>
          )}
          <p style={{ color: 'var(--text-soft)', marginBottom: 20, fontSize: 14 }}>
            Próximo turno sugerido: <strong>{tipoTurno === 'manana' ? '☀️ Mañana' : '🌙 Tarde'}</strong>
          </p>
          <button className="btn-primary" onClick={() => setStep('apertura')} style={{ padding: '14px 32px', fontSize: 16 }}>
            Iniciar turno
          </button>
        </div>
      )}

      {/* ─── SESIÓN ACTIVA ─── */}
      {sesion && step === 'idle' && (
        <>
          {/* Banner estado */}
          <div style={{ background: 'var(--ok-bg)', borderLeft: '4px solid var(--ok)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--ok)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>✓ <strong>Turno {sesion.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'} activo</strong></span>
            <span>desde {new Date(sesion.fecha_apertura).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>— Fondo: <strong>Bs {Number(sesion.monto_apertura).toFixed(2)}</strong></span>
            <span style={{ marginLeft: 'auto', fontSize: 12 }}>Responsable: {sesion.profiles?.full_name}</span>
          </div>

          {/* Pan */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🍞 Pan del turno</h3>
            <div className="grid-3" style={{ gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Pan inicial</p>
                <p style={{ fontSize: 32, fontWeight: 900 }}>{totalPanInicial}</p>
                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                  {sesion.cajas_pan > 0 ? `${sesion.cajas_pan} cajas × ${sesion.panes_por_caja}` : ''}
                  {sesion.pan_sobrante_anterior > 0 ? ` + ${sesion.pan_sobrante_anterior} sobrantes` : ''}
                </p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Ventas totales</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--ok)' }}>Bs {totalVentas.toFixed(2)}</p>
                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>Efectivo + QR</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>Caja teórica</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--info)' }}>Bs {cajaTeórica.toFixed(2)}</p>
                <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>Fondo + efectivo − gastos</p>
              </div>
            </div>
          </div>

          {/* Métricas */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            {[['Efectivo', ef, 'ok'], ['QR', qr, 'info'], ['Transferencia', tr, 'info'], ['Gastos', gastoTotal, 'err']].map(([l, v, t]) => (
              <div key={l} className="card" style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
                <p style={{ fontSize: 20, fontWeight: 700 }}>Bs {Number(v).toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* Resumen turno anterior si es tarde */}
          {sesion.tipo_turno === 'tarde' && sesionAnterior && (
            <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13 }}>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>☀️ Resumen turno mañana</p>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <span>Ventas: <strong>Bs {Number(sesionAnterior.resumen_turno?.total_ventas ?? 0).toFixed(2)}</strong></span>
                <span>Pan sobrante: <strong>{sesionAnterior.pan_sobrante_cierre ?? 0} panes</strong></span>
                {Number(sesionAnterior.perdidas_monto ?? 0) > 0 && (
                  <span style={{ color: 'var(--err)' }}>Pérdidas: <strong>Bs {Number(sesionAnterior.perdidas_monto).toFixed(2)}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Movimientos */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700, fontSize: 15 }}>
              Movimientos del turno
            </div>
            <div className="table-scroll">
              <table className="clap-table">
                <thead>
                  <tr><th>Hora</th><th>Tipo</th><th>Medio</th><th>Monto</th></tr>
                </thead>
                <tbody>
                  {movimientos.length === 0
                    ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin movimientos</td></tr>
                    : movimientos.map(m => (
                      <tr key={m.id}>
                        <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>
                          {new Date(m.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td><span className={m.tipo === 'gasto' ? 'badge-err' : m.tipo === 'reserva' ? 'badge-warn' : 'badge-ok'}>{m.tipo}</span></td>
                        <td>{m.medio_pago ?? '—'}</td>
                        <td style={{ fontWeight: 700 }}>Bs {Number(m.monto).toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── MODAL APERTURA ─── */}
      <Modal open={step === 'apertura'} onClose={() => setStep('idle')} title="Iniciar turno">
        {/* Tipo turno */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[['manana','☀️ Turno mañana'], ['tarde','🌙 Turno tarde']].map(([k, l]) => (
            <button key={k} onClick={() => setTipoTurno(k)}
              style={{ padding: 14, borderRadius: 12, border: `2px solid ${tipoTurno === k ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: tipoTurno === k ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Pan */}
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🍞 Registro de pan</p>
          {panSobrAnterior > 0 && (
            <div style={{ background: 'var(--info-bg)', color: 'var(--info)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
              📦 Pan sobrante cargado automáticamente: <strong>{panSobrAnterior} panes</strong>
            </div>
          )}
          <div className="grid-3" style={{ gap: 10, marginBottom: 12 }}>
            <div>
              <label className="form-label">Cajas nuevas</label>
              <input className="form-input" type="number" value={cajasPan}
                onChange={e => setCajasPan(+e.target.value)}
                style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
            </div>
            <div>
              <label className="form-label">Panes / caja</label>
              <input className="form-input" type="number" value={panesCaja}
                onChange={e => setPanesCaja(+e.target.value)}
                style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
            </div>
            <div>
              <label className="form-label">Pan sobrante</label>
              <input className="form-input" type="number" value={panSobrAnterior}
                onChange={e => setPanSobrAnterior(+e.target.value)}
                style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
            </div>
          </div>
          <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
            <span>Total panes</span>
            <span>{cajasPan * panesCaja + panSobrAnterior}</span>
          </div>
        </div>

        {/* Denominaciones */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>💰 Conteo de caja</p>
            <span style={{ fontSize: 18, fontWeight: 800, color: totalDenoms(denom) >= 200 ? 'var(--ok)' : 'var(--err)' }}>
              Bs {totalDenoms(denom).toFixed(2)}
            </span>
          </div>
          {totalDenoms(denom) < 200 && (
            <p style={{ fontSize: 12, color: 'var(--err)', marginBottom: 8 }}>⚠ Mínimo requerido: Bs 200</p>
          )}
          <DenomInput value={denom} onChange={setDenom} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={totalDenoms(denom) < 200} onClick={abrirCaja}>
            Iniciar turno
          </button>
        </div>
      </Modal>

      {/* ─── MODAL CIERRE ─── */}
      <Modal open={step === 'cierre'} onClose={() => setStep('idle')} title={`Cerrar turno ${sesion?.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'}`}>
        {/* Resumen */}
        <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Fondo inicial</span><span>Bs {Number(sesion?.monto_apertura ?? 0).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Ventas efectivo</span><span>Bs {ef.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Ventas QR</span><span>Bs {qr.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--err)' }}><span>Gastos</span><span>- Bs {gastoTotal.toFixed(2)}</span></div>
          <div style={{ borderTop: '1px solid var(--silver)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
            <span>Caja teórica</span><span>Bs {cajaTeórica.toFixed(2)}</span>
          </div>
        </div>

        {/* Pan sobrante */}
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <label className="form-label">🍞 Panes sobrantes al cerrar</label>
          <input className="form-input" type="number" value={panSobrCierre}
            onChange={e => setPanSobrCierre(+e.target.value)}
            style={{ textAlign: 'center', fontWeight: 800, fontSize: 24, marginBottom: 6 }} placeholder="0" />
          <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
            {sesion?.tipo_turno === 'tarde' ? 'Pasarán al turno mañana del próximo día' : 'Pasarán al turno tarde de hoy'}
          </p>
        </div>

        {/* Pérdidas */}
        <div style={{ border: '1.5px solid var(--err-bg)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <label className="form-label">⚠ ¿Hubo pérdidas? (opcional)</label>
          <input className="form-input" type="number" value={perdidasMonto || ''}
            onChange={e => setPerdidasMonto(+e.target.value)}
            placeholder="Monto en Bs" style={{ marginBottom: 8 }} />
          <input className="form-input" value={perdidasNota}
            onChange={e => setPerdidasNota(e.target.value)}
            placeholder="Descripción de la pérdida" />
        </div>

        {/* Conteo físico */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>💰 Conteo físico de caja</p>
            <span style={{ fontSize: 18, fontWeight: 800 }}>Bs {totalDenoms(denomCierre).toFixed(2)}</span>
          </div>
          <DenomInput value={denomCierre} onChange={setDenomCierre} />
        </div>

        {totalDenoms(denomCierre) > 0 && (
          <div style={{
            background: diferenciaCierre < -1 ? 'var(--err-bg)' : 'var(--ok-bg)',
            color: diferenciaCierre < -1 ? 'var(--err)' : 'var(--ok)',
            borderRadius: 10, padding: '10px 14px', fontWeight: 800,
            fontSize: 18, textAlign: 'center', marginBottom: 14,
          }}>
            Diferencia: {diferenciaCierre >= 0 ? '+' : ''}Bs {diferenciaCierre.toFixed(2)}
          </div>
        )}

        {/* Resumen turno anterior (si es tarde) */}
        {sesion?.tipo_turno === 'tarde' && sesionAnterior && (
          <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 13 }}>
            <p style={{ fontWeight: 700, marginBottom: 6 }}>☀️ Resumen turno mañana</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>Ventas: <strong>Bs {Number(sesionAnterior.resumen_turno?.total_ventas ?? 0).toFixed(2)}</strong></span>
              <span>Pan sobrante: <strong>{sesionAnterior.pan_sobrante_cierre ?? 0}</strong></span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={totalDenoms(denomCierre) <= 0} onClick={cerrarCaja}>
            Confirmar cierre
          </button>
        </div>
      </Modal>

      {/* ─── MODAL AJUSTE DE FONDO ─── */}
      <Modal open={step === 'ajuste'} onClose={() => setStep('idle')} title="⚙ Ajustar fondo de caja">
        <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          ⚠ Esta acción queda registrada en auditoría con tu usuario y hora exacta.
        </div>

        <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Fondo actual registrado</span>
            <span style={{ fontWeight: 700 }}>Bs {Number(sesion?.monto_apertura ?? 0).toFixed(2)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 700 }}>💰 Nuevo conteo de caja</p>
          <span style={{ fontSize: 18, fontWeight: 800, color: totalDenoms(denomAjuste) > 0 ? 'var(--ok)' : 'var(--text-soft)' }}>
            Bs {totalDenoms(denomAjuste).toFixed(2)}
          </span>
        </div>
        <DenomInput value={denomAjuste} onChange={setDenomAjuste} />

        <label className="form-label" style={{ marginTop: 16 }}>Motivo del ajuste</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={motivoAjuste}
          onChange={e => setMotivoAjuste(e.target.value)}
          placeholder="Ej: Error en conteo inicial, corrección de denominaciones" />

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }}
            disabled={totalDenoms(denomAjuste) <= 0 || !motivoAjuste}
            onClick={ajustarFondo}>
            Confirmar ajuste
          </button>
        </div>
      </Modal>
    </div>
  )
}