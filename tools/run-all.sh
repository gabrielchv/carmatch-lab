#!/usr/bin/env bash
# ──────────────────────────────────────────────
# CarMatch Lab — rodar as versões locais
# ──────────────────────────────────────────────
# Duas gerações:
#   v*  — primeira rodada (chat interno)
#   w*  — rodada WhatsApp: sem chat, onboarding, filtro reverso
#
#   ./tools/run-all.sh                 inicia a geração v
#   ./tools/run-all.sh start w         inicia a geração w
#   ./tools/run-all.sh start all       inicia as duas (10 servidores)
#   ./tools/run-all.sh status          estado da geração v
#   ./tools/run-all.sh status w        estado da geração w
#   ./tools/run-all.sh stop all        encerra tudo
#   ./tools/run-all.sh logs w3         acompanha uma versão
set -uo pipefail

LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LAB}/tools/.logs"
mkdir -p "$LOG_DIR"

V_VERSIONS=(v1 v2 v3 v4 v5)
V_PORTS=(3200 3502 3503 3504 3505)

W_VERSIONS=(w1 w2 w3 w4 w5 w6)
W_PORTS=(3601 3602 3603 3604 3605 3606)

title_for() {
  case "$1" in
    v1) echo "original corrigido" ;;
    v2) echo "Confiança — verificação e dossiê" ;;
    v3) echo "Corrente — trocas em anel 3-5" ;;
    v4) echo "Avalia — valor justo e acerto" ;;
    v5) echo "Troca Fechada — negociação até o fim" ;;
    w1) echo "WhatsApp-first — o pedido, fiel" ;;
    w2) echo "Radar — alertas de match no WhatsApp" ;;
    w3) echo "Roda — correntes de 3-5 pessoas" ;;
    w4) echo "Preço — valor justo dentro da mensagem" ;;
    w5) echo "Confiança — dossiê antes do primeiro oi" ;;
    w6) echo "FIPE enxuta — o mesmo carro, sem 20 acabamentos" ;;
  esac
}

# Escolhe o conjunto de versões/portas conforme a geração pedida.
#
# Default é `w`: é a geração atual (WhatsApp, onboarding, filtro reverso).
# A `v` continua disponível para comparação, mas não deve ser o que aparece
# quando alguém digita o comando sem pensar.
set_gen() {
  case "${1:-${DEFAULT_GEN:-w}}" in
    v) GEN="v"; VERSIONS=("${V_VERSIONS[@]}"); PORTS=("${V_PORTS[@]}") ;;
    w) GEN="w"; VERSIONS=("${W_VERSIONS[@]}"); PORTS=("${W_PORTS[@]}") ;;
    all)
      GEN="all"
      VERSIONS=("${V_VERSIONS[@]}" "${W_VERSIONS[@]}")
      PORTS=("${V_PORTS[@]}" "${W_PORTS[@]}")
      ;;
    *) echo "geração inválida: $1 (use v, w ou all)" >&2; exit 1 ;;
  esac
}

pid_on_port() {
  ss -lptn "sport = :$1" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1
}

alive() { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 2 "http://localhost:$1/" 2>/dev/null)" = "200" ]; }

start_one() {
  local name="$1" port="$2"
  if alive "$port"; then
    echo "   $name  já rodando  http://localhost:$port"
    return 0
  fi

  if [ ! -d "$LAB/$name/node_modules" ]; then
    echo "   $name  sem node_modules — rode: (cd $name && npm install)"
    return 1
  fi

  # `next build` leaves a production .next behind. If dev has never run there
  # (no .next/dev yet), `next dev` serves 404 for every route — the app looks
  # broken for no visible reason. Move the build aside so dev starts clean.
  if [ -f "$LAB/$name/.next/BUILD_ID" ] && [ ! -d "$LAB/$name/.next/dev" ]; then
    local stamp
    stamp="$(date +%Y%m%d-%H%M%S)"
    mv "$LAB/$name/.next" "$LAB/$name/.next.prod-$stamp"
    echo "   $name  build de produção movido para .next.prod-$stamp (dev precisa de cache próprio)"
  fi

  ( cd "$LAB/$name" && setsid nohup env PORT="$port" npx next dev -p "$port" \
      > "$LOG_DIR/$name.log" 2>&1 < /dev/null & ) >/dev/null 2>&1
  echo "   $name  iniciando  http://localhost:$port  (log: tools/.logs/$name.log)"
}

stop_one() {
  local port="$1" pid
  pid="$(pid_on_port "$port")"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null
    echo "   porta $port encerrada (pid $pid)"
  fi
}

