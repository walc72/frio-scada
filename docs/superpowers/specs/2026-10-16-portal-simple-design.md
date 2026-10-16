# Portal para usuarios no técnicos — diseño

Fecha: 2026-10-16. Repo: frio-scada (`frontend-react`, más dos endpoints chicos en `nodered/weg-api`).

## 1. Objetivo

Que el encargado de planta, los operarios, la gerencia y mantenimiento entiendan el portal sin conocimientos técnicos. Al abrirlo, la primera pantalla contesta "¿está todo bien?". Cada pantalla habla en frases, con íconos grandes y los colores del HMI de planta. Lo técnico queda guardado detrás de "Ver detalles".

Criterio de éxito: alguien que nunca vio el HMI mira el celular y dice qué cámara está enfriando o descongelando, cuándo es el próximo descongelado y si hay que hacer algo, sin preguntar.

Fuera de alcance:
- cambios en el poller, el PLC o el mapa Modbus;
- temperaturas (subproyecto 1, en espera de los datos de los Full Gauge);
- una vista "técnica" paralela.

## 2. Enfoque

Se rediseña el frontend actual en el lugar. Se mantienen:
- las stores (`camaras`, `auth`, `config`) y la conexión en vivo (`frio/estado` + `frio/latido`);
- `lib/api.ts`, las rutas protegidas y el export a Excel;
- la frescura (`recepcionFresca`, `estaVencido`).

Se reemplazan las vistas y los componentes visuales. No se agregan dependencias: los íconos son SVG propios, en un solo archivo.

## 3. Piezas nuevas

### 3.1 Íconos (`src/components/Icono.tsx`)

`<Icono nombre="frio|descongelando|escurriendo|alarma|manual|apagado|…" />`. Son SVG de línea dibujados con `currentColor`:
- **frío:** el copo de 6 brazos con ramitas (opción A elegida);
- **descongelando:** las ondas de calor;
- **escurriendo:** dos gotas;
- **alarma:** el triángulo;
- **manual:** la mano;
- **apagado:** la pausa.

El estado de un equipo se muestra como un **botón lleno con el color del HMI** y el ícono en blanco:

| Estado | Color |
|---|---|
| FRIO | `#1E6FD9` |
| DESCONGELANDO | `#F28C28` |
| ESCURRIENDO | `#4FC3F7` |
| ALARMA RES | `#D32F2F` |
| MANUAL | `#7E57C2` |
| DESHABILITADO / DETENIDO | `#9A9A9A` |

### 3.2 Traductor de estado (`src/lib/frases.ts`)

Son funciones puras y llevan tests de vitest.
- `estadoEquipo(estado, c, g) → {clave, texto, color, icono}`: por ejemplo "Enfriando", "Descongelando".
- `fraseCamara(estado, c, ahora) → {titulo, detalle}`. Ejemplos:
  - "4 equipos descongelando, terminan en 6 min" / "Después vuelven a frío · próximo: 10:00";
  - "Los 8 equipos enfriando" / "Próximo descongelado: hoy 12:00".
- `faltanMin(estado, c)`: minutos restantes de la etapa en curso, calculados como la duración de la etapa en curso (`Hh.etapaE_min`) menos `Cx.min_descongelado`. Si no se puede calcular, la frase pasa a "descongelando desde HH:MM", sin inventar un número.
- `semaforo(estado, fresco, mapa) → {nivel: 'ok'|'atencion'|'alarma'|'sin-datos', titulo, detalle}`:
  - **ok:** "Todo funcionando bien";
  - **alarma:** "Cámara 5: el equipo 3 necesita atención", más qué pasa y qué hacer. Toma la primera alarma por prioridad: comunicación, mapa incompatible, alarmas del PLC;
  - **sin-datos:** "Sin datos desde HH:MM";
  - **mapa incompatible:** "El PLC tiene un programa viejo".
- `textoAlarma(clave)`: texto en palabras para cada flag del mapa. Reutiliza los textos de `alertasCamaras.js`, pero sin códigos; por ejemplo "resistencia en manual hace 95 min". Cada texto lleva al lado una acción sugerida cuando la hay, por ejemplo "pasarlo a automático desde el panel".
- Badges del historial de descongelados:

| Badge | Condición |
|---|---|
| completo | sin ninguna de las de abajo |
| cortado a mano | `cortados` no vacío |
| saltado | `saltado` |
| no se hizo | `noEjecutada` |
| sin datos | `interrumpida` |

  Cada badge lleva un motivo en palabras.

### 3.3 Navegación

- **Celular:** una barra abajo con Inicio, Cámaras, Historial y Más.
- **PC:** el mismo menú a la izquierda.
- **Rutas:**

| Ruta | Pantalla |
|---|---|
| `/` | Inicio |
| `/camara/:c` | Cámara |
| `/historial/:pestaña?` (`descongelados` · `avisos` · `compresores`) | Historial |
| `/mas` | Más |
| `/reportes` | Reporte diario |
| `/avisos` | Avisos |
| `/sistema` | Estado del sistema |
| `/usuarios` | Usuarios |
| `/config` | Configuración avanzada |

- Las rutas viejas (`/descongelados`, `/compresores`, `/eventos`) redirigen a la pestaña que corresponde.

## 4. Pantallas

1. **Inicio:**
   - el semáforo y "Actualizado hace N s";
   - una tarjeta por cámara, con los 8 botones de equipo (1–8), la frase y el próximo descongelado. Si la cámara tiene una alarma, la tarjeta queda con borde rojo;
   - la franja "Hoy": descongelados hechos (de `/api/camaras/descongelados` del día), alarmas activas y compresores en marcha (`n/16`, en vivo).
   - En la PC, las dos cámaras van lado a lado.
