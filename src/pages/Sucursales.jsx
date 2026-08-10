import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

export default function Sucursales() {
  const toast = useToast()
  const [sucursales, setSucursales] = useState([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({ nombre: '', direccion: '' })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase.from('sucursales').select('*').order('nombre')
    setSucursales(data ?? [])
  }

  async function guardar() {
    let error
    if (editando) {
      ({ error } = await supabase.from('sucursales').update({ nombre: form.nombre, direccion: form.direccion }).eq('id', editando.id))
    } else {
      ({ error } = await supabase.from('sucursales').insert({ nombre: form.nombre, direccion: form.direccion }))
    }
    if (error) { toast(error.message, 'err'); return }
    toast(editando ? 'Sucursal actualizada' : 'Sucursal creada', 'ok')
    setModal(false); setEditando(null); setForm({ nombre: '', direccion: '' })
    fetchData()
  }

  async function toggleActivo(s) {
  const { error } = await supabase
    .from('sucursales')
    .update({ activo: !s.activo })
    .eq('id', s.id)

  if (error) {
    console.error('Error cambiando estado de sucursal:', error)
    toast(error.message, 'err')
    return
  }

  toast(
    s.activo ? 'Sucursal desactivada' : 'Sucursal activada',
    'ok'
  )

  fetchData()
}

  function abrirEditar(s) {
    setEditando(s); setForm({ nombre: s.nombre, direccion: s.direccion ?? '' }); setModal(true)
  }

  function abrirNueva() {
    setEditando(null); setForm({ nombre: '', direccion: '' }); setModal(true)
  }

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Sucursales</h2>
        <button className="btn-primary" onClick={abrirNueva}>+ Nueva sucursal</button>
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        {sucursales.map(s => (
          <div key={s.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: s.activo ? 'var(--yellow-soft)' : 'var(--silver-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                🏪
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{s.nombre}</p>
                <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 10 }}>{s.direccion ?? 'Sin dirección registrada'}</p>
                <span className={s.activo ? 'badge-ok' : 'badge-err'}>{s.activo ? 'Activa' : 'Inactiva'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: '7px' }} onClick={() => abrirEditar(s)}>✏ Editar</button>
              <button onClick={() => toggleActivo(s)}
                className={s.activo ? 'btn-secondary' : 'btn-primary'}
                style={{ flex: 1, fontSize: 12, padding: '7px', color: s.activo ? 'var(--err)' : undefined }}>
                {s.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar sucursal' : 'Nueva sucursal'}>
        <label className="form-label">Nombre</label>
        <input className="form-input" style={{ marginBottom: 12 }} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Sucursal Centro" />
        <label className="form-label">Dirección</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Ej: Av. Principal 123" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!form.nombre} onClick={guardar}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}