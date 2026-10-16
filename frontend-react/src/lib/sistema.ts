import { tipoAviso } from './frases'
import { DESVIO_MAX_S, fechaDia, type FilaDescongelado } from './camaras'
import { contarDescongelados } from './historial'

export interface Resumen {
  plc: { conectado: boolean | null; mapaVersion: number | null; programa: number | string | null; desvioRelojS: number | null } | null
  historial: { ultimaEscritura: string | null } | null
  telegram: { configurado: boolean | null } | null
  mail: { configurado: boolean | null } | null
  replica?: boolean
  copia: { ultima: string | null } | null
  cortes7d: { cantidad: number | null; minutos: number | null } | null
}
export type Color = 'verde' | 'rojo' | 'gris'
export interface Fila { titulo: string; color: Color; texto: string }

const SIN: Omit<Fila, 'titulo'> = { color: 'gris', texto: 'sin datos' }
const ms = (v: string | null | undefined) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null }
const f = (titulo: string, c: Color, texto: string): Fila => ({ titulo, color: c, texto })

export function filasSistema(r: Resumen | null, ahora: number): Fila[] {
  const plc = r?.plc
  const cfg = (titulo: string, v: boolean | null | undefined) =>
    r?.replica ? f(titulo, 'gris', 'se envían desde planta') : v == null ? { titulo, ...SIN } : v ? f(titulo, 'verde', 'configurado') : f(titulo, 'gris', 'sin configurar')
  const com = plc?.conectado == null ? { titulo: 'Comunicación con el PLC', ...SIN } : f('Comunicación con el PLC', plc.conectado ? 'verde' : 'rojo', plc.conectado ? 'Bien' : 'Sin comunicación')
  const viva = plc?.conectado === true
  const prog = !viva || plc?.mapaVersion == null ? { titulo: 'Programa del PLC', ...SIN }
    : plc.mapaVersion >= 2 ? f('Programa del PLC', 'verde', plc.programa != null ? `programa ${plc.programa} ✓` : 'compatible ✓')
    : f('Programa del PLC', 'rojo', 'Programa viejo: avisar al técnico')
  const d = plc?.desvioRelojS
  const reloj = !viva || d == null ? { titulo: 'Reloj del PLC', ...SIN }
    : Math.abs(d) <= DESVIO_MAX_S ? f('Reloj del PLC', 'verde', 'en hora') : f('Reloj del PLC', 'rojo', `desviado ${Math.round(Math.abs(d) / 60)} min`)
  const w = ms(r?.historial?.ultimaEscritura)
  const hist = w == null ? { titulo: 'Datos del PLC guardados', ...SIN }
    : ahora - w <= 5 * 60e3 ? f('Datos del PLC guardados', 'verde', 'Bien') : f('Datos del PLC guardados', 'rojo', 'No llegan datos del PLC hace más de 5 min')
  const c = ms(r?.copia?.ultima)
  const copia = c == null ? { titulo: 'Copia de seguridad', ...SIN }
    : f('Copia de seguridad', ahora - c <= 35 * 864e5 ? 'verde' : 'rojo', fechaDia(c))
  return [com, prog, reloj, hist, cfg('Telegram', r?.telegram?.configurado), cfg('Mail', r?.mail?.configurado), copia]
}

export const textoCortes = (c: Resumen['cortes7d'] | undefined) =>
  c?.cantidad == null ? 'Cortes de comunicación de los últimos 7 días: sin datos'
    : `Cortes de comunicación de los últimos 7 días: ${c.cantidad} (${c.minutos ?? 0} min)`

// Resumen de "ayer": null = no se pudo leer ese dato
export function resumenAyer(desc: FilaDescongelado[] | null, eventos: { texto: string; estado?: number | string }[] | null, comp: { horas: number }[] | null) {
  const n = desc ? contarDescongelados(desc) : null
  return {
    descongelados: n ? n.hechos : null,
    saltados: n ? n.saltados : null,
    avisos: eventos ? eventos.filter(e => tipoAviso(e.texto, e.estado) === 'alarma').length : null,
    horas: comp ? Math.round(comp.reduce((s, x) => s + (Number(x.horas) || 0), 0) * 10) / 10 : null,
  }
}
