#!/bin/bash
# Installs the audit relay on the lab Mac as a LaunchDaemon (org.ophthaudit.relay), once, with the owner's go-ahead:
#
#     sudo relay/deploy/install.sh <user> [<repository folder>]
#
# <user> is the account the relay runs as (it owns the repository and the data_dir of the settings); the repository
# folder defaults to the one this script is in. Before running it: relay/relay.local.json from
# relay/relay.local.example.json (and, for the backup, the token file it names, mode 600).
# Steps: a venv in relay/.venv from /usr/bin/python3 (Python 3.9 is enough) with huggingface_hub for the backup,
# the plist with the paths filled in, loaded (an earlier copy is unloaded first), then the status check on
# http://127.0.0.1:<port><prefix>/status. Running it again updates the installation.
set -euo pipefail
LABEL=org.ophthaudit.relay
USER_NAME="${1:-}"
[ -n "$USER_NAME" ] || { echo "usage: sudo $0 <user> [<repository folder>]" >&2; exit 2; }
[ "$(id -u)" = 0 ] || { echo "run it with sudo" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "no user $USER_NAME" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "${2:-$HERE/../..}" && pwd)"
HOME_DIR="$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[ -n "$HOME_DIR" ] || HOME_DIR="$(eval echo "~$USER_NAME")"
SETTINGS="$REPO/relay/relay.local.json"
[ -f "$REPO/relay/relay.py" ] || { echo "$REPO is not the repository (no relay/relay.py)" >&2; exit 2; }
[ -f "$SETTINGS" ] || { echo "first copy relay/relay.local.example.json to $SETTINGS and fill it in" >&2; exit 2; }

echo "== the venv"
sudo -u "$USER_NAME" /usr/bin/python3 -m venv "$REPO/relay/.venv"
sudo -u "$USER_NAME" "$REPO/relay/.venv/bin/python" -m pip install --quiet --upgrade pip huggingface_hub \
  || echo "huggingface_hub could not be installed: the relay runs, without the backup"

echo "== the LaunchDaemon"
sudo -u "$USER_NAME" mkdir -p "$HOME_DIR/Library/Logs"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
sed -e "s#__REPO__#$REPO#g" -e "s#__USER__#$USER_NAME#g" -e "s#__HOME__#$HOME_DIR#g" "$HERE/$LABEL.plist" > "$PLIST"
chown root:wheel "$PLIST"
chmod 644 "$PLIST"
plutil -lint "$PLIST"
launchctl bootout system "$PLIST" 2>/dev/null || true
launchctl bootstrap system "$PLIST"

echo "== the status check"
read -r PORT PREFIX < <("$REPO/relay/.venv/bin/python" -c '
import json, sys
s = json.load(open(sys.argv[1]))
print(s.get("port", 8097), "/" + str(s.get("prefix", "/api/ophth-audit")).strip("/"))' "$SETTINGS")
for i in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$PORT$PREFIX/status"; then echo; echo "the relay is up (log: $HOME_DIR/Library/Logs/ophth-audit-relay.log)"; exit 0; fi
  sleep 1
done
echo "the relay does not answer on http://127.0.0.1:$PORT$PREFIX/status; see $HOME_DIR/Library/Logs/ophth-audit-relay.log" >&2
exit 1
