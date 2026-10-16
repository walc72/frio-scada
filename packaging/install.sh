#!/usr/bin/env bash
# =============================================================================
# Frío SCADA — instalador (Ubuntu / Debian)
#
#   curl -fsSL https://github.com/walc72/frio-scada/releases/latest/download/install.sh | sudo bash
#
# Instala Docker si falta, baja el release, genera las claves internas, crea
# los usuarios y levanta todo en /opt/frio-scada. Para actualizar después:
#   sudo frio-scada update
#
# Instalación desatendida (sin preguntas), con variables de entorno:
#   FRIO_VERSION (por defecto, el último release)   FRIO_DIR (/opt/frio-scada)
#   FRIO_MODE=planta|replica   FRIO_TZ (America/Asuncion)   FRIO_TAILSCALE=si|no
#   FRIO_PLC_IP (192.168.3.71)   FRIO_PLC_UNIT (255)          [solo planta]
#   FRIO_TELEGRAM_TOKEN  FRIO_TELEGRAM_CHAT                    [opcionales, se pueden
#   FRIO_SMTP_HOST  FRIO_SMTP_PORT  FRIO_SMTP_USER  FRIO_SMTP_PASS  FRIO_SMTP_TO   dejar vacíos y
#                                                               cargar luego en Configuración]
#   FRIO_SUPERADMIN_USER  FRIO_SUPERADMIN_PASSWORD  FRIO_ADMIN_USER  FRIO_ADMIN_PASSWORD
#   FRIO_PACKAGE=/ruta/frio-scada-<ver>.tar.gz   (usar un paquete local en vez de bajarlo)
# =============================================================================
set -euo pipefail

