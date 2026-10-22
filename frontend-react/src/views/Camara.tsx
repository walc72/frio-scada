import { useParams, Link } from 'react-router-dom'
import AjustesCamara from '../components/AjustesCamara'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import TablaEquipos from '../components/TablaEquipos'
import PanelAlarmas from '../components/PanelAlarmas'
import TablaHorarios from '../components/TablaHorarios'
import TrendEquipos from '../components/TrendEquipos'
import EventosHoy from '../components/EventosHoy'
import { useCamarasStore } from '../store/camaras'
import { useAuthStore } from '../store/auth'
import { estaVencido } from '../lib/estadoGrupo'
import { fraseCamara, faltanMin, badgeCamara, proximoTexto } from '../lib/frases'
import { CAMARAS, PLANTA_OFFSET, nombreCamara, txt, num, hhmm, diaPlanta, type FilaDescongelado } from '../lib/camaras'
import { useNow } from '../lib/useNow'
import { useDatos } from '../lib/useDatos'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { iniciarTutorial, tutorialVisto } from '../lib/tutorial'
import { aTramos, horariosVista, type TramoApi } from '../lib/paginaCamara'
import { agruparActivas, alarmasActivasVista, ultimoPorClave, type Evento } from '../lib/alarmas'

const MODOS: Record<string, string> = { AUTOMATICO: 'Automático', MANUAL: 'Manual', STOP: 'Detenido' }

export default function Camara() {
  const { c } = useParams()
  const cam = (c ?? '').toUpperCase()
  const estado = useCamarasStore(s => s.estado)
  const ts = useCamarasStore(s => s.ts)
  const recibidoEn = useCamarasStore(s => s.recibidoEn)
  const incompatible = useCamarasStore(s => s.mapa === 'incompatible')
  const admin = useAuthStore(s => s.isAdmin())
  const [ajustes, setAjustes] = useState(false)
  const user = useAuthStore(s => s.user)
  const ahora = useNow(1000)
  const dia = diaPlanta(ahora)
  const valida = (CAMARAS as readonly string[]).includes(cam)
  useEffect(() => { if (valida && !tutorialVisto('camara', user)) iniciarTutorial('camara', user, admin) }, [valida, user, admin])
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
  const alarmas = estado && !sinDatos ? agruparActivas(alarmasActivasVista(estado, ultimos, cam).map(a => ev.data && !ev.error && !ev.cargando ? a : { ...a, desde: undefined }), { camaraImplicita: cam }) : null

  return (
    <div className="space-y-3">
      <div data-tour="cam-selector" className="grid grid-cols-2 gap-1 rounded-lg border bg-card p-1 text-center text-sm font-semibold shadow-sm">
        {CAMARAS.map(k => <Link key={k} to={`/camara/${k}`} aria-current={k === cam ? 'page' : undefined} className={`toque flex items-center justify-center rounded-md transition-colors ${k === cam ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>{nombreCamara(k)}</Link>)}
      </div>

      <div data-tour="cam-estado" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold">{nombreCamara(cam)}</h1>
        {modo && <span className="text-sm text-muted-foreground">{modo}</span>}
        {hayDatos && <span className="text-sm text-muted-foreground">{falta != null ? `faltan ${falta} min` : (p => p.startsWith('Sin') ? p : `Próximo descongelado: ${p}`)(proximoTexto(estado!, cam, ahora))}</span>}
        {badge && <Badge className="ml-auto border-transparent text-white" style={{ backgroundColor: badge.c }}>{badge.t}</Badge>}
        {admin && <button type="button" data-tour="cam-ajustes" onClick={() => setAjustes(true)} className={`toque inline-flex items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted ${badge ? '' : 'ml-auto'}`}>⚙ Ajustes</button>}
        {admin && ajustes && <AjustesCamara cam={cam} onCerrar={() => setAjustes(false)} />}
        {!hayDatos && <span className="ml-auto text-sm text-amber-600 dark:text-amber-400">{incompatible ? 'El PLC tiene un programa viejo' : ts ? `Sin datos desde ${hhmm(ts)}` : 'Sin datos todavía'}</span>}
      </div>
      {hayDatos && <div><div className="text-sm font-semibold">{f!.titulo}</div>{f!.detalle && <div className="text-xs text-muted-foreground">{f!.detalle}</div>}</div>}

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div data-tour="cam-equipos"><TablaEquipos key={cam} estado={estado} cam={cam} hayDatos={hayDatos} /></div>
        <div className="space-y-3">
          <div data-tour="cam-alarmas"><PanelAlarmas alarmas={alarmas} /></div>
          <div data-tour="cam-horarios"><TablaHorarios estado={estado} cam={cam} horarios={horarios} sinDatos={sinDatos} /></div>
        </div>
      </div>

      <div data-tour="cam-trend"><TrendEquipos tramos={tramos} filas={filas.error ? null : filas.data} horarios={horarios} camara={cam} dia0={dia0} ahora={ahora} minutosPlan={minutosPlan} error={tr.error} /></div>
      <div data-tour="cam-eventos"><EventosHoy eventos={ev.data} error={ev.error} /></div>
    </div>
  )
}
