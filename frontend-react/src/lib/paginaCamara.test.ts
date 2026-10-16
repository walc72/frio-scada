import { describe, test, expect } from 'vitest'
import type { Estado } from '../store/camaras'
import type { FilaDescongelado } from './camaras'
import { segmentos, horariosVista, repartoTexto, pct, aTramos, type Tramo } from './paginaCamara'

const DIA0 = Date.UTC(2026, 9, 16, 3, 0) // 00:00 de planta
const AHORA = Date.UTC(2026, 9, 16, 15, 0) // 12:00 de planta
const t = (g: string, a: number, b: number, estado: Tramo['estado']): Tramo => aTramos([{ camara: 'C4', grupo: g, inicio: new Date(DIA0 + a * 6e4).toISOString(), fin: new Date(DIA0 + b * 6e4).toISOString(), estado }])[0]

describe('segmentos', () => {
  test('muestra con la forma real de la API (ISO)', () => {
    const tr = aTramos(JSON.parse('[{"camara":"C4","grupo":"G1","inicio":"2026-10-16T11:00:02.646Z","fin":"2026-10-16T11:05:34.895Z","estado":"descongelando"}]'))
    const s = segmentos(tr, 1, DIA0, AHORA)
    expect(s).toHaveLength(1)
    expect(s[0].izq).toBeCloseTo(pct(480.04), 1)
    expect(s[0].ancho).toBeCloseTo(pct(5.54), 1)
    expect(Number.isNaN(s[0].izq)).toBe(false)
  })
  test('porcentajes del día y recorte a ahora y a 00:00', () => {
    const s = segmentos([t('G1', -60, 360, 'frio'), t('G1', 360, 400, 'descongelando'), t('G1', 700, 900, 'frio'), t('G2', 0, 100, 'frio')], 1, DIA0, AHORA)
    expect(s).toHaveLength(3)
    expect(s[0]).toMatchObject({ izq: 0, estado: 'frio' })
    expect(s[0].ancho).toBeCloseTo(25)
    expect(s[1].izq).toBeCloseTo(25)
    expect(s[2].izq + s[2].ancho).toBeCloseTo(pct(720))
  })
  test('sin tramos', () => expect(segmentos([], 1, DIA0, AHORA)).toEqual([]))
})

const E: Estado = {
  'C4.H1.estado': 'PROGRAMADO', 'C4.H1.hora': '04:00',
  'C4.H2.estado': 'EN VENTANA', 'C4.H2.hora': '11:56', 'C4.H2.en_ventana': 1,
  'C4.H3.estado': 'PROGRAMADO', 'C4.H3.hora': '16:00',
  'C4.H4.estado': 'DESHABILITADO', 'C4.H4.hora': '22:00',
}
for (const h of [1, 2, 3, 4]) { E[`C4.H${h}.etapas`] = '12121212'; E[`C4.H${h}.etapa0_habilitada`] = 1; E[`C4.H${h}.etapa1_habilitada`] = 1 }
E['C4.H3.etapa1_habilitada'] = 0

describe('horarios', () => {
  test('estados y orden, sin deshabilitados', () => {
    const v = horariosVista(E, 'C4', AHORA, [{ camara: 'C4', horario: 'H1', etapa: 1, grupos: 'G1', inicio: 1, fin: 2, duracionS: 60, cortados: '', saltado: false, noEjecutada: false }])
    expect(v.map(x => [x.hora, x.estado])).toEqual([['04:00', 'hecho'], ['11:56', 'en curso'], ['16:00', 'próximo']])
  })
  test('frases de reparto', () => {
    expect(repartoTexto(E, 'C4', 1)).toBe('primero los impares, después los pares')
    expect(repartoTexto(E, 'C4', 3)).toBe('equipos impares (1, 3, 5, 7)')
  })
  test('sin etapas: sin frase ni undefined', () => {
    const v = horariosVista({ 'C4.H1.estado': 'PROGRAMADO', 'C4.H1.hora': '20:00' }, 'C4', AHORA)
    expect(v[0].frase).toBe('')
  })
  test('estado vacío', () => expect(horariosVista({}, 'C4', AHORA)).toEqual([]))
})

const fila = (h: string, extra: Partial<FilaDescongelado> = {}): FilaDescongelado => ({ camara: 'C4', horario: h, etapa: 1, grupos: 'G1', inicio: 1, fin: 2, duracionS: 600, cortados: '', saltado: false, noEjecutada: false, ...extra })

describe('hecho viene de los datos', () => {
  test('con fila: hecho; sin fila y pasó: sin registro; sin cargar: ya pasó', () => {
    expect(horariosVista(E, 'C4', AHORA, [fila('H1')])[0]).toMatchObject({ estado: 'hecho', nota: '' })
    expect(horariosVista(E, 'C4', AHORA, [])[0].estado).toBe('sin registro')
    expect(horariosVista(E, 'C4', AHORA, null)[0].estado).toBe('ya pasó')
  })
  test('nota si no fue completo', () => {
    expect(horariosVista(E, 'C4', AHORA, [fila('H1', { cortados: 'G2' })])[0].nota).toBe('cortado a mano')
    expect(horariosVista(E, 'C4', AHORA, [fila('H1', { saltado: true })])[0].nota).toBe('saltado')
    expect(horariosVista(E, 'C4', AHORA, [fila('H1', { noEjecutada: true })])[0].nota).toBe('no se hizo')
  })
  test('en curso gana, la fila de otra cámara no cuenta', () => {
    expect(horariosVista(E, 'C4', AHORA, [fila('H2')])[1].estado).toBe('en curso')
    expect(horariosVista(E, 'C4', AHORA, [fila('H1', { camara: 'C5' })])[0].estado).toBe('sin registro')
  })
  test('usa hora_plc como ahora', () => {
    const v = horariosVista({ ...E, hora_plc: '2026-10-16 03:00:00' }, 'C4', AHORA, [])
    expect(v[0].estado).toBe('próximo') // 04:00 todavía no llegó según el PLC
  })
})

describe('configuración mala', () => {
  test('solapado y mal configurado', () => {
    const e: Estado = { 'C4.H1.estado': 'SOLAPADO', 'C4.H1.hora': '05:00', 'C4.H2.estado': 'MAL CONFIGURADO', 'C4.H2.hora': '06:00' }
    const v = horariosVista(e, 'C4', AHORA, [])
    expect(v[0]).toMatchObject({ estado: 'solapado', frase: 'Se superpone con otro horario: revisar la programación' })
    expect(v[1]).toMatchObject({ estado: 'mal configurado', frase: 'Horario mal configurado, avisar al técnico' })
  })
})
