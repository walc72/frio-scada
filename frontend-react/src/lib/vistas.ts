import { useCallback, useEffect, useState } from 'react'
import { apiJson } from './api'

// Quién vio cada alarma activa (GET /api/avisos/activas, cada 15 s) y marcar como vistas (POST /api/avisos/visto).
// "Visto" corta la repetición de los avisos; la alarma sigue activa hasta que el PLC la limpie.
export interface Visto { usuario: string; ts: number }
interface Activa { clave: string; visto: Visto | null }

export function useVistas(activo = true) {
  const [vistas, setVistas] = useState<Map<string, Visto>>(new Map())
  const cargar = useCallback(() => apiJson<{ activas: Activa[] }>('/avisos/activas')
    .then(d => setVistas(new Map(d.activas.filter(a => a.visto).map(a => [a.clave, a.visto!]))))
    .catch(() => { /* sin API: sin marcas */ }), [])
  useEffect(() => {
    if (!activo) return
    cargar(); const id = setInterval(cargar, 15000); return () => clearInterval(id)
  }, [cargar, activo])
  const marcar = useCallback(async (claves: string[]) => {
    await apiJson('/avisos/visto', { method: 'POST', body: JSON.stringify({ claves }) })
    await cargar()
  }, [cargar])
  return { vistas, marcar }
}

// Vista del grupo: la primera marca de sus claves, si todas están vistas
export function vistoDe(vistas: Map<string, Visto>, claves: string[]): Visto | null {
  const v = claves.map(c => vistas.get(c))
  return claves.length && v.every(Boolean) ? (v as Visto[]).reduce((a, b) => (a.ts <= b.ts ? a : b)) : null
}
