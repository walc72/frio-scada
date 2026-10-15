import { useEffect, useState } from 'react'
import { apiJson } from './api'

// GET /api/camaras/<ruta>?desde&hasta[&camara]. Si falla: error=true y data=null (la página muestra "sin datos").
export function useDatos<T = any>(ruta: string, desde: string, hasta: string, camara = '') {
  const [data, setData] = useState<T[] | null>(null)
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    let vivo = true
    setCargando(true)
    const q = new URLSearchParams({
      desde: new Date(desde + 'T00:00:00').toISOString(),
      hasta: new Date(hasta + 'T23:59:59').toISOString(),
    })
    if (camara) q.set('camara', camara)
    apiJson<T[]>(`/camaras/${ruta}?${q}`)
      .then(d => { if (vivo) { setData(Array.isArray(d) ? d : []); setError(false) } })
      .catch(() => { if (vivo) { setData(null); setError(true) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [ruta, desde, hasta, camara])
  return { data, error, cargando }
}

export const hoy = (offsetDias = 0) => {
  const d = new Date(Date.now() + offsetDias * 864e5)
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}
