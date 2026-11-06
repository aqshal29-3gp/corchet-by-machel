#!/bin/bash
# Tutup checkout sebelum jendela patch API key Mayar (22:00 WIB).
exec /home/pusdatinkp/machel-rebuild/.venv-sync/bin/python3 \
  /home/pusdatinkp/machel-rebuild/scripts/mayar-key-guard.py tutup
