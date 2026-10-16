import { describe, expect, test } from 'vitest'
import { filasSistema, resumenAyer, textoCortes, type Resumen } from './sistema'

const A = Date.parse('2026-10-16T12:00:00Z')
const R = (o: Partial<Resumen> = {}): Resumen => ({
  plc: { conectado: true, mapaVersion: 2, programa: 19, desvioRelojS: 30 }, historial: { ultimaEscritura: A - 60e3 },
  telegram: { configurado: true }, mail: { configurado: false }, copia: { ultima: A - 864e5 }, cortes7d: { cantidad: 2, minutos: 7 }, ...o })
const col = (r: Resumen | null) => filasSistema(r, A).map(x => x.color)

describe('filasSistema', () => {
  test('todo bien', () => expect(col(R())).toEqual(['verde', 'verde', 'verde', 'verde', 'verde', 'gris', 'verde']))
  test('null = sin datos en gris', () => {
    expect(filasSistema(null, A).every(x => x.color === 'gris' && x.texto === 'sin datos')).toBe(true)
  })
  test('plc caido, programa viejo, reloj desviado', () => {
    const f = filasSistema(R({ plc: { conectado: false, mapaVersion: 1, programa: null, desvioRelojS: 600 } }), A)
    expect(f.slice(0, 3).map(x => x.color)).toEqual(['rojo', 'rojo', 'rojo'])
    expect(f[1].texto).toBe('Programa viejo: cargar la v19')
    expect(f[2].texto).toBe('desviado 10 min')
  })
  test('limites de reloj, historial y copia', () => {
    expect(col(R({ plc: { conectado: true, mapaVersion: 2, programa: 1, desvioRelojS: -120 } }))[2]).toBe('verde')
    expect(col(R({ historial: { ultimaEscritura: A - 300e3 } }))[3]).toBe('verde')
    expect(col(R({ historial: { ultimaEscritura: A - 360e3 } }))[3]).toBe('rojo')
    expect(col(R({ copia: { ultima: A - 2 * 864e5 } }))[6]).toBe('verde')
    expect(col(R({ copia: { ultima: A - 3 * 864e5 } }))[6]).toBe('rojo')
    expect(col(R({ copia: { ultima: null } }))[6]).toBe('gris')
  })
  test('cortes', () => {
    expect(textoCortes(R().cortes7d)).toBe('Cortes de comunicación de los últimos 7 días: 2 (7 min)')
    expect(textoCortes(null)).toMatch(/sin datos/)
  })
})

describe('resumenAyer', () => {
  const d = (o: object) => ({ camara: 'C1', horario: 'H1', etapa: 0, grupos: 'G1', inicio: 0, fin: 1, duracionS: 1, cortados: '', saltado: false, noEjecutada: false, ...o }) as any
  test('cuenta', () => {
    expect(resumenAyer([d({}), d({ saltado: true })], [{ texto: 'C1 G1 Resistencia T.Max', estado: 1 }, { texto: 'C1 G1 Resistencia T.Max', estado: 0 }, { texto: 'otra cosa' }], [{ horas: 1.25 }, { horas: 2 }]))
      .toEqual({ descongelados: 2, saltados: 1, avisos: 1, horas: 3.3 })
  })
  test('sin datos', () => expect(resumenAyer(null, null, null)).toEqual({ descongelados: null, saltados: null, avisos: null, horas: null }))
})
