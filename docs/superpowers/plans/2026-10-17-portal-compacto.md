# Portal compacto — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dejar todo el portal más compacto, convertir la página de Cámara en un tablero con un trend de verdad y separar las alarmas de los eventos.

**Architecture:** solo cambia el frontend (`frontend-react/`). Toda la lógica nueva va en funciones puras con tests de vitest:
- `lib/trend.ts` arma el detalle del instante bajo el cursor;
- `lib/alarmas.ts` calcula desde cuándo está activa una alarma y arma los pares inicio/fin.

Los componentes nuevos son tontos: dibujan lo que esas funciones devuelven. No hay endpoints nuevos.

**Tech Stack:** React 18 + TS, Tailwind, componentes `ui/` estilo shadcn, vitest. El trend se dibuja en SVG a mano, sin librerías nuevas (recharts ya está instalado, pero no se usa para esto).

**Spec:** `docs/superpowers/specs/2026-10-17-portal-compacto-design.md`

## Global Constraints

- Letra base: `html { font-size: 14px }`. Los títulos de página van en 18 px (`text-lg` = 1.125rem ≈ 15.75 px no alcanza: usar `text-[18px]`).
- Tarjetas: `p-3`, separación `space-y-3` / `gap-3` y esquinas `rounded-xl`. No queda ningún `rounded-2xl` ni `p-4` en tarjetas.
- El contenedor principal llega a `max-w-[1440px]`, centrado.
- **Toque:** por debajo de 768 px, todo control que manda algo mide como mínimo **44 px reales**. Con la base en 14 px, `h-11` da 38,5 px, así que se usa la clase utilitaria `toque` (Task 1), definida en px y nunca en rem. En PC el mínimo es 36 px.
- Textos en castellano rioplatense ("vos"). Las horas van "HH:MM" en hora de planta (offset fijo `PLANTA_OFFSET`). Las horas de marcha llevan una decimal y coma: "47,3 h".
- Las etapas del PLC vienen como 0/1 en `FilaDescongelado.etapa` y se muestran como 1/2.
- Los estados de color se toman de `colorEstadoGrupo` / `COLOR_TRAMO`, que ya existen. No se inventan colores.
- No se toca el backend ni el PLC.
- Cada task termina con `npx vitest run`, `npx tsc -b` (exit 0) y `npm run build` en `frontend-react/`.
- Commits con `git add` de archivos concretos. El mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Se trabaja en la rama `feature/portal-compacto` y no se hace push.

## Review Focus

1. **Tarjeta del trend cerca del borde derecho, o en un celular de 320 px:** se da vuelta o se acomoda para no salir de la pantalla, y nunca corta texto. Test en Task 3: `posicionTarjeta`.
2. **Instante justo en el borde entre dos tramos, o con un equipo sin datos:** la tarjeta dice "sin datos" para ese equipo y no inventa un estado. Test en Task 2.
3. **Alarma activa sin evento de aparición hoy** (porque apareció ayer): dice "desde antes de hoy" y no rompe. Test en Task 4.
4. **Alarma que aparece, se resuelve y vuelve a aparecer el mismo día:** "desde" es la última aparición, y los pares inicio/fin son dos. Test en Task 4.
5. **Botones de maniobra en el celular:** después de bajar la letra siguen midiendo 44 px. El chequeo va en la verificación de la Task 7.

---

### Task 1: Base compacta en todo el portal

**Files:**
- Modify: `frontend-react/src/index.css` (base `html`, clase `toque`).
- Modify: `frontend-react/src/App.tsx:131` (contenedor `main`).
- Modify: `frontend-react/src/components/ui/card.tsx`, `ui/button.tsx`, `ui/dialog.tsx` (rellenos por defecto).
- Modify: todas las vistas y componentes con `rounded-2xl`, `p-4` en tarjetas, `space-y-4`, `h-12` o `text-xl`. Hoy son: `views/General.tsx`, `Historial.tsx`, `Reportes.tsx`, `Sistema.tsx`, `Avisos.tsx`, `Usuarios.tsx`, `Programacion.tsx`, `Mas.tsx` y `Login.tsx`, y `components/HojaEquipo.tsx`, `Confirmar.tsx`, `AvisoArranque.tsx`, `Navegacion.tsx`, `ResumenHoy.tsx` y `Semaforo.tsx`. **No** se tocan `views/Camara.tsx`, `LineaDescongelados.tsx` ni `BarrasEquipos.tsx`: los rehacen las Tasks 3 y 5.