REPO="walc72/frio-scada"
DIR="${FRIO_DIR:-/opt/frio-scada}"

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_b=$'\e[1m'; c_0=$'\e[0m'
say()  { echo "${c_b}==>${c_0} $*"; }
ok()   { echo "${c_ok}✔${c_0} $*"; }
warn() { echo "${c_warn}!${c_0} $*"; }
die()  { echo "${c_err}✘ $*${c_0}" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Correlo con sudo:  curl -fsSL https://github.com/$REPO/releases/latest/download/install.sh | sudo bash"

# Con `curl | bash` la entrada estándar es el script: las preguntas van a /dev/tty.
TTY=""
if { : </dev/tty; } 2>/dev/null; then TTY=/dev/tty; fi

ask() {           # ask VAR "pregunta" "default"
  local var=$1 q=$2 def=${3:-} ans
  if [ -n "${!var:-}" ]; then return; fi
  [ -n "$TTY" ] || { printf -v "$var" '%s' "$def"; return; }
  read -r -p "$q${def:+ [$def]}: " ans <"$TTY"
  printf -v "$var" '%s' "${ans:-$def}"
}
ask_secret() {    # ask_secret VAR "pregunta"
  local var=$1 q=$2 a b
  if [ -n "${!var:-}" ]; then return; fi
  [ -n "$TTY" ] || die "Falta $var (instalación sin terminal)"
  while true; do
    read -r -s -p "$q: " a <"$TTY"; echo
    if [ ${#a} -lt 6 ]; then warn "Mínimo 6 caracteres"; continue; fi
    read -r -s -p "Repetir: " b <"$TTY"; echo
    [ "$a" = "$b" ] && break
    warn "No coinciden, de nuevo"
  done
  printf -v "$var" '%s' "$a"
}
ask_secret_opt() { # ask_secret_opt VAR "pregunta"  (opcional, sin eco, vacío = no configurar)
  local var=$1 q=$2 a
  if [ -n "${!var:-}" ]; then return; fi
  [ -n "$TTY" ] || { printf -v "$var" ''; return; }
  read -r -s -p "$q (Enter para omitir): " a <"$TTY"; echo
  printf -v "$var" '%s' "$a"
}
valid_ip()   { [[ $1 =~ ^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$ ]] && (( BASH_REMATCH[1] <= 255 && BASH_REMATCH[2] <= 255 && BASH_REMATCH[3] <= 255 && BASH_REMATCH[4] <= 255 )); }
valid_unit() { [[ $1 =~ ^[0-9]{1,3}$ ]] && (( 10#$1 <= 255 )); }
valid_port() { [[ $1 =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }
ask_valid() {     # ask_valid VAR "pregunta" "default" validador  (reintenta; sin terminal, un valor malo aborta)
  local var=$1 q=$2 def=$3 fn=$4 ans
  if [ -n "${!var:-}" ]; then
    if "$fn" "${!var}"; then return; fi
    [ -n "$TTY" ] || die "Valor inválido en $var: ${!var}"
    warn "Valor inválido en $var: ${!var}"; printf -v "$var" ''
  fi
  [ -n "$TTY" ] || { printf -v "$var" '%s' "$def"; return; }
  while true; do
    read -r -p "$q${def:+ [$def]}: " ans <"$TTY"; ans=${ans:-$def}
    if "$fn" "$ans"; then break; fi
    warn "Valor inválido: $ans"
  done
  printf -v "$var" '%s' "$ans"
}
safe_val() { case "$1" in *"'"*|*$'\n'*|*$'\r'*) return 1;; esac; }
ensure_safe() {   # ensure_safe VAR [s]: los valores van a .env entre comillas simples, sin ' ni saltos de línea.
  local var=$1 sec=${2:-} a                # Corre fuera de $(...) para que el die corte la instalación.
  safe_val "${!var:-}" && return
  [ -n "$TTY" ] || die "$var no puede llevar comillas simples ni saltos de línea"
  while true; do
    warn "$var no puede llevar comillas simples ni saltos de línea"
    if [ -n "$sec" ]; then read -r -s -p "Valor nuevo (Enter para omitir): " a <"$TTY"; echo
    else read -r -p "Valor nuevo (Enter para omitir): " a <"$TTY"; fi
    if safe_val "$a"; then printf -v "$var" '%s' "$a"; return; fi
  done
}
envq() {          # valor para .env entre comillas simples (compose no interpola $ ahí); ya validado por ensure_safe
  printf "'%s'" "$1"
}
gen() { openssl rand -hex "${1:-24}"; }
json_str() { local s=${1//\\/\\\\}; s=${s//\"/\\\"}; printf '"%s"' "$s"; }

echo
echo "${c_b}Frío SCADA — instalación${c_0}"
echo

# ─── Instalación existente ──────────────────────────────────────────────
if [ -f "$DIR/.env" ]; then
  die "Ya hay una instalación en $DIR. Para actualizarla:  sudo frio-scada update"
fi

# ─── Dependencias básicas ───────────────────────────────────────────────
if ! command -v curl >/dev/null || ! command -v openssl >/dev/null; then
  command -v apt-get >/dev/null || die "Instalá curl y openssl y volvé a correr el instalador"
  say "Instalando curl y openssl"
  apt-get update -qq && apt-get install -y -qq curl openssl ca-certificates >/dev/null
fi

# ─── Versión ────────────────────────────────────────────────────────────
VER="${FRIO_VERSION:-}"
if [ -z "$VER" ]; then
  VER=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
  [ -n "$VER" ] || die "No se pudo averiguar el último release (¿hay internet?)"
fi
ok "Versión $VER"

# ─── Preguntas ──────────────────────────────────────────────────────────
DEF_TZ=$(timedatectl show -p Timezone --value 2>/dev/null || true)
[ -n "$DEF_TZ" ] && [ "$DEF_TZ" != "Etc/UTC" ] && [ "$DEF_TZ" != "UTC" ] || DEF_TZ="America/Asuncion"

if [ -z "${FRIO_MODE:-}" ]; then
  echo "¿Qué servidor es?"
  echo "  1) Planta  — lee el PLC de las cámaras por Modbus"
  echo "  2) Réplica de oficina — copia de solo lectura que se sincroniza desde una planta"
  ask FRIO_MODE "Elegí 1 o 2" "1"
fi
case "$FRIO_MODE" in
  1|planta)  MODE=planta ;;
  2|replica) MODE=replica ;;
  *) die "Opción inválida: $FRIO_MODE" ;;
esac
ask FRIO_TZ "Zona horaria" "$DEF_TZ"
[ -f "/usr/share/zoneinfo/$FRIO_TZ" ] || warn "No encuentro la zona horaria $FRIO_TZ en este sistema; la uso igual"

if [ "$MODE" = planta ]; then
  echo
  echo "PLC de las cámaras (Modbus TCP, solo lectura)."
  ask_valid FRIO_PLC_IP "IP del PLC" "192.168.3.71" valid_ip
  ask_valid FRIO_PLC_UNIT "Unit id Modbus (0-255)" "255" valid_unit
  FRIO_PLC_UNIT=$((10#$FRIO_PLC_UNIT))   # sin ceros a la izquierda: va como número en el JSON
  echo
  echo "Alertas (opcionales: Enter para omitir; se pueden cargar luego en Configuración)."
  ask_secret_opt FRIO_TELEGRAM_TOKEN "Token del bot de Telegram"
  if [ -n "${FRIO_TELEGRAM_TOKEN:-}" ]; then ask FRIO_TELEGRAM_CHAT "Chat id de Telegram" ""; fi
  ask FRIO_SMTP_HOST "Servidor SMTP (ej. smtp.gmail.com)" ""
  if [ -n "${FRIO_SMTP_HOST:-}" ]; then
    ask_valid FRIO_SMTP_PORT "Puerto SMTP" "587" valid_port
    ask FRIO_SMTP_USER "Usuario SMTP" ""
    ask_secret_opt FRIO_SMTP_PASS "Contraseña SMTP"
    ask FRIO_SMTP_TO "Destinatario de las alertas y del reporte diario" ""
  fi
fi
echo
echo "Superadmin: el único que ve Marca, Conexión y Réplicas (no se puede eliminar)."
ask FRIO_SUPERADMIN_USER "Usuario superadmin" "superadmin"
ask_secret FRIO_SUPERADMIN_PASSWORD "Contraseña del superadmin"
echo
echo "Administrador: maneja la configuración y los usuarios."
ask FRIO_ADMIN_USER "Usuario administrador" "admin"
[ "$FRIO_ADMIN_USER" != "$FRIO_SUPERADMIN_USER" ] || die "El administrador tiene que tener otro usuario que el superadmin"
ask_secret FRIO_ADMIN_PASSWORD "Contraseña del administrador"
echo
ask FRIO_TAILSCALE "¿Instalar Tailscale para acceso remoto? (si/no)" "si"

if [ "$MODE" = planta ]; then
  ensure_safe FRIO_TELEGRAM_TOKEN s; ensure_safe FRIO_TELEGRAM_CHAT
  ensure_safe FRIO_SMTP_HOST; ensure_safe FRIO_SMTP_USER; ensure_safe FRIO_SMTP_PASS s; ensure_safe FRIO_SMTP_TO
fi

# ─── Docker ─────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null; then
  say "Instalando Docker (script oficial get.docker.com)"
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose' (instalá docker-compose-plugin)"
ok "Docker $(docker version -f '{{.Server.Version}}' 2>/dev/null || echo '?')"

# ─── Tailscale (opcional) ───────────────────────────────────────────────
case "$FRIO_TAILSCALE" in
  s|si|sí|y|yes)
    if ! command -v tailscale >/dev/null; then
      say "Instalando Tailscale (script oficial tailscale.com)"
      curl -fsSL https://tailscale.com/install.sh | sh >/dev/null
    fi
    ok "Tailscale instalado — la conexión se hace desde Configuración → Conexión"
    ;;
esac
mkdir -p /var/run/tailscale   # frio-agent lo monta aunque no haya Tailscale

# ─── Archivos del release ───────────────────────────────────────────────
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if [ -n "${FRIO_PACKAGE:-}" ]; then          # paquete local (pruebas / sin GitHub)
  cp "$FRIO_PACKAGE" "$TMP/pkg.tgz"
else
  say "Descargando frio-scada $VER"
  curl -fsSL "https://github.com/$REPO/releases/download/$VER/frio-scada-$VER.tar.gz" -o "$TMP/pkg.tgz" \
    || die "No se pudo bajar el paquete del release $VER"
fi
tar xzf "$TMP/pkg.tgz" -C "$TMP"
mkdir -p "$DIR"
cp -r "$TMP/frio-scada/." "$DIR/"
cd "$DIR"
mkdir -p config reports backups
if [ "$MODE" = planta ] && [ ! -f config/config.json ]; then
  sed -e "s/__PLC_IP__/$FRIO_PLC_IP/" -e "s/__PLC_UNIT__/$FRIO_PLC_UNIT/" config.template.json > config/config.json
fi
chown -R 1001:1001 config reports      # frio-api / poller / réplica corren como uid 1001

# ─── .env (claves internas generadas acá) ───────────────────────────────
umask 077
{
  echo "# Generado por install.sh el $(date '+%Y-%m-%d %H:%M'). Referencia de variables: .env.example"
  echo "FRIO_VERSION=$VER"
  echo "COMPOSE_PROJECT_NAME=frio-scada"
  if [ "$MODE" = replica ]; then echo "COMPOSE_FILE=docker-compose.yml:docker-compose.replica.yml"; fi
  echo "TZ=$FRIO_TZ"
  echo "INFLUXDB_USERNAME=admin"
  echo "INFLUXDB_PASSWORD=$(gen 16)"
  echo "INFLUXDB_ORG=tecnoelectric"
  echo "INFLUXDB_BUCKET=camaras"
  echo "INFLUXDB_TOKEN=$(gen 32)"
  echo "INFLUXDB_RETENTION=1095d"
  echo "# Token de solo lectura para Grafana (lo crea crear-token-grafana.sh)"
  echo "INFLUXDB_GRAFANA_TOKEN="
  echo "GF_ADMIN_USER=admin"
  echo "GF_ADMIN_PASSWORD=$(gen 12)"
  echo "AGENT_TOKEN=$(gen 32)"
  echo "MANDO_TOKEN=$(gen 32)"
  echo "DAILY_REPORT_ENABLED=true"
  echo "DAILY_REPORT_HOUR=7"
  echo "# Usuarios: se crean en config/settings.json (no van acá)"
  echo "AUTH_PASSWORD="
  if [ "$MODE" = planta ]; then
    echo "# Alertas (opcionales; también se editan en Configuración → Correo)"
    echo "TELEGRAM_TOKEN=$(envq "${FRIO_TELEGRAM_TOKEN:-}")"
    echo "TELEGRAM_CHAT_ID=$(envq "${FRIO_TELEGRAM_CHAT:-}")"
    echo "SMTP_HOST=$(envq "${FRIO_SMTP_HOST:-}")"
    echo "SMTP_PORT=$(envq "${FRIO_SMTP_PORT:-}")"
    echo "SMTP_USER=$(envq "${FRIO_SMTP_USER:-}")"
    echo "SMTP_PASS=$(envq "${FRIO_SMTP_PASS:-}")"
    echo "ALERT_EMAIL=$(envq "${FRIO_SMTP_TO:-}")"
  fi
  echo "# Correo de Grafana (opcional; el SMTP del SCADA se configura en Configuración → Correo)"
  echo "GF_SMTP_USER="
  echo "GF_SMTP_PASSWORD="
  echo "GF_SMTP_FROM="
} > .env
umask 022
ok "Claves internas generadas en $DIR/.env"

# ─── Imágenes ───────────────────────────────────────────────────────────
say "Descargando imágenes (puede tardar unos minutos)"
# Baja todo lo que pueda (una falla no cancela las demás) y después verifica
# que estén todas: sirve también si alguna ya estaba cargada en el equipo.
docker compose pull -q --ignore-pull-failures 2>&1 | grep -vi 'warn' || true
missing=""
for img in $(docker compose config --images); do docker image inspect "$img" >/dev/null 2>&1 || missing="$missing $img"; done
[ -z "$missing" ] || die "Faltan imágenes:$missing. Si el error dice 'denied', los paquetes de ghcr.io todavía no son públicos."
ok "Imágenes listas"

# ─── Usuarios ───────────────────────────────────────────────────────────
say "Creando usuarios"
if ! out=$(printf '{"superadmin":{"user":%s,"password":%s},"admin":{"user":%s,"password":%s}}' \
  "$(json_str "$FRIO_SUPERADMIN_USER")" "$(json_str "$FRIO_SUPERADMIN_PASSWORD")" \
  "$(json_str "$FRIO_ADMIN_USER")" "$(json_str "$FRIO_ADMIN_PASSWORD")" \
  | docker compose run --rm -T --no-deps frio-api node src/cli/init-users.js 2>&1); then
  echo "$out" | tail -5; die "No se pudieron crear los usuarios"
fi
unset FRIO_SUPERADMIN_PASSWORD FRIO_ADMIN_PASSWORD FRIO_TELEGRAM_TOKEN FRIO_SMTP_PASS
ok "Usuarios: $FRIO_SUPERADMIN_USER (superadmin), $FRIO_ADMIN_USER (admin)"

# ─── Arranque ───────────────────────────────────────────────────────────
say "Levantando servicios"
docker compose up -d --quiet-pull >/dev/null 2>&1 || docker compose up -d
for _ in $(seq 1 60); do
  st=$(docker inspect -f '{{.State.Health.Status}}' frio-api 2>/dev/null || true)
  [ "$st" = healthy ] && break
  sleep 3
done
[ "${st:-}" = healthy ] && ok "frio-api en marcha" || warn "frio-api todavía no responde; revisá con:  sudo frio-scada status"

# Token de solo lectura de Grafana (idempotente; reinicia grafana con el token)
bash "$DIR/crear-token-grafana.sh" "$DIR/.env" || warn "No se pudo crear el token de Grafana; correr:  cd $DIR && bash crear-token-grafana.sh"

install -m 755 "$DIR/frio-scada" /usr/local/bin/frio-scada

# ─── Resumen ────────────────────────────────────────────────────────────
# IPs del equipo, sin las redes internas de Docker
IPS=$(ip -4 -o addr show scope global 2>/dev/null | grep -vE ' (docker[0-9]*|br-[0-9a-f]+|veth[^ ]*) ' \
  | awk '{print $4}' | cut -d/ -f1 | head -3 | tr '\n' ' ')
IPS=${IPS% }
echo
echo "${c_ok}${c_b}Listo: Frío SCADA $VER instalado en $DIR ($MODE)${c_0}"
echo
for ip in ${IPS:-localhost}; do echo "  SCADA:   http://$ip"; done
echo "  Grafana: solo dentro del portal (/grafana/), sin puerto propio"
echo
if [ "$MODE" = planta ]; then
  echo "Planta: PLC $FRIO_PLC_IP (unit $FRIO_PLC_UNIT). Entrá como $FRIO_ADMIN_USER; las alertas se ajustan en Configuración."
else
  echo "Siguiente paso: entrá como $FRIO_SUPERADMIN_USER y en Configuración → Conexión pegá el código de enlace"
  echo "que se genera en la planta (Configuración → Réplicas)."
fi
echo "Comandos: sudo frio-scada status | logs | update | restart"
echo
