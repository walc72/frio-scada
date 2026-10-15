// Descarga CSV (UTF-8 con BOM, separador ';') que Excel abre directo.
const celda = (v: unknown) => {
  let s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v)
  if (typeof v === 'string' && /^[=+@-]/.test(s)) s = "'" + s   // inyección de fórmulas
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvDe(filas: Record<string, unknown>[]): string {
  if (!filas.length) return ''
  const cols = Object.keys(filas[0])
  return [cols, ...filas.map(f => cols.map(c => f[c]))].map(r => r.map(celda).join(';')).join('\r\n')
}

export function downloadXlsx(nombre: string, filas: Record<string, unknown>[]) {
  const blob = new Blob(['﻿' + csvDe(filas)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre.replace(/\.(csv|xlsx)$/i, '') + '.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
