#!/usr/bin/env bash
#
# Kafra Service — one script to set up and open Kafra City.
#
#   ./kafra.sh            open your world (checks Node and git first)
#   ./kafra.sh demo       a sample town showing every animation
#   ./kafra.sh simulate   six fake towns that keep working
#   ./kafra.sh public     your world with all text removed, safe to share
#   ./kafra.sh menubar    macOS menu bar icon (SwiftBar) and notifications
#   ./kafra.sh autostart on|off|status   start Kafra at every macOS login
#   ./kafra.sh setup      only check Node and git
#   ./kafra.sh clean      remove Kafra's temporary files (simulation, demo, tests)
#   ./kafra.sh test       run the tests
#   ./kafra.sh help       this list
#
# Messages are in English, or Indonesian when KAFRA_LANG=id or your locale is
# Indonesian. Everything runs on this machine; see `local_notice` below for
# exactly what is read.

set -euo pipefail
cd "$(dirname "$0")"

GOLD=$'\033[33m'; PINK=$'\033[35m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
[[ -t 1 ]] || { GOLD=; PINK=; GREEN=; RED=; DIM=; BOLD=; OFF=; }

# ── Language ────────────────────────────────────────────────────────────────

# KAFRA_LANG, then the shell locale, then macOS's preferred language; English otherwise.
detect_lang() {
  local v="${KAFRA_LANG:-${LC_ALL:-${LANG:-}}}"
  if [[ -z "$v" || "$v" == C* || "$v" == POSIX* ]] && command -v defaults >/dev/null 2>&1; then
    v=$(defaults read -g AppleLanguages 2>/dev/null | sed -n '2p' | tr -d ' ",')
  fi
  case "$v" in id*|ID*) echo id ;; *) echo en ;; esac
}
KAFRA_LANG=$(detect_lang)
export KAFRA_LANG  # the server and menu bar speak the same language
# lx "English" "Indonesian": print the one for the current language.
lx() { if [[ $KAFRA_LANG == id ]]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }

kafra() { printf '%s\n' "${PINK}♥ Kafra:${OFF} $*"; }
ok()    { printf '%s\n' "  ${GREEN}✓${OFF} $*"; }
warn()  { printf '%s\n' "  ${GOLD}!${OFF} $*"; }
fail()  { printf '%s\n' "  ${RED}✗${OFF} $*" >&2; exit 1; }

banner() {
  printf '%s\n' "${GOLD}${BOLD}"
  printf '%s\n' "   ⚔  K A F R A   C I T Y"
  printf '%s\n' "${OFF}${DIM}   $(lx "a Ragnarok-style world for your AI coding agents" "kota Ragnarok untuk agent AI-mu")${OFF}"
  echo
}

local_notice() {
  printf '%s\n' "${BOLD}  🔒 $(lx "Everything runs locally on this machine" "Semua berjalan lokal di laptop ini")${OFF}"
  printf '%s\n' "${DIM}     • $(lx "The server listens on 127.0.0.1 only: not reachable from Wi-Fi or the internet." "Server hanya di 127.0.0.1: tidak bisa dibuka dari WiFi atau internet.")"
  printf '%s\n' "     • $(lx "It only READS agent sessions (~/.claude, ~/.codex, ~/.gemini) and git." "Hanya MEMBACA sesi agent (~/.claude, ~/.codex, ~/.gemini) dan git.")"
  printf '%s\n' "     • $(lx "It never writes to your repos, installs no hooks, changes no agent settings." "Tidak menulis ke repo, tidak memasang hooks, tidak mengubah setting agent.")"
  printf '%s\n' "     • $(lx "It never calls an AI model and uses no tokens." "Tidak memanggil model AI dan tidak memakai token.")"
  printf '%s\n' "     • $(lx "No npm install, no internet: everything it needs is in this repo." "Tanpa npm install dan tanpa internet: semua yang dibutuhkan ada di repo.")${OFF}"
  echo
}

