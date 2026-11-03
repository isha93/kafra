#!/usr/bin/env bash
#
# Kafra Service — one script to set up and open Kafra City.
#
#   ./kafra.sh            siapkan (sekali) lalu buka kota dengan agent aslimu
#   ./kafra.sh demo       kota contoh dengan semua animasi
#   ./kafra.sh simulate   enam kota palsu yang hidup terus
#   ./kafra.sh public     kotamu tanpa teks apa pun, aman untuk dipamerkan
#   ./kafra.sh menubar    pasang ikon menu bar (SwiftBar)
#   ./kafra.sh setup      cuma siapkan (cek Node, npm install)
#   ./kafra.sh test       jalankan test
#   ./kafra.sh help       bantuan
#
# Everything runs on this machine. See `local_notice` below for exactly what is read.

set -euo pipefail
cd "$(dirname "$0")"

GOLD=$'\033[33m'; PINK=$'\033[35m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
[[ -t 1 ]] || { GOLD=; PINK=; GREEN=; RED=; DIM=; BOLD=; OFF=; }

kafra() { printf '%s\n' "${PINK}♥ Kafra:${OFF} $*"; }
ok()    { printf '%s\n' "  ${GREEN}✓${OFF} $*"; }
fail()  { printf '%s\n' "  ${RED}✗${OFF} $*" >&2; exit 1; }

banner() {
  printf '%s\n' "${GOLD}${BOLD}"
  printf '%s\n' "   ⚔  K A F R A   C I T Y"
  printf '%s\n' "${OFF}${DIM}   kota Ragnarok untuk agent Claude Code-mu${OFF}"
  echo
}

local_notice() {
  printf '%s\n' "${BOLD}  🔒 Semua berjalan lokal di laptop ini${OFF}"
  printf '%s\n' "${DIM}     • Server hanya di 127.0.0.1 — tidak bisa dibuka dari WiFi atau internet."
  printf '%s\n' "     • Hanya MEMBACA: transcript di ~/.claude/projects dan git di repo-mu."
  printf '%s\n' "     • Tidak menulis ke repo, tidak memasang hooks, tidak mengubah setting Claude Code."
  printf '%s\n' "     • Tidak memanggil model AI dan tidak memakai token."
  printf '%s\n' "     • Satu-satunya akses internet: npm install sekali (PixiJS)."
  printf '%s\n' "       (scripts/gen-assets.mjs ke Retro Diffusion hanya kalau kamu jalankan sendiri.)${OFF}"
  echo
}

usage() {
  banner
  cat <<EOF
  ${BOLD}Pakai:${OFF} ./kafra.sh [perintah]

    ${GOLD}(kosong)${OFF}   siapkan lalu buka kota dengan agent aslimu   → http://127.0.0.1:4317
    ${GOLD}demo${OFF}       kota contoh, semua animasi sekaligus          → http://127.0.0.1:4318
    ${GOLD}simulate${OFF}   enam kota palsu yang hidup terus              → http://127.0.0.1:4319
    ${GOLD}public${OFF}     kotamu tanpa teks: aman untuk layar bersama   → http://127.0.0.1:4317
    ${GOLD}menubar${OFF}    pasang ikon menu bar macOS (lewat SwiftBar)
    ${GOLD}setup${OFF}      cuma cek Node dan npm install
    ${GOLD}test${OFF}       jalankan test
    ${GOLD}help${OFF}       pesan ini

  ${BOLD}Di dalam kota:${OFF} geser = drag · zoom = scroll · Tab = lompat antar agent
                  M = lihat seluruh dunia · Esc = batal pilih
  ${BOLD}Privasi:${OFF} salin kafra.config.example.json ke kafra.config.json untuk
           menyembunyikan repo (hide/only) atau menyensor kata (redact).
  ${BOLD}Berhenti:${OFF} Ctrl+C

EOF
  local_notice
}

# ── Persiapan ────────────────────────────────────────────────────────────────

check_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js belum terpasang. Pasang Node 20+ dari https://nodejs.org lalu coba lagi."
  local major
  major=$(node -p 'process.versions.node.split(".")[0]')
  (( major >= 20 )) || fail "Node $(node -v) terlalu tua; Kafra butuh Node 20 atau lebih baru."
  ok "Node $(node -v)"
}

check_git() {
  command -v git >/dev/null 2>&1 || fail "git tidak ditemukan; Kafra butuh git untuk membaca repo."
  ok "git $(git --version | awk '{print $3}')"
}

check_claude() {
  if [[ -d "$HOME/.claude/projects" ]]; then
    local n
    n=$(find "$HOME/.claude/projects" -maxdepth 2 -name '*.jsonl' -mtime -7 2>/dev/null | wc -l | tr -d ' ')
    ok "Catatan petualangan Claude Code ditemukan ($n sesi dalam 7 hari)"
  else
    printf '%s\n' "  ${GOLD}!${OFF} Belum ada ~/.claude/projects — kotanya akan sepi sampai kamu memakai Claude Code."
    printf '%s\n' "    ${DIM}Coba dulu: ./kafra.sh demo${OFF}"
  fi
}

