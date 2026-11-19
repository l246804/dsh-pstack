#!/bin/sh
set -eu

# `dsh web` refuses to bind a wildcard address; bind the container's own address and
# publish the port on 127.0.0.1 from the host.
host="${DSH_HOST:-$(hostname -I | tr ' ' '\n' | grep -v '^$' | head -n1)}"
exec dsh web --port "${DSH_PORT:-8080}" --host "$host" --no-open "$@"
