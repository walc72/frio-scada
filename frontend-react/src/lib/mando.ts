// Comandos remotos al PLC: reglas de "se puede mandar", frases de confirmación y codificación de valores.
// Espejo de nodered/weg-api/src/services/mando.js (CATALOGO) y de mapa_modbus.md, "Mando". Funciones puras salvo enviarMando.
import type { Estado } from '../store/camaras'
import type { Role } from '../store/auth'
import { apiJson } from './api'
import { nombreCamara } from './camaras'

export type Motivo =
  | 'Sin conexión con el PLC'
  | 'El PLC todavía no tiene el mando remoto (versión vieja)'
  | 'El mando remoto está desactivado en el panel'
  | 'El mando remoto del PLC no está respondiendo'
  | 'Tu usuario solo puede mirar'
  | 'Solo el administrador puede cambiar la programación'
export type Permiso = { ok: true } | { ok: false; motivo: Motivo }

// Los comandos 1..7 son del día a día (rol operar); el resto es programación y ajustes (admin)
export const esComandoOperar = (c: number) => c >= 1 && c <= 7

// Orden: sin dato fresco, llave del panel, rol. Mapa v2: mando_remoto_hab no existe (versión vieja del PLC).
export function puedeMandar(estado: Estado | null, fresco: boolean, rol: Role | string, comando: number): Permiso {
  if (!estado || !fresco) return { ok: false, motivo: 'Sin conexión con el PLC' }
  if (estado.mando_remoto_hab == null) return { ok: false, motivo: 'El PLC todavía no tiene el mando remoto (versión vieja)' }
  if (Number(estado.mando_remoto_hab) !== 1) return { ok: false, motivo: 'El mando remoto está desactivado en el panel' }
  if (Number(estado.sin_mando_remoto) === 1) return { ok: false, motivo: 'El mando remoto del PLC no está respondiendo' }
  const admin = rol === 'admin' || rol === 'superadmin'
  if (!admin && rol !== 'operar') return { ok: false, motivo: 'Tu usuario solo puede mirar' }
  if (!admin && !esComandoOperar(comando)) return { ok: false, motivo: 'Solo el administrador puede cambiar la programación' }
  return { ok: true }
}

export const MODOS_TXT = ['automático', 'manual', 'fuera de servicio'] as const
const donde = (camara: string, grupo?: number) => `${nombreCamara(camara)}${grupo ? `, equipo ${grupo}` : ''}`
const hhmmDe = (v: number) => `${String(Math.floor(v / 100)).padStart(2, '0')}:${String(v % 100).padStart(2, '0')}`
const decimas = (d: number) => `${d / 10}`.replace('.', ',')

export const AJUSTES: Record<number, { nombre: string; clave: string; unidad: string }> = {
  1: { nombre: 'el tope de la resistencia en manual', clave: 'param.res_man_max_min', unidad: 'min' },
  2: { nombre: 'las horas máximas sin descongelar', clave: 'param.horas_max_sin_desc', unidad: 'h' },
  3: { nombre: 'las horas máximas en manual', clave: 'param.horas_max_manual', unidad: 'h' },
}

