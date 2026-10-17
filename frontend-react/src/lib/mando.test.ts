import { describe, test, expect } from 'vitest'
import { puedeMandar, fraseConfirmacion, codHora, codEtapaMin, codEtapaHab, codReparto, codAjuste, repartoValido, textoResultado, topeRes, esComandoOperar } from './mando'

const E = { mando_remoto_hab: 1, sin_mando_remoto: 0 }

describe('puedeMandar', () => {
  test('ok', () => {
    expect(puedeMandar(E, true, 'operar', 1)).toEqual({ ok: true })
    expect(puedeMandar(E, true, 'admin', 20)).toEqual({ ok: true })
    expect(puedeMandar(E, true, 'superadmin', 30)).toEqual({ ok: true })
  })
  test('sin conexión (gana a todo)', () => {
    expect(puedeMandar(null, true, 'admin', 1)).toEqual({ ok: false, motivo: 'Sin conexión con el PLC' })
    expect(puedeMandar({ mando_remoto_hab: 0 }, false, 'operador', 1)).toEqual({ ok: false, motivo: 'Sin conexión con el PLC' })
  })
  test('llave apagada (gana al rol)', () => {
    expect(puedeMandar({ mando_remoto_hab: 0 }, true, 'operador', 1)).toEqual({ ok: false, motivo: 'El mando remoto está desactivado en el panel' })
  })
  test('PLC con mapa v2: sin la llave en el estado', () => {
    expect(puedeMandar({}, true, 'admin', 1)).toEqual({ ok: false, motivo: 'El PLC todavía no tiene el mando remoto (versión vieja)' })
  })
  test('alarma sin mando remoto', () => {
    expect(puedeMandar({ mando_remoto_hab: 1, sin_mando_remoto: 1 }, true, 'admin', 1).ok).toBe(false)
  })
  test('operador solo mira', () => {
    expect(puedeMandar(E, true, 'operador', 1)).toEqual({ ok: false, motivo: 'Tu usuario solo puede mirar' })
    expect(puedeMandar(E, true, '', 7)).toEqual({ ok: false, motivo: 'Tu usuario solo puede mirar' })
  })
  test('operar no cambia la programación', () => {
    for (const c of [20, 21, 22, 23, 24, 25, 30, 31]) expect(puedeMandar(E, true, 'operar', c)).toEqual({ ok: false, motivo: 'Solo el administrador puede cambiar la programación' })
    for (const c of [1, 2, 3, 4, 5, 6, 7]) expect(puedeMandar(E, true, 'operar', c).ok).toBe(true)
    expect(esComandoOperar(20)).toBe(false)
  })
})

describe('fraseConfirmacion', () => {
  test('frases', () => {
    expect(fraseConfirmacion(1, 'C5', 3, undefined, 0)).toBe('¿Pasar Cámara 5, equipo 3 a automático?')
    expect(fraseConfirmacion(1, 'C5', 3, undefined, 2)).toBe('¿Pasar Cámara 5, equipo 3 a fuera de servicio?')
    expect(fraseConfirmacion(4, 'C4', 2, undefined, 30)).toBe('¿Prender la resistencia de Cámara 4, equipo 2 por 30 min?')
    expect(fraseConfirmacion(4, 'C4', 2, undefined, 0)).toBe('¿Apagar la resistencia de Cámara 4, equipo 2?')
    expect(fraseConfirmacion(5, 'C5', undefined, undefined, 0)).toBe('¿Saltar el descongelado en curso de Cámara 5?')
    expect(fraseConfirmacion(6, 'C4', 7, undefined, 0)).toBe('¿Cortar el descongelado de Cámara 4, equipo 7?')
    expect(fraseConfirmacion(20, 'C5', undefined, 2, 630)).toBe('¿Cambiar el horario 2 de Cámara 5 para las 06:30?')
    expect(fraseConfirmacion(22, 'C5', undefined, 1, 10085)).toBe('¿Poner la etapa 1 del horario 1 de Cámara 5 en 8,5 min?')
  })
})

