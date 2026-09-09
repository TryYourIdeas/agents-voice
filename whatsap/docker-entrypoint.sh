#!/bin/sh
set -e

# whatsapp-web.js's LocalAuth bind-mounts a persistent Chromium profile per
# device (./devices/<name>/session) into an otherwise ephemeral container.
# Chromium's SingletonLock/SingletonCookie/SingletonSocket embed the
# container's hostname, which changes on every recreate, so on restart
# Chromium always sees the lock as held by "another machine" and refuses to
# start even though nothing else is using the profile. Clear them before
# every launch, across every device's session directory (devices/<name>/
# session/session-<name>/Singleton*).
find /app/devices -mindepth 4 -maxdepth 4 -iname 'Singleton*' -delete 2>/dev/null || true

exec "$@"
