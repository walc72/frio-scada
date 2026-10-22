# Frío SCADA

Monitoreo remoto de las cámaras frías C4/C5 de Unifrisa: PLC Schneider M241,
lectura Modbus TCP de solo lectura -> MQTT/InfluxDB, con panel web.
Instalación en servidor: ver [`packaging/README.md`](packaging/README.md).

---

## Stack

| Servicio | Descripcion |
|----------|-------------|
| **frio-api** | API REST + SSE (Node.js/Express) |
| **modbus-poller** | Lector Modbus TCP (hoy un stub que publica `frio/status`) |
| **InfluxDB** | Base de datos de series de tiempo |
| **Grafana** | Dashboards historicos |
| **Mosquitto** | Broker MQTT para alertas |
| **Nginx** | Servidor frontend + reverse proxy API |

---

## Requisitos

- Docker + Docker Compose v2
- Node.js 18+ (solo para build del frontend)
- Tailscale instalado en el host (para acceso a red industrial)

---

## Instalación rápida (recomendada)

En un servidor **Ubuntu o Debian** con internet:

```bash
curl -fsSL https://github.com/walc72/frio-scada/releases/latest/download/install.sh | sudo bash
```

El instalador:

- Instala Docker si falta, y opcionalmente Tailscale.
- Pregunta si el servidor es **planta** o **réplica de oficina**, la zona horaria y los usuarios superadmin y administrador.
- Genera las claves internas (InfluxDB, Grafana, agente) en `/opt/frio-scada/.env`.
- Baja las imágenes ya construidas del release (ghcr.io) y levanta todo.

No hace falta Node ni compilar nada.

Después se administra con el comando `frio-scada`:

```bash
sudo frio-scada status            # estado de los servicios
sudo frio-scada logs frio-api      # logs en vivo
sudo frio-scada update            # actualiza al último release (o: update v1.2.1)
sudo frio-scada superadmin        # cambia usuario/contraseña del superadmin
```

Las actualizaciones conservan los datos, el `.env` y `config/`. Antes de reemplazar archivos, guardan una copia en `/opt/frio-scada/backups/`.

Para una instalación desatendida, las respuestas se pueden pasar por variables de entorno (ver el encabezado de [`packaging/install.sh`](packaging/install.sh)).

Cómo se arma cada release: [`packaging/README.md`](packaging/README.md).

---

## Instalacion manual desde el codigo (desarrollo)

> Para servidores de producción usá la instalación rápida de arriba.

### Linux (VPS)

### 1. Clonar el repositorio

```bash
git clone https://github.com/walc72/frio-scada.git
cd frio-scada
```

### 2. Configurar variables de entorno

```bash
cp nodered/.env.example nodered/.env
```

Editar `nodered/.env`:

```env
INFLUXDB_TOKEN=tu_token_aqui
INFLUXDB_ORG=tecnoelectric
INFLUXDB_BUCKET=camaras
INFLUXDB_URL=http://influxdb:8086
MQTT_BROKER=mqtt://mosquitto:1883
```

### 3. Build del frontend

```bash
cd frontend-react
npm install
npx vite build
cd ..
```

### 4. Crear directorio de config con permisos

```bash
mkdir -p nodered/config
cp nodered/weg-modbus-poller/config.json nodered/config/config.json
chown -R 1001:65533 nodered/config/
```

### 5. Levantar el stack

```bash
cd nodered
docker compose up -d
```

### 6. Verificar

```bash
docker compose ps
```

Acceder en: `http://<ip-servidor>:9090`

---

## Instalacion en Windows (Docker Desktop)

En Windows, Docker Desktop con WSL2 tiene restricciones de permisos en bind mounts.
Se requiere una configuracion especial para que el config.json sea escribible.

### 1. Clonar el repositorio

```powershell
git clone https://github.com/walc72/frio-scada.git
cd frio-scada
```

### 2. Configurar variables de entorno

```powershell
copy nodered\.env.example nodered\.env
```

Editar `nodered\.env` con los tokens y credenciales.

### 3. Build del frontend

```powershell
cd frontend-react
npm install
npx vite build
cd ..
```

### 4. Preparar config en WSL

Docker Desktop en Windows no permite escritura en bind mounts de rutas Windows (`C:\...`).
La solucion es montar el config desde una ruta WSL:

```powershell
# Crear directorio dentro de WSL
wsl -e sh -c "mkdir -p /home/frioconfig && chmod 777 /home/frioconfig"

# Copiar config.json
type nodered\frio-poller\config.json | wsl -e sh -c "cat > /home/frioconfig/config.json"
```

### 5. Modificar docker-compose.yml

Cambiar los bind mounts de config en `frio-api` y `modbus-poller`:

```yaml
# ANTES (Linux)
- ./config:/app/config

# DESPUES (Windows)
- /home/frioconfig:/app/config
```

### 6. Desactivar Docker credential store

Docker Desktop bloquea pulls via SSH. Si se necesita acceso remoto:

