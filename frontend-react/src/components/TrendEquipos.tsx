import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Card } from './ui/card'
import { GRUPOS, hhmm, type FilaDescongelado } from '../lib/camaras'
import { COLOR_TRAMO, TEXTO_TRAMO, HACHURA, type Tramo, type HorarioVista } from '../lib/paginaCamara'
import { anclasEtiquetas, detalleEnInstante, posicionTarjeta, type DetalleInstante, type EstadoInstante } from '../lib/trend'

const W = 1000, L = 64, R = 10, Y0 = 26, RH = 14, H = Y0 + GRUPOS.length * RH + 20
const DIA = 24 * 3600000
const COLOR_INST: Record<EstadoInstante, string> = { enfriando: COLOR_TRAMO.frio, descongelando: COLOR_TRAMO.descongelando, apagado: COLOR_TRAMO.apagado, 'sin datos': '#9CA3AF' }
const aHora = (m: number) => `${String(m).padStart(2, '0')}:00`

interface Props { tramos: Tramo[] | null; filas: FilaDescongelado[] | null; horarios: HorarioVista[]; camara: string; dia0: number; ahora: number; minutosPlan: (horario: number) => number | undefined; error: boolean }

export default function TrendEquipos({ tramos, filas, horarios, camara, dia0, ahora, minutosPlan, error }: Props) {
  const caja = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), tarjeta = useRef<HTMLDivElement>(null)
  const idHachura = `hachura${useId().replace(/:/g, '')}`
  const [ancho, setAncho] = useState(1000)
  const [cur, setCur] = useState<{ px: number; ts: number; cx: number; cy: number } | null>(null)

  useEffect(() => {
    const el = caja.current
    if (!el || typeof ResizeObserver === 'undefined') return
    setAncho(el.clientWidth)
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [tramos, error])

  // Con el dedo la tarjeta queda al levantarlo; se oculta tocando fuera del gráfico
  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (!svg.current?.contains(e.target as Node)) setCur(null) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [])

  // El ancho de la tarjeta se conoce recién al dibujarla: se posiciona antes de pintar
  useLayoutEffect(() => {
    const t = tarjeta.current, c = caja.current
    if (!cur || !t || !c) return
    t.style.left = `${posicionTarjeta(cur.cx, t.offsetWidth, c.clientWidth)}px`
    t.style.top = `${Math.max(0, Math.min(cur.cy - 20, c.clientHeight - t.offsetHeight))}px`
  }, [cur])

  const x = (ms: number) => L + ((ms - dia0) / DIA) * (W - L - R)
  const mover = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect(), c = caja.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) * W) / r.width
    const ts = dia0 + ((px - L) / (W - L - R)) * DIA
    setCur(ts < dia0 || ts > ahora ? null : { px, ts, cx: e.clientX - c.left, cy: e.clientY - c.top })
  }
  const ocultar = () => setCur(null)

  const minuto = cur ? Math.floor(cur.ts / 60000) : null
  const det = useMemo<DetalleInstante | null>(() => {
    if (!cur || !tramos) return null
    const base = detalleEnInstante(tramos, filas ?? [], camara, cur.ts)
    // Con el horario conocido se vuelve a calcular con los minutos planificados
    return base.descongelado ? detalleEnInstante(tramos, filas ?? [], camara, cur.ts, minutosPlan(base.descongelado.horario)) : base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuto, tramos, filas, camara, minutosPlan])

  if (error) return <Card className="p-3 rounded-xl text-sm text-muted-foreground">No se pudo cargar el gráfico</Card>
  if (!tramos) return <Card className="p-3 rounded-xl text-sm text-muted-foreground">Cargando…</Card>

  const paso = ancho < 480 ? 4 : 2
  const marcas = horarios.filter(h => h.estado !== 'mal configurado' && Math.abs(x(dia0 + h.min * 60000) - x(ahora)) >= 40).sort((p, q) => p.min - q.min)
  const anclas = anclasEtiquetas(marcas.map(h => x(dia0 + h.min * 60000)), 32)
  const d = det?.descongelado
  const enCurso = !!d && d.finEtapa == null
  const nCam = camara.replace(/\D/g, '')

  return (
    <Card className="p-3 space-y-3 rounded-xl">
      <div className="font-semibold">Qué hizo cada equipo hoy</div>
      <div ref={caja} className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
          role="img" aria-label={`Qué hizo cada equipo de la cámara ${nCam} hoy, de 00:00 a 24:00: enfriando, descongelando, apagado o sin datos`}
          onPointerDown={mover} onPointerMove={mover} onPointerLeave={e => { if (e.pointerType !== 'touch') ocultar() }} onPointerCancel={ocultar}>
          <defs>
            <pattern id={idHachura} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} fill="#E5E7EB" /><rect width={3} height={6} fill="#D1D5DB" />
            </pattern>
          </defs>
          {Array.from({ length: 25 }, (_, h) => (
            <g key={h}>
              <line x1={x(dia0 + h * 3600000)} x2={x(dia0 + h * 3600000)} y1={Y0 - 6} y2={Y0 + GRUPOS.length * RH} stroke="currentColor" strokeOpacity={0.12} />
              {h % paso === 0 && <text x={x(dia0 + h * 3600000)} y={Y0 + GRUPOS.length * RH + 12} textAnchor="middle" fontSize={10} className="fill-muted-foreground">{aHora(h)}</text>}
            </g>
          ))}
          {GRUPOS.map((g, i) => {
            const y = Y0 + i * RH
            return (
              <g key={g}>
                <text x={4} y={y + 11} fontSize={11} className="fill-foreground">Equipo {g}</text>
                {tramos.filter(t => t.grupo === `G${g}` && t.fin > dia0 && t.inicio < ahora).map((t, k) => {
                  const a = x(Math.max(t.inicio, dia0)), b = x(Math.min(t.fin, ahora))
                  return b > a ? <rect key={k} x={a} y={y + 2} width={b - a} height={RH - 5} fill={t.estado === 'sin-datos' ? `url(#${idHachura})` : COLOR_TRAMO[t.estado]} /> : null
                })}
              </g>
            )
          })}
          {marcas.map((h, i) => (
            // La punta del triángulo y la línea punteada marcan la hora exacta (el texto va arriba; corrido si hay otra cerca)
            <g key={h.h} className="fill-emerald-700 stroke-emerald-700 dark:fill-emerald-400 dark:stroke-emerald-400">
              <text x={x(dia0 + h.min * 60000) + (anclas[i] === 'start' ? -3 : anclas[i] === 'end' ? 3 : 0)} y={9} textAnchor={anclas[i]} fontSize={10} stroke="none">{h.hora}</text>
              <polygon points={`${x(dia0 + h.min * 60000) - 4},12 ${x(dia0 + h.min * 60000) + 4},12 ${x(dia0 + h.min * 60000)},18`} stroke="none" />
              <line x1={x(dia0 + h.min * 60000)} x2={x(dia0 + h.min * 60000)} y1={18} y2={Y0 + GRUPOS.length * RH} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
            </g>
          ))}
          <line x1={x(ahora)} x2={x(ahora)} y1={Y0 - 6} y2={Y0 + GRUPOS.length * RH} stroke="#dc2626" strokeWidth={1.5} />
          <text x={x(ahora)} y={Y0 - 9} textAnchor="middle" fontSize={10} fill="#dc2626">ahora</text>
          {cur && <line x1={cur.px} x2={cur.px} y1={Y0 - 6} y2={Y0 + GRUPOS.length * RH} stroke="currentColor" strokeDasharray="3 2" />}
        </svg>
        {cur && det && (
          <div ref={tarjeta} className="pointer-events-none absolute z-10 rounded-[10px] border bg-popover text-popover-foreground shadow-lg px-3 py-2.5 text-xs"
            style={{ width: 'max-content', maxWidth: 'min(320px, 100%)', left: 0, top: 0 }}>
            <div className="text-xl font-bold tracking-wide">{det.hora}</div>
            <div className="text-xs text-muted-foreground mb-1.5">Cámara {nCam} · hoy</div>
            {d ? (
              <div className="my-1.5 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
                <b>Descongelado {d.horario}</b> ({hhmm(d.inicio)}) · etapa {d.etapa} de 2<br />
                {enCurso ? (d.faltaMin == null ? `lleva ${d.llevaMin} min` : `lleva ${d.llevaMin} min · faltan ${d.faltaMin} min`)
                  : `de ${hhmm(d.inicio)} a ${hhmm(d.finEtapa!)}`}
              </div>
            ) : det.resumen === 'Los 8 equipos enfriando' ? (
              <div className="text-xs mb-1.5 text-emerald-700 dark:text-emerald-400">● {det.resumen}</div>
            ) : null}
            <div className={`grid ${ancho < 480 ? 'grid-cols-1' : 'grid-cols-2'} gap-x-3.5 gap-y-0.5`}>
              {det.equipos.map(q => (
                <div key={q.grupo} className={`flex min-w-0 items-center gap-1.5 ${ancho < 480 ? '' : 'whitespace-nowrap'}`}>
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_INST[q.estado] }} />
                  Equipo {q.grupo}: {q.estado === 'descongelando' ? <b className="text-orange-700 dark:text-orange-400">descongelando</b> : q.estado}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(['frio', 'descongelando', 'apagado', 'sin-datos'] as const).map(k => (
          <span key={k} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: k === 'sin-datos' ? HACHURA : COLOR_TRAMO[k] }} />{TEXTO_TRAMO[k]}</span>
        ))}
      </div>
    </Card>
  )
}
