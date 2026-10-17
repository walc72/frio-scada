import { Card } from './ui/card'
import { GRUPOS } from '../lib/camaras'
import { segmentos, pct, COLOR_TRAMO, TEXTO_TRAMO, HACHURA, type Tramo } from '../lib/paginaCamara'

// Una barra por equipo, de 00:00 a ahora (el resto del día queda vacío). `minuto` = la marca de ahora (mismo reloj que los horarios).
export default function BarrasEquipos({ tramos, error, dia0, ahora, minuto }: { tramos: Tramo[] | null; error: boolean; dia0: number; ahora: number; minuto: number }) {
  return (
    <Card className="p-4 space-y-3 rounded-2xl">
      <div className="font-semibold">Qué hizo cada equipo hoy</div>
      {error ? <div className="text-sm text-muted-foreground">No se pudo cargar el gráfico</div> : !tramos ? <div className="text-sm text-muted-foreground">Cargando...</div> : <>
        <div className="space-y-1.5">
          {GRUPOS.map(g => (
            <div key={g} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs">Equipo {g}</span>
              <div className="relative h-3 flex-1 rounded bg-muted/50 overflow-hidden" role="img" aria-label={`Equipo ${g}: qué hizo hoy`}>
                {segmentos(tramos, g, dia0, ahora).map((s, i) => (
                  <span key={i} className="absolute inset-y-0" title={TEXTO_TRAMO[s.estado]}
                    style={{ left: `${s.izq}%`, width: `${s.ancho}%`, background: s.estado === 'sin-datos' ? HACHURA : COLOR_TRAMO[s.estado] }} />
                ))}
                <span className="absolute inset-y-0 w-0.5 bg-red-600" style={{ left: `${pct(minuto)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {(['frio', 'descongelando', 'apagado', 'sin-datos'] as const).map(k => (
            <span key={k} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: k === 'sin-datos' ? HACHURA : COLOR_TRAMO[k] }} />{TEXTO_TRAMO[k]}</span>
          ))}
        </div>
      </>}
    </Card>
  )
}
