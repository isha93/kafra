#!/bin/bash
# <xbar.title>Kafra</xbar.title>
# <xbar.desc>Agents waiting for you, from your local Kafra City.</xbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
#
# SwiftBar plugin for Kafra. Runs every 10 s (the ".10s." in the name).
# It only talks to Kafra on 127.0.0.1; nothing leaves this machine.
#
# Install with:  ./kafra.sh menubar

PORT="${KAFRA_PORT:-4317}"
STATE="${TMPDIR:-/tmp}/kafra-menubar-notified"
KAFRA_DIR="$(cd "$(dirname "$(readlink "$0" || echo "$0")")/../.." && pwd)"

out=$(curl -fs --max-time 3 "http://127.0.0.1:$PORT/api/swiftbar")
if [[ -z "$out" ]]; then
  echo "⚔ | color=#8a8a8a"
  echo "---"
  echo "Kafra belum jalan"
  echo "Buka Kafra… | bash=$KAFRA_DIR/kafra.sh terminal=true"
  exit 0
fi

# Native notification once per agent that starts waiting. Text goes to
# osascript as arguments, never inside the script, so it can't inject anything.
touch "$STATE"
now=$(grep '^#notify ' <<<"$out" | cut -d' ' -f2 | sort)
while read -r line; do
  [[ -z "$line" ]] && continue
  id=$(cut -d' ' -f2 <<<"$line")
  text=$(cut -d' ' -f3- <<<"$line")
  if ! grep -qxF "$id" "$STATE"; then
    osascript -e 'on run argv' -e 'display notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"' -e 'end run' "Kafra" "$text" >/dev/null 2>&1
  fi
done < <(grep '^#notify ' <<<"$out")
# Remember who is waiting now; an agent that stops and waits again notifies again.
printf '%s\n' "$now" > "$STATE"

grep -v '^#notify ' <<<"$out"
