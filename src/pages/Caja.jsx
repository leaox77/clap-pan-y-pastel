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
        <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-soft)', borderRadius: 8, padding: '5px 8px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 44 }}>Bs {d}</span>
          <input type="text" inputMode="numeric"
            value={value[d] === undefined || value[d] === 0 ? '' : value[d]}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, '')
              const n = { ...value }
              if (raw === '') delete n[d]; else n[d] = Number(raw)
              onChange(n)
            }}
            placeholder="0"
            style={{ width: '100%', border: '1px solid var(--silver-light)', borderRadius: 6, padding: '4px 6px', fontSize: 13 }} />
          <span style={{ fontSize: 11, color: 'var(--text-soft)', minWidth: 46, textAlign: 'right' }}>
            {((value[d] ?? 0) * d).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Caja() {
  const toast = useToast()
  const { role, sucursalId } = useAuth()
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

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: s }, { data: prods }] = await Promise.all([
      supabase.from('caja_sesiones').select('*, profiles!usuario_apertura_id(full_name)')
        .eq('estado', 'abierta').limit(1).maybeSingle(),
      supabase.from('productos').select('id, nombre, es_pan').eq('activo', true).order('nombre'),
    ])

    setProductos(prods ?? [])
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
      } else setSesionAnterior(null)
    } else {
      // Cargar sobrantes pendientes y última sesión
      const hoy = new Date().toISOString().split('T')[0]
      const ayer = new Date(); ayer.setDate(ayer.getDate() - 1)
      const ayerStr = ayer.toISOString().split('T')[0]

      const [{ data: sob }, { data: ultima }] = await Promise.all([
        supabase.from('sobrantes_dia').select('*').eq('confirmado', false)
          .gte('fecha', ayerStr).order('created_at', { ascending: false }),
        supabase.from('caja_sesiones').select('*').eq('estado', 'cerrada')
          .gte('fecha_apertura', `${ayerStr}T00:00:00`)
          .order('fecha_cierre', { ascending: false }).limit(1).maybeSingle(),
      ])

      // Preparar sobrantes con cantidad ajustable
      const sobConCantidad = (sob ?? []).map(s => ({ ...s, cantidad_recibida: s.cantidad_registrada }))
      setSobraantesPendientes(sobConCantidad)
      setSobraantesConfirmados(sobConCantidad.map(s => ({ ...s })))

      if (ultima) {
        setSesionAnterior(ultima)
        if (ultima.tipo_turno === 'manana') {
          setTipoTurno('tarde')
          setPanSobrAnterior(ultima.pan_sobrante_cierre ?? 0)
          setCajasPan('')
        } else {
          setTipoTurno('manana')
          const { data: ult2 } = await supabase.from('caja_sesiones').select('pan_sobrante_cierre')
            .eq('estado', 'cerrada').gte('fecha_apertura', `${ayerStr}T00:00:00`)
            .lte('fecha_apertura', `${ayerStr}T23:59:59`)
            .order('fecha_cierre', { ascending: false }).limit(1).maybeSingle()
          setPanSobrAnterior(ult2?.pan_sobrante_cierre ?? 0)
          setCajasPan('')
        }
      } else {
        setTipoTurno('manana')
        setPanSobrAnterior(0)
        setCajasPan('')
      }
    }
    setLoading(false)
  }

  async function abrirCaja() {
    const monto = totalDenoms(denom)
    const { error } = await supabase.rpc('abrir_caja', {
      p_monto: monto,
      p_denominaciones: denom,
      p_tipo_turno: tipoTurno,
      p_cajas_pan: Number(cajasPan) || 0,
      p_panes_por_caja: Number(panesCaja) || 90,
      p_pan_sobrante_anterior: Number(panSobrAnterior) || 0,
      p_sesion_anterior_id: sesionAnterior?.id ?? null,
      p_sobrantes_confirmados: sobraantesConfirmados
        .filter(s => s.incluir !== false)
        .map(s => ({ id: s.id, producto_id: s.producto_id, cantidad_recibida: s.cantidad_recibida })),
    })
    if (error) { toast(error.message, 'err'); return }
    const totalPan = (Number(cajasPan) || 0) * (Number(panesCaja) || 90) + (Number(panSobrAnterior) || 0)
    toast(`Turno ${tipoTurno === 'manana' ? '☀️ mañana' : '🌙 tarde'} iniciado${totalPan > 0 ? ` — ${totalPan} panes` : ''}`, 'ok')
    setStep('idle'); setDenom({})
    fetchData()
  }

  async function cerrarCaja() {
    const montoFisico = totalDenoms(denomCierre)
    const sobFiltrados = sobraantesCierre.filter(s => s.producto_id && Number(s.cantidad) > 0)
    const { error } = await supabase.rpc('cerrar_caja', {
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
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Turno cerrado correctamente', 'ok')
    setStep('idle')
    setDenomCierre({}); setPanSobrCierre(''); setPerdidasMonto(''); setPerdidasNota(''); setSobraantesCierre([])
    fetchData()
  }

  async function ajustarFondo() {
    const nuevoMonto = totalDenoms(denomAjuste)
    const { error } = await supabase.rpc('ajustar_fondo_caja', {
      p_caja_sesion_id: sesion.id,
      p_nuevo_monto: nuevoMonto,
      p_denominaciones: denomAjuste,
      p_motivo: motivoAjuste,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Fondo ajustado', 'ok')
    setStep('idle'); setDenomAjuste({}); setMotivoAjuste('')
    fetchData()
  }

  if (loading) return <div className="page-wrap" style={{ color: 'var(--text-soft)' }}>Cargando caja...</div>

  const ef = movimientos.filter(m => ['venta','reserva'].includes(m.tipo) && m.medio_pago === 'efectivo').reduce((s, m) => s + Number(m.monto), 0)
  const qr = movimientos.filter(m => ['venta','reserva'].includes(m.tipo) && m.medio_pago === 'qr').reduce((s, m) => s + Number(m.monto), 0)
  const tr = movimientos.filter(m => ['venta','reserva'].includes(m.tipo) && m.medio_pago === 'transferencia').reduce((s, m) => s + Number(m.monto), 0)
  const gastoTotal = gastos.reduce((s, g) => s + Number(g.monto), 0)
  const cajaTeórica = Number(sesion?.monto_apertura ?? 0) + ef - gastoTotal
  const diferenciaCierre = totalDenoms(denomCierre) - cajaTeórica

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Caja</h2>
        {sesion ? (
          <>
            {esAdmin && <button className="btn-secondary" onClick={() => setStep('ajuste')} style={{ fontSize: 13 }}>⚙ Ajustar fondo</button>}
            <button className="btn-danger" onClick={() => setStep('cierre')}>Cerrar turno</button>
          </>
        ) : (
          <button className="btn-primary" onClick={() => setStep('apertura')}>Iniciar turno</button>
        )}
      </div>

      {/* Sin sesión */}
      {!sesion && step === 'idle' && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🏦</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sin turno activo</h3>
          {sobraantesPendientes.length > 0 && (
            <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, textAlign: 'left' }}>
              <strong>⚠ Hay {sobraantesPendientes.length} producto(s) sobrante(s) del turno anterior pendientes de confirmar</strong>
              {sobraantesPendientes.map(s => (
                <div key={s.id} style={{ marginTop: 4 }}>• {s.producto_nombre}: {s.cantidad_registrada} unid.</div>
              ))}
            </div>
          )}
          {sesionAnterior && (
            <div style={{ background: 'var(--info-bg)', color: 'var(--info)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
              Último turno: <strong>{sesionAnterior.tipo_turno}</strong> — pan sobrante: <strong>{sesionAnterior.pan_sobrante_cierre ?? 0}</strong>
            </div>
          )}
          <button className="btn-primary" onClick={() => setStep('apertura')} style={{ padding: '14px 32px', fontSize: 16 }}>
            Iniciar turno {tipoTurno === 'manana' ? '☀️ mañana' : '🌙 tarde'}
          </button>
        </div>
      )}

      {/* Sesión activa */}
      {sesion && step === 'idle' && (
        <>
          <div style={{ background: 'var(--ok-bg)', borderLeft: '4px solid var(--ok)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--ok)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span>✓ <strong>Turno {sesion.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'} activo</strong></span>
            <span>desde {new Date(sesion.fecha_apertura).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>— Fondo: <strong>Bs {Number(sesion.monto_apertura).toFixed(2)}</strong></span>
            <span style={{ marginLeft: 'auto', fontSize: 11 }}>{sesion.profiles?.full_name}</span>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🍞 Pan del turno</h3>
            <div className="grid-3" style={{ gap: 12 }}>
              {[
                ['Pan inicial', Number(sesion.total_pan_inicial ?? 0), `${sesion.cajas_pan ?? 0} cajas × ${sesion.panes_por_caja ?? 90}${sesion.pan_sobrante_anterior > 0 ? ` + ${sesion.pan_sobrante_anterior} sob.` : ''}`],
                ['Ventas totales', `Bs ${(ef + qr + tr).toFixed(2)}`, 'Efectivo + QR + Transfer'],
                ['Caja teórica', `Bs ${cajaTeórica.toFixed(2)}`, 'Fondo + efectivo − gastos'],
              ].map(([l, v, s]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
                  <p style={{ fontSize: 26, fontWeight: 900 }}>{v}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-soft)' }}>{s}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid-4" style={{ marginBottom: 20 }}>
            {[['Efectivo', ef],['QR', qr],['Transfer.', tr],['Gastos', gastoTotal]].map(([l, v], i) => (
              <div key={l} className="card" style={{ padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: i === 3 ? 'var(--err)' : 'inherit' }}>Bs {Number(v).toFixed(2)}</p>
              </div>
            ))}
          </div>

          {sesion.tipo_turno === 'tarde' && sesionAnterior && (
            <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13 }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>☀️ Turno mañana</p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <span>Ventas: <strong>Bs {Number(sesionAnterior.resumen_turno?.total_ventas ?? 0).toFixed(2)}</strong></span>
                <span>Pan sobrante: <strong>{sesionAnterior.pan_sobrante_cierre ?? 0}</strong></span>
              </div>
            </div>
          )}

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--silver-light)', fontWeight: 700 }}>Movimientos del turno</div>
            <div className="table-scroll">
              <table className="clap-table">
                <thead><tr><th>Hora</th><th>Tipo</th><th>Medio</th><th>Monto</th></tr></thead>
                <tbody>
                  {movimientos.length === 0
                    ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>Sin movimientos</td></tr>
                    : movimientos.map(m => (
                      <tr key={m.id}>
                        <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>{new Date(m.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[['manana','☀️ Mañana'], ['tarde','🌙 Tarde']].map(([k, l]) => (
            <button key={k} onClick={() => setTipoTurno(k)}
              style={{ padding: 14, borderRadius: 12, border: `2px solid ${tipoTurno === k ? 'var(--yellow-dark)' : 'var(--silver-light)'}`, background: tipoTurno === k ? 'var(--yellow-soft)' : '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Sobrantes pendientes */}
        {sobraantesConfirmados.length > 0 && (
          <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: '3px solid var(--warn)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📦 Sobrantes pendientes — ¿Ingresan hoy?</p>
            {sobraantesConfirmados.map((s, idx) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer' }}>
                  <input type="checkbox" checked={s.incluir !== false} onChange={e => setSobraantesConfirmados(arr => arr.map((x, i) => i === idx ? { ...x, incluir: e.target.checked } : x))}
                    style={{ width: 16, height: 16, accentColor: 'var(--yellow-dark)', cursor: 'pointer' }} />
                  <span style={{ fontWeight: 600 }}>{s.producto_nombre}</span>
                </label>
                {s.incluir !== false && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setSobraantesConfirmados(arr => arr.map((x, i) => i === idx ? { ...x, cantidad_recibida: Math.max(0, x.cantidad_recibida - 1) } : x))}
                      style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}>−</button>
                    <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 700 }}>{s.cantidad_recibida}</span>
                    <button onClick={() => setSobraantesConfirmados(arr => arr.map((x, i) => i === idx ? { ...x, cantidad_recibida: x.cantidad_recibida + 1 } : x))}
                      style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--silver)', background: 'none', cursor: 'pointer', fontWeight: 700 }}>+</button>
                    <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>unid.</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pan */}
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🍞 Pan recibido hoy</p>
          <div className="grid-3" style={{ gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-label">Cajas recibidas</label>
              <input className="form-input" type="number" value={cajasPan}
                onChange={e => setCajasPan(e.target.value)}
                placeholder="0" style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
            </div>
            <div>
              <label className="form-label">Panes / caja</label>
              <input className="form-input" type="number" value={panesCaja}
                onChange={e => setPanesCaja(e.target.value)}
                style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
            </div>
            <div>
              <label className="form-label">Pan sobrante</label>
              <input className="form-input" type="number" value={panSobrAnterior}
                onChange={e => setPanSobrAnterior(e.target.value)}
                style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }} />
            </div>
          </div>
          {(Number(cajasPan) > 0 || Number(panSobrAnterior) > 0) && (
            <div style={{ background: 'var(--yellow-soft)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>Total panes</span>
              <span>{(Number(cajasPan) || 0) * (Number(panesCaja) || 90) + (Number(panSobrAnterior) || 0)}</span>
            </div>
          )}
        </div>

        {/* Denominaciones */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>💰 Conteo de caja</p>
            <span style={{ fontSize: 18, fontWeight: 800 }}>Bs {totalDenoms(denom).toFixed(2)}</span>
          </div>
          {totalDenoms(denom) > 0 && totalDenoms(denom) < 200 && (
            <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '6px 10px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
              ⚠ El fondo está por debajo de Bs 200. Puedes continuar pero quedará registrado.
            </div>
          )}
          {totalDenoms(denom) === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 8 }}>Si no hay billetes, ingresa solo monedas.</p>
          )}
          <DenomInput value={denom} onChange={setDenom} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={totalDenoms(denom) <= 0} onClick={abrirCaja}>
            Iniciar turno
          </button>
        </div>
      </Modal>

      {/* ─── MODAL CIERRE ─── */}
      <Modal open={step === 'cierre'} onClose={() => setStep('idle')} title={`Cerrar turno ${sesion?.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'}`}>
        <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Fondo inicial</span><span>Bs {Number(sesion?.monto_apertura ?? 0).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Ventas efectivo</span><span>Bs {ef.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Ventas QR</span><span>Bs {qr.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: 'var(--err)' }}><span>Gastos</span><span>- Bs {gastoTotal.toFixed(2)}</span></div>
          <div style={{ borderTop: '1px solid var(--silver)', paddingTop: 8, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}>
            <span>Caja teórica</span><span>Bs {cajaTeórica.toFixed(2)}</span>
          </div>
        </div>

        {/* Pan sobrante */}
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <label className="form-label">🍞 Panes sobrantes al cerrar</label>
          <input className="form-input" type="number" value={panSobrCierre}
            onChange={e => setPanSobrCierre(e.target.value)}
            placeholder="0" style={{ textAlign: 'center', fontWeight: 800, fontSize: 22, marginBottom: 6 }} />
          <p style={{ fontSize: 11, color: 'var(--text-soft)' }}>
            {sesion?.tipo_turno === 'tarde' ? 'Pasarán al turno mañana del próximo día' : 'Pasarán al turno tarde de hoy'}
          </p>
        </div>

        {/* Sobrantes otros productos */}
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📦 ¿Sobran otros productos? (opcional)</p>
          {sobraantesCierre.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select className="form-input form-select" style={{ flex: 2 }} value={s.producto_id ?? ''}
                onChange={e => setSobraantesCierre(arr => arr.map((x, i) => i === idx ? { ...x, producto_id: e.target.value } : x))}>
                <option value="">Seleccionar...</option>
                {productos.filter(p => !p.es_pan).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <input className="form-input" type="number" style={{ width: 70 }} placeholder="Cant."
                value={s.cantidad ?? ''}
                onChange={e => setSobraantesCierre(arr => arr.map((x, i) => i === idx ? { ...x, cantidad: e.target.value } : x))} />
              <button onClick={() => setSobraantesCierre(arr => arr.filter((_, i) => i !== idx))}
                style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
            </div>
          ))}
          <button onClick={() => setSobraantesCierre(arr => [...arr, { producto_id: '', cantidad: '' }])}
            className="btn-secondary" style={{ width: '100%', fontSize: 12, padding: '7px' }}>
            + Agregar sobrante
          </button>
        </div>

        {/* Pérdidas */}
        <div style={{ border: '1.5px solid var(--err-bg)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <label className="form-label">⚠ Pérdidas (opcional)</label>
          <input className="form-input" type="number" value={perdidasMonto}
            onChange={e => setPerdidasMonto(e.target.value)}
            placeholder="Monto en Bs" style={{ marginBottom: 8 }} />
          <input className="form-input" value={perdidasNota}
            onChange={e => setPerdidasNota(e.target.value)}
            placeholder="Descripción (si hubo pérdidas, justifica aquí)" />
        </div>

        {/* Conteo físico */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>💰 Conteo físico</p>
            <span style={{ fontSize: 18, fontWeight: 800 }}>Bs {totalDenoms(denomCierre).toFixed(2)}</span>
          </div>
          {totalDenoms(denomCierre) === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 8 }}>Si solo hay monedas, ingresalas en las denominaciones correspondientes.</p>
          )}
          <DenomInput value={denomCierre} onChange={setDenomCierre} />
        </div>

        {totalDenoms(denomCierre) > 0 && (
          <div style={{ background: diferenciaCierre < -0.5 ? 'var(--err-bg)' : 'var(--ok-bg)', color: diferenciaCierre < -0.5 ? 'var(--err)' : 'var(--ok)', borderRadius: 10, padding: '10px 14px', fontWeight: 800, fontSize: 16, textAlign: 'center', marginBottom: 12 }}>
            Diferencia: {diferenciaCierre >= 0 ? '+' : ''}Bs {diferenciaCierre.toFixed(2)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={totalDenoms(denomCierre) <= 0} onClick={cerrarCaja}>
            Confirmar cierre
          </button>
        </div>
      </Modal>

      {/* ─── MODAL AJUSTE FONDO ─── */}
      <Modal open={step === 'ajuste'} onClose={() => setStep('idle')} title="⚙ Ajustar fondo de caja">
        <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
          ⚠ Queda registrado en auditoría con usuario, hora y motivo.
        </div>
        <div style={{ background: 'var(--bg-soft)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          <span>Fondo actual</span><span style={{ fontWeight: 700 }}>Bs {Number(sesion?.monto_apertura ?? 0).toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 700 }}>💰 Nuevo conteo</p>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Bs {totalDenoms(denomAjuste).toFixed(2)}</span>
        </div>
        <DenomInput value={denomAjuste} onChange={setDenomAjuste} />
        <label className="form-label" style={{ marginTop: 14 }}>Motivo del ajuste</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={motivoAjuste}
          onChange={e => setMotivoAjuste(e.target.value)}
          placeholder="Ej: Error en conteo inicial, corrección de monto" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={totalDenoms(denomAjuste) <= 0 || !motivoAjuste} onClick={ajustarFondo}>
            Confirmar ajuste
          </button>
        </div>
      </Modal>
    </div>
  )
}