**Interfaces:**
- Produces:
  - la clase CSS `toque` = `min-height: 44px` por debajo de 768 px y `min-height: 36px` desde 768 px, definida en `@layer components` en px;
  - el contenedor `main` envuelve su contenido en `mx-auto w-full max-w-[1440px]`.

- [ ] **Step 1:** En `index.css`, poner `html { font-size: 14px; }` dentro de `@layer base` y definir `.toque` como se indica arriba.
- [ ] **Step 2:** En `App.tsx`, el contenido de `<main>` pasa a ir dentro de `<div className="mx-auto w-full max-w-[1440px]">`.
- [ ] **Step 3:** Hacer el barrido de clases en los archivos listados:
  - `rounded-2xl` pasa a `rounded-xl`;
  - `p-4` de tarjetas pasa a `p-3`;
  - `space-y-4` / `gap-4` pasan a `space-y-3` / `gap-3`;
  - los títulos de página `text-xl` pasan a `text-[18px]`;
  - los botones `h-12 …` de maniobra, confirmar y navegación pasan a `toque h-auto py-2`.
- [ ] **Step 4:** Ejecutar `rg -n "rounded-2xl|h-12\b" frontend-react/src --glob '!views/Camara.tsx' --glob '!components/LineaDescongelados.tsx' --glob '!components/BarrasEquipos.tsx'`. Esperado: sin resultados.
- [ ] **Step 5:** Ejecutar `npx vitest run`, `npx tsc -b` y `npm run build`. Esperado: 143 tests passed, exit 0 y build OK.
- [ ] **Step 6:** Commit con el mensaje "Portal: base compacta (14 px, tarjetas y botones más chicos, ancho de PC)".

### Task 2: Detalle del instante del trend (lógica pura)

**Files:**
- Create: `frontend-react/src/lib/trend.ts`.
- Test: `frontend-react/src/lib/trend.test.ts`.

**Interfaces:**
- Consumes:
  - `Tramo` de `lib/paginaCamara.ts`: `{camara, grupo:'G1'..'G8', inicio:number, fin:number, estado:EstadoTramo}`;
  - `FilaDescongelado` de `lib/camaras.ts`: una fila por etapa, `etapa` 0/1;
  - `hhmm` de `lib/camaras.ts`.
- Produces:
  - `type EstadoInstante = 'enfriando' | 'descongelando' | 'apagado' | 'sin datos'`;
  - `estadoEn(tramos: Tramo[], grupo: number, ts: number): EstadoInstante`. Mapea `frio` a 'enfriando', `descongelando` a 'descongelando', `apagado` a 'apagado', y `sin-datos` o la falta de tramo a 'sin datos'. El intervalo de un tramo es `[inicio, fin)`.
  - `interface DescongeladoEnCurso { horario: number; inicio: number; etapa: 1 | 2; llevaMin: number; faltaMin: number | null; finEtapa: number | null }`;
  - `descongeladoEn(filas: FilaDescongelado[], camara: string, ts: number, minutosPlan?: number): DescongeladoEnCurso | null`. Busca la fila de esa cámara con `inicio <= ts < (fin ?? +∞)`. Devuelve:
    - `horario`: el número del horario (de "H2" sale 2);
    - `inicio`: el `inicio` de la etapa 0 del mismo horario y la misma corrida, o el de la propia fila si no la hay;
    - `etapa`: `fila.etapa + 1`;
    - `llevaMin`: `round((ts - inicio)/60000)`;
    - `faltaMin`: `minutosPlan - llevaMin` si viene `minutosPlan`; si no, null;
    - `finEtapa`: el `fin` de la fila.
  - `interface DetalleInstante { ts: number; hora: string; equipos: { grupo: number; estado: EstadoInstante }[]; descongelado: DescongeladoEnCurso | null; resumen: string }`;
  - `detalleEnInstante(tramos: Tramo[], filas: FilaDescongelado[], camara: string, ts: number, minutosPlan?: number): DetalleInstante`. El `resumen` sale así:
    - "Los 8 equipos enfriando" si los 8 están enfriando;
    - "Sin datos" si los 8 están sin datos;
    - si no, "Descongelando: equipos 2, 4" (los que estén descongelando), y si hay otros estados se agrega " · apagados: 1".

- [ ] **Step 1: Escribir `trend.test.ts`.**

