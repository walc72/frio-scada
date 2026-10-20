import { describe, expect, test } from 'vitest'
import { pasosPara, PASOS } from './tutorial'

describe('pasos del tutorial', () => {
  test('el paso de administradores solo para admin', () => {
    expect(pasosPara(true)).toHaveLength(PASOS.length)
    expect(pasosPara(false).some(p => p.soloAdmin)).toBe(false)
  })
  test('cada paso tiene título y texto', () => expect(PASOS.every(p => p.titulo && p.texto && p.el)).toBe(true))
})
