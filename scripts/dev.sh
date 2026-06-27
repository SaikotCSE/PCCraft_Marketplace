#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────
# PCCraft Marketplace — local dev orchestrator
# ───────────────────────────────────────────────────────────────
# Activates the `pccraft` conda env, then starts Django (8000)
# and Vite (5173) in the background with logs + pidfiles under
# scripts/.runtime/. Tails logs to the terminal. Ctrl+C stops
# both servers cleanly.
#
# Usage:   bash scripts/dev.sh
# Stop:    bash scripts/dev.sh stop
# ───────────────────────────────────────────────────────────────

set -euo pipefail

# ── Resolve project root from this script's location ──
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "${SCRIPT_DIR}/.." && pwd )"
cd "${PROJECT_ROOT}"

# ── Runtime artefacts (gitignored) ──
RUNTIME_DIR="${SCRIPT_DIR}/.runtime"
mkdir -p "${RUNTIME_DIR}"
DJANGO_PID="${RUNTIME_DIR}/django.pid"
VITE_PID="${RUNTIME_DIR}/vite.pid"
DJANGO_LOG="${RUNTIME_DIR}/django.log"
VITE_LOG="${RUNTIME_DIR}/vite.log"

CONDA_ENV="${CONDA_ENV:-pccraft}"
DJANGO_PORT="${DJANGO_PORT:-8000}"
VITE_PORT="${VITE_PORT:-5173}"

# ── ANSI helpers ──
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

# ───────────────────────────────────────────────────────────────
# sub-command: stop
# ───────────────────────────────────────────────────────────────
stop_servers() {
    local stopped=0
    if [[ -f "${VITE_PID}" ]]; then
        local pid; pid="$(cat "${VITE_PID}" 2>/dev/null || true)"
        if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
            kill "${pid}" 2>/dev/null || true
            ok "Stopped Vite (pid ${pid})"
            stopped=1
        fi
        rm -f "${VITE_PID}"
    fi
    if [[ -f "${DJANGO_PID}" ]]; then
        local pid; pid="$(cat "${DJANGO_PID}" 2>/dev/null || true)"
        if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
            kill "${pid}" 2>/dev/null || true
            ok "Stopped Django (pid ${pid})"
            stopped=1
        fi
        rm -f "${DJANGO_PID}"
    fi
    # Belt-and-braces: kill anything still bound to our ports
    for port in "${DJANGO_PORT}" "${VITE_PORT}"; do
        local pids; pids="$(lsof -ti tcp:"${port}" 2>/dev/null || true)"
        if [[ -n "${pids}" ]]; then
            echo "${pids}" | xargs -r kill 2>/dev/null || true
            stopped=1
        fi
    done
    if [[ ${stopped} -eq 0 ]]; then
        warn "No running dev servers found."
    fi
    exit 0
}

if [[ "${1:-}" == "stop" ]]; then
    stop_servers
fi

# ───────────────────────────────────────────────────────────────
# preflight
# ───────────────────────────────────────────────────────────────
echo "─── PCCraft dev orchestrator ───"
echo "    Project root: ${PROJECT_ROOT}"
echo "    Conda env:    ${CONDA_ENV}"
echo

# Verify conda is on PATH
if ! command -v conda >/dev/null 2>&1; then
    err "conda not found on PATH. Source your shell's conda init (e.g. 'source ~/miniforge3/etc/profile.d/conda.sh') first."
    exit 1
fi

# Refuse to start if another instance is already running
for pidfile in "${DJANGO_PID}" "${VITE_PID}"; do
    if [[ -f "${pidfile}" ]]; then
        local_pid="$(cat "${pidfile}" 2>/dev/null || true)"
        if [[ -n "${local_pid}" ]] && kill -0 "${local_pid}" 2>/dev/null; then
            err "Stale pidfile: ${pidfile} (pid ${local_pid} still alive). Run: bash scripts/dev.sh stop"
            exit 1
        fi
        rm -f "${pidfile}"
    fi
done

# Activate conda env in this shell. `conda activate` won't work under
# `set -u` until CONDA_SHLVL exists, so prime it.
CONDA_SHLVL="${CONDA_SHLVL:-0}"
# shellcheck disable=SC1091
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate "${CONDA_ENV}"
ok "Conda env '${CONDA_ENV}' active (python $(python -c 'import sys;print(sys.version.split()[0])'))"

# Verify required CLIs
for cli in python npm; do
    if ! command -v "${cli}" >/dev/null 2>&1; then
        err "Required command '${cli}' not found in env '${CONDA_ENV}'."
        exit 1
    fi
done