usage() {
  banner
  if [[ $KAFRA_LANG == id ]]; then cat <<EOF
  ${BOLD}Pakai:${OFF} ./kafra.sh [perintah]

    ${GOLD}(kosong)${OFF}   buka kota dengan agent aslimu                → http://127.0.0.1:4317
    ${GOLD}demo${OFF}       kota contoh, semua animasi sekaligus          → http://127.0.0.1:4318
    ${GOLD}simulate${OFF}   enam kota palsu yang hidup terus              → http://127.0.0.1:4319
    ${GOLD}public${OFF}     kotamu tanpa teks: aman untuk layar bersama   → http://127.0.0.1:4317
    ${GOLD}menubar${OFF}    ikon menu bar macOS dan notifikasi (SwiftBar)
    ${GOLD}autostart${OFF}  on | off | status: Kafra jalan sendiri tiap login ke Mac
    ${GOLD}setup${OFF}      cuma cek Node dan git
    ${GOLD}clean${OFF}      hapus sisa file sementara (simulasi, demo, test)
    ${GOLD}test${OFF}       jalankan test
    ${GOLD}help${OFF}       pesan ini

  ${BOLD}Di dalam kota:${OFF} drag = geser · scroll = zoom · Tab = agent berikutnya
                  M = seluruh dunia · R = replay · Esc = batal
  ${BOLD}Privasi:${OFF} salin kafra.config.example.json ke kafra.config.json untuk
           menyembunyikan repo (hide/only) atau menyensor kata (redact).
  ${BOLD}Bahasa:${OFF} KAFRA_LANG=en atau KAFRA_LANG=id · ${BOLD}Berhenti:${OFF} Ctrl+C

EOF
  else cat <<EOF
  ${BOLD}Usage:${OFF} ./kafra.sh [command]

    ${GOLD}(none)${OFF}     open your world with your real agents         → http://127.0.0.1:4317
    ${GOLD}demo${OFF}       a sample town showing every animation         → http://127.0.0.1:4318
    ${GOLD}simulate${OFF}   six fake towns that keep working              → http://127.0.0.1:4319
    ${GOLD}public${OFF}     your world with all text removed, to share    → http://127.0.0.1:4317
    ${GOLD}menubar${OFF}    macOS menu bar icon and notifications (SwiftBar)
    ${GOLD}autostart${OFF}  on | off | status: start Kafra at every Mac login
    ${GOLD}setup${OFF}      only check Node and git
    ${GOLD}clean${OFF}      remove temporary files (simulation, demo, tests)
    ${GOLD}test${OFF}       run the tests
    ${GOLD}help${OFF}       this list

  ${BOLD}In the city:${OFF} drag = pan · scroll = zoom · Tab = next agent
                M = whole world · R = replay · Esc = clear
  ${BOLD}Privacy:${OFF} copy kafra.config.example.json to kafra.config.json to hide
           repos (hide/only) or mask words (redact).
  ${BOLD}Language:${OFF} KAFRA_LANG=en or KAFRA_LANG=id · ${BOLD}Stop:${OFF} Ctrl+C

EOF
  fi
  local_notice
}

# ── Setup ───────────────────────────────────────────────────────────────────

check_node() {
  command -v node >/dev/null 2>&1 || fail "$(lx "Node.js isn't installed. Install Node 20+ from https://nodejs.org and try again." "Node.js belum terpasang. Pasang Node 20+ dari https://nodejs.org lalu coba lagi.")"
  local major
  major=$(node -p 'process.versions.node.split(".")[0]')
  (( major >= 20 )) || fail "$(lx "Node $(node -v) is too old; Kafra needs Node 20 or newer." "Node $(node -v) terlalu tua; Kafra butuh Node 20 atau lebih baru.")"
  ok "Node $(node -v)"
}

check_git() {
  command -v git >/dev/null 2>&1 || fail "$(lx "git not found; Kafra needs git to read your repos." "git tidak ditemukan; Kafra butuh git untuk membaca repo.")"
  ok "git $(git --version | awk '{print $3}')"
}

# Which agents have left sessions on this machine in the last week.
check_agents() {
  local found=0 n
  for pair in "Claude Code:$HOME/.claude/projects:*.jsonl:2" "Codex:$HOME/.codex/sessions:*.jsonl:4" "Gemini CLI:$HOME/.gemini/tmp:session-*.json:3"; do
    IFS=: read -r name dir pattern depth <<<"$pair"
    [[ -d "$dir" ]] || continue
    n=$(find "$dir" -maxdepth "$depth" -name "$pattern" -mtime -7 2>/dev/null | wc -l | tr -d ' ')
    ok "$(lx "$name: $n sessions in the last 7 days" "$name: $n sesi dalam 7 hari terakhir")"
    found=1
  done
  if (( ! found )); then
    warn "$(lx "No agent sessions found yet: the world stays empty until you use Claude Code, Codex or Gemini CLI." "Belum ada sesi agent: dunianya sepi sampai kamu memakai Claude Code, Codex, atau Gemini CLI.")"
    printf '%s\n' "    ${DIM}$(lx "Try it first: ./kafra.sh demo" "Coba dulu: ./kafra.sh demo")${OFF}"
  fi
}

