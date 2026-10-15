# packaging/ — instalador y releases

Cómo se instala y actualiza Frío SCADA en un servidor sin compilar nada.

## Para instalar

```bash
curl -fsSL https://github.com/walc72/frio-scada/releases/latest/download/install.sh | sudo bash
```

Ver la sección *Instalación rápida* del [README principal](../README.md).

## Instalación desatendida (VM de planta)

Pendiente de correr en la aceptación en planta (VM Ubuntu limpia). Todas las preguntas tienen una variable; las de alertas pueden quedar vacías y cargarse después en Configuración. `FRIO_PLC_IP` debe ser IPv4 y `FRIO_PLC_UNIT` 0..255: un valor inválido corta la instalación.

```bash
curl -fsSL https://github.com/walc72/frio-scada/releases/latest/download/install.sh | sudo   FRIO_MODE=planta FRIO_TZ=America/Asuncion FRIO_TAILSCALE=si   FRIO_PLC_IP=192.168.3.71 FRIO_PLC_UNIT=255   FRIO_SUPERADMIN_USER=superadmin FRIO_SUPERADMIN_PASSWORD='...'   FRIO_ADMIN_USER=admin FRIO_ADMIN_PASSWORD='...'   FRIO_TELEGRAM_TOKEN='' FRIO_TELEGRAM_CHAT=''   FRIO_SMTP_HOST='' FRIO_SMTP_PORT=587 FRIO_SMTP_USER='' FRIO_SMTP_PASS='' FRIO_SMTP_TO=''   bash
sudo frio-scada status    # todos los servicios healthy
```

El token de Telegram y la clave SMTP se guardan en `/opt/frio-scada/.env` (modo 600) y llegan a `frio-api` como variables de entorno del contenedor (visibles con `docker inspect` para quien tenga acceso a Docker). El instalador no los muestra. No pueden llevar comillas simples (`'`) ni saltos de línea: el instalador lo rechaza antes de escribir nada.

## Cómo se publica un release

1. Crear y pushear un tag `vX.Y.Z` desde `main`:
   ```bash
   git tag -a v1.2.1 -m "v1.2.1 — ..." && git push origin v1.2.1
   ```
2. El workflow [`release.yml`](../.github/workflows/release.yml):
   - construye y publica las imágenes en `ghcr.io/walc72/frio-scada-<servicio>:<versión>` (y `:latest` si es estable): `api`, `poller`, `agent`, `backup`, `replica` y `frontend`, este último con el build de Vite adentro;
   - arma el paquete con `make-release.sh`;
   - sube al release `frio-scada-<versión>.tar.gz` e `install.sh`. Si el release no existe, lo crea con notas automáticas, que después se pueden editar.
3. Un tag con sufijo (`v1.3.0-rc.1`) se publica como *pre-release* y no mueve `:latest`.

También se puede correr a mano (*Actions → Release → Run workflow*): publica las imágenes con la etiqueta indicada (por ejemplo `edge`) y deja el paquete como artifact, sin tocar releases.

> Los paquetes de ghcr.io quedan públicos, como el repo (verificado en v1.2.1), así que los servidores los bajan sin credenciales. Si alguno apareciera privado, el instalador falla con *denied*. En ese caso se cambia en *Package settings → Change visibility*.

## Archivos

| Archivo | Qué es |
|---|---|
| `install.sh` | Instalador (se publica suelto en cada release). |
| `frio-scada` | Comando de administración: status, logs, update, superadmin… |
| `make-release.sh` | Arma `frio-scada-<ver>.tar.gz`: compose con imágenes publicadas (sin `build:`), configs de nginx/mosquitto/grafana, plantilla de `config.json`, `.env.example` y `frio-scada`. |
| `crear-token-grafana.sh` | (vive en `scripts/`, va en el paquete) Crea el token de solo lectura de Grafana y lo guarda en `.env`; idempotente. Lo llama `install.sh`. |
| `config.template.json` | `config.json` inicial de una planta nueva (sin equipos). |

## Grafana

