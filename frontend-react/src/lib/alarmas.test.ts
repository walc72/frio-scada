import { describe, test, expect } from 'vitest'
import type { Estado } from '../store/camaras'
import { claveAlarmaDeEvento } from './frases'
import { agruparActivas, agruparPeriodos, desdeAlarma, periodosAlarma, alarmasActivasVista, ultimoPorClave } from './alarmas'

const t = (hm: string) => Date.parse(`2026-10-17T${hm}:00-03:00`)
const ev = [
  { ts: t('09:00'), texto: 'C5 G4 SIN DESCONGELAR', estado: 1 },
  { ts: t('10:00'), texto: 'C5 G4 SIN DESCONGELAR', estado: 0 },
  { ts: t('14:20'), texto: 'C5 G4 SIN DESCONGELAR', estado: 1 },
  { ts: t('15:00'), texto: 'C5 MODO AUTOMATICO', estado: 1 },
  { ts: t('15:02'), texto: 'admin: C5 equipo 1: pasar a automático', estado: 1, maniobra: true },
]
describe('alarmas', () => {
  test('clave de un evento de alarma', () => {
    expect(claveAlarmaDeEvento('C5 G4 SIN DESCONGELAR')).toBe('C5.G4.alarma_sin_desc')
    expect(claveAlarmaDeEvento('C5 MODO AUTOMATICO')).toBeNull()
    expect(claveAlarmaDeEvento('C5 DESCONGELADO ETAPA 1')).toBeNull()
    expect(claveAlarmaDeEvento('C5 G1 RESISTENCIA BLOQUEADA')).toBeNull()
    expect(claveAlarmaDeEvento('RELOJ DEL PLC INVALIDO')).toBe('alarma_reloj')
  })
  test('desde = la última aparición sin cierre posterior', () => {
    expect(desdeAlarma(ultimoPorClave(ev), 'C5.G4.alarma_sin_desc')).toBe(t('14:20'))
  })
  test('sin evento de hoy → null ("desde antes de hoy")', () => {
    expect(desdeAlarma(ultimoPorClave(ev), 'C5.G1.alarma_res')).toBeNull()
  })
  test('aparece, se resuelve y vuelve: dos períodos, el último sigue activo', () => {
    const p = periodosAlarma(ev)
    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ inicio: t('14:20'), fin: null, duracionMin: null })
    expect(p[1]).toMatchObject({ inicio: t('09:00'), fin: t('10:00'), duracionMin: 60 })
  })
  test('cierre sin inicio en los eventos cargados: período con inicio null', () => {
    const p = periodosAlarma([{ ts: t('08:00'), texto: 'C5 G4 SIN DESCONGELAR', estado: 0 }, { ts: t('08:30'), texto: 'C5 G4 SIN DESCONGELAR', estado: 0 }])
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ inicio: null, fin: t('08:00'), duracionMin: null })
  })
  test('las maniobras y los cambios de modo no entran en los períodos', () => {
    expect(periodosAlarma(ev)).toHaveLength(2)
  })
  test('vista de activas con desde', () => {
    const estado = { 'C5.G4.alarma_sin_desc': 1 } as Estado
    const a = alarmasActivasVista(estado, ultimoPorClave(ev), 'C5')
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ clave: 'C5.G4.alarma_sin_desc', desde: t('14:20') })
    expect(a[0].titulo).toMatch(/^Equipo 4: /)
  })
  test('con cámara también salen las alarmas de la planta, no las de otra cámara', () => {
    const e = { 'C4.alarma_manual': 1, 'C5.alarma_manual': 1, alarma_reloj: 1 } as Estado
    expect(alarmasActivasVista(e, new Map(), 'C5').map(x => x.clave).sort()).toEqual(['C5.alarma_manual', 'alarma_reloj'])
  })
  test('títulos de cámara y PLC', () => {
    const a = alarmasActivasVista({ 'C5.alarma_manual': 1, alarma_reloj: 1 } as Estado, new Map())
    expect(a.map(x => x.titulo.split(':')[0]).sort()).toEqual(['Cámara 5', 'PLC'])
  })
})

