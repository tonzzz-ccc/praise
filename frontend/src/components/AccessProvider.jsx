import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccessContext } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { getAccess, getMe, login, logout, setSessionExpiredHandler } from '../services/api'
import { hasPermission, permissionsForPreview, signedInPermissions } from '../utils/access'

const PREVIEW_STORAGE_KEY = 'praise.previewAs'
const SIGNED_OUT = { status: 'out', me: null, error: null }

function readStoredPreview() {
  try {
    return sessionStorage.getItem(PREVIEW_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function storePreview(value) {
  try {
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, value)
  } catch {
    // The preview still applies until the page reloads.
  }
}

async function loadSession() {
  try {
    return { status: 'in', me: await getMe(), error: null }
  } catch (error) {
    return error.status === 401 ? SIGNED_OUT : { status: 'error', me: null, error }
  }
}

// Holds who is signed in and what they can do. People who manage access can also
// preview the app as another role or person; the server still applies their real access.
export default function AccessProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', me: null, error: null })
  const [preview, setPreviewState] = useState(readStoredPreview)

  const refreshSession = useCallback(() => loadSession().then(setSession), [])

  useEffect(() => {
    setSessionExpiredHandler(() => setSession(SIGNED_OUT))
    loadSession().then(setSession)
    return () => setSessionExpiredHandler(null)
  }, [])

  const realPermissions = useMemo(() => signedInPermissions(session.me), [session.me])
  const canManageAccess = hasPermission(realPermissions, 'access_management')
  const loadAccess = useCallback(() => (canManageAccess ? getAccess() : Promise.resolve(null)), [canManageAccess])
  const { data: access, error, reload: reloadAccess } = useApi(loadAccess)

  const setPreview = useCallback((value) => {
    setPreviewState(value)
    storePreview(value)
  }, [])

  const signIn = useCallback(
    async (credentials) => {
      await login(credentials)
      await refreshSession()
    },
    [refreshSession],
  )

  const signOut = useCallback(async () => {
    await logout()
    setPreview('')
    setSession(SIGNED_OUT)
  }, [setPreview])

  const reload = useCallback(() => {
    reloadAccess()
    refreshSession()
  }, [reloadAccess, refreshSession])

  const value = useMemo(() => {
    const previewed = canManageAccess && access && preview ? permissionsForPreview(access, preview) : null
    const permissions = previewed ?? realPermissions
    return {
      access,
      canManageAccess,
      error,
      isReady: session.status === 'in',
      me: session.me,
      preview: previewed ? preview : '',
      reload,
      session,
      setPreview,
      signIn,
      signOut,
      can: (key) => hasPermission(permissions, key),
    }
  }, [access, canManageAccess, error, preview, realPermissions, reload, session, setPreview, signIn, signOut])

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}