# Verify frontend deps installed
if [[ ! -d "${PROJECT_ROOT}/frontend/node_modules" ]]; then
    warn "frontend/node_modules missing — running 'npm install' first."
    ( cd "${PROJECT_ROOT}/frontend" && npm install )
fi

# ───────────────────────────────────────────────────────────────
# start Django (background)
# ───────────────────────────────────────────────────────────────
ok "Starting Django on http://127.0.0.1:${DJANGO_PORT} (logs: ${DJANGO_LOG})"
: > "${DJANGO_LOG}"
(
    cd "${PROJECT_ROOT}/backend"
    exec python manage.py runserver "127.0.0.1:${DJANGO_PORT}" --noreload
) >> "${DJANGO_LOG}" 2>&1 &
echo $! > "${DJANGO_PID}"

# ───────────────────────────────────────────────────────────────
# start Vite (background)
# ───────────────────────────────────────────────────────────────
ok "Starting Vite on http://127.0.0.1:${VITE_PORT} (logs: ${VITE_LOG})"
: > "${VITE_LOG}"
(
    cd "${PROJECT_ROOT}/frontend"
    exec npm run dev -- --host 127.0.0.1 --port "${VITE_PORT}" --strictPort
) >> "${VITE_LOG}" 2>&1 &
echo $! > "${VITE_PID}"

# ───────────────────────────────────────────────────────────────
# wait for both ports to accept connections
# ───────────────────────────────────────────────────────────────
wait_for_port() {
    local port="$1" name="$2" log="$3" tries=60
    while (( tries-- > 0 )); do
        if lsof -ti tcp:"${port}" >/dev/null 2>&1; then
            ok "${name} listening on :${port}"
            return 0
        fi
        # Fail fast if the process died
        if grep -qE "Error|error:|Traceback|EADDRINUSE" "${log}" 2>/dev/null; then
            err "${name} failed to start. Last log lines:"
            tail -n 20 "${log}" | sed 's/^/    /'
            return 1
        fi
        sleep 1
    done
    err "${name} did not start within 60s. Last log lines:"
    tail -n 20 "${log}" | sed 's/^/    /'
    return 1
}

wait_for_port "${DJANGO_PORT}" "Django" "${DJANGO_LOG}" || stop_servers
wait_for_port "${VITE_PORT}"  "Vite"   "${VITE_LOG}"  || stop_servers

# ───────────────────────────────────────────────────────────────
# health probes
# ───────────────────────────────────────────────────────────────
probe() {
    local url="$1" name="$2" expect="$3" tries=30
    while (( tries-- > 0 )); do
        local code
        code="$(curl -s -o /dev/null -w '%{http_code}' "${url}" || echo 000)"
        if [[ "${code}" == "${expect}" ]]; then
            ok "${name} OK  (${url} → ${code})"
            return 0
        fi
        sleep 1
    done
    err "${name} unhealthy (${url} → last code ${code}, expected ${expect})"
    return 1
}

probe "http://127.0.0.1:${DJANGO_PORT}/api/schema/"   "Django schema"   200 || true
probe "http://127.0.0.1:${DJANGO_PORT}/api/docs/"     "Django swagger"  200 || true
probe "http://127.0.0.1:${VITE_PORT}/"                "Vite root"       200 || true

# ───────────────────────────────────────────────────────────────
# trap Ctrl+C → stop both
# ───────────────────────────────────────────────────────────────
cleanup() {
    echo
    warn "Caught signal — stopping dev servers…"
    if [[ -f "${VITE_PID}" ]]; then
        kill "$(cat "${VITE_PID}")" 2>/dev/null || true
        rm -f "${VITE_PID}"
    fi
    if [[ -f "${DJANGO_PID}" ]]; then
        kill "$(cat "${DJANGO_PID}")" 2>/dev/null || true
        rm -f "${DJANGO_PID}"
    fi
    ok "Done."
}
trap cleanup INT TERM

echo
ok "All services up."
echo "    Django admin:  http://127.0.0.1:${DJANGO_PORT}/admin/"
echo "    Django docs:   http://127.0.0.1:${DJANGO_PORT}/api/docs/"
echo "    Vite app:      http://127.0.0.1:${VITE_PORT}/"
echo
echo "Tailing logs (Ctrl+C to stop everything)…"
echo

# Tail both logs merged with a prefix so you can tell them apart
tail -n +1 -F \
    "${DJANGO_LOG}" \
    "${VITE_LOG}" 2>/dev/null &
TAIL_PID=$!

# Wait until either child process exits (e.g. server crashed)
wait -n "${TAIL_PID}" 2>/dev/null || true
warn "A child process exited — stopping everything."
cleanup