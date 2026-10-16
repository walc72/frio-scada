import { describe, test, expect } from 'vitest'
import type { Estado } from '../store/camaras'
import { segmentos, horariosVista, repartoTexto, pct, type Tramo } from './paginaCamara'

const DIA0 = Date.UTC(2026, 9, 16, 3, 0) // 00:00 de planta
const AHORA = Date.UTC(2026, 9, 16, 15, 0) // 12:00 de planta
const t = (g: string, a: number, b: number, estado: Tramo['estado']): Tramo => ({ camara: 'C4', grupo: g, inicio: DIA0 + a * 6e4, fin: DIA0 + b * 6e4, estado })

describe('segmentos', () => {
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
    const v = horariosVista(E, 'C4', AHORA)
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