setup() {
  kafra "$(lx "Welcome to Kafra Service! Let me check your supplies…" "Selamat datang di Kafra Service! Saya periksa perbekalanmu dulu…")"
  check_node
  check_git
  # Nothing to install: PixiJS ships in web/vendor/, and Kafra has no npm dependencies.
  [[ -f web/vendor/pixi.js ]] || fail "$(lx "web/vendor/pixi.js is missing. Restore it with: git checkout web/vendor" "web/vendor/pixi.js hilang. Pulihkan dengan: git checkout web/vendor")"
  ok "$(lx "Supplies complete (nothing to install)" "Perbekalan lengkap (tanpa npm install)")"
}

# ── Running ─────────────────────────────────────────────────────────────────

open_browser() {
  local url=$1
  # KAFRA_NO_OPEN=1 skips the browser, for headless machines and scripts.
  if [[ -n "${KAFRA_NO_OPEN:-}" ]]; then return; fi
  if command -v open >/dev/null 2>&1; then open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1
  else kafra "$(lx "Open this in your browser: $url" "Buka sendiri di browser: $url")"
  fi
}

# Kafra already serving on this port? Then just open it instead of failing on a busy port.
already_running() {
  curl -fs --max-time 1 "http://127.0.0.1:$1/api/sessions" >/dev/null 2>&1
}

port_busy() {
  if command -v lsof >/dev/null 2>&1; then lsof -ti "tcp:$1" >/dev/null 2>&1
  else (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
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
    kafra "$(lx "This world is already open at $url; teleporting you there." "Kota ini sudah buka di $url; saya teleport-kan ke sana.")"
    open_browser "$url"
    exit 0
  fi
  if port_busy "$port"; then
    fail "$(lx "Port $port is used by another program. Pick another: KAFRA_PORT=4400 ./kafra.sh $mode" "Port $port dipakai program lain. Pakai port lain: KAFRA_PORT=4400 ./kafra.sh $mode")"
  fi
  echo
  local_notice
  kafra "$what"
  kafra "$(lx "Warp portal open at ${BOLD}$url${OFF}; press Ctrl+C to close it." "Warp portal terbuka di ${BOLD}$url${OFF}; tekan Ctrl+C untuk menutup.")"
  echo
  wait_and_open "$port" &
  KAFRA_PORT=$port exec node "$script"
}

# ── Menu bar ────────────────────────────────────────────────────────────────

install_menubar() {
  [[ "$(uname)" == Darwin ]] || fail "$(lx "The menu bar icon is macOS-only." "Ikon menu bar hanya untuk macOS.")"
  if [[ ! -d /Applications/SwiftBar.app ]]; then
    kafra "$(lx "The menu bar icon uses SwiftBar (free, open source). Install it first:" "Ikon menu bar memakai SwiftBar (gratis, open source). Pasang dulu:")"
    printf '%s\n' "    ${BOLD}brew install --cask swiftbar${OFF}"
    printf '%s\n' "    ${DIM}$(lx "or download it from https://swiftbar.app, then run ./kafra.sh menubar again." "atau unduh dari https://swiftbar.app, lalu jalankan ./kafra.sh menubar lagi.")${OFF}"
    exit 1
  fi
  local dir
  dir=$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)
  if [[ -z "$dir" ]]; then
    kafra "$(lx "Open SwiftBar once and choose its plugin folder, then run ./kafra.sh menubar again." "Buka SwiftBar sekali dan pilih folder plugin-nya, lalu jalankan ./kafra.sh menubar lagi.")"
    open -a SwiftBar
    exit 1
  fi
  dir=${dir/#\~/$HOME}
  mkdir -p "$dir"
  # A link, not a copy: updating Kafra updates the plugin too.
  ln -sf "$PWD/integrations/swiftbar/kafra.10s.sh" "$dir/kafra.10s.sh"
  ok "$(lx "Plugin installed in $dir" "Plugin terpasang di $dir")"
  # Notifications as "Kafra" (osascript's belong to Script Editor), built from
  # source here so no third-party app is involved.
  if command -v swiftc >/dev/null 2>&1; then
    kafra "$(lx "Building Kafra Notifier from source (swiftc)…" "Merakit Kafra Notifier dari source (swiftc)…")"
    if ./integrations/notifier/build.sh >/dev/null 2>&1; then
      ok "$(lx "Kafra Notifier ready; macOS will ask once to allow notifications from \"Kafra\"" "Kafra Notifier siap; macOS akan menanyakan izin notifikasi untuk \"Kafra\" sekali")"
    else
      warn "$(lx "Couldn't build Kafra Notifier; notifications will come from SwiftBar." "Gagal merakit Kafra Notifier; notifikasi memakai SwiftBar.")"
    fi
  else
    warn "$(lx "swiftc not found (install the Xcode Command Line Tools); notifications will come from SwiftBar." "swiftc tidak ada (pasang Xcode Command Line Tools); notifikasi memakai SwiftBar.")"
  fi
  # SwiftBar watches its plugin folder, so a running SwiftBar picks the plugin up
  # by itself. Don't send it swiftbar:// URLs: SwiftBar 2.1.1 crashes on them
  # while it is still starting.
  pgrep -x SwiftBar >/dev/null || open -a SwiftBar
  kafra "$(lx "Look at the top-right corner: ⚔ shows how many agents are waiting for you." "Lihat pojok kanan atas: ⚔ menunjukkan berapa agent yang menunggumu.")"
  printf '%s\n' "  ${DIM}$(lx "A notification appears when an agent starts waiting. Kafra must be running (./kafra.sh or autostart)." "Notifikasi muncul saat ada agent yang mulai menunggu. Kafra harus jalan (./kafra.sh atau autostart).")${OFF}"
}

