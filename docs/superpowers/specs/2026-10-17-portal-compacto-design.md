# Portal compacto, Cámara como tablero y alarmas separadas de eventos

Fecha: 2026-10-17. Parte del portal simple (`2026-10-16-portal-simple-design.md`) y del control remoto. Pedido del usuario después de usarlo en planta:

1. **Tamaño:** "todo le queda muy grande", en todo el portal.
2. **Alarmas:** las alarmas y los eventos van por separado.
3. **Gráfico:** la línea de descongelados y las barras por equipo no se entienden. Tienen que ser un trend con estampa de tiempo.
4. **Datos técnicos:** arranques, horas de marcha, horas sin descongelar, horarios y etapas son importantes y tienen que estar a la vista.

Se usa en PC y en celular por igual. La app nativa queda para más adelante.

Decisiones tomadas con maquetas:

| Tema | Elegido |
|---|---|
| Gráfico | Opción A: una fila por equipo, eje de horas y tarjeta de detalle al pasar el mouse o tocar. |
| Página de Cámara | Opción A: tablero, todo en una pantalla. |
| Alcance de la compactación | Todo el portal, sin excepciones. |

## 1. Densidad (todo el portal)

- **Letra:** la base baja de 16 a 14 px (`html { font-size: 14px }`, así las clases `rem` de Tailwind escalan solas). Los títulos de página quedan en 18 px.
- **Tarjetas:**
  - relleno `p-3` en lugar de `p-4`;
  - separación entre bloques `space-y-3` / `gap-3`;
  - esquinas `rounded-xl` en lugar de `rounded-2xl`.
- **Ancho:**
  - El contenedor principal llega hasta 1440 px en PC, en lugar de la columna angosta actual.
  - En pantallas `lg` (1024 px o más) las páginas usan dos columnas donde tenga sentido.
- **Toque en el celular:**
  - Por debajo de 768 px, los controles que mandan algo (botones de maniobra, confirmar, pestañas, navegación) mantienen 44 px de alto como mínimo.
  - En PC pueden bajar a 36 px.
- **Páginas afectadas:** Inicio, Cámara, Historial (Descongelados, Alarmas, Eventos, Compresores), Reportes, Sistema, Avisos por Telegram y mail, Usuarios, Programación, Más y Login. También los diálogos: HojaEquipo, Confirmar y AvisoArranque.

## 2. Página de Cámara: tablero

Orden en PC, de arriba hacia abajo y de izquierda a derecha:

1. **Encabezado, en una línea:**
   - el selector de cámara (pestañas C4 / C5);
   - el nombre y el modo;
   - el estado, como insignia de color;
   - "Próximo descongelado HH:MM", o "faltan N min" si está descongelando.
2. **Fila de dos columnas, en `lg` 1.6fr : 1fr:**
   - **Izquierda, "Equipos":** una tabla con una fila por equipo.

     | Eq. | Estado | Salidas | Arranques | Horas de marcha | Sin descongelar | |
     |---|---|---|---|---|---|---|

     - El estado va con un punto de color.
     - Las salidas son chips C / E / R: verde si está prendido, naranja la R mientras resiste, gris si está apagado.
     - Las horas van con una decimal y coma: "47,3 h".
     - La última columna es "Cambiar…" (HojaEquipo) y respeta los permisos de siempre.
     - En el celular la tabla pasa a filas compactas de dos renglones: arriba "Equipo N · estado · chips", abajo "arranques · horas · sin descongelar · Cambiar…". No hay scroll horizontal.
   - **Derecha:**
     - **"Alarmas activas":**
       - Un recuadro rojo con una línea por alarma: el texto en palabras, la acción si hay, y "desde HH:MM" (ver §4).
       - Sin alarmas, un recuadro verde "Sin alarmas".
     - **"Horarios de descongelado":** una tabla.

       | # | Hora | Etapa 1 | Etapa 2 | Hoy |
       |---|---|---|---|---|

       - "Hoy" muestra hecho ✓, en curso, próximo, sin registro, solapado o mal configurado. Es lo mismo que calcula `horariosVista`.
       - Debajo va la frase del reparto ("primero los impares, después los pares").
       - El horario en curso muestra el botón **Saltar**.
       - Las etapas deshabilitadas dicen "—".
3. **"Qué hizo cada equipo hoy":** el gráfico de §3, a todo el ancho.
4. **"Eventos de hoy":** los últimos 10 eventos de la cámara (§4), con hora y el ícono de mano para las maniobras, y un enlace "Ver todos" que lleva a Historial → Eventos.

En el celular se apila en ese mismo orden: encabezado, equipos, alarmas, horarios, gráfico y eventos.

**Se quitan:**
- las tarjetas grandes por equipo;
- `LineaDescongelados` (su contenido pasa a la tabla de horarios y al gráfico);
- `BarrasEquipos` (lo reemplaza el gráfico);
- el bloque "Ver detalles técnicos".

