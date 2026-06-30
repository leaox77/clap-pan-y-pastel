import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const MERMA_LABELS = {
  merma_danado:'Dañado', merma_vencido:'Vencido', merma_consumo_interno:'Consumo interno',
  merma_degustacion:'Degustación', merma_donacion:'Donación', merma_regalo:'Regalo a cliente', merma_diferencia:'Diferencia de inventario'
}

export default function Inventario() {
  const toast = useToast()
  const [productos, setProductos] = useState([])
  const [tab, setTab] = useState('todos')
  const [modalIngreso, setModalIngreso] = useState(null)
  const [modalMerma, setModalMerma] = useState(null)
  const [modalProd, setModalProd] = useState(false)
  const [categorias, setCategorias] = useState([])

  const [fIngreso, setFIngreso] = useState({ cantidad: '', nota: '' })
  const [fMerma, setFMerma] = useState({ tipo: 'merma_danado', cantidad: '', nota: '' })
  const [fProd, setFProd] = useState({ nombre: '', precio_venta: '', costo_unitario: '', stock_actual: '', stock_minimo: 5, categoria_id: '' })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('productos').select('*, categorias(nombre)').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('*').order('nombre'),
    ])
    setProductos(prods ?? [])
    setCategorias(cats ?? [])
  }

  async function registrarIngreso() {
    const { error } = await supabase.rpc('registrar_ingreso_inventario', {
      p_producto_id: modalIngreso.id, p_cantidad: Number(fIngreso.cantidad), p_nota: fIngreso.nota,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Ingreso registrado', 'ok')
    setModalIngreso(null); setFIngreso({ cantidad: '', nota: '' })
    fetchData()
  }

  async function registrarMerma() {
    const { error } = await supabase.rpc('registrar_merma', {
      p_producto_id: modalMerma.id, p_subtipo: fMerma.tipo, p_cantidad: Number(fMerma.cantidad), p_nota: fMerma.nota,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Merma registrada', 'ok')
    setModalMerma(null); setFMerma({ tipo: 'merma_danado', cantidad: '', nota: '' })
    fetchData()
  }

  async function crearProducto() {
    const { error } = await supabase.from('productos').insert({
      nombre: fProd.nombre, precio_venta: Number(fProd.precio_venta), costo_unitario: Number(fProd.costo_unitario),
      stock_actual: Number(fProd.stock_actual), stock_minimo: Number(fProd.stock_minimo), categoria_id: fProd.categoria_id || null,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Producto creado', 'ok')
    setModalProd(false)
    fetchData()
  }

  const filtrados = productos.filter(p =>
    tab === 'todos' ? true : tab === 'bajo' ? p.stock_actual <= p.stock_minimo && p.stock_actual > 0 : p.stock_actual <= 0
  )

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1, minWidth: 200 }}>Inventario del día</h2>
        <button className="btn-secondary" onClick={() => setModalProd(true)} style={{ fontSize: 13 }}>+ Nuevo producto</button>
      </div>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        {[
          ['Total productos', productos.length],
          ['Stock OK', productos.filter(p => p.stock_actual > p.stock_minimo).length],
          ['Stock bajo', productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_actual > 0).length],
          ['Agotados', productos.filter(p => p.stock_actual <= 0).length],
        ].map(([l, v]) => (
          <div key={l} className="card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{l}</p>
            <p style={{ fontSize: 26, fontWeight: 700 }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--silver-light)', overflowX: 'auto' }}>
        {[['todos','Todos'], ['bajo','Stock bajo'], ['agotado','Agotados']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            color: tab === k ? 'var(--text)' : 'var(--text-soft)',
            borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent', marginBottom: -2,
          }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden', borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        <div className="table-scroll">
          <table className="clap-table">
            <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Mín.</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 32 }}>Sin registros</td></tr>
                : filtrados.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td style={{ color: 'var(--text-soft)' }}>{p.categorias?.nombre ?? '—'}</td>
                    <td>Bs {Number(p.precio_venta).toFixed(2)}</td>
                    <td style={{ fontWeight: 700 }}>{p.stock_actual}</td>
                    <td style={{ color: 'var(--text-soft)' }}>{p.stock_minimo}</td>
                    <td>
                      {p.stock_actual <= 0 ? <span className="badge-err">Agotado</span>
                        : p.stock_actual <= p.stock_minimo ? <span className="badge-warn">Bajo</span>
                        : <span className="badge-ok">OK</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setModalIngreso(p)}>+ Ingreso</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--warn)' }} onClick={() => setModalMerma(p)}>Merma</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!modalIngreso} onClose={() => setModalIngreso(null)} title={`Registrar ingreso — ${modalIngreso?.nombre}`}>
        <label className="form-label">Cantidad que ingresa</label>
        <input className="form-input" type="number" style={{ marginBottom: 12 }} value={fIngreso.cantidad} onChange={e => setFIngreso(f => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
        <label className="form-label">Nota (opcional)</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={fIngreso.nota} onChange={e => setFIngreso(f => ({ ...f, nota: e.target.value }))} placeholder="Ej: Producción de la mañana" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalIngreso(null)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!fIngreso.cantidad} onClick={registrarIngreso}>Registrar</button>
        </div>
      </Modal>

      <Modal open={!!modalMerma} onClose={() => setModalMerma(null)} title={`Registrar merma — ${modalMerma?.nombre}`}>
        <label className="form-label">Tipo de merma</label>
        <select className="form-input form-select" style={{ marginBottom: 12 }} value={fMerma.tipo} onChange={e => setFMerma(f => ({ ...f, tipo: e.target.value }))}>
          {Object.entries(MERMA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="form-label">Cantidad</label>
        <input className="form-input" type="number" style={{ marginBottom: 12 }} value={fMerma.cantidad} onChange={e => setFMerma(f => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
        <label className="form-label">Nota</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={fMerma.nota} onChange={e => setFMerma(f => ({ ...f, nota: e.target.value }))} placeholder="Descripción del motivo" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalMerma(null)}>Cancelar</button>
          <button className="btn-danger" style={{ flex: 1 }} disabled={!fMerma.cantidad} onClick={registrarMerma}>Registrar merma</button>
        </div>
      </Modal>

      <Modal open={modalProd} onClose={() => setModalProd(false)} title="Nuevo producto">
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Nombre del producto</label>
            <input className="form-input" value={fProd.nombre} onChange={e => setFProd(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Pan de queso" />
          </div>
          <div>
            <label className="form-label">Precio de venta</label>
            <input className="form-input" type="number" value={fProd.precio_venta} onChange={e => setFProd(f => ({ ...f, precio_venta: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label className="form-label">Costo unitario</label>
            <input className="form-input" type="number" value={fProd.costo_unitario} onChange={e => setFProd(f => ({ ...f, costo_unitario: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label className="form-label">Stock inicial</label>
            <input className="form-input" type="number" value={fProd.stock_actual} onChange={e => setFProd(f => ({ ...f, stock_actual: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className="form-label">Stock mínimo (alerta)</label>
            <input className="form-input" type="number" value={fProd.stock_minimo} onChange={e => setFProd(f => ({ ...f, stock_minimo: e.target.value }))} placeholder="5" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Categoría</label>
            <select className="form-input form-select" value={fProd.categoria_id} onChange={e => setFProd(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalProd(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!fProd.nombre || !fProd.precio_venta} onClick={crearProducto}>Guardar producto</button>
        </div>
      </Modal>
    </div>
  )
}