import { describe, test, expect } from 'vitest'
import type { Estado } from '../store/camaras'
import type { FilaDescongelado } from './camaras'
import { RUTAS_VIEJAS } from './rutas'
import { estadoEquipo, faltanMin, fraseCamara, proximoTexto, semaforo, textoAlarma, badgeDescongelado, fraseEvento, badgeCamara, tipoAviso, sigueActivo } from './frases'

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
  test('semaforo incompatible gana a datos viejos o sin estado', () => {
    expect(semaforo(fx8frio, false, T, 'incompatible').titulo).toBe('El PLC tiene un programa viejo')
    expect(semaforo(null, false, null, 'incompatible').titulo).toBe('El PLC tiene un programa viejo')
  })
  test('proximoTexto usa la hora del PLC si viene', () => {
    const e = E({ 'C4.H1.estado': 'PROGRAMADO', 'C4.H1.hora': '10:00', hora_plc: '2026-10-15 09:59:00' })
    expect(proximoTexto(e, 'C4', T)).toBe('hoy 10:00')
    expect(proximoTexto({ ...e, hora_plc: '2026-10-15 10:01:00' }, 'C4', T)).toMatch(/^mañana/)
  })
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
      '/eventos': '/historial/eventos',
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

describe('fraseEvento / tipoAviso / sigueActivo con textos reales', () => {
  // [texto, estado, frase, tipo]
  test.each([
    ['C4 G3 RESISTENCIA T.MAX', 1, 'Se cortó la resistencia del equipo 3 por tiempo máximo', 'alarma'],
    ['C4 G3 RESISTENCIA T.MAX', 0, 'Equipo 3: se normalizó la resistencia', 'resuelto'],
    ['C5 G2 SIN DESCONGELAR', 1, 'Equipo 2 lleva mucho tiempo sin descongelar', 'alarma'],
    ['C5 G2 SIN DESCONGELAR', 0, 'Equipo 2 ya descongeló', 'resuelto'],
    ['C4 G1 RESISTENCIA BLOQUEADA', 1, 'La resistencia del equipo 1 está bloqueada', 'atencion'],
    ['C4 G1 RESISTENCIA BLOQUEADA', 0, 'Equipo 1: se desbloqueó la resistencia', 'resuelto'],
    ['C4 G6 DESHABILITADO', 1, 'Equipo 6 deshabilitado', 'atencion'],
    ['C4 G6 DESHABILITADO', 0, 'Equipo 6 habilitado', 'resuelto'],
    ['C4 HORARIO 2 SOLAPADO', 1, 'El horario 2 se superpone con otro', 'alarma'],
    ['C4 HORARIO 2 SOLAPADO', 0, 'Horario 2: se corrigió la superposición', 'resuelto'],
    ['C4 HORARIO 3 HORA INVALIDA', 1, 'El horario 3 tiene una hora no válida', 'alarma'],
    ['C4 HORARIO 3 TIEMPO INVALIDO', 0, 'Horario 3: se corrigió el tiempo', 'resuelto'],
    ['C4 DESCONGELADO ETAPA 0', 1, 'Empezó la etapa 1 del descongelado', 'info'], // el PLC numera las etapas desde 0
    ['C4 DESCONGELADO ETAPA 1', 0, 'Terminó la etapa 2 del descongelado', 'info'],
    ['C5 ETAPA 1 SIN CONFIRMACION', 1, 'Esperó demasiado para empezar la etapa 2 del descongelado', 'alarma'],
    ['C5 RECUPERACION INVALIDA', 1, 'Tardó demasiado en volver a frío', 'alarma'],
    ['C5 MANUAL PROLONGADO', 0, 'Ya no hay equipos en manual de más', 'resuelto'],
    ['RELOJ DEL PLC INVALIDO', 1, 'El reloj del PLC no es válido', 'alarma'],
    ['RELOJ DEL PLC INVALIDO', 0, 'El reloj del PLC volvió a estar bien', 'resuelto'],
    ['INDICE FUERA DE RANGO', 1, 'Falló el índice de alarmas del PLC', 'alarma'],
    ['C4 G1 RESET CONTADORES', 1, 'Un operario reinició los contadores del equipo 1', 'operario'],
    ['C4 MODO STOP', 1, 'La cámara se detuvo', 'operario'],
    ['C4 MODO AUTOMATICO', 1, 'La cámara pasó a automático', 'operario'],
    ['C4 MODO MANUAL', 1, 'La cámara pasó a manual', 'operario'],
    ['C4 G5 MODO AUTO', 1, 'Equipo 5 pasó a automático', 'operario'],
    ['C4 G1 MODO MANUAL', 1, 'Equipo 1 pasó a manual', 'operario'],
    ['C4 G2 RES MANUAL (FIN)', 1, 'Equipo 2: terminó la resistencia manual', 'info'],
    ['C5 G3 DESCONGELADO CORTADO', 1, 'Se cortó a mano el descongelado del equipo 3', 'cortado'],
    ['C5 SALTO DE DESCONGELADO', 1, 'Un operario saltó el descongelado', 'operario'],
    ['C4 ETAPAS CAMBIADAS', 1, 'Se cambió el reparto de equipos por etapa', 'operario'],
    ['C4 ETAPAS: REPARTO RECHAZADO', 1, 'El PLC rechazó el reparto de equipos por etapa', 'atencion'],
    ['ARRANQUE DEL PLC', 1, 'El PLC arrancó', 'info'],
    ['GRUPOS EN MANUAL AL ARRANCAR', 1, 'Al arrancar el PLC había equipos en manual', 'atencion'],
    ['ARRANQUE: MANUAL CONFIRMADO', 1, 'Al arrancar, un operario confirmó dejar los equipos en manual', 'operario'],
    ['ARRANQUE: A AUTO POR OPERADOR', 1, 'Al arrancar, un operario pasó los equipos a automático', 'operario'],
    ['ARRANQUE: A AUTO POR TIEMPO', 1, 'Al arrancar, los equipos pasaron a automático por tiempo', 'operario'],
    ['C4 G5 ALGO NUEVO', 1, 'Equipo 5 algo nuevo', 'info'],
    ['', 1, '', 'info'],
  ])('%s (estado %i)', (t, e, frase, tipo) => {
    expect(fraseEvento(t as string, e as number)).toBe(frase)
    expect(tipoAviso(t as string, e as number)).toBe(tipo)
  })
  test('sigueActivo: un flag por alarma', () => {
    const flags: [string, string][] = [
      ['C4 G3 RESISTENCIA T.MAX', 'C4.G3.alarma_res'], ['C4 G2 SIN DESCONGELAR', 'C4.G2.alarma_sin_desc'],
      ['C4 HORARIO 2 SOLAPADO', 'C4.H2.solapado'], ['C5 HORARIO 1 HORA INVALIDA', 'C5.H1.hora_invalida'],
      ['C5 HORARIO 4 TIEMPO INVALIDO', 'C5.H4.tiempo_invalido'], ['C4 ETAPA 1 SIN CONFIRMACION', 'C4.alarma_espera'],
      ['C4 RECUPERACION INVALIDA', 'C4.alarma_recuperacion'], ['C5 MANUAL PROLONGADO', 'C5.alarma_manual'],
      ['RELOJ DEL PLC INVALIDO', 'alarma_reloj'], ['INDICE FUERA DE RANGO', 'alarma_indice'],
    ]
    for (const [t, k] of flags) {
      expect(sigueActivo(t, { [k]: 1 }, true), t).toBe(true)
      expect(sigueActivo(t, { [k]: 0 }, true), t).toBe(false)
      expect(sigueActivo(t, { [k]: 1 }, false), t).toBe(false)
    }
    expect(sigueActivo('C4 G1 MODO MANUAL', { 'C4.G1.alarma_res': 1 }, true)).toBe(false)
    expect(sigueActivo('C4 G3 RESISTENCIA T.MAX', null, true)).toBe(false)
  })
  test('badge', () => {
    expect(badgeCamara(fx4desc, 'C4', 'ok')?.t).toBe('Descongelando')
    expect(badgeCamara(fxAlarmaYDesc, 'C5', 'alarma')?.t).toBe('Atención')
    expect(badgeCamara(fxVacio, 'C4', 'sin-datos')).toBeNull()
  })
})