# ── Housekeeping ────────────────────────────────────────────────────────────

# Everything Kafra itself writes outside the repo lives in the temp folder under
# these names. Your agents' sessions and repos are never touched.
clean_temp() {
  local tmp freed=0
  tmp=$(node -p 'require("os").tmpdir()')
  [[ -n "$tmp" && -d "$tmp" ]] || fail "$(lx "Couldn't find the temp folder." "Folder sementara tidak ditemukan.")"
  for p in "$tmp"/kafra-sim "$tmp"/kafra-demo-projects "$tmp"/kafra-test-* "$tmp"/kafra-sources-*; do
    [[ -e "$p" ]] || continue
    freed=$((freed + $(du -sk "$p" | cut -f1)))
    rm -rf "$p"
  done
  ok "$(lx "Temporary files removed ($((freed / 1024)) MB)" "Sisa file sementara dihapus ($((freed / 1024)) MB)")"
}

# ── Autostart (launchd) ─────────────────────────────────────────────────────

LABEL="dev.kafra.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGDIR="$HOME/Library/Logs/Kafra"
DOMAIN="gui/$(id -u)"

xml_escape() { local s=${1//&/&amp;}; s=${s//</&lt;}; s=${s//>/&gt;}; printf '%s' "$s"; }

autostart_on() {
  [[ "$(uname)" == Darwin ]] || fail "$(lx "Autostart uses launchd and is macOS-only." "Autostart memakai launchd, hanya untuk macOS.")"
  setup
  local node port
  node=$(command -v node)
  port=${KAFRA_PORT:-4317}
  mkdir -p "$HOME/Library/LaunchAgents" "$LOGDIR"

  # Whatever already serves Kafra on this port (a ./kafra.sh in a terminal) makes
  # way, or launchd's copy would fail to bind and keep retrying.
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  if already_running "$port"; then
    lsof -ti "tcp:$port" -sTCP:LISTEN | xargs kill 2>/dev/null || true
    sleep 1
  fi

  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$node")</string>
    <!-- A small heap cap keeps a long-running server lean; it needs ~30 MB of heap. -->
    <string>--max-old-space-size=128</string>
    <string>$(xml_escape "$PWD/src/server.mjs")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml_escape "$PWD")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KAFRA_PORT</key><string>$port</string>
    <key>KAFRA_LANG</key><string>$KAFRA_LANG</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <!-- Restart after a crash, but not in a tight loop if the port is taken. -->
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$(xml_escape "$LOGDIR/server.log")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$LOGDIR/server.log")</string>
</dict>
</plist>
PLIST
  plutil -lint "$PLIST" >/dev/null || fail "$(lx "Invalid launchd file: $PLIST" "File launchd tidak valid: $PLIST")"
  launchctl bootstrap "$DOMAIN" "$PLIST" || fail "$(lx "launchctl refused $PLIST" "launchctl menolak $PLIST")"
  ok "$(lx "Kafra will start at every login (launchd: $LABEL)" "Kafra akan jalan sendiri tiap login (launchd: $LABEL)")"

  # The menu bar icon needs SwiftBar running too.
  if [[ -d /Applications/SwiftBar.app ]]; then
    if ! osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null | grep -q SwiftBar; then
      osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/SwiftBar.app", hidden:true}' >/dev/null 2>&1 \
        && ok "$(lx "SwiftBar added to Login Items" "SwiftBar ditambahkan ke Login Items")" \
        || warn "$(lx "Add SwiftBar to Login Items yourself (System Settings → General → Login Items)." "Tambahkan SwiftBar ke Login Items sendiri (System Settings → General → Login Items).")"
    else
      ok "$(lx "SwiftBar is already in Login Items" "SwiftBar sudah ada di Login Items")"
    fi
  fi

  for _ in $(seq 1 20); do already_running "$port" && break; sleep 0.5; done
  if already_running "$port"; then
    ok "$(lx "Server up at http://127.0.0.1:$port" "Server hidup di http://127.0.0.1:$port")"
  else
    fail "$(lx "The server didn't start. Check the log: $LOGDIR/server.log" "Server belum hidup. Cek log: $LOGDIR/server.log")"
  fi
  printf '%s\n' "  ${DIM}Node: $node — $(lx "if you switch Node versions (nvm), run ./kafra.sh autostart on again." "kalau versi Node diganti (nvm), jalankan ./kafra.sh autostart on lagi.")${OFF}"
}

autostart_off() {
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  rm -f "$PLIST"
  ok "$(lx "Autostart off and server stopped. (SwiftBar stays in Login Items.)" "Autostart dimatikan dan server dihentikan. (SwiftBar dibiarkan di Login Items.)")"
}

autostart_status() {
  local port=${KAFRA_PORT:-4317}
  if [[ -f "$PLIST" ]]; then ok "$(lx "Autostart on: $PLIST" "Autostart aktif: $PLIST")"; else printf '%s\n' "  · $(lx "Autostart off" "Autostart mati")"; fi
  local pid
  pid=$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null | awk '/^\tpid =/ {print $3}')
  [[ -n "$pid" ]] && ok "$(lx "Run by launchd (pid $pid)" "Dijalankan launchd (pid $pid)")"
  if already_running "$port"; then ok "$(lx "Server answering at http://127.0.0.1:$port" "Server menjawab di http://127.0.0.1:$port")"; else printf '%s\n' "  ${RED}✗${OFF} $(lx "No server answering on port $port" "Server tidak menjawab di port $port")"; fi
  printf '%s\n' "  ${DIM}Log: $LOGDIR/server.log${OFF}"
}

