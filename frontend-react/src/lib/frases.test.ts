import { describe, test, expect } from 'vitest'
import type { Estado } from '../store/camaras'
import type { FilaDescongelado } from './camaras'
import { RUTAS_VIEJAS } from './rutas'
import { estadoEquipo, faltanMin, fraseCamara, proximoTexto, semaforo, textoAlarma, badgeDescongelado, fraseEvento, badgeCamara } from './frases'

// 2026-10-16 12:00 hora de planta (UTC-3) y 23:30 del mismo día
const T = Date.UTC(2026, 9, 16, 15, 0)
const T2330 = Date.UTC(2026, 9, 17, 2, 30)

// 8 equipos por cámara, todos en FRIO salvo lo que se pise
function E(extra: Estado = {}, c: 'C4' | 'C5' = 'C4'): Estado {
  const e: Estado = {}
  for (const cam of ['C4', 'C5']) {
    e[`${cam}.modo`] = 'AUTOMATICO'
    for (let g = 1; g <= 8; g++) e[`${cam}.G${g}.estado`] = 'FRIO'
    for (let h = 1; h <= 4; h++) { e[`${cam}.H${h}.estado`] = 'DESHABILITADO'; e[`${cam}.H${h}.hora`] = '00:00' }
  }
  void c
  return { ...e, ...extra }
}
const fx8frio = E({ 'C5.H1.estado': 'PROGRAMADO', 'C5.H1.hora': '12:30' })
const fx4desc = E({
  'C4.G2.estado': 'DESCONGELANDO', 'C4.G4.estado': 'DESCONGELANDO', 'C4.G6.estado': 'DESCONGELANDO', 'C4.G8.estado': 'DESCONGELANDO',
  'C4.H1.estado': 'EN VENTANA', 'C4.H1.en_ventana': 1, 'C4.H1.hora': '11:56', 'C4.H1.etapas': '12121212',
  'C4.H1.etapa0_min': 8, 'C4.H1.etapa1_min': 10, 'C4.G2.min_descongelado': 4, 'C4.G4.min_descongelado': 4, 'C4.G6.min_descongelado': 4, 'C4.G8.min_descongelado': 4,
  'C4.H2.estado': 'PROGRAMADO', 'C4.H2.hora': '16:00',
})
const fxSinEtapa = E({ 'C4.G2.estado': 'DESCONGELANDO', 'C4.H1.estado': 'EN VENTANA', 'C4.H1.en_ventana': 1, 'C4.H1.hora': '11:50' })
const fxAlarmaYDesc = E({ 'C5.G3.estado': 'ALARMA RES', 'C5.G3.alarma_res': 1, 'C5.G1.estado': 'DESCONGELANDO' })
const fxUltimoHorario2200 = E({ 'C4.H1.estado': 'PROGRAMADO', 'C4.H1.hora': '04:00', 'C4.H2.estado': 'PROGRAMADO', 'C4.H2.hora': '22:00' })
const fxSinHorarios = E()
const fxTodosApagados = E(Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(g => [`C4.G${g}.estado`, 'DESHABILITADO'])))
const fxVacio: Estado = {}
const todasLasFixtures = [fx8frio, fx4desc, fxSinEtapa, fxAlarmaYDesc, fxUltimoHorario2200, fxSinHorarios, fxTodosApagados, fxVacio]

const fila: FilaDescongelado = { camara: 'C4', horario: 'H1', etapa: 1, grupos: 'G1,G3', inicio: 1, fin: 2, duracionS: 600, cortados: '', saltado: false, noEjecutada: false }

