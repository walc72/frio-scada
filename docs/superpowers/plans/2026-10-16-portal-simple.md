# Portal para usuarios no técnicos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar las pantallas del portal frio-scada para que gente no técnica entienda de un vistazo qué pasa en las cámaras, y sumar 3 endpoints chicos a la API.

**Architecture:** Se reemplazan las vistas del frontend React actual y se conservan las stores, la API, la conexión en vivo y las rutas protegidas. Hay un traductor puro de estado a frases (`lib/frases.ts`) y un set de íconos SVG propio (`components/Icono.tsx`). En weg-api se suman `/api/camaras/tramos`, `/api/sistema/resumen` y `/api/avisos/prueba`.

**Tech Stack:** React 18 + Vite + zustand + Tailwind + vitest (frontend); Node 20 + Express + node:test (weg-api). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-16-portal-simple-design.md`

## Global Constraints

- Sin dependencias npm nuevas: íconos SVG propios en un solo archivo.
- **Colores de estado (los del HMI):**

  | Estado | Color |
  |---|---|
  | FRIO | `#1E6FD9` |
  | DESCONGELANDO | `#F28C28` |
  | ESCURRIENDO | `#4FC3F7` |
  | ALARMA RES | `#D32F2F` |
  | MANUAL | `#7E57C2` |
  | DESHABILITADO / DETENIDO | `#9A9A9A` |

- **Estilo de ícono:** botón lleno con el color del estado e ícono blanco. El frío es el copo de 6 brazos con ramitas.
- **Nombres de las partes del equipo:** "Compresor", "Evaporador", "Resistencia". A los grupos se les dice "Equipo N".
- **Nunca inventar números:**
  - si no hay datos frescos, se muestra "Sin datos desde HH:MM" y los equipos en gris;
  - si no se puede calcular cuánto falta, se muestra "descongelando desde HH:MM".
- **Formato:** fechas y horas con `es-AR`, `timeZone: 'America/Asuncion'`, 24 h.
- **Responsive:** el celular de 375 px es la vista principal. En la PC (1280 px) el menú va a la izquierda.
- **Nada de esto escribe al PLC.** El poller no se toca.
- **Commits:** `git add` de archivos concretos; el mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No se hace push.

## Review Focus

1. **Datos que todavía no llegaron.** Primer render sin `estado`, cámara con todos los equipos DESHABILITADO, horario sin etapas. Lo esperable: frases neutras ("Sin datos todavía", "Sin descongelados programados"), sin `NaN` ni `undefined` en pantalla. → Task 1, en los tests de `frases`.
2. **Mapa incompatible o comunicación caída.** El semáforo no dice "Todo funcionando bien" cuando `_mapa === 'incompatible'` o cuando los datos están vencidos. → Task 1, test de `semaforo`.
3. **Descongelado que cruza la medianoche, o día sin horarios habilitados.** La línea de 00 a 24 h y "próximo" no se rompen; "próximo" puede ser "mañana 04:00". → Task 1, test de `proximoTexto`.
4. **Cámara con alarma y además descongelando.** La alarma tiene prioridad en el semáforo y en el badge. → Task 1.
5. **Pantallas angostas (320 px) y modo oscuro.** No hay scroll horizontal y el texto sigue legible. → Task 8, verificación visual.

---

### Task 1: Traductor de estado a frases e íconos

**Files:**
- Create: `frontend-react/src/lib/frases.ts`, `frontend-react/src/lib/frases.test.ts`, `frontend-react/src/components/Icono.tsx`, `frontend-react/src/components/BotonEquipo.tsx`
- Modify: `frontend-react/src/lib/estadoGrupo.ts` (colores: reusar o mover a `frases.ts`, sin duplicar)

