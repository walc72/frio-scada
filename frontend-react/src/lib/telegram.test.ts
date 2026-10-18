import { describe, expect, test } from 'vitest'
import { errorChat, errorToken } from './telegram'

const FAKE = '123456:' + 'A'.repeat(35)

describe('validación de Telegram', () => {
  test('token: vacío vale (conserva el guardado), válido vale, el resto no', () => {
    expect(errorToken('')).toBeNull()
    expect(errorToken(` ${FAKE} `)).toBeNull()
    for (const m of ['abc', '123:corto', 'x123456:' + 'A'.repeat(35)]) expect(errorToken(m)).not.toBeNull()
  })
  test('chat: número, negativo o @canal', () => {
    for (const ok of ['123', '-1001234567', '@micanal']) expect(errorChat(ok)).toBeNull()
    for (const m of ['', 'hola', '@ab', '12-3']) expect(errorChat(m)).not.toBeNull()
  })
})