cmd=${1:-start}
case "$cmd" in
  start|"")
    banner; setup; check_agents
    run start "${KAFRA_PORT:-4317}" src/server.mjs "$(lx "Opening the towns where your agents work…" "Membuka kota-kota tempat agent-mu bekerja…")" ;;
  menubar)
    banner
    install_menubar ;;
  clean)
    clean_temp ;;
  autostart)
    case "${2:-status}" in
      on) banner; autostart_on ;;
      off) autostart_off ;;
      status) autostart_status ;;
      *) fail "$(lx "Usage: ./kafra.sh autostart on|off|status" "Pakai: ./kafra.sh autostart on|off|status")" ;;
    esac ;;
  public)
    banner; setup
    kafra "$(lx "Public mode: repo names, paths, prompts and commit subjects are hidden by the server." "Mode publik: nama repo, path, prompt, dan judul commit disembunyikan di server.")"
    export KAFRA_PUBLIC=1
    run public "${KAFRA_PORT:-4317}" src/server.mjs "$(lx "Opening your world in public mode…" "Membuka kota-kotamu dalam mode publik…")" ;;
  demo)
    banner; setup
    run demo "${KAFRA_PORT:-4318}" scripts/demo.mjs "$(lx "Opening a sample town: 12 adventurers, every kind of activity." "Membuka kota contoh: 12 adventurer, semua jenis aktivitas.")" ;;
  simulate|sim)
    banner; setup
    kafra "$(lx "Building six fake towns in a temp folder (your real repos are untouched)…" "Membangun enam kota palsu di folder sementara (repo aslimu tidak disentuh)…")"
    run simulate "${KAFRA_PORT:-4319}" scripts/simulate.mjs "$(lx "Six towns, ten adventurers, working until you close it." "Enam kota, sepuluh adventurer, bekerja terus sampai kamu menutupnya.")" ;;
  setup)
    banner; setup; check_agents; echo; local_notice
    kafra "$(lx "Ready! Run ${BOLD}./kafra.sh${OFF} to open your world." "Siap! Jalankan ${BOLD}./kafra.sh${OFF} untuk membuka kotamu.")" ;;
  test)
    setup; node --test tests/*.test.mjs ;;
  help|-h|--help)
    usage ;;
  *)
    usage; fail "$(lx "Unknown command: $cmd" "Perintah tidak dikenal: $cmd")" ;;
esac