**Interfaces:**
- Consumes: claves del estado plano que arma `mapa.js` `decodificar` (`C4.G1.estado`, `C4.G1.comp|eva|res`, `C4.H1.hora|estado|etapa1_min|etapa1_habilitada|...`, `C4.min_descongelado`, `C4.modo`, flags de alarma). Leer `nodered/weg-modbus-poller/src/mapa.js` para los nombres exactos. Consume también `_mapa`, `_conectado` y la frescura de `store/camaras.ts`.
- Produces:
  - `type Nivel = 'ok' | 'atencion' | 'alarma' | 'sin-datos'`
  - `estadoEquipo(estado: Estado, c: 'C4'|'C5', g: number): { clave: ClaveEstado, texto: string, color: string, icono: NombreIcono }`
  - `faltanMin(estado: Estado, c: string): number | null`
  - `fraseCamara(estado: Estado, c: string, ahora: number): { titulo: string, detalle: string, nivel: Nivel }`
  - `proximoTexto(estado: Estado, c: string, ahora: number): string`, que devuelve "hoy 12:00", "mañana 04:00" o "Sin descongelados programados"
  - `semaforo(estado: Estado | null, fresco: boolean, ts: number | null): { nivel: Nivel, titulo: string, detalle: string }`
  - `textoAlarma(clave: string): { texto: string, accion?: string }`
  - `badgeDescongelado(fila: FilaDescongelado): { etiqueta: 'completo'|'cortado a mano'|'saltado'|'no se hizo'|'sin datos', motivo: string }`
  - `UMBRAL_ARRANQUES_HORA = 6`
  - `<Icono nombre: NombreIcono, size?: number />`, donde `NombreIcono = 'frio'|'descongelando'|'escurriendo'|'alarma'|'manual'|'apagado'`
  - `<BotonEquipo c g />`: botón lleno con color e ícono, más el número debajo.

- [ ] **Step 1: Tests en `frases.test.ts`**

```ts
test('estadoEquipo FRIO', () => expect(estadoEquipo(E({'C4.G1.estado':'FRIO'}),'C4',1)).toMatchObject({texto:'Enfriando',color:'#1E6FD9',icono:'frio'}))
test('fraseCamara 4 descongelando con etapa de 10 min y 4 transcurridos', () =>
  expect(fraseCamara(fx4desc, 'C4', T).titulo).toBe('4 equipos descongelando, terminan en 6 min'))
test('faltanMin sin datos de etapa -> null', () => expect(faltanMin(E({'C4.G2.estado':'DESCONGELANDO'}),'C4')).toBeNull())
test('fraseCamara sin faltanMin -> desde HH:MM', () => expect(fraseCamara(fxSinEtapa,'C4',T).titulo).toMatch(/descongelando desde \d\d:\d\d/))
test('todos enfriando', () => expect(fraseCamara(fx8frio,'C5',T).titulo).toBe('Los 8 equipos enfriando'))
test('semaforo ok', () => expect(semaforo(fx8frio,true,T).nivel).toBe('ok'))
test('semaforo vencido', () => expect(semaforo(fx8frio,false,T)).toMatchObject({nivel:'sin-datos'}))
test('semaforo mapa incompatible', () => expect(semaforo({...fx8frio,_mapa:'incompatible'},true,T).titulo).toBe('El PLC tiene un programa viejo'))
test('semaforo alarma gana a descongelado', () => expect(semaforo(fxAlarmaYDesc,true,T)).toMatchObject({nivel:'alarma',titulo:'Cámara 5: el equipo 3 necesita atención'}))
test('semaforo null', () => expect(semaforo(null,false,null).nivel).toBe('sin-datos'))
test('proximoTexto cruza medianoche', () => expect(proximoTexto(fxUltimoHorario2200,'C4',T2330)).toBe('mañana 04:00'))
test('proximoTexto sin horarios', () => expect(proximoTexto(fxSinHorarios,'C4',T)).toBe('Sin descongelados programados'))
test('badges', () => {
  expect(badgeDescongelado({...fila, cortados:'G5'}).etiqueta).toBe('cortado a mano')
  expect(badgeDescongelado({...fila, saltado:true}).etiqueta).toBe('saltado')
  expect(badgeDescongelado({...fila, noEjecutada:true}).etiqueta).toBe('no se hizo')
  expect(badgeDescongelado({...fila, interrumpida:true}).etiqueta).toBe('sin datos')
  expect(badgeDescongelado(fila).etiqueta).toBe('completo')
})
test('ninguna frase trae undefined/NaN', () => for (const f of todasLasFixtures) expect(JSON.stringify(fraseCamara(f,'C4',T))).not.toMatch(/undefined|NaN/))
```

Las fixtures (`fx*`) se arman a mano en el test, con las claves reales de `mapa.js`. `fx4desc` tiene G2, G4, G6 y G8 en DESCONGELANDO, H1 en EN VENTANA con `etapa2_min=10` y `C4.min_descongelado=4`.

