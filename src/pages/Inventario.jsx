import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useSucursal } from '../context/SucursalContext'
import Modal from '../components/Modal'

const MERMA_LABELS = {
  merma_danado: 'Dañado', merma_vencido: 'Vencido',
  merma_consumo_interno: 'Consumo interno', merma_degustacion: 'Degustación',
  merma_donacion: 'Donación', merma_regalo: 'Regalo', merma_diferencia: 'Diferencia',
}

export default function Inventario() {
  const toast = useToast()
  const { role } = useAuth()
  const { sucursalActivaId } = useSucursal()

  const esAdmin = ['administrador', 'propietaria'].includes(role)

  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [tab, setTab] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const [modalIngreso, setModalIngreso] = useState(null)
  const [modalMerma, setModalMerma] = useState(null)
  const [modalProd, setModalProd] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)
  const [modalAuditoria, setModalAuditoria] = useState(null)
  const [auditoria, setAuditoria] = useState([])

  const [fIngreso, setFIngreso] = useState({ cantidad: '', nota: '' })
  const [fMerma, setFMerma] = useState({ tipo: 'merma_danado', cantidad: '', nota: '' })
  const [fProd, setFProd] = useState({ nombre: '', precio_venta: '', costo_unitario: '', stock_actual: '', stock_minimo: 2, categoria_id: '' })
  const [fEditar, setFEditar] = useState({})

  useEffect(() => {
    if (!sucursalActivaId) { setProductos([]); return }
    fetchData()
  }, [sucursalActivaId])

  async function fetchData() {
    if (!sucursalActivaId) return
    const [{ data: inv, error: errorInv }, { data: cats, error: errorCats }] = await Promise.all([
      supabase.from('inventario_sucursal').select('id, sucursal_id, producto_id, stock_actual, stock_minimo, updated_at, productos!inner(*, categorias(nombre))').eq('sucursal_id', sucursalActivaId),
      supabase.from('categorias').select('*').order('nombre')
    ])
    if (errorInv) { toast(errorInv.message, 'err'); return }
    if (errorCats) { toast(errorCats.message, 'err'); return }
    const productosNormalizados = (inv ?? []).map(i => ({ ...i.productos, inventario_id: i.id, producto_id: i.producto_id, stock_actual: i.stock_actual, stock_minimo: i.stock_minimo })).sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'))
    setProductos(productosNormalizados)
    setCategorias(cats ?? [])
  }

  async function abrirEditar(p) {
    setFEditar({
      nombre: p.nombre ?? '',
      precio_venta: p.precio_venta ?? '',
      costo_unitario: p.costo_unitario ?? '',
      stock_actual: p.stock_actual ?? 0,
      stock_minimo: p.stock_minimo ?? 0,
      activo_en_pos: p.activo_en_pos ?? true,
      es_pan: p.es_pan ?? false,
    })
    setModalEditar(p)
  }

  async function abrirAuditoria(p) {
    const { data } = await supabase.from('vista_auditoria')
      .select('*').eq('tabla', 'productos').eq('registro_id', p.id)
      .order('fecha', { ascending: false }).limit(20)
    setAuditoria(data ?? [])
    setModalAuditoria(p)
  }

  async function guardarEdicion() {
    if (!modalEditar || !sucursalActivaId) return
    const stockNuevo = Number(fEditar.stock_actual)
    if (Number.isNaN(stockNuevo) || stockNuevo < 0) { toast('El stock no puede ser negativo', 'err'); return }
    const { error } = await supabase.rpc('editar_producto', { p_id: modalEditar.id, p_nombre: fEditar.nombre, p_precio_venta: Number(fEditar.precio_venta), p_costo_unitario: Number(fEditar.costo_unitario), p_stock_actual: stockNuevo, p_stock_minimo: Number(fEditar.stock_minimo), p_activo_en_pos: fEditar.activo_en_pos, p_es_pan: fEditar.es_pan, p_sucursal_id: sucursalActivaId })
    if (error) { toast(error.message, 'err'); return }
    toast('Producto actualizado', 'ok')
    setModalEditar(null)
    setFEditar({})
    await fetchData()
  }

  async function registrarIngreso() {
    const cantidad = Number(fIngreso.cantidad)
    if (!cantidad || cantidad <= 0) { toast('Cantidad inválida', 'err'); return }
    const { error } = await supabase.rpc('registrar_ingreso_inventario', { p_producto_id: modalIngreso.id, p_sucursal_id: sucursalActivaId, p_cantidad: cantidad, p_nota: fIngreso.nota?.trim() || null })
    if (error) { toast(error.message, 'err'); return }
    toast('Ingreso registrado', 'ok')
    setModalIngreso(null)
    setFIngreso({ cantidad: '', nota: '' })
    await fetchData()
  }

  async function registrarMerma() {
    const cantidad = Number(fMerma.cantidad)
    if (!cantidad || cantidad <= 0) { toast('Cantidad inválida', 'err'); return }
    const { error } = await supabase.rpc('registrar_merma', { p_producto_id: modalMerma.id, p_sucursal_id: sucursalActivaId, p_subtipo: fMerma.tipo, p_cantidad: cantidad, p_nota: fMerma.nota?.trim() || null })
    if (error) { toast(error.message, 'err'); return }
    toast('Merma registrada', 'ok')
    setModalMerma(null)
    setFMerma({ tipo: 'merma_danado', cantidad: '', nota: '' })
    await fetchData()
  }

  async function crearProducto() {
    if (!fProd.nombre.trim() || !fProd.precio_venta) { toast('Nombre y precio requeridos', 'err'); return }
    const { error } = await supabase.from('productos').insert({
      nombre: fProd.nombre.trim(),
      precio_venta: Number(fProd.precio_venta),
      costo_unitario: Number(fProd.costo_unitario || 0),
      stock_actual: Number(fProd.stock_actual || 0),
      stock_minimo: Number(fProd.stock_minimo || 2),
      categoria_id: fProd.categoria_id || null,
      activo_en_pos: true, es_pan: false,
    })
    if (error) { toast(error.message, 'err'); return }
    toast('Producto creado', 'ok')
    setModalProd(false)
    setFProd({ nombre: '', precio_venta: '', costo_unitario: '', stock_actual: '', stock_minimo: 2, categoria_id: '' })
    fetchData()
  }

  const filtrados = productos
    .filter(p => {
      const s = Number(p.stock_actual ?? 0), m = Number(p.stock_minimo ?? 0)
      if (tab === 'todos') return true
      if (tab === 'bajo') return s <= m && s > 0
      return s <= 0
    })
    .filter(p => String(p.nombre ?? '').toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="page-wrap">
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Inventario</h2>
        {esAdmin && (
          <button className="btn-secondary" onClick={() => setModalProd(true)} style={{ fontSize: 13 }}>
            + Nuevo producto
          </button>
        )}
      </div>

      {/* RESUMEN */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          ['Total', productos.length],
          ['Stock OK', productos.filter(p => Number(p.stock_actual ?? 0) > Number(p.stock_minimo ?? 0)).length],
          ['Bajo', productos.filter(p => Number(p.stock_actual ?? 0) <= Number(p.stock_minimo ?? 0) && Number(p.stock_actual ?? 0) > 0).length],
          ['Agotados', productos.filter(p => Number(p.stock_actual ?? 0) <= 0).length],
        ].map(([l, v]) => (
          <div key={l} className="card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
            <p style={{ fontSize: 26, fontWeight: 700 }}>{v}</p>
          </div>
        ))}
      </div>

      {/* BÚSQUEDA + TABS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 180 }}
          placeholder="Buscar producto..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)} />
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--silver-light)' }}>
          {[['todos','Todos'],['bajo','Bajo stock'],['agotado','Agotados']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              color: tab === k ? 'var(--text)' : 'var(--text-soft)',
              borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent',
              marginBottom: -2,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* TABLA */}
      <div className="card" style={{ overflow: 'hidden', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        <div className="table-scroll">
          <table className="clap-table">
            <thead>
              <tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Mín.</th><th>Estado</th><th>POS</th><th>Pan</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 32 }}>Sin registros</td></tr>
              ) : filtrados.map(p => {
                const stock = Number(p.stock_actual ?? 0)
                const min = Number(p.stock_minimo ?? 0)
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre ?? '—'}</td>
                    <td style={{ fontWeight: 700 }}>Bs {Number(p.precio_venta ?? 0).toFixed(2)}</td>
                    <td style={{ fontWeight: 700 }}>{stock}</td>
                    <td style={{ color: 'var(--text-soft)' }}>{min}</td>
                    <td>
                      {stock <= 0 ? <span className="badge-err">Agotado</span>
                        : stock <= min ? <span className="badge-warn">Bajo</span>
                        : <span className="badge-ok">OK</span>}
                    </td>
                    <td>{p.activo_en_pos ? <span className="badge-ok">✓</span> : <span className="badge-err">✗</span>}</td>
                    <td>{p.es_pan ? <span className="badge-info">🍞</span> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setModalIngreso(p)}>+ Stock</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--warn)' }} onClick={() => setModalMerma(p)}>Merma</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--info)' }} onClick={() => abrirEditar(p)}>✏ Editar</button>
                        {esAdmin && <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-soft)' }} onClick={() => abrirAuditoria(p)}>📋 Log</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL INGRESO */}
      <Modal open={!!modalIngreso} onClose={() => setModalIngreso(null)} title={`+ Stock — ${modalIngreso?.nombre}`}>
        <label className="form-label">Cantidad que ingresa</label>
        <input className="form-input" type="number" style={{ marginBottom: 12 }} value={fIngreso.cantidad}
          onChange={e => setFIngreso(f => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
        <label className="form-label">Nota (opcional)</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={fIngreso.nota}
          onChange={e => setFIngreso(f => ({ ...f, nota: e.target.value }))} placeholder="Producción de la mañana" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalIngreso(null)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!fIngreso.cantidad || Number(fIngreso.cantidad) <= 0} onClick={registrarIngreso}>Registrar</button>
        </div>
      </Modal>

      {/* MODAL MERMA */}
      <Modal open={!!modalMerma} onClose={() => setModalMerma(null)} title={`Merma — ${modalMerma?.nombre}`}>
        <label className="form-label">Tipo</label>
        <select className="form-input form-select" style={{ marginBottom: 12 }} value={fMerma.tipo}
          onChange={e => setFMerma(f => ({ ...f, tipo: e.target.value }))}>
          {Object.entries(MERMA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="form-label">Cantidad</label>
        <input className="form-input" type="number" style={{ marginBottom: 12 }} value={fMerma.cantidad}
          onChange={e => setFMerma(f => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
        <label className="form-label">Nota</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={fMerma.nota}
          onChange={e => setFMerma(f => ({ ...f, nota: e.target.value }))} placeholder="Motivo" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalMerma(null)}>Cancelar</button>
          <button className="btn-danger" style={{ flex: 1 }} disabled={!fMerma.cantidad || Number(fMerma.cantidad) <= 0} onClick={registrarMerma}>Registrar</button>
        </div>
      </Modal>

      {/* MODAL EDITAR */}
      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title={`✏ Editar — ${modalEditar?.nombre}`}>
        <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
          ⚠ Los cambios quedan registrados en auditoría con tu usuario y hora.
        </div>
        <label className="form-label">Nombre</label>
        <input className="form-input" style={{ marginBottom: 12 }} value={fEditar.nombre ?? ''}
          onChange={e => setFEditar(f => ({ ...f, nombre: e.target.value }))} />

        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="form-label">Precio de venta (Bs)</label>
            <input className="form-input" type="number" value={fEditar.precio_venta ?? ''}
              onChange={e => setFEditar(f => ({ ...f, precio_venta: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Costo unitario (Bs)</label>
            <input className="form-input" type="number" value={fEditar.costo_unitario ?? ''}
              onChange={e => setFEditar(f => ({ ...f, costo_unitario: e.target.value }))} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 12, border: '1px solid var(--silver-light)', marginBottom: 12 }}>
          <label className="form-label">Stock actual</label>
          <input className="form-input" type="number" value={fEditar.stock_actual ?? ''}
            onChange={e => setFEditar(f => ({ ...f, stock_actual: e.target.value }))} />
          <p style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 6 }}>
            Registrado: <strong>{modalEditar?.stock_actual}</strong> — El cambio genera un movimiento de auditoría.
          </p>
        </div>

        <label className="form-label">Stock mínimo (alerta)</label>
        <input className="form-input" type="number" style={{ marginBottom: 16 }} value={fEditar.stock_minimo ?? ''}
          onChange={e => setFEditar(f => ({ ...f, stock_minimo: e.target.value }))} />

        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={fEditar.activo_en_pos ?? true}
              onChange={e => setFEditar(f => ({ ...f, activo_en_pos: e.target.checked }))}
              style={{ width: 18, height: 18, accentColor: 'var(--yellow-dark)', cursor: 'pointer' }} />
            Visible en POS
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={fEditar.es_pan ?? false}
              onChange={e => setFEditar(f => ({ ...f, es_pan: e.target.checked }))}
              style={{ width: 18, height: 18, accentColor: 'var(--yellow-dark)', cursor: 'pointer' }} />
            Es pan (POS rápido)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalEditar(null)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }}
            disabled={!fEditar.nombre?.trim() || fEditar.precio_venta === '' || Number(fEditar.stock_actual) < 0}
            onClick={guardarEdicion}>Guardar cambios</button>
        </div>
      </Modal>

      {/* MODAL AUDITORÍA */}
      <Modal open={!!modalAuditoria} onClose={() => setModalAuditoria(null)} title={`📋 Historial — ${modalAuditoria?.nombre}`}>
        {auditoria.length === 0
          ? <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>Sin cambios registrados</p>
          : auditoria.map(a => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--silver-light)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>{a.accion}</span>
                <span style={{ color: 'var(--text-soft)', fontSize: 11 }}>
                  {new Date(a.fecha).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ color: 'var(--text-soft)' }}>
                {a.usuario_nombre ?? '—'} <span className="badge-info" style={{ fontSize: 10 }}>{a.usuario_rol}</span>
              </div>
              {a.datos_anteriores && a.datos_nuevos && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {['nombre','precio_venta','costo_unitario','stock_actual','stock_minimo','activo_en_pos','es_pan'].map(campo => {
                    const ant = a.datos_anteriores[campo], nvo = a.datos_nuevos[campo]
                    if (ant === undefined && nvo === undefined) return null
                    if (String(ant) === String(nvo)) return null
                    return (
                      <div key={campo} style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-soft)', minWidth: 100 }}>{campo}:</span>
                        <span style={{ background: 'var(--err-bg)', color: 'var(--err)', padding: '1px 6px', borderRadius: 4 }}>{String(ant)}</span>
                        <span>→</span>
                        <span style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '1px 6px', borderRadius: 4 }}>{String(nvo)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
      </Modal>

      {/* MODAL NUEVO PRODUCTO */}
      <Modal open={modalProd} onClose={() => setModalProd(false)} title="Nuevo producto">
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Nombre</label>
            <input className="form-input" value={fProd.nombre}
              onChange={e => setFProd(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Brazo Gitano" />
          </div>
          <div>
            <label className="form-label">Precio de venta</label>
            <input className="form-input" type="number" value={fProd.precio_venta}
              onChange={e => setFProd(f => ({ ...f, precio_venta: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label className="form-label">Costo unitario</label>
            <input className="form-input" type="number" value={fProd.costo_unitario}
              onChange={e => setFProd(f => ({ ...f, costo_unitario: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label className="form-label">Stock inicial</label>
            <input className="form-input" type="number" value={fProd.stock_actual}
              onChange={e => setFProd(f => ({ ...f, stock_actual: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className="form-label">Stock mínimo</label>
            <input className="form-input" type="number" value={fProd.stock_minimo}
              onChange={e => setFProd(f => ({ ...f, stock_minimo: e.target.value }))} placeholder="2" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Categoría</label>
            <select className="form-input form-select" value={fProd.categoria_id}
              onChange={e => setFProd(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalProd(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!fProd.nombre.trim() || !fProd.precio_venta} onClick={crearProducto}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}