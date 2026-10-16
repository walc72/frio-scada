import { useEffect, useState } from 'react'
import { apiJson } from './api'
import { ventanaPlanta } from './camaras'

// GET /api/camaras/<ruta>?desde&hasta[&camara]. Si falla: error=true y data=null (la página muestra "sin datos").
export function useDatos<T = any>(ruta: string, desde: string, hasta: string, camara = '', refrescoMs = 0) {
  const [data, setData] = useState<T[] | null>(null)
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    let vivo = true
    setCargando(true)
    const q = new URLSearchParams(ventanaPlanta(desde, hasta))
    if (camara) q.set('camara', camara)
    const cargar = () => apiJson<T[]>(`/camaras/${ruta}?${q}`)
      .then(d => { if (vivo) { setData(Array.isArray(d) ? d : []); setError(false) } })
      .catch(() => { if (vivo) { setData(null); setError(true) } })
      .finally(() => { if (vivo) setCargando(false) })
    cargar()
    const id = refrescoMs ? setInterval(cargar, refrescoMs) : undefined
    return () => { vivo = false; if (id) clearInterval(id) }
  }, [ruta, desde, hasta, camara, refrescoMs])
  return { data, error, cargando }
}

export const hoy = (offsetDias = 0) => {
  const d = new Date(Date.now() + offsetDias * 864e5)
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}
