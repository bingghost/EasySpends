#!/bin/sh
set -eu

task_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python_bin=""

for candidate in "$task_dir"/python/*/bin/python3; do
  if [ -x "$candidate" ]; then
    python_bin=$candidate
    break
  fi
done

if [ -z "$python_bin" ]; then
  for command_name in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$command_name" >/dev/null 2>&1; then
      python_bin=$(command -v "$command_name")
      break
    fi
  done
fi

if [ -z "$python_bin" ] || ! "$python_bin" -c 'import sys; raise SystemExit(sys.version_info < (3, 10))'; then
  echo "Python 3.10+ is required. Install it under .codex-tasks/python or update this wrapper." >&2
  exit 1
fi

exec "$python_bin" "$task_dir/run.py" "$@"