describe('frases', () => {
  test('estadoEquipo FRIO', () => expect(estadoEquipo(E({ 'C4.G1.estado': 'FRIO' }), 'C4', 1)).toMatchObject({ texto: 'Enfriando', color: '#1E6FD9', icono: 'frio' }))
  test('estadoEquipo sin dato o desconocido', () => {
    const sd = { clave: 'sin-datos', texto: 'Sin datos', color: '#9A9A9A', icono: 'apagado' }
    expect(estadoEquipo(fxVacio, 'C4', 1)).toEqual(sd)
    expect(estadoEquipo(E({ 'C4.G1.estado': 7 }), 'C4', 1)).toEqual(sd)
    expect(estadoEquipo(E({ 'C4.G1.estado': 'DESHABILITADO' }), 'C4', 1).texto).toBe('Apagado')
  })
  test('faltanMin por equipo: misma etapa', () => {
    const e = { ...fx4desc, 'C4.G2.min_descongelado': 4, 'C4.G4.min_descongelado': 4, 'C4.G6.min_descongelado': 3, 'C4.G8.min_descongelado': 4 }
    expect(faltanMin(e, 'C4')).toBe(7)
  })
  test('faltanMin etapas distintas o dato faltante -> null', () => {
    const base = { ...fx4desc, 'C4.G2.min_descongelado': 4, 'C4.G4.min_descongelado': 4, 'C4.G6.min_descongelado': 4, 'C4.G8.min_descongelado': 4 }
    expect(faltanMin({ ...base, 'C4.G3.estado': 'DESCONGELANDO', 'C4.G3.min_descongelado': 4 }, 'C4')).toBeNull()
    expect(faltanMin({ ...base, 'C4.G8.min_descongelado': '' }, 'C4')).toBeNull()
  })
  test('camara sin equipos funcionando no es verde', () => {
    expect(semaforo(fxTodosApagados, true, T)).toMatchObject({ nivel: 'atencion', titulo: 'Cámara 4: ningún equipo está funcionando' })
    expect(fraseCamara(fxTodosApagados, 'C4', T).nivel).toBe('atencion')
    expect(semaforo(E({ 'C5.modo': 'STOP' }), true, T)).toMatchObject({ nivel: 'atencion', titulo: 'Cámara 5: ningún equipo está funcionando', detalle: 'La cámara está detenida' })
  })
  test('alarma de camara y varias alarmas', () => {
    expect(semaforo(E({ 'C4.alarma_manual': 1 }), true, T).titulo).toBe('Cámara 4 necesita atención')
    expect(semaforo(E({ 'C4.alarma_manual': 1, 'C4.G2.alarma_res': 1 }), true, T).detalle).toMatch(/\(y 1 más\)$/)
  })
  test('fraseCamara 4 descongelando con etapa de 10 min y 4 transcurridos', () =>
    expect(fraseCamara(fx4desc, 'C4', T).titulo).toBe('4 equipos descongelando, terminan en 6 min'))
  test('faltanMin sin datos de etapa -> null', () => expect(faltanMin(E({ 'C4.G2.estado': 'DESCONGELANDO' }), 'C4')).toBeNull())
  test('fraseCamara sin faltanMin -> desde HH:MM', () => expect(fraseCamara(fxSinEtapa, 'C4', T).titulo).toMatch(/descongelando desde \d\d:\d\d/))
  test('todos enfriando', () => expect(fraseCamara(fx8frio, 'C5', T).titulo).toBe('Los 8 equipos enfriando'))
  test('todos enfriando: detalle con próximo', () => expect(fraseCamara(fx8frio, 'C5', T).detalle).toBe('Próximo descongelado: hoy 12:30'))
  test('semaforo ok', () => expect(semaforo(fx8frio, true, T).nivel).toBe('ok'))
  test('semaforo vencido', () => expect(semaforo(fx8frio, false, T)).toMatchObject({ nivel: 'sin-datos' }))
  test('semaforo mapa incompatible', () => expect(semaforo(fx8frio, true, T, 'incompatible').titulo).toBe('El PLC tiene un programa viejo'))
  test('semaforo alarma gana a descongelado', () => expect(semaforo(fxAlarmaYDesc, true, T)).toMatchObject({ nivel: 'alarma', titulo: 'Cámara 5: el equipo 3 necesita atención' }))
  test('fraseCamara alarma gana a descongelado', () => expect(fraseCamara(fxAlarmaYDesc, 'C5', T).nivel).toBe('alarma'))
  test('semaforo null', () => expect(semaforo(null, false, null).nivel).toBe('sin-datos'))
  test('proximoTexto cruza medianoche', () => expect(proximoTexto(fxUltimoHorario2200, 'C4', T2330)).toBe('mañana 04:00'))
  test('proximoTexto hoy', () => expect(proximoTexto(fxUltimoHorario2200, 'C4', T)).toBe('hoy 22:00'))
  test('proximoTexto sin horarios', () => expect(proximoTexto(fxSinHorarios, 'C4', T)).toBe('Sin descongelados programados'))
  test('textoAlarma', () => {
    expect(textoAlarma('C4.G2.alarma_manual').texto).not.toMatch(/C4|G2|undefined/)
    expect(textoAlarma('C4.G2.alarma_res').accion).toBeTruthy()
    expect(textoAlarma('xxx').texto).toBeTruthy()
  })
  test('badges', () => {
    expect(badgeDescongelado({ ...fila, cortados: 'G5' }).etiqueta).toBe('cortado a mano')
    expect(badgeDescongelado({ ...fila, saltado: true }).etiqueta).toBe('saltado')
    expect(badgeDescongelado({ ...fila, noEjecutada: true }).etiqueta).toBe('no se hizo')
    expect(badgeDescongelado({ ...fila, interrumpida: true }).etiqueta).toBe('sin datos')
    expect(badgeDescongelado(fila).etiqueta).toBe('completo')
    expect(badgeDescongelado({ ...fila, cortados: 'G5' }).motivo).toMatch(/equipo 5/)
  })
  test('ninguna frase trae undefined/NaN', () => {
    for (const f of todasLasFixtures) for (const c of ['C4', 'C5']) {
      expect(JSON.stringify(fraseCamara(f, c, T))).not.toMatch(/undefined|NaN/)
      expect(proximoTexto(f, c, T)).not.toMatch(/undefined|NaN/)
      expect(JSON.stringify(semaforo(f, true, T))).not.toMatch(/undefined|NaN/)
    }
  })
})

