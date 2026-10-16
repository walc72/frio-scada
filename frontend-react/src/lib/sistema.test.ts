import { describe, expect, test } from 'vitest'
import { filasSistema, resumenAyer, textoCortes, type Resumen } from './sistema'

const A = Date.parse('2026-10-16T12:00:00Z')
const R = (o: Partial<Resumen> = {}): Resumen => ({
  plc: { conectado: true, mapaVersion: 2, programa: 19, desvioRelojS: 30 }, historial: { ultimaEscritura: new Date(A - 60e3).toISOString() },
  telegram: { configurado: true }, mail: { configurado: false }, copia: { ultima: new Date(A - 864e5).toISOString() }, cortes7d: { cantidad: 2, minutos: 7 }, ...o })
const col = (r: Resumen | null) => filasSistema(r, A).map(x => x.color)

describe('filasSistema', () => {
  test('todo bien', () => expect(col(R())).toEqual(['verde', 'verde', 'verde', 'verde', 'verde', 'gris', 'verde']))
  test('null = sin datos en gris', () => {
    expect(filasSistema(null, A).every(x => x.color === 'gris' && x.texto === 'sin datos')).toBe(true)
  })
  test('programa viejo y reloj desviado (PLC conectado)', () => {
    const f = filasSistema(R({ plc: { conectado: true, mapaVersion: 1, programa: null, desvioRelojS: 600 } }), A)
    expect(f.slice(0, 3).map(x => x.color)).toEqual(['verde', 'rojo', 'rojo'])
    expect(f[1].texto).toBe('Programa viejo: avisar al técnico')
    expect(f[2].texto).toBe('desviado 10 min')
  })
  test('limites de reloj, historial y copia', () => {
    expect(col(R({ plc: { conectado: true, mapaVersion: 2, programa: 1, desvioRelojS: -120 } }))[2]).toBe('verde')
    expect(col(R({ historial: { ultimaEscritura: new Date(A - 300e3).toISOString() } }))[3]).toBe('verde')
    expect(col(R({ historial: { ultimaEscritura: new Date(A - 360e3).toISOString() } }))[3]).toBe('rojo')
    expect(col(R({ copia: { ultima: new Date(A - 34 * 864e5).toISOString() } }))[6]).toBe('verde')
    expect(col(R({ copia: { ultima: new Date(A - 36 * 864e5).toISOString() } }))[6]).toBe('rojo')
    expect(col(R({ copia: { ultima: null } }))[6]).toBe('gris')
    expect(filasSistema(R(), A)[1].texto).toBe('programa 19 ✓')
  })
  test('PLC sin comunicacion: programa y reloj en gris', () => {
    const f = filasSistema(R({ plc: { conectado: false, mapaVersion: 1, programa: 3, desvioRelojS: 900 } }), A)
    expect(f.map(x => x.color).slice(0, 3)).toEqual(['rojo', 'gris', 'gris'])
    expect(f[1].texto).toBe('sin datos')
  })
  test('cortes', () => {
    expect(textoCortes(R().cortes7d)).toBe('Cortes de comunicación de los últimos 7 días: 2 (7 min)')
    expect(textoCortes(null)).toMatch(/sin datos/)
  })
})

describe('replica y nombres', () => {
  test('replica: Telegram y Mail en gris', () => {
    const f = filasSistema(R({ replica: true }), A)
    expect(f.slice(4, 6).map(x => [x.color, x.texto])).toEqual([['gris', 'se envían desde planta'], ['gris', 'se envían desde planta']])
  })
  test('datos del PLC guardados', () => {
    const f = filasSistema(R({ historial: { ultimaEscritura: new Date(A - 360e3).toISOString() } }), A)[3]
    expect(f.titulo).toBe('Datos del PLC guardados'); expect(f.texto).toBe('No llegan datos del PLC hace más de 5 min')
  })
})

describe('resumenAyer', () => {
  const d = (o: object) => ({ camara: 'C1', horario: 'H1', etapa: 0, grupos: 'G1', inicio: 0, fin: 1, duracionS: 1, cortados: '', saltado: false, noEjecutada: false, ...o }) as any
  test('cuenta', () => {
    expect(resumenAyer([d({}), d({ horario: 'H2', saltado: true })], [{ texto: 'C1 G1 Resistencia T.Max', estado: 1 }, { texto: 'C1 G1 Resistencia T.Max', estado: 0 }, { texto: 'otra cosa' }], [{ horas: 1.25 }, { horas: 2 }]))
      .toEqual({ descongelados: 1, saltados: 1, avisos: 1, horas: 3.3 })
  })
  test('2 etapas del mismo horario cuentan una vez', () => {
    expect(resumenAyer([d({ etapa: 0 }), d({ etapa: 1, inicio: 36e5 })], null, null).descongelados).toBe(1)
  })
  test('sin datos', () => expect(resumenAyer(null, null, null)).toEqual({ descongelados: null, saltados: null, avisos: null, horas: null }))
})