# Poll every port in one loop: five cold Next dev servers must not be waited on
# sequentially.
wait_all_ready() {
  local tries=0 pending port
  while [ "$tries" -lt 90 ]; do
    pending=0
    for port in "${PORTS[@]}"; do
      curl -s -o /dev/null -m 1 "http://localhost:$port/" 2>/dev/null || pending=$((pending + 1))
    done
    [ "$pending" -eq 0 ] && return 0
    sleep 1
    tries=$((tries + 1))
  done
  return 1
}

banner() {
  local first_port="${PORTS[0]}"
  echo
  echo "  CarMatch Lab — geração: ${GEN}"
  case "$GEN" in
    w)   echo "  (a atual: sem chat, WhatsApp, onboarding, filtro reverso)" ;;
    v)   echo "  (a anterior: chat interno, sem onboarding)" ;;
    all) echo "  (v = anterior com chat · w = atual, WhatsApp)" ;;
  esac
  echo "  ────────────────────────────────────────────────────────"
  for i in "${!VERSIONS[@]}"; do
    echo "  ${VERSIONS[$i]} · $(title_for "${VERSIONS[$i]}")"
    echo "       http://localhost:${PORTS[$i]}"
  done
  echo "  ────────────────────────────────────────────────────────"

  # O onboarding só existe na geração W; apontar a URL evita a caçada.
  if [[ "$GEN" != "v" ]]; then
    echo "  onboarding (primeiro acesso): http://localhost:${first_port}/boas-vindas"
  else
    echo "  onboarding: só existe na geração W — rode: ./tools/run-all.sh start w"
  fi

  echo "  login: /auth → \"Entrar sem senha\" (ALLOW_DEV_LOGIN=1)"
  case "$GEN" in
    v)   echo "  popular: node tools/seed-posts.mjs --all --reset" ;;
    w)   echo "  popular: node tools/seed-posts.mjs --all-w --reset" ;;
    all) echo "  popular: node tools/seed-posts.mjs --all --reset && node tools/seed-posts.mjs --all-w --reset" ;;
  esac
  echo
}

CMD="${1:-start}"
# `set -u` acima: qualquer $2 ausente derruba o script. O uso principal é
# `./tools/run-all.sh` sem argumento nenhum, então o default tem que estar aqui.
GEN_ARG="${2:-}"

case "$CMD" in
  start)
    set_gen "$GEN_ARG"
    echo "Iniciando geração ${GEN}…"
    for i in "${!VERSIONS[@]}"; do start_one "${VERSIONS[$i]}" "${PORTS[$i]}"; done
    echo
    echo "Aguardando resposta…"
    wait_all_ready || true
    ok=0
    for port in "${PORTS[@]}"; do alive "$port" && ok=$((ok + 1)); done
    echo "   $ok/${#PORTS[@]} respondendo"
    banner
    ;;
  stop)
    set_gen "$GEN_ARG"
    echo "Encerrando geração ${GEN}…"
    for port in "${PORTS[@]}"; do stop_one "$port"; done
    ;;
  restart)
    set_gen "$GEN_ARG"
    for port in "${PORTS[@]}"; do stop_one "$port"; done
    sleep 2
    exec "${BASH_SOURCE[0]}" start "$GEN"
    ;;
  status)
    set_gen "$GEN_ARG"
    echo
    for i in "${!VERSIONS[@]}"; do
      name="${VERSIONS[$i]}"; port="${PORTS[$i]}"
      if alive "$port"; then
        echo "  ${name}  ●  up    http://localhost:${port}   $(title_for "$name")"
      else
        echo "  ${name}  ○  down  http://localhost:${port}   $(title_for "$name")"
      fi
    done
    # `status` é onde alguém olha para descobrir o que está no ar — então a URL
    # do onboarding pertence aqui, não só no banner do `start`.
    echo
    if [[ "$GEN" != "v" ]]; then
      echo "  onboarding (primeiro acesso): http://localhost:${PORTS[0]}/boas-vindas"
    else
      echo "  onboarding: só existe na geração W — ./tools/run-all.sh status w"
    fi
    echo
    ;;
  logs)
    target="${2:-}"
    if [ -z "$target" ]; then
      echo "uso: ./tools/run-all.sh logs w3"
      exit 1
    fi
    tail -f "$LOG_DIR/$target.log"
    ;;
  *)
    echo "uso: ./tools/run-all.sh [start|stop|restart|status] [v|w|all]"
    echo "     ./tools/run-all.sh logs <vN|wN>"
    exit 1
    ;;
esac