describe('RUTAS_VIEJAS', () => {
  test('redirige las 3 rutas viejas', () => {
    expect(RUTAS_VIEJAS).toEqual({
      '/descongelados': '/historial/descongelados',
      '/compresores': '/historial/compresores',
      '/eventos': '/historial/avisos',
    })
  })
})

import { ventanaPlanta } from './camaras'
describe('ventanaPlanta', () => {
  test('día de planta UTC-3', () => {
    const v = ventanaPlanta('2026-10-16', '2026-10-16')
    expect(v.desde).toBe('2026-10-16T03:00:00.000Z')
    expect(v.hasta).toBe('2026-10-17T02:59:59.999Z')
  })
})

describe('fraseEvento / badgeCamara', () => {
  test.each([
    ['C4 G1 MODO MANUAL', 'Equipo 1 pasó a manual'],
    ['C4 G1 DESHABILITADO', 'Equipo 1 deshabilitado'],
    ['C4 ETAPAS CAMBIADAS', 'Se cambió el reparto de equipos por etapa'],
    ['C4 DESCONGELADO ETAPA 1', 'Descongelado, etapa 1'],
    ['C5 G3 DESCONGELADO CORTADO', 'Se cortó a mano el descongelado del equipo 3'],
    ['C5 SALTO DE DESCONGELADO', 'Se saltó un descongelado'],
    ['C4 G5 ALGO NUEVO', 'Equipo 5 algo nuevo'],
    ['', ''],
  ])('%s', (i, o) => expect(fraseEvento(i)).toBe(o))
  test('badge', () => {
    expect(badgeCamara(fx4desc, 'C4', 'ok')?.t).toBe('Descongelando')
    expect(badgeCamara(fxAlarmaYDesc, 'C5', 'alarma')?.t).toBe('Atención')
    expect(badgeCamara(fxVacio, 'C4', 'sin-datos')).toBeNull()
  })
})