// La pregunta del diálogo de confirmación
export function fraseConfirmacion(comando: number, camara: string, grupo: number | undefined, horario: number | undefined, valor: number): string {
  const d = donde(camara, grupo), h = `horario ${horario} de ${nombreCamara(camara)}`
  switch (comando) {
    case 1: return `¿Pasar ${d} a ${MODOS_TXT[valor]}?`
    case 2: return `¿${valor ? 'Prender' : 'Apagar'} el compresor de ${d}?`
    case 3: return `¿${valor ? 'Prender' : 'Apagar'} el evaporador de ${d}?`
    case 4: return valor ? `¿Prender la resistencia de ${d} por ${valor} min?` : `¿Apagar la resistencia de ${d}?`
    case 5: return `¿Saltar el descongelado en curso de ${nombreCamara(camara)}?`
    case 6: return `¿Cortar el descongelado de ${d}?`
    case 7: return valor === 1 ? '¿Mantener en manual los equipos del arranque?' : '¿Pasar a automático los equipos del arranque?'
    case 20: return `¿Cambiar el ${h} para las ${hhmmDe(valor)}?`
    case 21: return `¿${valor ? 'Habilitar' : 'Deshabilitar'} el ${h}?`
    case 22: return `¿Poner la etapa ${Math.floor(valor / 10000)} del ${h} en ${decimas(valor % 10000)} min?`
    case 23: return `¿${valor % 10 ? 'Habilitar' : 'Deshabilitar'} la etapa ${Math.floor(valor / 10)} del ${h}?`
    case 24: return `¿Cambiar el reparto de equipos entre etapas del ${h}?`
    case 25: return `¿Poner el tiempo de recuperación de ${nombreCamara(camara)} en ${valor} min?`
    case 30: return `¿Cambiar ${AJUSTES[Math.floor(valor / 1000)]?.nombre ?? 'el ajuste'} a ${valor % 1000}?`
    case 31: return `¿Hacer el reset de mantenimiento de ${d}?`
    default: return '¿Mandar este pedido al PLC?'
  }
}

// ── Codificación de valores (igual que el catálogo de la API) ─────────
export const codHora = (hhmm: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); return m ? +m[1] * 100 + +m[2] : NaN }   // cmd 20: HHMM
export const codEtapaMin = (etapa: 1 | 2, min: number) => etapa * 10000 + Math.round(min * 10)                               // cmd 22: etapa·10000 + décimas
export const codEtapaHab = (etapa: 1 | 2, hab: boolean) => etapa * 10 + (hab ? 1 : 0)                                      // cmd 23: etapa·10 + 0|1
// cmd 24: máscara, bit g-1 = equipo g en la etapa 2. El reparto sale del estado como '12121212' (un carácter por equipo).
export const codReparto = (etapas: string) => [...etapas].reduce((a, c, i) => a + (c === '2' ? 1 << i : 0), 0)
export const codAjuste = (id: 1 | 2 | 3, valor: number) => id * 1000 + valor                                              // cmd 30: id·1000 + valor
// Resistencia (cmd 4): 0 apaga, > 0 prende por esos minutos. Tope en param.res_man_max_min (0 = sin tope); sin dato, 120.
export const topeRes = (e: Estado | null) => { const t = e?.['param.res_man_max_min']; return t == null || t === '' ? 120 : Number(t) }

// Reparto válido: al menos un equipo en cada etapa (máscara 1..254; si no, el PLC lo rechaza)
export const repartoValido = (etapas: string) => { const m = codReparto(etapas); return m >= 1 && m <= 254 }

// ── Pedido a la API ───────────────────────────────────────────────────
export interface Pedido { comando: number; camara?: string; grupo?: number; horario?: number; valor: number }
export interface Resultado { resultado: number; texto: string }
const REVISAR = 'revisá el estado antes de repetir'

// Texto del resultado. El 0 (desconocido) nunca dice "no lo hizo": la API ya avisa que hay que revisar.
export const textoResultado = (r: Resultado) => (r.resultado === 1 ? 'Listo' : r.texto || `No se pudo confirmar el resultado: ${REVISAR}`)

// Manda un pedido. Nunca lanza: los errores HTTP (403, 409, 503, 400, 429) vuelven con su texto; un corte de red es resultado 0.
export async function enviarMando(p: Pedido): Promise<Resultado> {
  try {
    const d = await apiJson<Resultado>('/mando', { method: 'POST', body: JSON.stringify(p) })
    return { resultado: Number(d.resultado), texto: d.texto }
  } catch (e) {
    // TypeError = no hubo respuesta: el pedido pudo haber llegado
    if (e instanceof TypeError) return { resultado: 0, texto: `No hubo respuesta del servidor: ${REVISAR}` }
    return { resultado: -1, texto: e instanceof Error ? e.message : 'No se pudo mandar el pedido' }
  }
}