Grafana no tiene puerto publicado: se ve solo dentro del portal (`/grafana/`, nginx + `auth_request`), en la red `grafana-net` compartida solo con nginx e influxdb.

- Usa un token de **solo lectura** del bucket (`INFLUXDB_GRAFANA_TOKEN`), creado por `crear-token-grafana.sh`. `install.sh` y `frio-scada update` lo corren solos (idempotente: si el token cargado ya no sirve, genera otro). A mano: `cd /opt/frio-scada && bash crear-token-grafana.sh`.
- Quien tenía sesión abierta antes del deploy tiene que volver a entrar (la cookie `frio_token` se emite en el login).
- La cookie lleva `Secure` solo si el TLS termina en nginx (X-Forwarded-Proto=https); por HTTP plano (Tailscale) va sin `Secure`.
- La línea de tiempo usa los cambios de `estado` más la `foto` de cada minuto (el valor aparece a lo sumo 1 min después del inicio del rango). Los cortes se dibujan como hueco "sin datos": cada minuto con `comunicacion.conectado=false` agrega un -1 (mapeado a transparente) a todas las series, y `insertNulls` (180 s) corta si el poller o la PC no escriben nada. Nada de eso se guarda en Influx.
- Aceptación de los huecos de maniobras (no se puede probar sin Docker; verificar en planta o en una VM):
  1. `python -m json.tool nodered/grafana/dashboards/maniobras.json` parsea.
  2. Grafana arranca sin error de provisioning (`docker compose logs grafana | grep -i maniobras`).
  3. El panel "Maniobras" muestra 24 filas (G1..G8 × comp/eva/res) de la cámara elegida, sin error de Flux (Inspect → Query; `join`, `strings` y `window/first` corren en InfluxDB 2.7).
  4. Cortar el PLC (desenchufar el cable o bloquear la IP) > 2 min y reconectar: en el corte las 24 filas quedan vacías ("sin datos" al pasar el mouse) desde ~3 s después del corte, y al volver retoman el valor real enseguida (foto inmediata al reconectar).
  5. Parar el poller (`docker compose stop modbus-poller`) > 3 min: aparece el hueco por `insertNulls`. Si Grafana 11.6 no respeta `insertNulls`/`spanNulls` en state-timeline (Panel → Field → "Disconnect values"), dejarlo anotado: el caso PLC caído igual queda cubierto por el -1.
- Chequeos de aceptación con Docker: `curl -s -o /dev/null -w '%{http_code}' http://localhost/grafana/api/health` sin sesión → 401, con cookie `frio_token` → 200; `/grafana/public/build/<archivo>.js` con sesión → 200 (comprueba el `location ^~`); `docker compose port grafana 3000` sin salida; el token de Grafana no puede escribir en Influx; el panel de Cámara carga y un `X-WEBAUTH-USER` mandado por el cliente se ignora.
- Riesgos aceptados: un usuario autenticado del portal (Viewer) puede usar Flux `http`/`sql` desde influxdb dentro de `grafana-net`; y si el navegador manda dos cookies `frio_token` duplicadas, la API valida la primera y nginx quita solo la primera (la otra llegaría a Grafana, dentro de la red interna).

## Probar sin publicar

```bash
bash packaging/make-release.sh prueba out/
# imágenes locales con el mismo nombre, p.ej.:
docker build -t ghcr.io/walc72/frio-scada-api:prueba nodered/weg-api   # (y el resto)
sudo FRIO_VERSION=prueba FRIO_PACKAGE=out/frio-scada-prueba.tar.gz bash out/install.sh
```

Si no puede bajar las imágenes pero ya están en el equipo, el instalador sigue con esas.

## Layout en el servidor (`/opt/frio-scada`)

```
.env                    claves internas, FRIO_VERSION (modo 600)
docker-compose.yml      (+ docker-compose.replica.yml en réplica, vía COMPOSE_FILE)
config/                 config.json, settings.json (usuarios, SMTP, hora del reporte)
reports/  backups/      PDFs del reporte diario y backups de InfluxDB
nginx/ mosquitto/ grafana/
```
