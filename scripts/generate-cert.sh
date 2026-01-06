#!/usr/bin/env sh
set -eu

if [ "${HTTPS:-true}" = "false" ]; then
  echo "HTTPS disabled; skipping cert generation."
  exit 0
fi

cert_dir="certs"
key_path="$cert_dir/key.pem"
cert_path="$cert_dir/cert.pem"

if [ -f "$key_path" ] && [ -f "$cert_path" ]; then
  echo "Certs already exist in $cert_dir."
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found; install it or set HTTPS=false."
  exit 1
fi

mkdir -p "$cert_dir"

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$key_path" \
  -out "$cert_path" \
  -days 365 \
  -subj "/C=TW/ST=Taipei/L=Taipei/O=LocalDev/OU=Dev/CN=localhost"

echo "Generated self-signed certs in $cert_dir."
