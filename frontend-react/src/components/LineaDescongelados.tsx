import { Card } from './ui/card'
import type { Estado } from '../store/camaras'
import { minutoAhora, type FilaDescongelado } from '../lib/camaras'
import { colorEstadoGrupo } from '../lib/estadoGrupo'
import { horariosVista, pct, type EstadoHorario } from '../lib/paginaCamara'

const C = (k: string) => colorEstadoGrupo(k).fondo
const MARCA: Record<EstadoHorario, { icono: string; color: string; sufijo: string }> = {
  'hecho': { icono: '✅', color: '#16A34A', sufijo: 'hecho ✓' },
  'en curso': { icono: '', color: C('DESCONGELANDO'), sufijo: 'en curso' },
  'próximo': { icono: '⏰', color: C('DESCONGELANDO'), sufijo: 'próximo' },
  'pendiente': { icono: '', color: C('DETENIDO'), sufijo: 'pendiente' },
  'sin registro': { icono: '', color: C('DETENIDO'), sufijo: 'sin registro' },
  'ya pasó': { icono: '', color: C('DETENIDO'), sufijo: 'ya pasó' },
  'solapado': { icono: '⚠️', color: '#F59E0B', sufijo: 'revisar' },
  'mal configurado': { icono: '⚠️', color: '#F59E0B', sufijo: 'revisar' },
}

// Barra de 00 a 24 h con los horarios habilitados, la marca de ahora (roja) y una frase por horario.
export default function LineaDescongelados({ estado, sinDatos, cam, ahora, filas }: { estado: Estado | null; sinDatos: boolean; cam: string; ahora: number; filas: FilaDescongelado[] | null }) {
  const hs = estado && !sinDatos ? horariosVista(estado, cam, ahora, filas) : []
  return (
    <Card className="p-4 space-y-3 rounded-2xl">
      <div className="font-semibold">Descongelados de hoy</div>
      <div className="relative h-6 rounded bg-muted">
        {hs.map(x => <span key={x.h} role="img" aria-label={`Descongelado de las ${x.hora}: ${MARCA[x.estado].sufijo}`} className="absolute top-1 h-4 w-2 -translate-x-1/2 rounded-sm" style={{ left: `${pct(x.min)}%`, backgroundColor: MARCA[x.estado].color }} title={x.hora} />)}
        <span className="absolute inset-y-0 w-0.5 bg-red-600" style={{ left: `${pct(minutoAhora(sinDatos ? null : estado, ahora))}%` }} title="Ahora" />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>00</span><span>06</span><span>12</span><span>18</span><span>24 h</span></div>
      {sinDatos ? <div className="text-sm text-muted-foreground">Sin datos</div>
        : hs.length === 0 ? <div className="text-sm text-muted-foreground">Sin descongelados programados</div> : (
        <ul className="text-sm space-y-1">
          {hs.map(x => (
            <li key={x.h}>
              <span className="font-medium">{[MARCA[x.estado].icono, x.hora].filter(Boolean).join(' ')}</span>
              {x.frase && ` · ${x.frase}`}
              <span className="text-muted-foreground"> · {MARCA[x.estado].sufijo}{x.nota && ` (${x.nota})`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
