import { describe, test, expect } from 'vitest'
import { agruparCompresores, filasCompresores, filasDescongelados, filasAvisos, prepararAvisos } from './historial'

describe('agruparCompresores', () => {
  const r = agruparCompresores([
    { camara: 'C4', dia: '2026-10-15', grupo: 'G2', horas: 10.5, horasSinDatos: 1, arranques: 5, maxArranquesHora: 2 },
    { camara: 'C4', dia: '2026-10-16', grupo: 'G2', horas: 4, arranques: 9, maxArranquesHora: 7 },
    { camara: 'C4', dia: '2026-10-16', grupo: 'G1', horas: 1, arranques: 1, maxArranquesHora: 1 },
  ])
  test('suma y máximo', () => expect(r.find(x => x.grupo === 'G2')).toMatchObject({ horas: 14.5, arranques: 14, maxArranquesHora: 7, horasSinDatos: 1 }))
  test('ordena por equipo', () => expect(r.map(x => x.grupo)).toEqual(['G1', 'G2']))
  test('vacío', () => expect(agruparCompresores([])).toEqual([]))
})

describe('prepararAvisos', () => {
  const ev = [
    { ts: 1, texto: 'C4 G3 RESISTENCIA T.MAX', estado: 1 },
    { ts: 2, texto: 'C4 G3 RESISTENCIA T.MAX', estado: 0 },
    { ts: 3, texto: 'C4 G3 RESISTENCIA T.MAX', estado: 1 },
    { ts: 4, texto: 'C4 G2 SIN DESCONGELAR', estado: 1 },
    { ts: 5, texto: 'C4 G2 SIN DESCONGELAR', estado: 0 },
  ]
  const vivo = { 'C4.G3.alarma_res': 1, 'C4.G2.alarma_sin_desc': 1 }
  test('más nuevo primero y sigue activo solo en el último con estado 1', () => {
    const r = prepararAvisos(ev, vivo, true)
    expect(r.map(x => x.ts)).toEqual([5, 4, 3, 2, 1])
    expect(r.filter(x => x.sigue).map(x => x.ts)).toEqual([3])
  })
  test('estado vencido: ninguno', () => expect(prepararAvisos(ev, vivo, false).some(x => x.sigue)).toBe(false))
})

describe('filas de exportación', () => {
  test('compresores', () => expect(filasCompresores(agruparCompresores([{ camara: 'C4', dia: 'd', grupo: 'G2', horas: 3.04, arranques: 4, maxArranquesHora: 2 }])))
    .toEqual([{ Cámara: 'Cámara 4', Equipo: 'Equipo 2', 'Horas en marcha': 3, Arranques: 4, 'Máximo de arranques por hora': 2, 'Horas sin datos': 0 }]))
  test('descongelados', () => expect(filasDescongelados([{ camara: 'C4', horario: 'H1', etapa: 1, grupos: 'G1,G3', inicio: 0, fin: 1, duracionS: 1, cortados: '', saltado: false, noEjecutada: false }])[0])
    .toMatchObject({ Cámara: 'Cámara 4', Equipos: '1,3', Resultado: 'completo', Motivo: 'Terminó normalmente' }))
  test('avisos', () => expect(filasAvisos(prepararAvisos([{ ts: 0, texto: 'C4 G1 MODO MANUAL', estado: 1 }], null, false))[0])
    .toMatchObject({ Tipo: 'Acción de un operario', Aviso: 'Equipo 1 pasó a manual', 'Sigue activo': '' }))
})

test('un evento sin texto no rompe la lista de avisos', () => {
  expect(() => prepararAvisos([{ ts: 1, texto: undefined as unknown as string, estado: 1 }], null, false)).not.toThrow()
})

import { contarDescongelados } from './historial'
describe('contarDescongelados', () => {
  const H = 36e5
  const d = (o: object) => ({ camara: 'C4', horario: 'H1', etapa: 0, grupos: 'G1', inicio: 0, fin: 1, duracionS: 1, cortados: '', saltado: false, noEjecutada: false, ...o }) as any
  test('2 etapas del mismo horario = 1 corrida', () => {
    expect(contarDescongelados([d({ etapa: 0, inicio: 10 * H }), d({ etapa: 1, inicio: 10.5 * H })])).toEqual({ hechos: 1, saltados: 0, noSeHizo: 0, cortados: 0 })
  })
  test('el mismo horario a otro día/hora (> 2 h) es otra corrida; otro horario o cámara también', () => {
    expect(contarDescongelados([d({ inicio: 0 }), d({ inicio: 5 * H }), d({ horario: 'H2' }), d({ camara: 'C5' })]).hechos).toBe(4)
  })
  test('gana la peor etiqueta de la corrida', () => {
    expect(contarDescongelados([d({}), d({ etapa: 1, inicio: H, saltado: true })])).toEqual({ hechos: 0, saltados: 1, noSeHizo: 0, cortados: 0 })
    expect(contarDescongelados([d({}), d({ etapa: 1, inicio: H, cortados: 'G1' })])).toEqual({ hechos: 1, saltados: 0, noSeHizo: 0, cortados: 1 })
    expect(contarDescongelados([d({ noEjecutada: true })]).noSeHizo).toBe(1)
  })
  test('vacío', () => expect(contarDescongelados([])).toEqual({ hechos: 0, saltados: 0, noSeHizo: 0, cortados: 0 }))
})
