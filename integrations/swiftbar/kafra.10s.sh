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

# One notification per agent that starts waiting. Kafra Notifier (built by
# ./kafra.sh menubar) posts it as "Kafra" and opens the agent when clicked;
# without it, SwiftBar's own notify is the fallback. The server URL-encodes
# every field and the notifier decodes them, so nothing here needs quoting.
NOTIFIER="$KAFRA_DIR/integrations/notifier/build/Kafra Notifier.app"
touch "$STATE"
now=$(grep '^#notify ' <<<"$out" | cut -d' ' -f2 | sort)
while read -r _ id body href; do
  [[ -z "$id" ]] && continue
  grep -qxF "$id" "$STATE" && continue
  if [[ -d "$NOTIFIER" ]]; then
    open -g -n -a "$NOTIFIER" --args --title Kafra --body "$body" --url "$href" >/dev/null 2>&1
  else
    open -g "swiftbar://notify?plugin=kafra.10s.sh&title=Kafra&body=$body&href=$href" >/dev/null 2>&1
  fi
done < <(grep '^#notify ' <<<"$out")
# Remember who is waiting now; an agent that stops and waits again notifies again.
printf '%s\n' "$now" > "$STATE"

grep -v '^#notify ' <<<"$out"
