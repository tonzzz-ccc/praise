import { useCallback, useEffect, useState } from 'react'

// Runs load when it changes. Pass a function from useCallback, or one defined outside the component.
export function useApi(load) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState({ data: null, error: null, load: null, version: -1 })

  useEffect(() => {
    let isCurrent = true
    load().then(
      (data) => isCurrent && setResult({ data, error: null, load, version }),
      (error) => isCurrent && setResult((current) => ({ data: current.data, error, load, version })),
    )
    return () => {
      isCurrent = false
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  return {
    data: result.data,
    error: result.error,
    loading: result.load !== load || result.version !== version,
    reload,
  }
}