setup() {
  kafra "Selamat datang di Kafra Service! Saya periksa perbekalanmu dulu…"
  check_node
  check_git
  if [[ -d node_modules/pixi.js ]]; then
    ok "Perbekalan sudah lengkap (node_modules)"
  else
    kafra "Mengisi tas petualang (npm ci)…"
    # Exactly the locked versions, and no package install scripts get to run.
    npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null || fail "npm ci gagal. Coba jalankan 'npm ci' manual untuk melihat errornya."
    ok "PixiJS terpasang"
  fi
}

# ── Menjalankan ──────────────────────────────────────────────────────────────

open_browser() {
  local url=$1
  # KAFRA_NO_OPEN=1 skips the browser, for headless machines and scripts.
  if [[ -n "${KAFRA_NO_OPEN:-}" ]]; then return; fi
  if command -v open >/dev/null 2>&1; then open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1
  else kafra "Buka sendiri di browser: $url"
  fi
}

# Kafra already serving on this port? Then just open it instead of failing on a busy port.
already_running() {
  curl -fs --max-time 1 "http://127.0.0.1:$1/api/sessions" >/dev/null 2>&1
}

wait_and_open() {
  local port=$1
  for _ in $(seq 1 60); do
    if already_running "$port"; then open_browser "http://127.0.0.1:$port"; return; fi
    sleep 0.5
  done
}

run() {
  local mode=$1 port=$2 script=$3 what=$4
  local url="http://127.0.0.1:$port"
  if already_running "$port"; then
    kafra "Kota ini sudah buka di $url — saya teleport-kan ke sana."
    open_browser "$url"
    exit 0
  fi
  if lsof -ti "tcp:$port" >/dev/null 2>&1; then
    fail "Port $port dipakai program lain. Pakai port lain: KAFRA_PORT=4400 ./kafra.sh $mode"
  fi
  echo
  local_notice
  kafra "$what"
  kafra "Warp portal terbuka di ${BOLD}$url${OFF} — tekan Ctrl+C untuk menutup."
  echo
  wait_and_open "$port" &
  KAFRA_PORT=$port exec node "$script"
}

# ── Menu bar ─────────────────────────────────────────────────────────────────

install_menubar() {
  [[ "$(uname)" == Darwin ]] || fail "Ikon menu bar hanya untuk macOS."
  if [[ ! -d /Applications/SwiftBar.app ]]; then
    kafra "Ikon menu bar memakai SwiftBar (gratis, open source). Pasang dulu:"
    printf '%s\n' "    ${BOLD}brew install --cask swiftbar${OFF}"
    printf '%s\n' "    ${DIM}atau unduh dari https://swiftbar.app — lalu jalankan ./kafra.sh menubar lagi.${OFF}"
    exit 1
  fi
  local dir
  dir=$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)
  if [[ -z "$dir" ]]; then
    kafra "Buka SwiftBar sekali dan pilih folder plugin-nya, lalu jalankan ./kafra.sh menubar lagi."
    open -a SwiftBar
    exit 1
  fi
  dir=${dir/#\~/$HOME}
  mkdir -p "$dir"
  # A link, not a copy: updating Kafra updates the plugin too.
  ln -sf "$PWD/integrations/swiftbar/kafra.10s.sh" "$dir/kafra.10s.sh"
  ok "Plugin terpasang di $dir"
  # SwiftBar watches its plugin folder, so a running SwiftBar picks the plugin up
  # by itself. Don't send it swiftbar:// URLs: SwiftBar 2.1.1 crashes on them
  # while it is still starting.
  pgrep -x SwiftBar >/dev/null || open -a SwiftBar
  kafra "Lihat pojok kanan atas: ⚔ menunjukkan berapa agent yang menunggumu."
  printf '%s\n' "  ${DIM}Notifikasi macOS muncul saat ada agent yang mulai menunggu. Kafra harus jalan (./kafra.sh).${OFF}"
}

cmd=${1:-start}
case "$cmd" in
  start|"")
    banner; setup; check_claude
    run start "${KAFRA_PORT:-4317}" src/server.mjs "Membuka kota-kota tempat agent-mu bekerja…" ;;
  menubar)
    banner
    install_menubar ;;
  public)
    banner; setup
    kafra "Mode publik: nama repo, path, prompt, dan judul commit disembunyikan di server."
    export KAFRA_PUBLIC=1
    run public "${KAFRA_PORT:-4317}" src/server.mjs "Membuka kota-kotamu dalam mode publik…" ;;
  demo)
    banner; setup
    run demo "${KAFRA_PORT:-4318}" scripts/demo.mjs "Membuka kota contoh: 12 adventurer, semua jenis aktivitas." ;;
  simulate|sim)
    banner; setup
    kafra "Membangun enam kota palsu di folder sementara (repo aslimu tidak disentuh)…"
    run simulate "${KAFRA_PORT:-4319}" scripts/simulate.mjs "Enam kota, sepuluh adventurer, bekerja terus sampai kamu menutupnya." ;;
  setup)
    banner; setup; check_claude; echo; local_notice
    kafra "Siap! Jalankan ${BOLD}./kafra.sh${OFF} untuk membuka kotamu." ;;
  test)
    setup; npm test ;;
  help|-h|--help)
    usage ;;
  *)
    usage; fail "Perintah tidak dikenal: $cmd" ;;
esac