import { equiposDeReparto } from './frases'
describe('eventos REM del PLC (comandos del portal)', () => {
  test.each([
    ['REM u1 AJUSTE 2 = 24', 'Desde el portal: horas máximas sin descongelar = 24 h'],
    ['REM u1 AJUSTE 1 = 0', 'Desde el portal: tope de la resistencia en manual = sin tope'],
    ['REM u1 AJUSTE 1 = 30', 'Desde el portal: tope de la resistencia en manual = 30 min'],
    ['REM u1 AJUSTE 3 = 8', 'Desde el portal: horas máximas en manual = 8 h'],
    ['REM u12 C5 G3 MODO AUTO', 'Desde el portal: Cámara 5, equipo 3 pasó a automático'],
    ['REM u12 C5 G3 MODO MANUAL', 'Desde el portal: Cámara 5, equipo 3 pasó a manual'],
    ['REM u12 C5 G3 MODO FUERA', 'Desde el portal: Cámara 5, equipo 3 pasó a fuera de servicio'],
    ['REM u12 C4 H2 HORA 1030', 'Desde el portal: Cámara 4, horario 2 a las 10:30'],
    ['REM u3 C5 H1 E1 T 5.0', 'Desde el portal: Cámara 5, horario 1, etapa 1 = 5 min'],
    ['REM u3 C5 H1 E2 T 7.5', 'Desde el portal: Cámara 5, horario 1, etapa 2 = 7,5 min'],
    ['REM u3 C5 H1 E2 ON', 'Desde el portal: Cámara 5, horario 1, etapa 2 activada'],
    ['REM u3 C5 H1 E1 OFF', 'Desde el portal: Cámara 5, horario 1, etapa 1 desactivada'],
    ['REM u3 C5 H1 REPARTO 170', 'Desde el portal: Cámara 5, horario 1, etapa 2: equipos 2, 4, 6, 8'],
    ['REM u3 C5 G2 RES 30 MIN', 'Desde el portal: Cámara 5, equipo 2: resistencia 30 min'],
    ['REM u3 C5 G2 RES OFF', 'Desde el portal: Cámara 5, equipo 2: resistencia apagada'],
    ['REM u3 C5 G1 COMP ON', 'Desde el portal: Cámara 5, equipo 1: compresor encendido'],
    ['REM u3 C5 G1 COMP OFF', 'Desde el portal: Cámara 5, equipo 1: compresor apagado'],
    ['REM u3 C5 G1 EVA ON', 'Desde el portal: Cámara 5, equipo 1: evaporador encendido'],
    ['REM u3 C5 G1 EVA OFF', 'Desde el portal: Cámara 5, equipo 1: evaporador apagado'],
    ['REM u3 C5 SALTO DESC', 'Desde el portal: Cámara 5, se saltó el descongelado'],
    ['REM u3 C5 G4 CORTE DESC', 'Desde el portal: Cámara 5, equipo 4: se cortó el descongelado'],
    ['REM u3 C5 ARRANQUE MANTENER', 'Desde el portal: Cámara 5, al arrancar, se dejan los equipos en manual'],
    ['REM u3 ARRANQUE AUTO', 'Desde el portal: al arrancar, se pasan los equipos a automático'],
    ['REM u3 C5 G2 HAB ON', 'Desde el portal: Cámara 5, equipo 2: habilitado'],
    ['REM u3 C5 G2 HAB OFF', 'Desde el portal: Cámara 5, equipo 2: deshabilitado'],
    ['REM u3 C5 RECUP 15 MIN', 'Desde el portal: Cámara 5, recuperación 15 min'],
    ['REM u3 C5 G2 RESET MANT', 'Desde el portal: Cámara 5, equipo 2: se reinició el mantenimiento'],
    ['  rem  u12  c5  g3  modo   auto ', 'Desde el portal: Cámara 5, equipo 3 pasó a automático'],
  ])('%s', (t, frase) => { expect(fraseEvento(t)).toBe(frase); expect(tipoAviso(t, 1)).toBe('operario') })
  test('reparto: máscara de bits', () => {
    expect(equiposDeReparto(170)).toEqual([2, 4, 6, 8])
    expect(equiposDeReparto(1)).toEqual([1])
    expect(equiposDeReparto(255)).toHaveLength(8)
    expect(fraseEvento('REM u1 C5 H2 REPARTO 0')).toBe('Desde el portal: Cámara 5, horario 2, etapa 2: ningún equipo')
  })
})
