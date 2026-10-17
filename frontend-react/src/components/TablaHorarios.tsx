import { Card } from './ui/card'
import { Button } from './ui/button'
import { useMando, usePermiso } from './Confirmar'
import { colorEstadoGrupo } from '../lib/estadoGrupo'
import { num, txt } from '../lib/camaras'
import { repartoTexto, type EstadoHorario, type HorarioVista } from '../lib/paginaCamara'
import type { Estado } from '../store/camaras'

const C = (k: string) => colorEstadoGrupo(k).fondo
const MARCA: Record<EstadoHorario, { icono: string; color: string; texto: string }> = {
  'hecho': { icono: '✅', color: '#16A34A', texto: 'hecho ✓' },
  'en curso': { icono: '', color: C('DESCONGELANDO'), texto: 'en curso' },
  'próximo': { icono: '⏰', color: C('DESCONGELANDO'), texto: 'próximo' },
  'pendiente': { icono: '', color: C('DETENIDO'), texto: 'pendiente' },
  'sin registro': { icono: '', color: C('DETENIDO'), texto: 'sin registro' },
  'ya pasó': { icono: '', color: C('DETENIDO'), texto: 'ya pasó' },
  'solapado': { icono: '⚠️', color: '#F59E0B', texto: 'revisar' },
  'mal configurado': { icono: '⚠️', color: '#F59E0B', texto: 'revisar' },
}

export default function TablaHorarios({ estado, cam, horarios, sinDatos }: { estado: Estado | null; cam: string; horarios: HorarioVista[]; sinDatos: boolean }) {
  const { pedir, enviando, dialogo } = useMando()
  const permiso = usePermiso(5)
  const enCurso = horarios.some(x => x.estado === 'en curso')
  const ref = horarios.find(x => x.estado === 'en curso') ?? horarios.find(x => x.estado === 'próximo')
  const reparto = ref && estado ? repartoTexto(estado, cam, ref.h) : ''
  const etapa = (h: number, i: number) => {
    const m = txt(estado, `${cam}.H${h}.etapa${i}_min`)
    return estado && num(estado, `${cam}.H${h}.etapa${i}_habilitada`) === 1 && m !== '' ? `${m} min` : '—'
  }
  return (
    <Card className="p-3 rounded-xl">
      <div className="mb-2 text-sm font-semibold">Descongelados de hoy</div>
      {sinDatos ? <div className="text-sm text-muted-foreground">Sin datos</div>
        : horarios.length === 0 ? <div className="text-sm text-muted-foreground">Sin descongelados programados</div> : (
        <table className="w-full text-left text-xs sm:text-sm">
          <thead><tr className="text-xs text-muted-foreground"><th className="pb-1 pr-2 font-medium">#</th><th className="pb-1 pr-2 font-medium">Hora</th><th className="pb-1 pr-2 font-medium">Etapa 1</th><th className="pb-1 pr-2 font-medium">Etapa 2</th><th className="pb-1 font-medium">Hoy</th></tr></thead>
          <tbody>{horarios.map(x => (
            <tr key={x.h} className="border-t">
              <td className="py-1 pr-2">{x.h}</td>
              <td className="py-1 pr-2 font-medium">{x.hora}</td>
              <td className="py-1 pr-2">{etapa(x.h, 0)}</td>
              <td className="py-1 pr-2">{etapa(x.h, 1)}</td>
              <td className="py-1" style={{ color: MARCA[x.estado].color }}>
                <div className="flex flex-wrap items-center gap-1">
                <span>{MARCA[x.estado].icono} {MARCA[x.estado].texto}{x.nota && ` (${x.nota})`}</span>
                {x.estado === 'en curso' && <Button variant="outline" className="px-3" disabled={!permiso.ok || enviando} onClick={() => pedir({ comando: 5, camara: cam, valor: 0 })}>Saltar</Button>}
                </div>
              </td>
            </tr>))}</tbody>
        </table>
      )}
      {reparto && <div className="mt-2 text-xs text-muted-foreground">{ref!.hora}: {reparto}</div>}
      {!permiso.ok && enCurso && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">Para saltar el descongelado: {permiso.motivo}</div>}
      {dialogo}
    </Card>
  )
}
