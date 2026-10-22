import { expect, test } from 'vitest'
import { vistoDe } from './vistas'

test('vistoDe: el grupo está visto solo si todas sus alarmas lo están; muestra la primera marca', () => {
  const v = new Map([['C4.G1.alarma_res', { usuario: 'ana', ts: 20 }], ['C4.G3.alarma_res', { usuario: 'bob', ts: 10 }]])
  expect(vistoDe(v, ['C4.G1.alarma_res', 'C4.G3.alarma_res'])).toEqual({ usuario: 'bob', ts: 10 })
  expect(vistoDe(v, ['C4.G1.alarma_res', 'C4.G5.alarma_res'])).toBeNull()
  expect(vistoDe(v, [])).toBeNull()
})

import { quitarRemDuplicados } from './historial'
test('un "visto" no tapa un REM real cercano', () => {
  const rem = { ts: 1000, texto: 'REM u1 C4 G2 MODO AUTO', estado: 1 }
  expect(quitarRemDuplicados([rem, { ts: 1500, texto: 'ana: Vio la alarma: x', estado: 1, maniobra: true, comando: 'visto' }])).toHaveLength(2)
  expect(quitarRemDuplicados([rem, { ts: 1500, texto: 'ana: Equipo 2 a automático', estado: 1, maniobra: true }])).toHaveLength(1)
})
