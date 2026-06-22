import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const TIPOS = {
  merma_danado:'Dañado', merma_vencido:'Vencido', merma_consumo_interno:'Consumo interno',
  merma_degustacion:'Degustación', merma_donacion:'Donación', merma_regalo:'Regalo', merma_diferencia:'Diferencia'
}

export default function Mermas() {
  const toast = useToast()
  const [mermas, setMermas] = useState([])
  const [productos, setProductos] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ producto_id: '', tipo: 'merma_danado', cantidad: '', nota: '' })
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchData() }, [filtroFecha])

  async function fetchData() {
    const [{ data: mv }, { data: prods }] = await Promise.all([
      supabase.from('inventario_movimientos').select('*, productos(nombre)')
        .like('tipo', 'merma%').gte('fecha', `${filtroFecha}T00:00:00`).lte('fecha', `${filtroFecha}T23:59:59`)
        .order('fecha', { ascending: false }),
      supabase.from('productos').select('id, nombre, stock_actual').eq('activo', true).order('nombre'),
    ])
    setMermas(mv ?? [])
    setProductos(prods ?? [])
  }

  async function registrar() {
    const { error } = await supabase.rpc('registrar_merma', {
      p_producto_id: form.producto_id,
      p_subtipo: form.tipo,
      p_cantidad: Number(form.cantidad),
      p_nota: form.nota,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Merma registrada', 'ok')
    setModal(false)
    setForm({ producto_id: '', tipo: 'merma_danado', cantidad: '', nota: '' })
    fetchData()
  }

  const resumen = mermas.reduce((acc, m) => {
    const t = m.tipo; acc[t] = (acc[t] ?? 0) + Math.abs(Number(m.cantidad)); return acc
  }, {})
  const totalUnidades = mermas.reduce((s, m) => s + Math.abs(Number(m.cantidad)), 0)

  return (
    <div style={{ padding: 28, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Mermas y pérdidas</h2>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        <button className="btn-primary" onClick={() => setModal(true)}>+ Registrar merma</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div>
          <div style={{ background: 'var(--err-bg)', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--err)' }}>
            <span style={{ fontSize: 13 }}>Total unidades perdidas</span>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{totalUnidades}</span>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="clap-table">
              <thead><tr><th>Hora</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Nota</th></tr></thead>
              <tbody>
                {mermas.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 28 }}>Sin mermas registradas</td></tr>
                  : mermas.map(m => (
                    <tr key={m.id}>
                      <td style={{ color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>{new Date(m.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ fontWeight: 600 }}>{m.productos?.nombre}</td>
                      <td><span className="badge-err">{TIPOS[m.tipo] ?? m.tipo}</span></td>
                      <td style={{ fontWeight: 700, color: 'var(--err)' }}>{Math.abs(m.cantidad)}</td>
                      <td style={{ color: 'var(--text-soft)' }}>{m.nota || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Por tipo</h3>
          {Object.entries(resumen).length === 0
            ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin mermas</p>
            : Object.entries(resumen).map(([tipo, cant]) => (
              <div key={tipo} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
                <span>{TIPOS[tipo] ?? tipo}</span>
                <span style={{ fontWeight: 600, color: 'var(--err)' }}>{cant} unid.</span>
              </div>
            ))}
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Registrar merma o pérdida">
        <label className="form-label">Producto</label>
        <select className="form-input form-select" style={{ marginBottom: 12 }} value={form.producto_id} onChange={e => setForm(f => ({ ...f, producto_id: e.target.value }))}>
          <option value="">Seleccionar...</option>
          {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (stock: {p.stock_actual})</option>)}
        </select>
        <label className="form-label">Motivo</label>
        <select className="form-input form-select" style={{ marginBottom: 12 }} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="form-label">Cantidad</label>
        <input className="form-input" type="number" style={{ marginBottom: 12 }} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
        <label className="form-label">Nota (opcional)</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="Descripción del motivo" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn-danger" style={{ flex: 1 }} disabled={!form.producto_id || !form.cantidad} onClick={registrar}>Registrar pérdida</button>
        </div>
      </Modal>
    </div>
  )
}