```ts
const T0 = Date.parse('2026-10-17T10:00:00-03:00')
const m = (min: number) => T0 + min * 60000
const tramos: Tramo[] = [
  ...[1,3,5,7].flatMap(g => [{camara:'C5',grupo:`G${g}`,inicio:m(-600),fin:m(0),estado:'frio'},{camara:'C5',grupo:`G${g}`,inicio:m(0),fin:m(6),estado:'descongelando'},{camara:'C5',grupo:`G${g}`,inicio:m(6),fin:m(600),estado:'frio'}]),
  ...[2,4,6].flatMap(g => [{camara:'C5',grupo:`G${g}`,inicio:m(-600),fin:m(6),estado:'frio'},{camara:'C5',grupo:`G${g}`,inicio:m(6),fin:m(16),estado:'descongelando'},{camara:'C5',grupo:`G${g}`,inicio:m(16),fin:m(600),estado:'frio'}]),
  {camara:'C5',grupo:'G8',inicio:m(-600),fin:m(600),estado:'sin-datos'},
]
const filas: FilaDescongelado[] = [
  {camara:'C5',horario:'H2',etapa:0,grupos:'G1G3G5G7',inicio:m(0),fin:m(6),duracionS:360,cortados:'',saltado:false,noEjecutada:false},
  {camara:'C5',horario:'H2',etapa:1,grupos:'G2G4G6G8',inicio:m(6),fin:m(16),duracionS:600,cortados:'',saltado:false,noEjecutada:false},
]
test('dentro de la etapa 1: impares descongelando, lleva y falta', () => {
  const d = detalleEnInstante(tramos, filas, 'C5', m(3), 16)
  expect(d.hora).toBe('10:03')
  expect(d.descongelado).toMatchObject({ horario: 2, etapa: 1, llevaMin: 3, faltaMin: 13 })
  expect(d.equipos.find(e => e.grupo === 1)!.estado).toBe('descongelando')
  expect(d.equipos.find(e => e.grupo === 2)!.estado).toBe('enfriando')
})
test('dentro de la etapa 2: el inicio es el de la etapa 1 de la misma corrida', () => {
  const d = detalleEnInstante(tramos, filas, 'C5', m(10), 16)
  expect(d.descongelado).toMatchObject({ etapa: 2, inicio: m(0), llevaMin: 10, faltaMin: 6 })
})
test('fuera de descongelado: resumen y sin bloque de descongelado', () => {
  const d = detalleEnInstante(tramos, filas, 'C5', m(30))
  expect(d.descongelado).toBeNull()
  expect(d.resumen).toBe('7 equipos enfriando · sin datos: 8')
})
test('equipo sin datos se informa como sin datos', () => {
  expect(estadoEn(tramos, 8, m(3))).toBe('sin datos')
  expect(estadoEn(tramos, 1, m(-700))).toBe('sin datos')   // antes del primer tramo
})
test('borde exacto: el instante fin de un tramo pertenece al siguiente', () => {
  expect(estadoEn(tramos, 1, m(6))).toBe('enfriando')
  expect(estadoEn(tramos, 2, m(6))).toBe('descongelando')
})
test('resumen con los 8 enfriando', () => {
  const todos = [1,2,3,4,5,6,7,8].map(g => ({ camara:'C5', grupo:`G${g}`, inicio:m(-10), fin:m(10), estado:'frio' as const }))
  expect(detalleEnInstante(todos, [], 'C5', m(0)).resumen).toBe('Los 8 equipos enfriando')
})
```

  Formato del `resumen` cuando nadie descongela: "N equipos enfriando", y después " · sin datos: …" / " · apagados: …" con los números de equipo.
- [ ] **Step 2:** Ejecutar `npx vitest run src/lib/trend.test.ts`. Esperado: FAIL (`trend.ts` todavía no existe).
- [ ] **Step 3:** Implementar `lib/trend.ts` con las firmas de arriba.
- [ ] **Step 4:** Ejecutar `npx vitest run`. Esperado: todos pasan.
- [ ] **Step 5:** Commit con el mensaje "Portal: detalle del instante para el trend".

### Task 3: Componente `TrendEquipos`

**Files:**
- Create: `frontend-react/src/components/TrendEquipos.tsx`.
- Modify: `frontend-react/src/lib/trend.ts` (agrega `posicionTarjeta`) y `trend.test.ts`.

