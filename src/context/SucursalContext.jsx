import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const SucursalContext = createContext(null)

export function SucursalProvider({ children }) {
  const { role, sucursalId, loading: authLoading } = useAuth()

  const [sucursales, setSucursales] = useState([])

  const [sucursalActivaId, setSucursalActivaId] = useState(() => {
    try {
      return localStorage.getItem('sucursal_activa_id') || null
    } catch {
      return null
    }
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function cargarSucursales() {
      if (authLoading) return

      if (!role) {
        setSucursales([])
        setSucursalActivaId(null)
        setLoading(false)
        return
      }

      setLoading(true)

      /*
       * CAJERO
       *
       * Un cajero nunca puede elegir otra sucursal.
       * La sucursal activa siempre es la de su perfil.
       */
      if (role === 'cajero') {
        if (!cancelled) {
          setSucursales([])
          setSucursalActivaId(sucursalId ?? null)
          setLoading(false)
        }

        return
      }

      /*
       * ADMINISTRADOR / PROPIETARIA
       *
       * Pueden trabajar con cualquiera de las
       * sucursales activas.
       */
      const { data, error } = await supabase
        .from('sucursales')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('Error cargando sucursales:', error)
        setSucursales([])
        setSucursalActivaId(null)
        setLoading(false)
        return
      }

      const lista = data ?? []

      setSucursales(lista)

      /*
       * Buscar sucursal válida:
       *
       * 1. La que ya está en el estado
       * 2. La guardada en localStorage
       * 3. La primera disponible
       */
      setSucursalActivaId(actual => {
        if (actual && lista.some(s => s.id === actual)) {
          return actual
        }

        let guardada = null

        try {
          guardada = localStorage.getItem('sucursal_activa_id')
        } catch {
          guardada = null
        }

        if (guardada && lista.some(s => s.id === guardada)) {
          return guardada
        }

        const primera = lista[0]?.id ?? null

        if (primera) {
          try {
            localStorage.setItem('sucursal_activa_id', primera)
          } catch (error) {
            console.error('No se pudo guardar la sucursal:', error)
          }
        }

        return primera
      })

      setLoading(false)
    }

    cargarSucursales()

    return () => {
      cancelled = true
    }
  }, [role, sucursalId, authLoading])

  /*
   * Seguridad adicional:
   * un cajero nunca puede establecer manualmente
   * una sucursal diferente.
   */
  function cambiarSucursal(id) {
    if (role === 'cajero') {
      setSucursalActivaId(sucursalId ?? null)
      return
    }

    const existe = sucursales.some(s => s.id === id)

    if (!existe) {
      console.warn('Sucursal no válida:', id)
      return
    }

    try {
      localStorage.setItem('sucursal_activa_id', id)
    } catch (error) {
      console.error('No se pudo guardar la sucursal:', error)
    }

    setSucursalActivaId(id)
  }

  const sucursalActiva =
    sucursales.find(s => s.id === sucursalActivaId) ?? null

  return (
    <SucursalContext.Provider
      value={{
        sucursales,
        sucursalActivaId,
        sucursalActiva,
        setSucursalActivaId: cambiarSucursal,
        loading,
      }}
    >
      {children}
    </SucursalContext.Provider>
  )
}

export function useSucursal() {
  return useContext(SucursalContext)
}