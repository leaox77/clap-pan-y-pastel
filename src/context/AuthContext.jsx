import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    if (!userId) {
      setProfile(null)
      return null
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'role, sucursal_id, full_name, active'
      )
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error(
        'Error cargando perfil:',
        error
      )

      setProfile(null)
      return null
    }

    setProfile(data ?? null)

    return data
  }

  useEffect(() => {
    let mounted = true

    async function initializeAuth() {
      try {
        const {
          data,
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error(
            'Error obteniendo sesión:',
            error
          )

          if (mounted) {
            setUser(null)
            setProfile(null)
          }

          return
        }

        const currentUser =
          data.session?.user ?? null

        if (!mounted) return

        setUser(currentUser)

        if (currentUser) {
          await loadProfile(currentUser.id)
        } else {
          setProfile(null)
        }
      } catch (error) {
        console.error(
          'Error inicializando autenticación:',
          error
        )

        if (mounted) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    const {
      data: subscription,
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return

        const currentUser =
          session?.user ?? null

        setUser(currentUser)

        if (!currentUser) {
          setProfile(null)
          setLoading(false)
          return
        }

        await loadProfile(
          currentUser.id
        )

        if (mounted) {
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    })
  }

  async function signOut() {
    const { error } =
      await supabase.auth.signOut({
        scope: 'global',
      })

    if (error) {
      console.error(
        'Error cerrando sesión:',
        error
      )

      // Limpiamos el estado local aunque
      // Supabase rechace el logout remoto.
      setUser(null)
      setProfile(null)

      return {
        error,
      }
    }

    setUser(null)
    setProfile(null)

    return {
      error: null,
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,

        role:
          profile?.role ?? null,

        sucursalId:
          profile?.sucursal_id ?? null,

        fullName:
          profile?.full_name ?? null,

        profile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () =>
  useContext(AuthContext)