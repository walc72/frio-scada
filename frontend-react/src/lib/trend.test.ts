import { test, expect } from 'vitest'
import type { Tramo } from './paginaCamara'
import type { FilaDescongelado } from './camaras'
import { detalleEnInstante, estadoEn, posicionTarjeta } from './trend'

const T0 = Date.parse('2026-10-17T10:00:00-03:00')
const m = (min: number) => T0 + min * 60000
const tramos: Tramo[] = [
  ...[1,3,5,7].flatMap(g => [{camara:'C5',grupo:`G${g}`,inicio:m(-600),fin:m(0),estado:'frio' as const},{camara:'C5',grupo:`G${g}`,inicio:m(0),fin:m(6),estado:'descongelando' as const},{camara:'C5',grupo:`G${g}`,inicio:m(6),fin:m(600),estado:'frio' as const}]),
  ...[2,4,6].flatMap(g => [{camara:'C5',grupo:`G${g}`,inicio:m(-600),fin:m(6),estado:'frio' as const},{camara:'C5',grupo:`G${g}`,inicio:m(6),fin:m(16),estado:'descongelando' as const},{camara:'C5',grupo:`G${g}`,inicio:m(16),fin:m(600),estado:'frio' as const}]),
  {camara:'C5',grupo:'G8',inicio:m(-600),fin:m(600),estado:'sin-datos' as const},
]
const filas: FilaDescongelado[] = [
  {camara:'C5',horario:'2',etapa:1,grupos:'G1G3G5G7',inicio:m(0),fin:m(6),duracionS:360,cortados:'',saltado:false,noEjecutada:false},
  {camara:'C5',horario:'2',etapa:2,grupos:'G2G4G6G8',inicio:m(6),fin:m(16),duracionS:600,cortados:'',saltado:false,noEjecutada:false},
]
test('dentro de la etapa 1: impares descongelando, lleva y falta', () => {
  const d = detalleEnInstante(tramos, filas, 'C5', m(3), 16)
  expect(d.hora).toBe('10:03')
  expect(d.descongelado).toMatchObject({ horario: 2, etapa: 1, llevaMin: 3, faltaMin: 13 })
  expect(d.equipos.find(e => e.grupo === 1)!.estado).toBe('descongelando')
  expect(d.equipos.find(e => e.grupo === 2)!.estado).toBe('enfriando')
})
test('dentro de la etapa 2: el inicio es el de la etapa 1 de la misma corrida', () => {
  const d = detalleEnInstante(tramos, filas, 'C5', m(10), 16)
  expect(d.descongelado).toMatchObject({ etapa: 2, inicio: m(0), llevaMin: 10, faltaMin: 6 })
})
test('etapa 2 sin etapa 1: usa su propio inicio', () => {
  const d = detalleEnInstante(tramos, [filas[1]], 'C5', m(10))
  expect(d.descongelado).toMatchObject({ etapa: 2, inicio: m(6), llevaMin: 4, faltaMin: null })
})
test('fuera de descongelado: resumen y sin bloque de descongelado', () => {
  const d = detalleEnInstante(tramos, filas, 'C5', m(30))
  expect(d.descongelado).toBeNull()
  expect(d.resumen).toBe('7 equipos enfriando · sin datos: 8')
})
test('resumen descongelando con otros estados', () => {
  expect(detalleEnInstante(tramos, filas, 'C5', m(3)).resumen).toBe('Descongelando: equipos 1, 3, 5, 7 · sin datos: 8')
})
test('equipo sin datos se informa como sin datos', () => {
  expect(estadoEn(tramos, 8, m(3))).toBe('sin datos')
  expect(estadoEn(tramos, 1, m(-700))).toBe('sin datos')   // antes del primer tramo
})
test('borde exacto: el instante fin de un tramo pertenece al siguiente', () => {
  expect(estadoEn(tramos, 1, m(6))).toBe('enfriando')
  expect(estadoEn(tramos, 2, m(6))).toBe('descongelando')
})
test('resumen con los 8 enfriando', () => {
  const todos = [1,2,3,4,5,6,7,8].map(g => ({ camara:'C5', grupo:`G${g}`, inicio:m(-10), fin:m(10), estado:'frio' as const }))
  expect(detalleEnInstante(todos, [], 'C5', m(0)).resumen).toBe('Los 8 equipos enfriando')
})
test('posicionTarjeta: derecha, izquierda y bordes', () => {
  expect(posicionTarjeta(100, 240, 800)).toBe(112)
  expect(posicionTarjeta(700, 240, 800)).toBe(448)
  expect(posicionTarjeta(150, 240, 300)).toBe(0)
  expect(posicionTarjeta(290, 240, 300)).toBe(38)
})
test('horario con prefijo H sigue dando el número', () => {
  const f = filas.map(x => ({ ...x, horario: 'H2' }))
  expect(detalleEnInstante(tramos, f, 'C5', m(3)).descongelado).toMatchObject({ horario: 2, etapa: 1 })
})