describe('agrupar', () => {
  const act = (clave: string, desde: number | null) => ({ clave, titulo: '', desde })
  const ocho = [1, 2, 3, 4, 5, 6, 7, 8].map(g => act(`C5.G${g}.alarma_sin_desc`, g % 2 ? t('20:08') : t('20:21')))
  test('8 equipos, dos instantes: dos líneas en plural', () => {
    const r = agruparActivas(ocho)
    expect(r.map(x => x.titulo)).toEqual([
      'Cámara 5 · Equipos 1, 3, 5, 7: llevan demasiadas horas sin descongelar',
      'Cámara 5 · Equipos 2, 4, 6, 8: llevan demasiadas horas sin descongelar'])
  })
  test('un equipo: singular; cámara y planta; orden planta primero', () => {
    const r = agruparActivas([act('C5.alarma_manual', null), act('C4.G4.alarma_sin_desc', null), act('alarma_reloj', null)])
    expect(r.map(x => x.titulo)).toEqual(['PLC: el reloj del PLC está mal', 'Cámara 4 · Equipo 4: lleva demasiadas horas sin descongelar', 'Cámara 5: hay equipos en manual demasiado tiempo'])
  })
  test('en la página de la cámara no se repite su nombre', () => {
    const r = agruparActivas([act('C5.G2.alarma_sin_desc', null), act('C5.G3.alarma_sin_desc', null), act('alarma_reloj', null)], { camaraImplicita: 'C5' })
    expect(r.map(x => x.titulo)).toEqual(['PLC: el reloj del PLC está mal', 'Equipos 2, 3: llevan demasiadas horas sin descongelar'])
  })
  test('períodos: mismo tipo, inicio y fin se juntan', () => {
    const p = (g: number, fin: number | null) => ({ clave: `C5.G${g}.alarma_sin_desc`, frase: '', inicio: t('20:21'), fin, duracionMin: fin ? 79 : null })
    const r = agruparPeriodos([p(2, t('21:40')), p(4, t('21:40')), p(6, null)])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ equipos: [2, 4], texto: 'Cámara 5 · Equipos 2, 4: llevan demasiadas horas sin descongelar', duracionMin: 79 })
    expect(r[1].texto).toMatch(/^Cámara 5 · Equipo 6: lleva /)
  })
  test('tolerancia 5 min: 14:59 y 15:00 son un grupo, 20:08 y 20:21 no', () => {
    const r = agruparActivas([2, 4, 6, 8].map(g => act(`C4.G${g}.alarma_sin_desc`, t(g === 2 ? '14:59' : '15:00'))))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ equipos: [2, 4, 6, 8], desde: t('14:59') })
    expect(agruparActivas([act('C4.G1.alarma_sin_desc', t('20:08')), act('C4.G2.alarma_sin_desc', t('20:21'))])).toHaveLength(2)
  })
  test('períodos: inicios cercanos se juntan (primer inicio, duración recalculada); fines lejanos no', () => {
    const p = (g: number, i: string, f: string) => ({ clave: `C4.G${g}.alarma_sin_desc`, frase: '', inicio: t(i), fin: t(f), duracionMin: 0 })
    const r = agruparPeriodos([p(2, '14:59', '16:08'), p(4, '15:00', '16:08'), p(6, '15:00', '16:09')])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ equipos: [2, 4, 6], inicio: t('14:59'), fin: t('16:09'), duracionMin: 70 })
    expect(agruparPeriodos([p(2, '15:00', '16:08'), p(4, '15:00', '16:30')])).toHaveLength(2)
  })
  test('períodos: más nueva primero; inicio null se ordena por su fin', () => {
    const p = (g: number, i: string | null, f: string | null) => ({ clave: `C4.G${g}.alarma_res`, frase: '', inicio: i ? t(i) : null, fin: f ? t(f) : null, duracionMin: null })
    const r = agruparPeriodos([p(1, '09:00', '09:30'), p(2, null, '12:00'), p(3, '14:00', null), p(4, '10:00', '10:30')])
    expect(r.map(x => x.equipos[0])).toEqual([3, 2, 4, 1])
  })
})
