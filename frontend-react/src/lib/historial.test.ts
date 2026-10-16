import { describe, test, expect } from 'vitest'
import { agruparCompresores, filasCompresores, filasDescongelados, filasAvisos } from './historial'
import { tipoAviso, sigueActivo } from './frases'

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

describe('tipoAviso', () => {
  test.each([
    ['C4 G1 MODO MANUAL', 1, 'operario'],
    ['C4 G3 DESCONGELADO CORTADO', 1, 'corte'],
    ['C5 SALTO DE DESCONGELADO', 1, 'corte'],
    ['C4 ALARMA ESPERA', 1, 'alarma'],
    ['C4 ALARMA ESPERA', 0, 'resuelto'],
    ['C4 ALARMA ESPERA RESUELTA', 1, 'resuelto'],
  ])('%s', (t, e, o) => expect(tipoAviso(t, e)).toBe(o))
})

describe('sigueActivo', () => {
  const e = { 'C4.alarma_espera': 1, 'C4.G3.alarma_res': 1, 'C5.alarma_espera': 0 }
  test('flag prendido', () => { expect(sigueActivo('C4 ALARMA ESPERA', e, true)).toBe(true); expect(sigueActivo('C4 G3 ALARMA RES', e, true)).toBe(true) })
  test('flag apagado o desconocido', () => { expect(sigueActivo('C5 ALARMA ESPERA', e, true)).toBe(false); expect(sigueActivo('C4 G1 MODO MANUAL', e, true)).toBe(false) })
  test('estado vencido o ausente', () => { expect(sigueActivo('C4 ALARMA ESPERA', e, false)).toBe(false); expect(sigueActivo('C4 ALARMA ESPERA', null, true)).toBe(false) })
})

describe('filas de exportación', () => {
  test('compresores', () => expect(filasCompresores(agruparCompresores([{ camara: 'C4', dia: 'd', grupo: 'G2', horas: 3.04, arranques: 4, maxArranquesHora: 2 }])))
    .toEqual([{ Cámara: 'Cámara 4', Equipo: 'Equipo 2', 'Horas en marcha': 3, Arranques: 4, 'Máximo de arranques por hora': 2, 'Horas sin datos': 0 }]))
  test('descongelados', () => expect(filasDescongelados([{ camara: 'C4', horario: 'H1', etapa: 1, grupos: 'G1,G3', inicio: 0, fin: 1, duracionS: 1, cortados: '', saltado: false, noEjecutada: false }])[0])
    .toMatchObject({ Cámara: 'Cámara 4', Equipos: '1,3', Resultado: 'completo', Motivo: 'Terminó normalmente' }))
  test('avisos', () => expect(filasAvisos([{ ts: 0, texto: 'C4 G1 MODO MANUAL', estado: 1 }], () => false)[0])
    .toMatchObject({ Tipo: 'Acción de un operario', Aviso: 'Equipo 1 pasó a manual', 'Sigue activo': '' }))
})
