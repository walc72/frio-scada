import { describe, test, expect } from 'vitest'
import type { Estado } from '../store/camaras'
import { claveAlarmaDeEvento } from './frases'
import { desdeAlarma, periodosAlarma, esEventoDeAlarma, alarmasActivasVista } from './alarmas'

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
    expect(desdeAlarma(ev, 'C5.G4.alarma_sin_desc')).toBe(t('14:20'))
  })
  test('sin evento de hoy → null ("desde antes de hoy")', () => {
    expect(desdeAlarma(ev, 'C5.G1.alarma_res')).toBeNull()
  })
  test('aparece, se resuelve y vuelve: dos períodos, el último sigue activo', () => {
    const p = periodosAlarma(ev)
    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ inicio: t('14:20'), fin: null, duracionMin: null })
    expect(p[1]).toMatchObject({ inicio: t('09:00'), fin: t('10:00'), duracionMin: 60 })
  })
  test('las maniobras y los cambios de modo no son eventos de alarma', () => {
    expect(ev.filter(esEventoDeAlarma)).toHaveLength(3)
  })
  test('vista de activas con desde', () => {
    const estado = { 'C5.G4.alarma_sin_desc': 1 } as Estado
    const a = alarmasActivasVista(estado, ev, 'C5')
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ clave: 'C5.G4.alarma_sin_desc', desde: t('14:20') })
    expect(a[0].titulo).toMatch(/^Equipo 4: /)
  })
  test('títulos de cámara y PLC', () => {
    const a = alarmasActivasVista({ 'C5.alarma_manual': 1, alarma_reloj: 1 } as Estado, [])
    expect(a.map(x => x.titulo.split(':')[0]).sort()).toEqual(['Cámara 5', 'PLC'])
  })
})