**Interfaces:**
- Consumes: `detalleEnInstante` (Task 2), `COLOR_TRAMO`, `TEXTO_TRAMO` y `pct` de `paginaCamara.ts`, y `HorarioVista` (`horariosVista`).
- Produces:
  - `posicionTarjeta(cursorX: number, anchoTarjeta: number, anchoContenedor: number, margen = 12): number`. Devuelve el `left` en px: a la derecha del cursor si entra; si no, a la izquierda (`cursorX - margen - anchoTarjeta`); y en ningún caso menor que 0 ni mayor que `anchoContenedor - anchoTarjeta`.
  - `<TrendEquipos tramos={Tramo[] | null} filas={FilaDescongelado[] | null} horarios={HorarioVista[]} camara={string} dia0={number} ahora={number} minutosPlan={(horario:number)=>number|undefined} error={boolean} />`.

- [ ] **Step 1:** Agregar tests de `posicionTarjeta` en `trend.test.ts`:
  - `posicionTarjeta(100, 240, 800)` es 112;
  - `posicionTarjeta(700, 240, 800)` es 448;
  - `posicionTarjeta(150, 240, 300)` es 0 (no entra a ningún lado: se pega al borde izquierdo);
  - `posicionTarjeta(290, 240, 300)` es 38.
- [ ] **Step 2:** Ejecutar los tests y verificar que fallan. Después implementar `posicionTarjeta` y verificar que pasan.
- [ ] **Step 3: Implementar `TrendEquipos.tsx`.** Es un SVG con `viewBox` de ancho 1000, `width:100%` y `height:auto`.
  - Ejes y filas:
    - El eje va de `dia0` a `dia0 + 24 h`.
    - Hay una fila por equipo de 14 unidades de alto, con el rótulo "Equipo N" a la izquierda, en un margen de 64.
    - Hay grilla por hora. Los rótulos van cada 2 h, y cada 4 h si el contenedor mide menos de 480 px (medido con `ResizeObserver`).
  - Tramos y marcas:
    - Los tramos van con `COLOR_TRAMO`. "Sin datos" va rayado, con el `HACHURA` de `BarrasEquipos`.
    - Por cada horario de `horarios`, un "▼ HH:MM" verde (`#047857`) arriba.
    - La línea roja de "ahora" lleva el rótulo "ahora".
  - Cursor y tarjeta:
    - Con `pointermove` (mouse y táctil, con `touch-action: pan-y` en el SVG), una línea punteada en el x del cursor y la tarjeta posicionada con `posicionTarjeta`.
    - Después de `ahora`, o con `pointerleave`, no se muestra nada.
    - La tarjeta es un `div` absoluto con `width: max-content` y `max-width: min(320px, 100%)`, de fondo `bg-popover`, y muestra el `DetalleInstante`:
      - la hora en `text-[18px] font-bold`, y debajo "Cámara N · hoy";
      - si hay descongelado, un recuadro naranja con "Descongelado n (HH:MM) · etapa e de 2". Si `ts` está en curso ahora, "lleva X min · faltan Y min" (o solo "lleva X min" si `faltaMin` es null). Si es pasado, "de HH:MM a HH:MM";
      - si no, el `resumen` en verde cuando son "Los 8 equipos enfriando";
      - una grilla de 2 columnas con un punto de color y "Equipo N: estado". "descongelando" va en negrita naranja.
  - Debajo del gráfico, la leyenda de 4 colores.
  - Con `error`: "No se pudo cargar el gráfico". Con `!tramos`: "Cargando…".
- [ ] **Step 4:** Ejecutar `npx vitest run`, `npx tsc -b` y `npm run build`. Esperado: todo pasa.
- [ ] **Step 5:** Commit con el mensaje "Portal: trend de equipos con eje de horas y tarjeta de detalle".

### Task 4: Alarmas: desde cuándo y pares inicio/fin

**Files:**
- Modify: `frontend-react/src/lib/frases.ts` (exporta `claveAlarmaDeEvento`).
- Create: `frontend-react/src/lib/alarmas.ts`.
- Test: `frontend-react/src/lib/alarmas.test.ts`.

**Interfaces:**
- Consumes:
  - `alarmasActivas(e, c?)`, `textoAlarma(clave)` y la tabla `EVENTOS` con su `flag` (en `frases.ts`);
  - `Evento = { ts: number; texto: string; estado: number | string; maniobra?: boolean }` (la forma de `/api/camaras/eventos`).
