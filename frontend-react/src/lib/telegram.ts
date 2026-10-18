// Mismas reglas que el servidor (services/settings.js). Devuelve el error o null.
export const errorToken = (t: string): string | null =>
  !t.trim() || /^\d+:[A-Za-z0-9_-]{30,}$/.test(t.trim()) ? null : 'El token no tiene el formato de @BotFather (123456:ABC…)'

export const errorChat = (c: string): string | null =>
  /^(-?\d+|@\w{5,})$/.test(c.trim()) ? null : 'El chat ID es un número (puede ser negativo) o @canal'