```powershell
# En $env:USERPROFILE\.docker\config.json cambiar a:
{"auths":{}}
```

### 7. Levantar el stack

```powershell
cd nodered
docker compose up -d
```

### 8. Si la imagen frio-api no hace build (error de credenciales)

Exportar la imagen desde un servidor Linux donde funcione:

```bash
# En el servidor Linux
docker save nodered-frio-api nodered-modbus-poller | gzip > frio-images.tar.gz
```

```powershell
# En Windows
docker load -i frio-images.tar.gz
```

Si la imagen no tiene el CMD correcto despues de importar, agregar en docker-compose.yml:

```yaml
frio-api:
  command: ["node", "src/server.js"]
```

---

## Actualizar

### Linux

```bash
cd frio-scada
git pull

# Rebuild frontend
cd frontend-react && npm install && npx vite build && cd ..

# Rebuild y reiniciar containers
cd nodered
docker compose build
docker compose up -d
```

### Windows

```powershell
cd frio-scada
git pull

# Rebuild frontend
cd frontend-react
npm install
npx vite build
cd ..

# Si se puede hacer build (Docker Desktop con sesion grafica)
cd nodered
docker compose build
docker compose up -d

# Si NO se puede hacer build (via SSH), importar imagenes desde Linux
# Ver seccion "Instalacion en Windows" paso 8
```

---

## Comandos útiles (WSL en Windows)

Reiniciar la API después de cambiar el `.env` (por ejemplo, la contraseña de superadmin). Cierra las sesiones abiertas: hay que volver a entrar al portal.

```bash
wsl -d Ubuntu -- bash -lc "cd ~/frio-scada/nodered && docker compose up -d frio-api"
```

## Estructura del proyecto

```
frio-scada/
|-- frontend-react/          # Interfaz React + Vite
|   |-- src/
|   |   |-- views/           # Dashboard, Config, Historicos, Reportes
|   |   |-- store/           # Zustand stores (auth, config, live)
|   |   +-- types.ts         # Tipos TypeScript
|   +-- dist/                # Build de produccion (generado)
|-- nodered/
|   |-- docker-compose.yml
|   |-- .env.example
|   |-- config/              # config.json (dispositivos, gateways, zonas)
|   |-- frio-api/             # API REST Node.js
|   |   +-- src/
|   |       |-- server.js
|   |       |-- routes/
|   |       +-- services/
|   |-- frio-poller/   # Poller Modbus -> InfluxDB
|   |   +-- src/
|   |       |-- index.js
|   |       +-- connections.js
|   |-- nginx/               # Configuracion Nginx
|   +-- grafana/             # Dashboards Grafana
+-- README.md
```

> **Nota sobre la carpeta `nodered/`**: ya no contiene Node-RED (fue reemplazado
> por el SCADA React). Conserva el nombre a proposito: renombrarla cambiaria el
> nombre de proyecto de Docker Compose y los prefijos de los volumenes en el
> servidor.

> **Dos `config.json`**: `frio-poller/config.json` es la **plantilla**
> versionada (semilla de ejemplo). `config/config.json` es la config **viva**
> (bind-mounted, editada por la UI, en `.gitignore`) — es la que mandan el poller
> y la API. La plantilla solo se usa para sembrar una instalacion nueva.

---

## Red industrial (Tailscale)

Los controladores de las cámaras están en una red privada accesible vía Tailscale (ver el runbook de red industrial del proyecto).

Instalacion de Tailscale en el host:

```bash
# Linux
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --accept-routes --accept-dns=false

# Windows
# Descargar e instalar desde https://tailscale.com/download
```

---

## Puertos

| Puerto | Servicio |
|--------|---------|
| 9090 | Frontend (Nginx) |
| 3200 | frio-api (interno) |
| 8086 | InfluxDB (interno) |
| 3000 | Grafana |
| 1883 | MQTT Mosquitto (interno) |

---

## Troubleshooting

**HTTP 502 al cargar configuracion**

Nginx cacho la IP vieja de frio-api. Reiniciar:

```bash
docker compose restart frio-frontend
```

El nginx ya tiene `resolver 127.0.0.11 valid=10s` para re-resolver DNS dinamicamente.

**HTTP 500 al guardar configuracion**

Error de permisos en config.json.

Linux:
```bash
chown -R 1001:65533 nodered/config/
```

Windows: verificar que el config esta montado desde WSL (`/home/frioconfig`), no desde `C:\`.

**No llega a los dispositivos industriales**

```bash
tailscale status
ping <ip-del-PLC>
```

**Ver logs**

```bash
docker compose logs -f frio-api
docker compose logs -f modbus-poller
```

**Docker build falla en Windows via SSH (error de credenciales)**

Docker Desktop usa el credential manager de Windows que no funciona sin sesion grafica.
Soluciones:
1. Hacer build desde la sesion grafica (AnyDesk/RDP)
2. Exportar imagenes desde un servidor Linux con `docker save | gzip`
3. Deshabilitar credential store en `~/.docker/config.json`

---

