import { describe, it, expect } from 'vitest'
import { estaVencido, colorEstadoGrupo } from './estadoGrupo'

describe('estaVencido', () => {
  const t = 1_000_000
  it('sin ts está vencido', () => expect(estaVencido(null, t)).toBe(true))
  it('6 s después está vencido', () => expect(estaVencido(t, t + 6000)).toBe(true))
  it('1 s después no', () => expect(estaVencido(t, t + 1000)).toBe(false))
})

describe('colorEstadoGrupo', () => {
  it('MANUAL', () => expect(colorEstadoGrupo('MANUAL').fondo).toBe('#7E57C2'))
  it('FRIO', () => expect(colorEstadoGrupo('FRIO').fondo).toBe('#1E6FD9'))
  it('desconocido cae a gris', () => expect(colorEstadoGrupo('???').fondo).toBe('#9A9A9A'))
})

import { csvDe } from './xlsx'
describe('csvDe', () => {
  it('entrecomilla ; " y salto de línea', () =>
    expect(csvDe([{ a: 'x;y', b: 'di"o', c: 'l\nm', d: 1 }])).toBe('a;b;c;d\r\n"x;y";"di""o";"l\nm";1'))
})

import { proximoDescongelado } from './camaras'
describe('proximoDescongelado', () => {
  const e = { hora_plc: '2026-10-15 10:30:00', 'C4.H1.estado': 'PROGRAMADO', 'C4.H1.hora': '06:00', 'C4.H2.estado': 'PROGRAMADO', 'C4.H2.hora': '14:00', 'C4.H3.estado': 'DESHABILITADO', 'C4.H3.hora': '11:00' }
  it('toma el siguiente habilitado', () => expect(proximoDescongelado(e, 'C4')).toBe('14:00'))
  it('da la vuelta al día', () => expect(proximoDescongelado({ ...e, hora_plc: '2026-10-15 15:00:00' }, 'C4')).toBe('06:00'))
  it('sin estado null', () => expect(proximoDescongelado(null, 'C4')).toBeNull())
})

import { recepcionFresca } from './estadoGrupo'
describe('recepcionFresca', () => {
  const ahora = 1_000_000
  it('mensaje en vivo siempre fresco', () => expect(recepcionFresca(false, ahora - 999_999, ahora)).toBe(true))
  it('retenido viejo es vencido', () => expect(recepcionFresca(true, ahora - 61_000, ahora)).toBe(false))
  it('retenido de hace 30 s (desvío de reloj) es fresco', () => expect(recepcionFresca(true, ahora - 30_000, ahora)).toBe(true))
})
describe('csv es-AR y fórmulas', () => {
  it('decimal con coma', () => expect(csvDe([{ a: 12.34 }])).toBe('a\r\n12,34'))
  it('no toca texto normal ni fechas', () => expect(csvDe([{ a: '2026-10-15', b: '9' }])).toBe('a;b\r\n2026-10-15;9'))
  it('prefija comilla a fórmulas', () => expect(csvDe([{ a: '=1+1', b: '@x', c: '-2', d: '+3', e: 'ok' }])).toBe("a;b;c;d;e\r\n'=1+1;'@x;'-2;'+3;ok"))
})

import { horaPlc, hhmm, esIPv4 } from './camaras'
describe('hora de planta y del PLC', () => {
  it('hhmm en hora de Paraguay (UTC-3) sin importar la zona del navegador', () => expect(hhmm(Date.parse('2026-10-15T15:00:00Z'))).toBe('12:00'))
  it('horaPlc formatea los segundos locales del PLC como UTC', () => expect(horaPlc('1790850600')).toBe('2026-10-01 10:30:00'))
  it('horaPlc vacío si no es número', () => { expect(horaPlc('')).toBe(''); expect(horaPlc(undefined)).toBe('') })
})
describe('esIPv4', () => {
  it('acepta', () => expect(esIPv4('192.168.3.71')).toBe(true))
  it('rechaza', () => ['256.1.1.1', '1.2.3', '1x2x3x4', '01.2.3.4', ''].forEach(v => expect(esIPv4(v)).toBe(false)))
})
