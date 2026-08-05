import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,20,.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 50, padding: '16px 12px', overflowY: 'auto',
        backdropFilter: 'blur(2px)', WebkitOverflowScrolling: 'touch',
      }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 18, padding: 24,
        width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(20,20,20,.2)',
        margin: 'auto', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-soft)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}