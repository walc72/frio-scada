'use strict';
// Detector de descongelados (spec §5). Puro: recibe los cambios y eventos de cada ciclo y devuelve
// una fila por etapa terminada. Duraciones siempre con tsMs (hora de la PC), nunca con hora_plc.
const RE_ORDEN = /^(C\d+)\.H(\d)\.etapa([01])_orden$/;
const RE_HAB = /^(C\d+)\.H(\d)\.etapa1_habilitada$/;
const RE_DESC = /^(C\d+)\.(G\d+)\.descongelando$/;
const RE_SALTO = /^(C\d+) SALTO DE DESCONGELADO/;
const RE_CORTE = /^(C\d+) (G\d+) DESCONGELADO CORTADO/;
const ordenG = (a, b) => Number(a.slice(1)) - Number(b.slice(1));

function createDetector() {
  const activas = new Map(); // 'C5.H1.1' -> {camara, horario, etapa, inicio, grupos:Set, cortados:Set, saltado}
  const hab2 = new Map(); // 'C5.H1' -> último Cx.Hn.etapa1_habilitada (sin dato = habilitada)

  function alimentar(cambios, eventos, tsMs) {
    const terminan = [], ordenes = [];
    for (const { campo, antes, ahora } of cambios) {
      let m;
      if ((m = RE_HAB.exec(campo))) hab2.set(`${m[1]}.H${m[2]}`, ahora);
      else if ((m = RE_ORDEN.exec(campo))) ordenes.push({ m, clave: `${m[1]}.H${m[2]}.${Number(m[3]) + 1}`, antes, ahora });
    }
    // 1) primero los fines, después los inicios. Solo 0->1 es inicio (antes null = arranque del poller a mitad de etapa).
    for (const { clave, antes, ahora } of ordenes) if (antes === 1 && ahora === 0 && activas.has(clave)) terminan.push(clave);
    for (const { m, clave, antes, ahora } of ordenes) {
      if (antes !== 0 || ahora !== 1) continue;
      // Otra etapa abierta en la misma cámara perdió su 1->0 (p. ej. reinicio del poller): se descarta.
      for (const [k, a] of activas) if (a.camara === m[1] && !terminan.includes(k)) activas.delete(k);
      activas.set(clave, { camara: m[1], horario: Number(m[2]), etapa: Number(m[3]) + 1, inicio: tsMs, grupos: new Set(), cortados: new Set(), saltado: false });
    }
    const deCamara = (cam, incluirTerminan) => [...activas].filter(([k, a]) => a.camara === cam && (incluirTerminan || !terminan.includes(k))).map(([, a]) => a);
    // 2) grupos que arrancan a descongelar pertenecen a la etapa en curso de su cámara
    for (const { campo, ahora } of cambios) {
      const m = RE_DESC.exec(campo);
      if (m && ahora === 1) for (const a of deCamara(m[1], false)) a.grupos.add(m[2]);
    }
    // 3) eventos: SALTO marca la etapa en curso; CORTADO marca al grupo en la etapa que lo contiene.
    // ponytail: un evento que llegue un ciclo después del fin de la etapa se pierde; agregar gracia si pasa.
    for (const { texto } of eventos) {
      let m;
      if ((m = RE_SALTO.exec(texto))) for (const a of deCamara(m[1], true)) a.saltado = true;
      else if ((m = RE_CORTE.exec(texto))) for (const a of deCamara(m[1], true)) if (a.grupos.has(m[2])) a.cortados.add(m[2]);
    }
    // 4) filas de las etapas terminadas
    const filas = [];
    for (const clave of terminan) {
      const a = activas.get(clave);
      activas.delete(clave);
      filas.push({ camara: a.camara, horario: a.horario, etapa: a.etapa, grupos: [...a.grupos].sort(ordenG), inicio: a.inicio, fin: tsMs,
        duracionS: Math.round((tsMs - a.inicio) / 1000), cortados: [...a.cortados].sort(ordenG), saltado: a.saltado, noEjecutada: false });
      // Un salto en la etapa 1 hace que la etapa 2 (si está habilitada) no llegue a correr (sus grupos no se conocen)
      if (a.saltado && a.etapa === 1 && hab2.get(`${a.camara}.H${a.horario}`) !== 0) filas.push({ camara: a.camara, horario: a.horario, etapa: 2, grupos: [], inicio: tsMs, fin: tsMs, duracionS: 0, cortados: [], saltado: false, noEjecutada: true });
    }
    return filas;
  }
  // Corte largo de comunicación: las etapas abiertas se cierran como interrumpidas, sin fin ni duración
  // (no se sabe cuándo terminaron; no se inventa). Al volver, el ciclo arranca de cero (antes null).
  function interrumpir() {
    const filas = [...activas.values()].map((a) => ({ camara: a.camara, horario: a.horario, etapa: a.etapa, grupos: [...a.grupos].sort(ordenG),
      inicio: a.inicio, fin: null, duracionS: null, cortados: [...a.cortados].sort(ordenG), saltado: a.saltado, noEjecutada: false, interrumpida: true }));
    activas.clear();
    return filas;
  }
  return { alimentar, interrumpir };
}

module.exports = { createDetector };