describe('codificación', () => {
  test('hora HHMM', () => { expect(codHora('06:30')).toBe(630); expect(codHora('0:05')).toBe(5); expect(codHora('23:59')).toBe(2359); expect(codHora('')).toBeNaN() })
  test('tiempos de etapa', () => { expect(codEtapaMin(1, 8)).toBe(10080); expect(codEtapaMin(2, 12.5)).toBe(20125); expect(codEtapaMin(2, 90)).toBe(20900) })
  test('etapa habilitada', () => { expect(codEtapaHab(1, false)).toBe(10); expect(codEtapaHab(2, true)).toBe(21) })
  test('reparto', () => {
    expect(codReparto('12121212')).toBe(0b10101010)
    expect(codReparto('11111111')).toBe(0)
    expect(repartoValido('12121212')).toBe(true)
    expect(repartoValido('11111111')).toBe(false)
    expect(repartoValido('22222222')).toBe(false)
    expect(repartoValido('21111111')).toBe(true)
  })
  test('ajuste', () => { expect(codAjuste(1, 120)).toBe(1120); expect(codAjuste(3, 0)).toBe(3000) })
  test('tope de la resistencia', () => {
    expect(topeRes({ 'param.res_man_max_min': 60 })).toBe(60)
    expect(topeRes({ 'param.res_man_max_min': 0 })).toBe(0)
    expect(topeRes({})).toBe(120)
  })
})

describe('textoResultado', () => {
  test('hecho', () => expect(textoResultado({ resultado: 1, texto: 'Listo' })).toBe('Listo'))
  test('rechazado: el texto de la API', () => expect(textoResultado({ resultado: 2, texto: 'El PLC no lo hizo: EL GRUPO NO ESTA EN MANUAL' })).toBe('El PLC no lo hizo: EL GRUPO NO ESTA EN MANUAL'))
  test('desconocido nunca dice "no lo hizo"', () => {
    const t = textoResultado({ resultado: 0, texto: '' })
    expect(t).not.toMatch(/no lo hizo/)
    expect(t).toMatch(/revisá/)
    expect(textoResultado({ resultado: 0, texto: 'El PLC no respondió: revisá el estado antes de repetir' })).toBe('El PLC no respondió: revisá el estado antes de repetir')
  })
})

import { campos, cambios } from './mando'
describe('programación', () => {
  const e = { 'C5.recuperacion_min': 5, 'C5.H2.hora': '06:30', 'C5.H2.estado': 'PROGRAMADO', 'C5.H2.habilitado_hmi': 1, 'C5.H2.etapa0_min': 8, 'C5.H2.etapa1_min': 10, 'C5.H2.etapa0_habilitada': 1, 'C5.H2.etapa1_habilitada': 0, 'C5.H2.etapas': '12121212', 'param.res_man_max_min': 120 }
  const cs = campos(e, ['C5'], [2])
  test('solo lo que cambió, con su código', () => {
    // HAB sale de habilitado_hmi, no del estado: MAL CONFIGURADO puede ser un horario apagado
    expect(cs.find(c => c.id === 'C5.H2.hab')?.actual).toBe(true)
    const r = cambios(cs, { 'C5.H2.hora': '07:15', 'C5.H2.t2': '12.5', 'C5.H2.e2': true, 'C5.H2.hab': false, 'C5.H2.t1': '8.0', 'C5.H2.etapas': '12121122', ajuste1: '90' })
    expect(r.map(x => [x.campo.id, x.pedido?.comando, x.pedido?.valor])).toEqual([
      ['C5.H2.hora', 20, 715], ['C5.H2.hab', 21, 0], ['C5.H2.t2', 22, 20125], ['C5.H2.e2', 23, 21], ['C5.H2.etapas', 24, 202], ['ajuste1', 30, 1090]])
  })
  test('valores inválidos no generan pedido', () => {
    const r = cambios(cs, { 'C5.H2.hora': '25:00', 'C5.H2.etapas': '11111111', 'C5.H2.t1': '0', 'C5.recuperacion': '61' })
    expect(r.every(x => !x.ok && x.pedido === null)).toBe(true)
    expect(r).toHaveLength(4)
  })
})

test('sin habilitado_hmi no hay campo HAB', () => {
  const cs = campos({ 'C5.H2.hora': '06:30', 'C5.H2.estado': 'PROGRAMADO' }, ['C5'], [2])
  expect(cs.some(c => c.id.endsWith('.hab'))).toBe(false)
})
