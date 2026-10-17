import { Link } from 'react-router-dom'
import { Card } from './ui/card'
import { Icono } from './Icono'
import { fraseEvento } from '../lib/frases'
import { textoManiobra } from '../lib/historial'
import { hhmm } from '../lib/camaras'
import type { Evento } from '../lib/alarmas'

export default function EventosHoy({ eventos, error }: { eventos: Evento[] | null; error: boolean }) {
  const ult = (eventos ?? []).slice(-10).reverse()
  return (
    <Card className="p-3 rounded-xl">
      <div className="mb-2 text-sm font-semibold">Eventos de hoy</div>
      {error ? <div className="text-sm text-muted-foreground">No se pudieron cargar los eventos</div>
        : !eventos ? <div className="text-sm text-muted-foreground">Cargando…</div>
        : ult.length === 0 ? <div className="text-sm text-muted-foreground">Sin eventos hoy</div>
        : <ul className="space-y-1 text-sm">{ult.map((a, i) => <li key={i}><span className="text-muted-foreground">{hhmm(a.ts)}</span> {a.maniobra && <span className="inline-block align-text-bottom" title="Maniobra desde el portal"><Icono nombre="manual" size={16} /></span>} {a.maniobra ? textoManiobra(a) : fraseEvento(a.texto, a.estado)}</li>)}</ul>}
      <Link to="/historial/eventos" className="mt-2 inline-block text-sm underline">Ver todos</Link>
    </Card>
  )
}