- Produces:
  - En `frases.ts`: `claveAlarmaDeEvento(texto: string): string | null`. Devuelve la misma clave que usa `alarmasActivas` (por ejemplo, "C5 G4 SIN DESCONGELAR" da `"C5.G4.alarma_sin_desc"`), o null si el texto no es una alarma con flag. Reusa `buscarEvento` y `row.flag`.
  - En `alarmas.ts`:
    - `desdeAlarma(eventos: Evento[], clave: string): number | null`. Es el `ts` del último evento con `estado` 1 cuya `claveAlarmaDeEvento` coincide, siempre que no haya después uno con estado 0 de la misma clave. Si no lo hay, null.
    - `interface AlarmaActivaVista { clave: string; titulo: string; accion?: string; desde: number | null }`.
    - `alarmasActivasVista(estado: Estado, eventos: Evento[], camara?: string): AlarmaActivaVista[]`. Combina `alarmasActivas`, `textoAlarma` y `desdeAlarma`. El `titulo` es "Equipo N: texto", o "Cámara N: texto" si es de la cámara.
    - `interface PeriodoAlarma { clave: string; frase: string; inicio: number; fin: number | null; duracionMin: number | null }`.
    - `periodosAlarma(eventos: Evento[]): PeriodoAlarma[]`. Junta cada estado 1 con el siguiente estado 0 de la misma clave. Si no hay cierre, `fin` es null (sigue activa). Se ordena de la más nueva a la más vieja, y se ignoran las maniobras y los eventos sin clave.
    - `esEventoDeAlarma(e: Evento): boolean`. Devuelve `claveAlarmaDeEvento(e.texto) !== null`.

- [ ] **Step 1: Escribir `alarmas.test.ts`.**

```ts
const t = (hm: string) => Date.parse(`2026-10-17T${hm}:00-03:00`)
const ev = [
  { ts: t('09:00'), texto: 'C5 G4 SIN DESCONGELAR', estado: 1 },
  { ts: t('10:00'), texto: 'C5 G4 SIN DESCONGELAR', estado: 0 },
  { ts: t('14:20'), texto: 'C5 G4 SIN DESCONGELAR', estado: 1 },
  { ts: t('15:00'), texto: 'C5 MODO AUTOMATICO', estado: 1 },
  { ts: t('15:02'), texto: 'admin: C5 equipo 1: pasar a automático', estado: 1, maniobra: true },
]
test('clave de un evento de alarma', () => {
  expect(claveAlarmaDeEvento('C5 G4 SIN DESCONGELAR')).toBe('C5.G4.alarma_sin_desc')
  expect(claveAlarmaDeEvento('C5 MODO AUTOMATICO')).toBeNull()
})
test('desde = la última aparición sin cierre posterior', () => {
  expect(desdeAlarma(ev, 'C5.G4.alarma_sin_desc')).toBe(t('14:20'))
})
test('sin evento de hoy → null ("desde antes de hoy")', () => {
  expect(desdeAlarma(ev, 'C5.G1.alarma_res')).toBeNull()
})
test('aparece, se resuelve y vuelve: dos períodos, el último sigue activo', () => {
  const p = periodosAlarma(ev)
  expect(p).toHaveLength(2)
  expect(p[0]).toMatchObject({ inicio: t('14:20'), fin: null, duracionMin: null })
  expect(p[1]).toMatchObject({ inicio: t('09:00'), fin: t('10:00'), duracionMin: 60 })
})
test('las maniobras y los cambios de modo no son eventos de alarma', () => {
  expect(ev.filter(esEventoDeAlarma)).toHaveLength(3)
})
test('vista de activas con desde', () => {
  const estado = { 'C5.G4.alarma_sin_desc': 1 } as Estado
  const a = alarmasActivasVista(estado, ev, 'C5')
  expect(a).toHaveLength(1)
  expect(a[0]).toMatchObject({ clave: 'C5.G4.alarma_sin_desc', desde: t('14:20') })
  expect(a[0].titulo).toMatch(/^Equipo 4: /)
})
```

  Antes de fijar las claves, verificá en `alarmasActivas` cómo se llama el flag "sin descongelar". Si es otro (por ejemplo `alarma_sin_desc` frente a otro nombre), usá el real en los tests y anotalo en el informe.
