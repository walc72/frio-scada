import { useParams, Link } from 'react-router-dom'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import GrupoChip from '../components/GrupoChip'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { CAMARAS, GRUPOS, HORARIOS, nombreCamara, txt, num, hhmm } from '../lib/camaras'
import { useNow } from '../lib/useNow'
import PanelGrafana from '../components/PanelGrafana'

const on = (v: number) => (v ? <span className="text-green-600 dark:text-green-400 font-bold">ON</span> : <span className="text-muted-foreground">off</span>)

export default function Camara() {
  const { c } = useParams()
  const cam = (c ?? '').toUpperCase()
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const eventos = useCamarasStore(s => s.eventos)
  const vencido = estaVencido(recibidoEn, useNow(1000))
  if (!(CAMARAS as readonly string[]).includes(cam)) {
    return <div className="text-center text-muted-foreground py-16">Cámara inexistente. <Link className="underline" to="/">Volver</Link></div>
  }
  const e = (k: string) => txt(estado, `${cam}.${k}`)
  const n = (k: string) => num(estado, `${cam}.${k}`)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{nombreCamara(cam)}</h1>
        {!vencido && <Badge variant="secondary">{e('modo') || '—'}</Badge>}
        {!vencido && n('alarma_activa') === 1 && <Badge variant="destructive">ALARMA</Badge>}
        {vencido && <span className="text-sm text-amber-600 dark:text-amber-400">sin datos{ts ? ` desde ${hhmm(ts)}` : ''}</span>}
      </div>

      <Card className="p-4 space-y-3">
        <div className="font-semibold">Maniobras</div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
          {GRUPOS.map(g => <GrupoChip key={g} n={g} estado={e(`G${g}.estado`)} vencido={vencido} />)}
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Grupo</TableHead><TableHead>Modo</TableHead><TableHead>Compresor</TableHead><TableHead>Evaporador</TableHead>
            <TableHead>Resistencia</TableHead><TableHead>Arranques</TableHead><TableHead>Horas marcha</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {GRUPOS.map(g => (
              <TableRow key={g}>
                <TableCell>G{g}</TableCell><TableCell>{e(`G${g}.modo`) || '—'}</TableCell>
                <TableCell>{on(n(`G${g}.comp`))}</TableCell><TableCell>{on(n(`G${g}.eva`))}</TableCell><TableCell>{on(n(`G${g}.res`))}</TableCell>
                <TableCell>{e(`G${g}.arranques`) || '—'}</TableCell><TableCell>{e(`G${g}.horas_marcha`) || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PanelGrafana uid="maniobras" panelId={1} vars={{ camara: cam }} title="Línea de tiempo de maniobras" />
      </Card>

      <Card className="p-4 space-y-2">
        <div className="font-semibold">Horarios y etapas</div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Horario</TableHead><TableHead>Hora</TableHead><TableHead>Estado</TableHead>
            <TableHead>Etapa 1</TableHead><TableHead>Etapa 2</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {HORARIOS.map(h => {
              const et = (i: number) => n(`H${h}.etapa${i}_habilitada`)
                ? `${e(`H${h}.etapa${i}_min`)} min${n(`H${h}.etapa${i}_orden`) ? ' · en curso' : ''}` : 'deshabilitada'
              return (
                <TableRow key={h}>
                  <TableCell>H{h}</TableCell><TableCell>{e(`H${h}.hora`) || '—'}</TableCell><TableCell>{e(`H${h}.estado`) || '—'}</TableCell>
                  <TableCell>{et(0)}</TableCell><TableCell>{et(1)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="font-semibold">Últimos eventos</div>
        {eventos.length === 0
          ? <div className="text-sm text-muted-foreground">Sin eventos desde que se abrió el portal. Historial en Alarmas y eventos.</div>
          : <ul className="text-sm space-y-1">{eventos.slice(0, 10).map((ev, i) => <li key={i}><span className="text-muted-foreground">{hhmm(ev.ts)}</span> {ev.texto}</li>)}</ul>}
      </Card>
      <div className="text-xs text-muted-foreground">Temperatura y su gráfico llegan con el subproyecto 1 (los Full Gauge todavía no están en el mapa del PLC).</div>
    </div>
  )
}
