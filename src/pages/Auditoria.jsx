import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auditoria() {
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  // Función para obtener fecha de Bolivia (UTC-4)
function getBoliviaDateString() {
  const now = new Date()
  // Bolivia está en UTC-4
  const boliviaTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - 4 * 3600000)
  return boliviaTime.toISOString().split('T')[0]
}

// Función para obtener fecha de Bolivia con hora
function getBoliviaDateTime() {
  const now = new Date()
  const boliviaTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - 4 * 3600000)
  return boliviaTime
}

// En tu estado, usa la fecha de Bolivia
const [filtros, setFiltros] = useState({ 
  tabla: '', 
  usuario: '', 
  desde: getBoliviaDateString(), 
  hasta: getBoliviaDateString() 
})

// Si necesitas la fecha con hora para otros cálculos
const hoyBolivia = getBoliviaDateTime()
  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    let q = supabase.from('vista_auditoria').select('*')
      .gte('fecha', `${filtros.desde}T00:00:00`)
      .lte('fecha', `${filtros.hasta}T23:59:59`)
      .limit(200)
    if (filtros.tabla) q = q.eq('tabla', filtros.tabla)
    const { data } = await q
    setRegistros(data ?? [])
    setLoading(false)
  }

  const TABLAS = ['productos', 'ventas', 'caja_sesiones', 'gastos', 'profiles']

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>📋 Auditoría</h2>
      </div>

      <div className="toolbar-wrap" style={{ marginBottom: 16, background: 'var(--bg)', padding: 14, borderRadius: 12, border: '1px solid var(--silver-light)' }}>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
        <span style={{ color: 'var(--text-soft)' }}>—</span>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        <select className="form-input form-select" style={{ width: 'auto' }} value={filtros.tabla} onChange={e => setFiltros(f => ({ ...f, tabla: e.target.value }))}>
          <option value="">Todas las tablas</option>
          {TABLAS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn-primary" style={{ padding: '8px 18px', fontSize: 13 }} onClick={fetchData}>Buscar</button>
      </div>

      {loading && <p style={{ color: 'var(--text-soft)', padding: 20 }}>Cargando...</p>}

      {!loading && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-scroll">
            <table className="clap-table">
              <thead><tr><th>Fecha</th><th>Tabla</th><th>Acción</th><th>Usuario</th><th>Rol</th><th>Cambios</th></tr></thead>
              <tbody>
                {registros.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 32 }}>Sin registros en este período</td></tr>
                  : registros.map(r => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(r.fecha).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td><span className="badge-info" style={{ fontSize: 10 }}>{r.tabla}</span></td>
                      <td style={{ fontWeight: 600 }}>{r.accion}</td>
                      <td style={{ fontSize: 13 }}>{r.usuario_nombre ?? '—'}</td>
                      <td><span className={r.usuario_rol === 'propietaria' ? 'badge-ok' : r.usuario_rol === 'administrador' ? 'badge-warn' : 'badge-info'} style={{ fontSize: 10 }}>{r.usuario_rol}</span></td>
                      <td style={{ fontSize: 12, maxWidth: 280 }}>
                        {r.datos_anteriores && r.datos_nuevos ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {Object.keys(r.datos_nuevos).map(k => {
                              const ant = r.datos_anteriores?.[k]
                              const nvo = r.datos_nuevos[k]
                              if (String(ant) === String(nvo)) return null
                              if (k === 'updated_at' || k === 'created_at') return null
                              return (
                                <div key={k} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ color: 'var(--text-soft)', fontSize: 10 }}>{k}:</span>
                                  <span style={{ background: 'var(--err-bg)', color: 'var(--err)', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>{String(ant).substring(0, 20)}</span>
                                  <span style={{ fontSize: 10 }}>→</span>
                                  <span style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>{String(nvo).substring(0, 20)}</span>
                                </div>
                              )
                            })}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}