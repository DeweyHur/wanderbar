#!/usr/bin/env bash
# Installs the release APK on the running emulator, launches it, sends a share intent, and fails if the app
# dies. Crash lines are printed and turned into GitHub annotations (readable without downloading logs).
set -u
APK="$1"
PKG=app.wanderbar.mobile
OUT=android-smoke
mkdir -p "$OUT"

annotate() { # title, file
  local body
  body=$(head -c 6000 "$2" | sed -e 's/%/%25/g' | awk '{printf "%s%%0A", $0}')
  echo "::error title=$1::$body"
}

adb install -r "$APK" || { echo "::error title=install failed::adb install failed"; exit 1; }
adb logcat -c

alive() { adb shell pidof "$PKG" >/dev/null 2>&1; }

step() { # name, seconds
  sleep "$2"
  adb exec-out screencap -p > "$OUT/$1.png" || true
  if ! alive; then
    echo "App is not running after: $1"
    return 1
  fi
  echo "OK: $1"
}

failed=0
adb shell am start -W -n "$PKG/.MainActivity"
step "1-launch" 25 || failed=1

if [ $failed = 0 ]; then
  adb shell am start -W -a android.intent.action.SEND -t text/plain \
    --es android.intent.extra.TEXT "'Blue Bottle Coffee https://maps.app.goo.gl/abc123'" -n "$PKG/.MainActivity"
  step "2-share" 15 || failed=1
fi

adb logcat -d -v brief > "$OUT/logcat-all.txt" || true
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ReactNative|Expo|$PKG|libc.*Fatal|DEBUG  \(" "$OUT/logcat-all.txt" > "$OUT/logcat-app.txt" || true
# The first crash block, if any.
awk '/FATAL EXCEPTION|Fatal signal|ReactNativeJS.*(Error|Exception)/{p=1} p{print; n++} n>=80{exit}' "$OUT/logcat-all.txt" > "$OUT/crash.txt" || true

echo "----- app log (last 200 lines) -----"
tail -n 200 "$OUT/logcat-app.txt"

if [ -s "$OUT/crash.txt" ]; then
  echo "----- crash -----"; cat "$OUT/crash.txt"
  annotate "Android crash" "$OUT/crash.txt"
  failed=1
elif [ $failed = 1 ]; then
  tail -n 60 "$OUT/logcat-app.txt" > "$OUT/tail.txt"
  annotate "App not running (no crash block found)" "$OUT/tail.txt"
fi
exit $failed
