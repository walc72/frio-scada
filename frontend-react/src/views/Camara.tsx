import { useParams, Link } from 'react-router-dom'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import TablaEquipos from '../components/TablaEquipos'
import PanelAlarmas from '../components/PanelAlarmas'
import TablaHorarios from '../components/TablaHorarios'
import TrendEquipos from '../components/TrendEquipos'
import EventosHoy from '../components/EventosHoy'
import { useCamarasStore } from '../store/camaras'
import { estaVencido } from '../lib/estadoGrupo'
import { fraseCamara, faltanMin, badgeCamara, proximoTexto } from '../lib/frases'
import { CAMARAS, PLANTA_OFFSET, nombreCamara, txt, num, hhmm, diaPlanta, type FilaDescongelado } from '../lib/camaras'
import { useNow } from '../lib/useNow'
import { useDatos } from '../lib/useDatos'
import { useCallback, useMemo } from 'react'
import { aTramos, horariosVista, type TramoApi } from '../lib/paginaCamara'
import { alarmasActivasVista, ultimoPorClave, type Evento } from '../lib/alarmas'

const MODOS: Record<string, string> = { AUTOMATICO: 'Automático', MANUAL: 'Manual', STOP: 'Detenido' }

export default function Camara() {
  const { c } = useParams()
  const cam = (c ?? '').toUpperCase()
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const ahora = useNow(1000)
  const dia = diaPlanta(ahora)
  const valida = (CAMARAS as readonly string[]).includes(cam)
  const tr = useDatos<TramoApi>('tramos', dia, dia, valida ? cam : '', 60000)
  const filas = useDatos<FilaDescongelado>('descongelados', dia, dia, valida ? cam : '', 60000)
  const tramos = useMemo(() => (tr.data ? aTramos(tr.data) : null), [tr.data])
  const minutosPlan = useCallback((h: number) => estado ? [0, 1].reduce((t, i) => t + (num(estado, `${cam}.H${h}.etapa${i}_habilitada`) === 1 ? Number(estado[`${cam}.H${h}.etapa${i}_min`]) || 0 : 0), 0) : undefined, [estado, cam])
  const ev = useDatos<Evento>('eventos', dia, dia, valida ? cam : '', 60000)
  const ultimos = useMemo(() => ultimoPorClave(ev.data ?? []), [ev.data])
  if (!valida) return <div className="text-center text-muted-foreground py-16">Cámara inexistente. <Link className="underline" to="/">Volver</Link></div>

  const sinDatos = !estado || incompatible || estaVencido(recibidoEn, ahora)
  const f = estado && !sinDatos ? fraseCamara(estado, cam, ahora) : null
  const hayDatos = !!f && f.nivel !== 'sin-datos'
  const badge = hayDatos ? badgeCamara(estado!, cam, f!.nivel) : null
  const modo = hayDatos ? MODOS[txt(estado, `${cam}.modo`)] : undefined
  const falta = hayDatos ? faltanMin(estado!, cam) : null
  const dia0 = Date.parse(`${dia}T00:00:00${PLANTA_OFFSET}`)
  const horarios = estado && !sinDatos ? horariosVista(estado, cam, ahora, filas.error ? null : filas.data) : []
  // Sin eventos cargados (cargando o con error) no se sabe desde cuándo: desde = undefined
  const alarmas = estado && !sinDatos ? alarmasActivasVista(estado, ultimos, cam).map(a => ev.data && !ev.error && !ev.cargando ? a : { ...a, desde: undefined }) : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-center text-sm font-medium">
        {CAMARAS.map(k => <Link key={k} to={`/camara/${k}`} className={`toque flex items-center justify-center rounded-md ${k === cam ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{nombreCamara(k)}</Link>)}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold">{nombreCamara(cam)}</h1>
        {modo && <span className="text-sm text-muted-foreground">{modo}</span>}
        {hayDatos && <span className="text-sm text-muted-foreground">{falta != null ? `faltan ${falta} min` : (p => p.startsWith('Sin') ? p : `Próximo descongelado: ${p}`)(proximoTexto(estado!, cam, ahora))}</span>}
        {badge && <Badge className="ml-auto border-transparent text-white" style={{ backgroundColor: badge.c }}>{badge.t}</Badge>}
        {!hayDatos && <span className="ml-auto text-sm text-amber-600 dark:text-amber-400">{incompatible ? 'El PLC tiene un programa viejo' : ts ? `Sin datos desde ${hhmm(ts)}` : 'Sin datos todavía'}</span>}
      </div>
      {hayDatos && <div><div className="text-sm font-semibold">{f!.titulo}</div>{f!.detalle && <div className="text-xs text-muted-foreground">{f!.detalle}</div>}</div>}

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <TablaEquipos key={cam} estado={estado} cam={cam} hayDatos={hayDatos} />
        <div className="space-y-3">
          <PanelAlarmas alarmas={alarmas} />
          <TablaHorarios estado={estado} cam={cam} horarios={horarios} sinDatos={sinDatos} />
        </div>
      </div>

      <TrendEquipos tramos={tramos} filas={filas.error ? null : filas.data} horarios={horarios} camara={cam} dia0={dia0} ahora={ahora} minutosPlan={minutosPlan} error={tr.error} />
      <EventosHoy eventos={ev.data} error={ev.error} />
    </div>
  )
}