// ── Programación (admin): campos editables del estado vivo y los pedidos que salen de editarlos ──
export type Valor = string | boolean
export interface Campo {
  id: string; titulo: string; tipo: 'texto' | 'num' | 'bool'; actual: Valor
  camara?: string; horario?: number; comando: number
  valido: (v: Valor) => boolean
  codificar: (v: Valor) => number
}
const entero = (v: Valor, a: number, b: number) => { const n = Number(v); return v !== '' && Number.isInteger(n) && n >= a && n <= b }
const decimas1 = (v: Valor) => { const n = Number(v); return v !== '' && Number.isFinite(n) && Math.round(n * 10) >= 1 && Math.round(n * 10) <= 900 }
const horaOk = (v: Valor) => { const n = codHora(String(v)); return Number.isFinite(n) && n <= 2359 && n % 100 < 60 }

// Todos los campos de programación que el estado trae (un PLC sin mapa v2 no trae el reparto, etc.)
export function campos(e: Estado | null, camaras: readonly string[], horarios: readonly number[]): Campo[] {
  if (!e) return []
  const out: Campo[] = []
  const tiene = (k: string) => e[k] != null && e[k] !== ''
  for (const c of camaras) {
    if (tiene(`${c}.recuperacion_min`)) out.push({ id: `${c}.recuperacion`, titulo: 'Tiempo de recuperación (min)', tipo: 'num', actual: String(e[`${c}.recuperacion_min`]),
      camara: c, comando: 25, valido: v => entero(v, 0, 60), codificar: v => Number(v) })
    for (const h of horarios) {
      const p = `${c}.H${h}.`
      if (tiene(p + 'hora')) out.push({ id: p + 'hora', titulo: 'Hora', tipo: 'texto', actual: String(e[p + 'hora']), camara: c, horario: h, comando: 20, valido: horaOk, codificar: v => codHora(String(v)) })
      if (tiene(p + 'estado')) out.push({ id: p + 'hab', titulo: 'Habilitado', tipo: 'bool', actual: e[p + 'estado'] !== 'DESHABILITADO', camara: c, horario: h, comando: 21, valido: () => true, codificar: v => (v ? 1 : 0) })
      for (const et of [1, 2] as const) {
        if (tiene(p + `etapa${et - 1}_min`)) out.push({ id: p + `t${et}`, titulo: `Etapa ${et} (min)`, tipo: 'num', actual: String(e[p + `etapa${et - 1}_min`]), camara: c, horario: h, comando: 22, valido: decimas1, codificar: v => codEtapaMin(et, Number(v)) })
        if (tiene(p + `etapa${et - 1}_habilitada`)) out.push({ id: p + `e${et}`, titulo: `Etapa ${et} habilitada`, tipo: 'bool', actual: Number(e[p + `etapa${et - 1}_habilitada`]) === 1, camara: c, horario: h, comando: 23, valido: () => true, codificar: v => codEtapaHab(et, !!v) })
      }
      if (tiene(p + 'etapas')) out.push({ id: p + 'etapas', titulo: 'Equipos en la etapa 2', tipo: 'texto', actual: String(e[p + 'etapas']), camara: c, horario: h, comando: 24, valido: v => repartoValido(String(v)), codificar: v => codReparto(String(v)) })
    }
  }
  for (const id of [1, 2, 3] as const) {
    const k = AJUSTES[id].clave
    if (tiene(k)) out.push({ id: `ajuste${id}`, titulo: AJUSTES[id].nombre, tipo: 'num', actual: String(e[k]), comando: 30, valido: v => entero(v, 0, 999), codificar: v => codAjuste(id, Number(v)) })
  }
  return out
}

const distinto = (c: Campo, v: Valor) => (c.tipo === 'num' ? Number(v) !== Number(c.actual) : v !== c.actual)
// Campos editados que difieren de lo que tiene el PLC, con su pedido (null si el valor no es válido)
export function cambios(cs: Campo[], ed: Record<string, Valor>) {
  return cs.filter(c => c.id in ed && distinto(c, ed[c.id])).map(c => {
    const v = ed[c.id], ok = c.valido(v)
    return { campo: c, ok, pedido: ok ? { comando: c.comando, camara: c.camara, horario: c.horario, valor: c.codificar(v) } as Pedido : null }
  })
}