- [ ] **Step 2:** Ejecutar los tests y verificar que fallan.
- [ ] **Step 3:** Implementar. Correr los tests y verificar que pasan, incluidos los 143 anteriores.
- [ ] **Step 4:** Commit con el mensaje "Portal: alarmas activas con desde y períodos de alarma".

### Task 5: Página de Cámara como tablero

**Files:**
- Create:
  - `frontend-react/src/components/TablaEquipos.tsx`;
  - `frontend-react/src/components/PanelAlarmas.tsx`;
  - `frontend-react/src/components/TablaHorarios.tsx`;
  - `frontend-react/src/components/EventosHoy.tsx`.
- Modify: `frontend-react/src/views/Camara.tsx` (se reescribe el cuerpo).
- Delete: `frontend-react/src/components/LineaDescongelados.tsx` y `BarrasEquipos.tsx`. Mover `HACHURA` a `paginaCamara.ts` si `TrendEquipos` lo importaba de ahí.

**Interfaces:**
- Consumes:
  - `TrendEquipos` (Task 3);
  - `alarmasActivasVista` (Task 4);
  - `horariosVista` y `repartoTexto` (`paginaCamara.ts`);
  - `estadoEquipo` y `faltanMin` (`frases.ts`);
  - `BotonEquipo`, `HojaEquipo`, `useMando`, `usePermiso` (el "Saltar" usa el comando 5, igual que en `LineaDescongelados`) y `fraseEvento` / `textoManiobra`.
- Produces: los componentes, cada uno con props `{ estado, cam, … }`. Son de presentación y no tienen lógica propia más allá de formatear.

- [ ] **Step 1: Layout de `Camara.tsx`**, en este orden:
  1. pestañas C4 / C5;
  2. encabezado de una línea: nombre, modo, insignia de estado y "Próximo descongelado HH:MM" o "faltan N min";
  3. `div.grid.gap-3.lg:grid-cols-[1.6fr_1fr]` con `TablaEquipos` a la izquierda, y `PanelAlarmas` y `TablaHorarios` apilados a la derecha;
  4. `TrendEquipos` a todo el ancho;
  5. `EventosHoy`.

  Se mantienen los estados de "sin datos" y "programa viejo" que ya maneja la página.
- [ ] **Step 2: `TablaEquipos`.**
  - Desde `md` es una `<table>` con estas columnas:

    | Eq. | Estado | Salidas | Arranques | Horas de marcha | Sin descongelar | |
    |---|---|---|---|---|---|---|

    - El estado va con un punto de color.
    - Las salidas son chips C / E / R: verde si está prendido; la R va naranja si `res` es 1 y el equipo está descongelando; gris si está apagado.
    - Las horas se formatean con `horasTxt` de `lib/historial.ts`.
    - La última columna es el botón "Cambiar…", que respeta los permisos con `usePermiso(1)` igual que hoy.
  - Por debajo de `md`, cada equipo ocupa dos renglones dentro de un `div`, sin `table`, para que no haya scroll horizontal.
  - Con el equipo descongelando, se agrega " · faltan N min" al estado.
- [ ] **Step 3: `PanelAlarmas`.**
  - Con alarmas: recuadro rojo con el título "Alarmas activas (N)" y una línea por alarma: `titulo`, `· accion` si la hay, y "desde HH:MM", o "desde antes de hoy" si `desde` es null.
  - Sin alarmas: recuadro verde "Sin alarmas".
  - Sin datos frescos: gris "Sin datos del PLC".
- [ ] **Step 4: `TablaHorarios`.**
  - Columnas:

    | # | Hora | Etapa 1 | Etapa 2 | Hoy |
    |---|---|---|---|---|

    - Las etapas muestran "N min", o "—" si están deshabilitadas.
    - "Hoy" toma el `estado` de `horariosVista`, con los mismos íconos y colores que hoy usa `LineaDescongelados`.
  - Debajo va `repartoTexto` del horario siguiente o del que está en curso.
  - El horario "en curso" muestra el botón "Saltar" con `useMando` y la clase `toque`, deshabilitado con el motivo según `usePermiso(5)`.
- [ ] **Step 5: `EventosHoy`.**
  - Muestra los últimos 10 eventos de hoy de la cámara: hora, el ícono de mano si es maniobra y la frase.
  - Termina con el enlace "Ver todos", que lleva a `/historial/eventos`.
