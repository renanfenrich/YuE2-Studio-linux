#!/bin/bash
# Build/test tooling. Needs curl, Node.js, Xvfb, xauth and dbus-run-session.
# Extracts into a disposable directory; never installs over a user's studio.
set -euo pipefail
package="$(realpath "${1:?usage: smoke-linux-package.sh PACKAGE.deb|PACKAGE.AppImage}")"
work="$(mktemp -d -t yue2-package-smoke-XXXXXX)"
runner=""
cleanup() {
  if [ -n "$runner" ]; then kill -- "-$runner" 2>/dev/null || true; wait "$runner" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
if curl --silent --max-time 1 http://127.0.0.1:8791/health >/dev/null; then
  echo 'Port 8791 is occupied; close the studio before this smoke check.' >&2
  exit 1
fi
case "$package" in
  *.deb) dpkg-deb -x "$package" "$work/extract"; prefix="$work/extract" ;;
  *.AppImage)
    cd "$work"
    chmod +x "$package"
    "$package" --appimage-extract >/dev/null
    prefix="$work/squashfs-root"
    ;;
  *) echo 'Expected a .deb or .AppImage' >&2; exit 1 ;;
esac
binary="$prefix/usr/bin/YuE2-Studio"
engine="$prefix/usr/lib/YuE2 Studio/resources/yue2-cpp/yue-server"
test -x "$binary"
test -x "$engine"
for executable in "$binary" "$engine"; do
  dependencies="$(ldd "$executable")"
  if [[ "$dependencies" == *'not found'* ]]; then echo "$dependencies" >&2; exit 1; fi
done
"$engine" --help >"$work/engine-help.log" 2>&1 || true
grep -q Usage "$work/engine-help.log"
export XDG_DATA_HOME="$work/user data" DO_NOT_TRACK=1 STUDIO_TELEMETRY=0
# The desktop must discover its packaged engine and XDG data path itself.
unset YUE_STUDIO_DATA_ROOT YUE_ENGINE_ROOT YUE_ENGINE_BIN YUE_MODELS_ROOT YUE_STUDIO_SETTINGS_PATH YUE_STUDIO_PORT
setsid dbus-run-session -- xvfb-run -a "$binary" >"$work/desktop.log" 2>&1 &
runner=$!
ready=false
for attempt in $(seq 1 90); do
  if curl --fail --silent --max-time 1 http://127.0.0.1:8791/health >"$work/health.json"; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then cat "$work/desktop.log" >&2; exit 1; fi
curl --fail --silent http://127.0.0.1:8791/setup/status >"$work/setup.json"
curl --fail --silent http://127.0.0.1:8791/engine/options >"$work/options.json"
node --input-type=module - "$work" "$engine" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [root, engine] = process.argv.slice(2);
const read = name => JSON.parse(readFileSync(`${root}/${name}.json`));
assert.equal(read('health').runtime, 'native');
assert.equal(read('health').engine_bundle_present, true);
assert.equal(read('setup').data_directory, `${root}/user data/yue2-studio`);
assert.equal(read('setup').ready, false);
assert.equal(read('options').executable, engine);
console.log('PASS: native desktop launch, packaged engine discovery and XDG first-run data path. Inference, dialogs and audible playback require separate acceptance.');
JS
