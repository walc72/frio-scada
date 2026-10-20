// Tutorial guiado de la primera vez (Inicio + menú). Los textos de cada paso viven acá.
// Se marca como visto por usuario en este navegador; "Ver el tutorial de nuevo" (Más) lo borra.
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export interface Paso { el: string; titulo: string; texto: string; soloAdmin?: boolean }

export const PASOS: Paso[] = [
  { el: 'resumen', titulo: 'Resumen de hoy', texto: 'Cuántos descongelados se hicieron hoy, cuántas alarmas hubo y cuántos compresores están andando ahora.' },
  { el: 'semaforo', titulo: 'Estado general', texto: 'Verde: todo anda bien. Amarillo: hay algo para mirar. Rojo: hay una alarma. Abajo dice cuándo llegó el último dato del PLC.' },
  { el: 'camara', titulo: 'Cada cámara', texto: 'Un cuadrado por equipo: azul enfriando, celeste escurriendo, naranja descongelando, violeta en manual, rojo en alarma, gris parado o sin datos. Tocá la tarjeta para ver el detalle de la cámara.' },
  { el: 'nav-camaras', titulo: 'Cámaras', texto: 'El detalle de cada cámara: el gráfico de las últimas horas, los equipos y los horarios de descongelado.' },
  { el: 'nav-alarmas', titulo: 'Alarmas', texto: 'Las alarmas activas ahora y las que hubo en los días anteriores, con cuánto duraron.' },
  { el: 'nav-eventos', titulo: 'Eventos', texto: 'Todo lo que pasó: cambios de modo, descongelados, maniobras desde el portal.' },
  { el: 'nav-historial', titulo: 'Historial', texto: 'Los descongelados hechos y cuánto trabajó cada equipo, por día. Se puede bajar a Excel.' },
  { el: 'nav-mas', titulo: 'Más', texto: 'El reporte diario en PDF, los avisos por Telegram y mail y el estado del sistema.' },
  { el: 'nav-mas', titulo: 'Para administradores', texto: 'En Más también están la Programación de descongelados, los Usuarios y la Configuración avanzada. Los ajustes de cada cámara están en el botón ⚙ Ajustes de su página.', soloAdmin: true },
]

export const pasosPara = (admin: boolean) => PASOS.filter(p => admin || !p.soloAdmin)

const clave = (user: string) => `frio_tutorial_visto_${user || 'anon'}`
export function tutorialVisto(user: string): boolean {
  try { return localStorage.getItem(clave(user)) === '1' } catch { return true } // sin storage: no molestar en cada entrada
}
export function marcarTutorial(user: string, visto: boolean) {
  try { if (visto) localStorage.setItem(clave(user), '1'); else localStorage.removeItem(clave(user)) } catch { /* sin storage */ }
}

export function iniciarTutorial(user: string, admin: boolean) {
  const d = driver({
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: 'Listo',
    allowClose: true,
    // los pasos cuyo elemento no está (p. ej. sin cámaras) se saltean
    steps: pasosPara(admin).filter(p => document.querySelector(`[data-tour="${p.el}"]`)).map(p => ({
      element: `[data-tour="${p.el}"]`,
      popover: { title: p.titulo, description: p.texto },
    })),
    onDestroyed: () => marcarTutorial(user, true), // terminado o cerrado: no vuelve a salir
  })
  d.drive()
}