## 3. Gráfico "Qué hizo cada equipo hoy"

Es un componente nuevo, `TrendEquipos`, en SVG y sin librerías nuevas.

- **Filas:** una fila por equipo (8 filas de unos 14 px), con el rótulo "Equipo N" a la izquierda.
- **Eje:** de 00:00 a 24:00 del día de planta. Hay una línea de grilla por hora y el texto cada 2 h; en anchos chicos, cada 4 h.
- **Tramos:** se dibujan con los datos de `/api/camaras/tramos`. Los colores son los de hoy: enfriando azul, descongelando naranja, apagado gris y sin datos rayado. El resto del día después de "ahora" queda vacío.
- **Marcas arriba:**
  - un "▼ HH:MM" en verde por cada horario habilitado de hoy;
  - la línea roja de "ahora", con el rótulo "ahora".
- **Cursor:**
  - Con el mouse encima, o tocando y arrastrando en el celular, una línea vertical punteada sigue el cursor.
  - Fuera del rango de datos (después de "ahora") no se muestra nada.
- **Tarjeta de detalle.** Sigue al cursor y se da vuelta hacia la izquierda si no entra a la derecha. Su ancho se ajusta al contenido, de modo que nunca corte texto. Muestra:
  - la **hora exacta** en grande (HH:MM), con "Cámara N · hoy" debajo;
  - si en ese instante había un descongelado, un recuadro naranja con: "Descongelado *n* (HH:MM) · etapa *e* de 2", "lleva X min · faltan Y min";
  - si no había, "● Los 8 equipos enfriando" en verde, o el resumen que corresponda;
  - el estado de los 8 equipos en dos columnas: un punto de color y "Equipo N: enfriando / **descongelando** / apagado / sin datos".
- **Lógica pura:** lo que dice la tarjeta sale de una función pura, `detalleEnInstante(tramos, horarios, ts)`, en `lib/trend.ts`. Esa función es la que llevan los tests.

## 4. Alarmas y eventos

**Definiciones:**
- **Alarma activa:**
  - Una de `alarmasActivas(estado, c)` (los flags del PLC que ya usa el portal), mientras esté prendida en el estado vivo.
  - "Desde HH:MM" sale del último evento con estado 1 que corresponde a esa alarma, usando el mapeo `flag` de la tabla `EVENTOS` en `lib/frases.ts`.
  - Si no hay un evento hoy, dice "desde antes de hoy".
  - La función es `desdeAlarma(eventos, clave) -> number | null`.
- **Evento:**
  - Todo lo que trae `/api/camaras/eventos`: descongelados, maniobras (con `maniobra:true`), cambios de modo, acciones del operario, arranque del PLC.
  - Las alarmas también aparecen como eventos cuando aparecen y cuando se resuelven, porque es el registro de lo que pasó.

**Dónde se ve cada cosa:**
- **Cámara:** como en §2.
- **Historial:** la pestaña "Avisos" se divide en dos, y las pestañas quedan Descongelados · Alarmas · Eventos · Compresores.
  - **Alarmas:** arriba las activas ahora, con "desde". Debajo, las alarmas del período elegido, cada una con su hora de inicio, su hora de fin ("sigue activa" si no terminó) y su duración.
  - **Eventos:** la lista completa del período, con los filtros que ya existen (cámara y tipo) y la mano en las maniobras.
- **Inicio:** cada tarjeta de cámara muestra "N alarmas activas" en rojo, o nada si no hay ninguna.
- **Rutas:**
  - `/historial/avisos` y la ruta vieja `/eventos` (en `RUTAS_VIEJAS`) redirigen a `/historial/eventos`.
  - `/avisos` es otra cosa: la configuración de Telegram y mail. No cambia, salvo la compactación.
  - La exportación a Excel de la pestaña vieja se reparte entre las dos pestañas nuevas, cada una con sus columnas.

## 5. Pruebas

- **Vitest, funciones puras:**
  - `detalleEnInstante`: dentro de un descongelado, en la etapa 1 y en la etapa 2; fuera de un descongelado; un equipo sin datos; el borde exacto entre tramos.
  - `desdeAlarma`: con un evento de hoy, sin evento, y una alarma que se resolvió y volvió a aparecer.
  - Separar los avisos en alarmas y eventos, y armar los pares inicio/fin con su duración.
- **Lo que ya existe:** las 143 pruebas siguen pasando, `tsc -b` termina sin errores y `npm run build` funciona.
- **Revisión visual** en el navegador, a 320, 375 y 1280 px y en tema claro y oscuro, de todas las rutas:
  - sin desborde horizontal;
  - la tarjeta del gráfico no se corta;
  - los botones de maniobra miden 44 px en el celular.

## Fuera de alcance

- La app nativa.
- Las temperaturas de los Full Gauge (subproyecto 1, en espera).
- Cambios en el PLC.
- Endpoints nuevos: todo sale de `/estado`, `/tramos`, `/eventos` y `/descongelados`, que ya existen.