- [ ] **Step 2:** `npx vitest run src/lib/frases.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `frases.ts`, `Icono.tsx` y `BotonEquipo.tsx`.
  - Los textos de `textoAlarma` salen de `DEFS` en `nodered/weg-api/src/services/alertasCamaras.js`, sin los códigos, más la acción sugerida cuando corresponde. Por ejemplo `alarma_res`: "resistencia en manual demasiado tiempo", con la acción "pasarlo a automático desde el panel".
  - Los íconos son SVG de línea con `currentColor`. Las formas son las del boceto aprobado: copo de 6 brazos con ramitas, ondas de calor, dos gotas, triángulo, mano y pausa.
- [ ] **Step 4:** `npx vitest run` → PASS, incluidos los tests viejos.
- [ ] **Step 5:** Commit: "Portal: traductor de estado a frases e íconos".

### Task 2: Navegación, Más y Entrar

**Files:**
- Create: `frontend-react/src/components/Navegacion.tsx`, `frontend-react/src/views/Mas.tsx`
- Modify:
  - `frontend-react/src/App.tsx` (rutas y layout)
  - `frontend-react/src/views/Login.tsx`
  - `frontend-react/src/lib/frases.test.ts` (test de redirecciones, si se exporta un mapa de rutas)

**Interfaces:**
- Produces:
  - `RUTAS_VIEJAS: Record<string,string>`: `{'/descongelados':'/historial/descongelados','/compresores':'/historial/compresores','/eventos':'/historial/avisos'}`
  - las rutas `/`, `/camara/:c`, `/historial/:pestana?`, `/mas`, `/reportes`, `/avisos`, `/sistema`, `/usuarios` (solo admin), `/config` (solo admin)

- [ ] **Step 1: Test.** `RUTAS_VIEJAS` redirige las 3 rutas viejas.
- [ ] **Step 2: Navegación.**
  - En el celular (`<768px`), una barra fija abajo con 4 botones: Inicio (`/`), Cámaras (`/camara/C4`, que adentro permite cambiar a C5), Historial y Más.
  - En la PC, el mismo menú a la izquierda.
  - El ítem activo va resaltado.
  - El header muestra el logo TE y "Cámaras de frío".
- [ ] **Step 3: Más.** Es una lista con:
  - Reporte diario
  - Avisos por Telegram y mail
  - Usuarios (solo admin)
  - Estado del sistema
  - Configuración avanzada (solo admin; es el `Config.tsx` actual, con el enlace "Gráficos de largo plazo" a `/grafana/`)
- [ ] **Step 3b: Usuarios.** `/usuarios` muestra la gestión de usuarios que hoy vive dentro de `Config.tsx`: se mueve, no se duplica. En la lista, los roles se muestran en palabras: "Solo mirar" para `operador` y "Administrador" para `admin`.
- [ ] **Step 4: Entrar.** Logo TE, el título "Cámaras de frío", el subtítulo "Unifrisa", usuario, contraseña y un botón grande "Entrar". No cambia la lógica.
- [ ] **Step 5:** `npx vitest run` y `npm run build` → OK. Commit: "Portal: navegación nueva, Más y Entrar".

### Task 3: Inicio

**Files:**
- Modify: `frontend-react/src/views/General.tsx`, `frontend-react/src/components/TarjetaCamara.tsx`
- Create: `frontend-react/src/components/Semaforo.tsx`, `frontend-react/src/components/ResumenHoy.tsx`

**Interfaces:**
- Consumes: `semaforo`, `fraseCamara`, `proximoTexto` y `BotonEquipo` (Task 1); `useCamarasStore`, `useNow(1000)`; `GET /api/camaras/descongelados?desde&hasta`, para contar los del día.

- [ ] **Step 1: Semáforo.** Es un cartel arriba, verde, amarillo, rojo o gris según `nivel`, con el título y "Actualizado hace N s". Si el nivel es alarma, al tocarlo lleva a la cámara afectada.
- [ ] **Step 2: TarjetaCamara.**
  - El título de la cámara y un badge con su estado (Enfriando / Descongelando / Atención).
  - Una grilla de 8 `BotonEquipo`.
  - `fraseCamara`, título y detalle, y "Próximo: {proximoTexto}".
  - Borde rojo si la cámara tiene alarma.
  - Al tocarla, abre `/camara/:c`.
  - Si está vencida, va gris y dice "Sin datos desde HH:MM".
- [ ] **Step 3: ResumenHoy.** Tres números:
  - descongelados del día, que son las filas de hoy en `/api/camaras/descongelados`;
  - alarmas activas, que son los flags del estado vivo;
  - compresores en marcha, `n/16` según `Cx.Gg.comp`.

  Si la API falla, cada número muestra "—".
- [ ] **Step 4: Layout.** En el celular, una columna. En la PC, las 2 cámaras lado a lado. Correr `npm run build`.
- [ ] **Step 5:** Commit: "Portal: pantalla de inicio".

### Task 4: API para tramos, estado del sistema y aviso de prueba

**Files:**
- Modify:
  - `nodered/weg-api/src/services/camaras.js` (agregar `fluxTramos` y `parseTramos`)
  - `nodered/weg-api/src/routes/camaras.js` (`GET /tramos`)
  - `nodered/weg-api/src/server.js` (montar las rutas nuevas)
- Create: `nodered/weg-api/src/routes/avisos.js`, `nodered/weg-api/src/routes/sistemaResumen.js`, `nodered/weg-api/test/tramos.test.js`, `nodered/weg-api/test/avisosPrueba.test.js`

**Interfaces:**
- Consumes: la validación existente de `desde`/`hasta`/`camara` en `services/camaras.js`; la consulta de latidos (`fluxLatidos`) y el hueco de 15 min de `parseCompresores`; `alerts.notify(texto)` y el envío por canal; `requireAdmin`.
- Produces:
  - `GET /api/camaras/tramos?desde&hasta&camara`, que devuelve `[{grupo:'G1', inicio: ISO, fin: ISO, estado:'frio'|'descongelando'|'sin-datos'}]` ordenado por grupo e inicio;
  - `POST /api/avisos/prueba {canal:'telegram'|'mail'}`, solo admin, que devuelve `{ok:boolean, error?:string}`. Hay un límite de 1 por minuto por canal; si se pasa, responde 429 con `{ok:false,error:'Esperá un minuto antes de probar de nuevo'}`;
  - `GET /api/sistema/resumen`, que devuelve `{plc:{conectado,mapaVersion,programa,desvioRelojS}, historial:{ultimaEscritura}, telegram:{configurado}, mail:{configurado}, copia:{ultima}, cortes7d:{cantidad,minutos}}`. Cada dato que no exista va `null`.

- [ ] **Step 1: Tests de `parseTramos`.**
  - `G1` FRIO de 00:00 a 08:06 y DESCONGELANDO de 08:06 a 08:12 → 2 tramos.
  - Un hueco de 2 h sin latido → un tramo `sin-datos` en el medio.
  - Un tramo que cruza la medianoche → se corta en `hasta`.
  - Los estados ESCURRIENDO, ALARMA RES y MANUAL cuentan como `frio`, salvo DESCONGELANDO.
  - Una `camara` inválida → 400.
- [ ] **Step 2: Tests de `/avisos/prueba`.**
  - Rol `operador` → 403.
  - Admin con `notify` mockeado que resuelve → `{ok:true}`.
  - Un segundo pedido dentro del minuto → 429.
  - Canal que falla → `{ok:false,error}` con un texto legible y status 200.
- [ ] **Step 3:** `npm test` → FAIL. Implementar. Para el resumen, reusar lo que ya hay: el estado vivo (`getEstadoCamaras`), el último punto de `foto`, `settings` para saber si Telegram y SMTP están configurados, y las copias de `weg-backup`. Cada dato que no exista va `null`, sin inventar.
- [ ] **Step 4:** `npm test` → PASS. Commit: "API: tramos por equipo, resumen del sistema y aviso de prueba".

### Task 5: Página de una cámara

**Files:**
- Modify: `frontend-react/src/views/Camara.tsx`
- Create: `frontend-react/src/components/LineaDescongelados.tsx`, `frontend-react/src/components/BarrasEquipos.tsx`

**Interfaces:**
- Consumes: Task 1 (frases, BotonEquipo); `GET /api/camaras/tramos` (Task 4); `GET /api/camaras/eventos`.

- [ ] **Step 1: Encabezado.** "Cámara N", el modo en palabras (Automático / Manual / Detenido) y el badge de estado.
- [ ] **Step 2: Equipos.** Una fila por equipo con `BotonEquipo`, el texto "Equipo N · {estado} · faltan X min" (la última parte solo si hay dato) y tres chips: Compresor, Evaporador y Resistencia, encendidos cuando la parte está prendida.
- [ ] **Step 3: LineaDescongelados.**
  - Una barra de 00 a 24 h con los 4 horarios en su posición y la marca de ahora en rojo.
  - Debajo, una lista en frases, una línea por horario:
    - ✅ hecho / en curso: "equipos pares (2, 4, 6, 8)", según el reparto;
    - ⏰ próximo: "primero los impares, después los pares";
    - "· pendiente".
  - Los horarios deshabilitados no se muestran.
- [ ] **Step 4: BarrasEquipos.** Una barra por equipo de 00:00 a ahora: azul enfriando, naranja descongelando, gris sin datos, sacado de `/tramos`. Si la API falla, "No se pudo cargar el gráfico".
- [ ] **Step 5: Últimos avisos.** Los últimos 5 eventos de la cámara en frases, con la hora.
- [ ] **Step 6: Ver detalles técnicos.** Va plegado: horas de marcha, arranques, horas sin descongelar y los tiempos de etapa, en una tabla chica.
- [ ] **Step 7:** `npm run build`. Commit: "Portal: página de cámara".

### Task 6: Historial

**Files:**
- Create: `frontend-react/src/views/Historial.tsx`
- Modify: `frontend-react/src/views/Descongelados.tsx`, `Eventos.tsx` y `Compresores.tsx`, que pasan a ser pestañas, o se borran y su lógica pasa a `Historial.tsx` (lo que deje menos código); también `frontend-react/src/components/Filtros.tsx`.

**Interfaces:**
- Consumes: `badgeDescongelado`, `UMBRAL_ARRANQUES_HORA` y `textoAlarma` (Task 1); los endpoints existentes; `downloadXlsx`.

- [ ] **Step 1:** Pestañas Descongelados, Avisos y Compresores en `/historial/:pestana`. Los chips de fecha son Hoy, Ayer, 7 días y Elegir fecha, más el filtro de cámara. Abajo, "⬇ Descargar en Excel".
- [ ] **Step 2: Descongelados.** Una fila por descongelado: hora, cámara, equipos, el badge de color y el motivo en palabras.
- [ ] **Step 3: Avisos.** Hora, un punto de color (rojo alarma, naranja se cortó, verde se resolvió, azul acción de un operario), la frase, y "Sigue activo" si el flag sigue prendido en el estado vivo.
- [ ] **Step 4: Compresores.** Por equipo: horas en marcha, arranques y una barra proporcional al máximo. Si `maxArranquesHora > UMBRAL_ARRANQUES_HORA`, se muestra "⚠️ Arranca demasiado seguido (hasta N veces por hora): conviene revisarlo".
- [ ] **Step 5:** `npx vitest run` y `npm run build`. Commit: "Portal: historial con pestañas".

### Task 7: Reporte diario, Avisos y Estado del sistema

**Files:**
- Modify: `frontend-react/src/views/Reportes.tsx`, `frontend-react/src/views/Sistema.tsx`
- Create: `frontend-react/src/views/Avisos.tsx`

**Interfaces:**
- Consumes: `POST /api/reports/camaras/xlsx`, `GET /api/sistema/resumen` y `POST /api/avisos/prueba` (Task 4).

- [ ] **Step 1: Reporte.**
  - Una tarjeta con "Ayer, {fecha}" y tres líneas: descongelados (y cuántos se saltaron), avisos y horas de compresores.
  - Los botones "⬇ Descargar Excel de ayer" y "Elegir otro día", este último con el `<input type="date">` existente.
  - La nota "Se manda solo por mail todos los días a las 07:00".
- [ ] **Step 2: Avisos.**
  - Las tarjetas Telegram y Mail, cada una con "Mandar un aviso de prueba" o "Mandar un mail de prueba", visibles solo para el admin. El resultado se muestra en palabras.
  - La tarjeta "¿Qué avisa?" con este texto: "Alarmas del PLC · PLC sin comunicación más de 2 min · reloj del PLC desviado. Repite cada 1 hora si sigue, y avisa cuando se resuelve."
- [ ] **Step 3: Estado del sistema.**
  - Filas con semáforo para: comunicación con el PLC, programa del PLC (versión de mapa y de programa), reloj del PLC, guardado del historial, Telegram, mail y copia de seguridad.
  - Un `null` se muestra como "sin datos".
  - Debajo, "Cortes de comunicación de los últimos 7 días: N (M min)".
- [ ] **Step 4:** `npm run build`. Commit: "Portal: reporte, avisos y estado del sistema".

### Task 8: Verificación visual contra el stack de WSL

**Files:** ninguno, salvo los arreglos que salgan.

- [ ] **Step 1:** Rebuild del frontend en WSL. Con node:20-alpine, montar `frontend-react` y correr `npm ci && npm run build`; después `docker compose restart frontend`. El reinicio del API se hace con `docker compose up -d --build frio-api`.
- [ ] **Step 2:** En el panel del navegador, capturas de cada pantalla a 375 px, 320 px y 1280 px, en claro y en oscuro, con los datos reales del PLC.
  - Pantallas: Inicio, Cámara C4 y C5, Historial (las 3 pestañas), Más, Reporte, Avisos, Estado y Entrar.
  - Revisar que no haya scroll horizontal y que no aparezcan `undefined` ni `NaN`.
- [ ] **Step 3:** Corregir lo que aparezca. Commit: "Portal: ajustes visuales".
