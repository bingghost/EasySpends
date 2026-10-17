#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm。请先安装 pnpm，然后重新运行 ./start.sh。" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "首次启动：正在安装项目依赖…"
  pnpm install
fi

if [[ ! -f node_modules/electron/path.txt ]]; then
  echo "正在安装 Electron 可执行文件…"
  pnpm exec install-electron
fi

export ELECTRON_ENABLE_LOGGING="${ELECTRON_ENABLE_LOGGING:-1}"
export ELECTRON_ENABLE_STACK_DUMPING="${ELECTRON_ENABLE_STACK_DUMPING:-1}"

echo "正在启动 EasySpends 开发环境…"
exec pnpm dev "$@"