2. **Cámara:**
   - el título, el modo (Automático, Manual o Detenido) y el badge de estado;
   - **Equipos:** por equipo, el botón, "Equipo N · estado · faltan X min" y tres etiquetas: Compresor, Evaporador y Resistencia, encendidas cuando esa parte está prendida;
   - **Descongelados de hoy:** una línea de 00 a 24 h con los 4 horarios y la marca de "ahora", más una lista en frases: hecho ✓, en curso, próximo ⏰ y pendiente. Indica qué equipos van en cada etapa: impares, pares o el orden configurado;
   - **Qué hizo cada equipo hoy:** barras nativas por equipo, azul enfriando y naranja descongelando, de 00:00 a ahora. Los huecos sin datos van en gris;
   - **Últimos avisos:** en frases;
   - **Ver detalles técnicos** (plegado): horas de marcha, arranques, horas sin descongelar y los tiempos de etapa.
3. **Historial**, con tres pestañas, chips de fecha (Hoy, Ayer, 7 días, Elegir fecha), el filtro de cámara y "Descargar en Excel":
   - **Descongelados:** la lista con sus badges y el motivo;
   - **Avisos:** la lista con un punto de color (rojo alarma, naranja se cortó, verde se resolvió, azul acción de un operario) y "sigue activo";
   - **Compresores:** para mantenimiento. Muestra horas en marcha y arranques por equipo, con una barra, y ⚠️ "arranca demasiado seguido" cuando `maxArranquesHora` pasa de un umbral, que es una constante en `frases.ts`.
4. **Más**, en forma de lista: Reporte diario, Avisos por Telegram y mail, Usuarios (solo admin), Estado del sistema y Configuración avanzada (solo admin). Grafana queda como un enlace "Gráficos de largo plazo" dentro de Configuración avanzada.
5. **Reporte diario:**
   - el resumen de ayer en tres líneas;
   - "Descargar Excel de ayer";
   - "Elegir otro día";
   - la nota "se manda por mail a las 07:00".
6. **Avisos:**
   - a dónde llegan los avisos (Telegram y mail);
   - los botones **"Mandar un aviso de prueba"** y **"Mandar un mail de prueba"**;
   - qué avisa el sistema y cada cuánto, explicado en palabras.
7. **Estado del sistema:** un semáforo por cada parte:
   - comunicación con el PLC;
   - programa del PLC (versión de mapa y de programa);
   - reloj del PLC;
   - guardado del historial;
   - Telegram;
   - mail;
   - copia de seguridad (la última);
   - los cortes de comunicación de los últimos 7 días.
8. **Entrar:**
   - el logo TE, "Cámaras de frío · Unifrisa";
   - usuario y contraseña;
   - un botón grande.

Estados "sin datos": cuando no hay datos frescos, los botones de equipo quedan en gris y la frase dice "Sin datos desde HH:MM". Nunca se muestra un estado viejo como si fuera actual.

## 5. API (weg-api)

1. `GET /api/camaras/tramos?desde&hasta&camara` → `[{grupo, inicio, fin, estado}]`, donde `estado` es `frio`, `descongelando` o `sin-datos`.
   - Los tramos se calculan desde los cambios de `estado` (campo `estado` de cada grupo) y desde los huecos de comunicación, igual que `parseCompresores`: un hueco de más de 15 min sin latido da un tramo `sin-datos`.
   - Usa la misma validación de `desde`/`hasta`/`camara` que el resto de `/api/camaras`.
2. `POST /api/avisos/prueba {canal: 'telegram'|'mail'}`, solo admin.
   - Manda "✅ Aviso de prueba de frio-scada (HH:MM)" por ese canal.
   - Devuelve `{ok, error?}` con un mensaje legible.
   - Tiene un límite de 1 por minuto.
3. `GET /api/sistema/resumen`: junta lo que ya existe (estado de comunicación, versión del mapa, desvío de reloj, la última escritura en Influx, si Telegram y SMTP están configurados, la última copia y los cortes de 7 días) en un solo objeto para la pantalla de Estado del sistema. Si un dato no existe todavía, va `null` y la pantalla muestra "sin datos".

## 6. Pruebas

- **vitest:**
  - `frases.ts`: cada estado de equipo, la frase de cámara con y sin `faltanMin`, el semáforo con cada nivel, los badges de descongelado y la frase de "sin datos";
  - el cálculo de los minutos que faltan cuando no hay datos de la etapa: no inventa números.
- **node:test en weg-api:**
  - `/tramos`: los huecos dan `sin-datos`, el corte a medianoche y la validación;
  - `/avisos/prueba`: rechaza a quien no es admin, aplica el límite y devuelve el error legible si el canal falla.
- **Visual:**
  - capturas en 375 px (celular) y 1280 px (PC) de cada pantalla, contra el stack de WSL con el PLC real;
  - revisar el modo oscuro.

## 7. Decisiones tomadas

- **Íconos:** botones llenos con los colores del HMI (C) y copo con ramitas (A). Las partes del equipo se llaman Compresor, Evaporador y Resistencia.
- **Inicio:** fusiona semáforo, dibujo de los equipos y resumen del día.
- **Historial:** un solo lugar con tres pestañas.
- **Gráfico "qué hizo cada equipo":** se dibuja nativo en el portal. Grafana queda para los períodos largos.
- **Se incluye** el botón de aviso de prueba.
