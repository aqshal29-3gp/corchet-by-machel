#!/bin/bash
# Buka lagi checkout HANYA kalau MAYAR_API_KEY yang terpasang benar-benar valid.
exec /home/pusdatinkp/machel-rebuild/.venv-sync/bin/python3 \
  /home/pusdatinkp/machel-rebuild/scripts/mayar-key-guard.py cek
