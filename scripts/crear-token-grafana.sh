#!/usr/bin/env bash
# Crea el token de SOLO LECTURA del bucket camaras para Grafana y lo guarda en
# .env (INFLUXDB_GRAFANA_TOKEN). Idempotente: si ya hay uno y sigue valido, no
# hace nada; si fue revocado o el volumen de Influx se recreo, genera otro.
# Correr desde la carpeta de instalacion, con influxdb arriba:
#   cd /opt/frio-scada && bash crear-token-grafana.sh
set -euo pipefail
ENVF="${1:-.env}"
[ -f "$ENVF" ] || { echo "No encuentro $ENVF (correr desde la carpeta de instalacion)" >&2; exit 1; }
val() { sed -n "s/^$1=//p" "$ENVF" | tail -1; }

ORG=$(val INFLUXDB_ORG); ORG=${ORG:-tecnoelectric}
BUCKET=$(val INFLUXDB_BUCKET); BUCKET=${BUCKET:-camaras}
ADMIN=$(val INFLUXDB_TOKEN)
CUR=$(val INFLUXDB_GRAFANA_TOKEN)
[ -n "$ADMIN" ] || { echo "Falta INFLUXDB_TOKEN en $ENVF" >&2; exit 1; }

# El token viaja por entorno (docker exec -e VAR sin valor), nunca en argv.
IX() { docker exec -e INFLUX_TOKEN frio-influxdb influx "$@"; }
for _ in $(seq 1 30); do (export INFLUX_TOKEN="$ADMIN"; IX ping) >/dev/null 2>&1 && break; sleep 2; done

# Token ya cargado: sirve si todavia lista el bucket
if [ -n "$CUR" ] && (export INFLUX_TOKEN="$CUR"; IX bucket list --org "$ORG" --name "$BUCKET" --hide-headers) >/dev/null 2>&1; then
  echo "Token de Grafana vigente; nada que hacer."; exit 0
fi
[ -z "$CUR" ] || echo "El token de Grafana ya no es valido; se genera uno nuevo."

export INFLUX_TOKEN="$ADMIN"
BID=$(IX bucket list --org "$ORG" --name "$BUCKET" --hide-headers | awk 'NR==1{print $1}')
[ -n "$BID" ] || { echo "No encuentro el bucket $BUCKET" >&2; exit 1; }
TOKEN=$(IX auth create --org "$ORG" --read-bucket "$BID" --description grafana-lectura --json \
  | sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' | head -1)
unset INFLUX_TOKEN
[ -n "$TOKEN" ] || { echo "No se pudo crear el token" >&2; exit 1; }

# Reescritura via archivo temporal en modo 600 (el token no pasa por argv)
TMP=$(umask 077; mktemp "$ENVF.XXXXXX")
{ grep -v '^INFLUXDB_GRAFANA_TOKEN=' "$ENVF" || true; printf 'INFLUXDB_GRAFANA_TOKEN=%s\n' "$TOKEN"; } > "$TMP"
chmod 600 "$TMP"; mv -f "$TMP" "$ENVF"
echo "Token de Grafana creado (solo lectura de $BUCKET). Reiniciando grafana."
(cd "$(dirname "$ENVF")" && docker compose up -d grafana >/dev/null)