- [ ] **Step 6:** Correr `npx vitest run`, `npx tsc -b` y `npm run build`, y verificar que pasan. Ejecutar `rg -n "LineaDescongelados|BarrasEquipos" frontend-react/src`. Esperado: sin resultados.
- [ ] **Step 7:** Commit con el mensaje "Portal: Cámara como tablero (equipos, alarmas, horarios, trend y eventos)".

### Task 6: Historial con Alarmas y Eventos, e Inicio con alarmas

**Files:**
- Modify:
  - `frontend-react/src/views/Historial.tsx`;
  - `frontend-react/src/lib/historial.ts` (filas de exportación);
  - `frontend-react/src/lib/rutas.ts`;
  - `frontend-react/src/App.tsx` (redirección);
  - `frontend-react/src/views/General.tsx` (Inicio).
- Test: `frontend-react/src/lib/historial.test.ts`.

**Interfaces:**
- Consumes: `periodosAlarma`, `esEventoDeAlarma` y `alarmasActivasVista` (Task 4), y `prepararAvisos` (que ya existe).
- Produces:
  - Pestañas `PESTANAS = descongelados · alarmas · eventos · compresores`, con los labels "Descongelados", "Alarmas", "Eventos" y "Compresores".
  - `filasAlarmas(p: PeriodoAlarma[])` con las columnas `{ Inicio, Fin ('sigue activa' si es null), 'Duración (min)', Alarma }`.
  - `filasEventos(a: AvisoFila[])`, que es la `filasAvisos` actual renombrada.

- [ ] **Step 1: Tests en `historial.test.ts`.**
  - `filasAlarmas` con un período abierto da `Fin: 'sigue activa'` y `'Duración (min)': ''`.
  - Con uno cerrado de 60 min da `'Duración (min)': 60`.
  - Correr los tests y verificar que fallan.
- [ ] **Step 2: Implementar las pestañas de Historial.**
  - Las dos pestañas nuevas usan la ruta de datos `eventos`.
  - **Alarmas:** arriba, las activas ahora con `alarmasActivasVista` (todas las cámaras) en un recuadro rojo, o verde "Sin alarmas activas". Debajo, la tabla de `periodosAlarma` del período elegido.
  - **Eventos:** la lista de `prepararAvisos` como hoy, con mano para las maniobras y los mismos filtros. Incluye los eventos de alarma (aparece y se resuelve).
  - El Excel de cada pestaña exporta sus propias filas.
- [ ] **Step 3: Rutas.**
  - En `rutas.ts`, `'/eventos'` pasa a apuntar a `'/historial/eventos'`.
  - En `App.tsx`, `/historial/avisos` redirige a `/historial/eventos` con `<Navigate replace>`.
  - `/avisos` (Telegram y mail) no cambia.
- [ ] **Step 4: Inicio.** Cada tarjeta de cámara de `General.tsx` muestra "N alarmas activas" en rojo cuando `alarmasActivas(estado, c).length > 0`. Con 0 no se muestra nada.
- [ ] **Step 5:** Correr `npx vitest run`, `npx tsc -b` y `npm run build`, y verificar que pasan.
- [ ] **Step 6:** Commit con el mensaje "Portal: Historial con Alarmas y Eventos separados; alarmas activas en Inicio".

### Task 7: Verificación visual en el stack de WSL (la hace el controlador)

**Files:** no se modifica nada, salvo los arreglos que salgan de esta verificación, cada uno con su propio commit.

- [ ] **Step 1:** Construir el frontend en WSL y desplegar el `dist`, siguiendo el procedimiento de siempre (el script `build_front.sh` en el scratchpad).
- [ ] **Step 2:** En el navegador, entrar con la sesión de prueba y recorrer todas las rutas a 320, 375 y 1280 px, en tema claro y en tema oscuro:
  - `/`, `/camara/C4`, `/camara/C5`;
  - `/historial/descongelados`, `/historial/alarmas`, `/historial/eventos`, `/historial/compresores`;
  - `/reportes`, `/sistema`, `/avisos`, `/usuarios`, `/programacion`, `/mas`.

  En cada ruta, verificar:
  - `document.documentElement.scrollWidth <= innerWidth`;
  - que no haya un error boundary ni "undefined" en el texto;
  - en `/camara/C5` a 320 px, que la tarjeta del trend quede dentro de la pantalla cuando el cursor está cerca de los dos bordes;
  - que los botones con clase `toque` midan 44 px o más a 375 px (`getBoundingClientRect().height`).
- [ ] **Step 3:** Corregir lo que aparezca, volver a verificar y hacer commit.
