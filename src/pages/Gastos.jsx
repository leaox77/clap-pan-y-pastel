import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const CATEGORIAS_GASTO = ['Bolsas','Servilletas','Envases','Platos','Vasos','Cubiertos','Material de oficina','Transporte','Alimentación','Mantenimiento','Otro']

export default function Gastos() {
  const toast = useToast()
  const [gastos, setGastos] = useState([])
  const [cajaSesionId, setCajaSesionId] = useState(null)
  const [modalGasto, setModalGasto] = useState(false)
  const [form, setForm] = useState({ categoria: 'Bolsas', descripcion: '', monto: '', responsable: '' })
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchData() }, [filtroFecha])

  async function fetchData() {
    const desde = `${filtroFecha}T00:00:00`
    const hasta = `${filtroFecha}T23:59:59`
    const [{ data: g }, { data: sesion }] = await Promise.all([
      supabase.from('gastos').select('*, profiles(full_name)').gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
      supabase.from('caja_sesiones').select('id').eq('estado', 'abierta').limit(1).maybeSingle(),
    ])
    setGastos(g ?? [])
    setCajaSesionId(sesion?.id ?? null)
  }

  async function registrarGasto() {
    if (!cajaSesionId) { toast('No hay caja abierta', 'warn'); return }
    const { error } = await supabase.rpc('registrar_gasto', {
      p_caja_sesion_id: cajaSesionId,
      p_categoria: form.categoria,
      p_descripcion: form.descripcion,
      p_monto: Number(form.monto),
      p_responsable: form.responsable,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Gasto registrado', 'ok')
    setModalGasto(false)
    setForm({ categoria: 'Bolsas', descripcion: '', monto: '', responsable: '' })
    fetchData()
  }

  const totalDia = gastos.reduce((s, g) => s + Number(g.monto), 0)
  const porCategoria = gastos.reduce((acc, g) => {
    acc[g.categoria] = (acc[g.categoria] ?? 0) + Number(g.monto)
    return acc
  }, {})

  return (
    <div style={{ padding: 28, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Gastos operativos</h2>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        <button className="btn-primary" onClick={() => setModalGasto(true)}>+ Registrar gasto</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Tabla */}
        <div>
          <div style={{ background: 'var(--yellow-soft)', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>Total del día</span>
            <span style={{ fontSize: 22, fontWeight: 700 }}>Bs {totalDia.toFixed(2)}</span>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="clap-table">
              <thead><tr><th>Hora</th><th>Categoría</th><th>Descripción</th><th>Responsable</th><th>Monto</th></tr></thead>
              <tbody>
                {gastos.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 28 }}>Sin gastos registrados</td></tr>
                  : gastos.map(g => (
                    <tr key={g.id}>
                      <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>{new Date(g.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td><span className="badge-warn">{g.categoria}</span></td>
                      <td style={{ color: 'var(--text-soft)' }}>{g.descripcion || '—'}</td>
                      <td>{g.responsable || g.profiles?.full_name || '—'}</td>
                      <td style={{ fontWeight: 700 }}>Bs {Number(g.monto).toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resumen por categoría */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Por categoría</h3>
          {Object.entries(porCategoria).length === 0
            ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin datos</p>
            : Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([cat, monto]) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                <span>{cat}</span>
                <span style={{ fontWeight: 600 }}>Bs {monto.toFixed(2)}</span>
              </div>
            ))}
        </div>
      </div>

      <Modal open={modalGasto} onClose={() => setModalGasto(false)} title="Registrar gasto">
        {!cajaSesionId && (
          <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            ⚠ No hay caja abierta. Abre la caja primero.
          </div>
        )}
        <label className="form-label">Categoría</label>
        <select className="form-input form-select" style={{ marginBottom: 12 }} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
          {CATEGORIAS_GASTO.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="form-label">Descripción</label>
        <input className="form-input" style={{ marginBottom: 12 }} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Detalle del gasto" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label className="form-label">Monto (Bs)</label>
            <input className="form-input" type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label className="form-label">Responsable</label>
            <input className="form-input" value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} placeholder="Nombre" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalGasto(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!form.monto || !cajaSesionId} onClick={registrarGasto}>Registrar</button>
        </div>
      </Modal>
    </div>
  )
}