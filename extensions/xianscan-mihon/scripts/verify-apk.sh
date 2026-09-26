#!/usr/bin/env bash
# APK CONTENTS GUARD (FEAT-005 PHASE 8): THE EXTENSION APK MAY CONTAIN ONLY XIANSCAN'S OWN CLASSES. THE HOST APP
# (MIHON / TACHIMANGA) PROVIDES KOTLIN, KOTLINX, OKHTTP, RX, INJEKT, ANDROIDX AND THE EXTENSION API AT RUNTIME.
#   bash scripts/verify-apk.sh [path/to/app.apk]   (DEFAULT: THE SINGLE APK UNDER app/build/outputs/apk/release/)
set -euo pipefail

cd "$(dirname "$0")/.."

DEX_CEILING_BYTES=${DEX_CEILING_BYTES:-131072}
OWN_PREFIX='Leu/kanade/tachiyomi/extension/all/xianscan/'

fail() {
	echo "verify-apk: $*" >&2
	exit 1
}

apk="${1:-}"
if [ -z "$apk" ]; then
	shopt -s nullglob
	found=(app/build/outputs/apk/release/*.apk)
	shopt -u nullglob
	[ "${#found[@]}" -eq 1 ] || fail "expected exactly one APK under app/build/outputs/apk/release/, found ${#found[@]}"
	apk="${found[0]}"
fi
[ -f "$apk" ] || fail "APK not found: $apk"

# DEXDUMP FROM $ANDROID_HOME (CI) OR sdk.dir IN local.properties (LOCAL)
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$sdk" ] && [ -f local.properties ]; then
	sdk=$(grep '^sdk.dir=' local.properties | head -1 | cut -d= -f2- | sed 's/\\:/:/g; s/\\\\/\//g; s/\\/\//g')
fi
dexdump=""
if [ -n "$sdk" ] && [ -d "$sdk/build-tools" ]; then
	for candidate in $(ls -d "$sdk"/build-tools/*/ 2>/dev/null | sort -V -r); do
		for name in dexdump dexdump.exe; do
			if [ -x "$candidate$name" ] || [ -f "$candidate$name" ]; then
				dexdump="$candidate$name"
				break 2
			fi
		done
	done
fi
[ -n "$dexdump" ] || fail "dexdump not found (set ANDROID_HOME or sdk.dir in local.properties)"

listing=$(unzip -l "$apk")

# 1. NO BUNDLED KOTLIN STDLIB
if printf '%s\n' "$listing" | grep -Eq ' kotlin/|[.]kotlin_builtins$'; then
	printf '%s\n' "$listing" | grep -E ' kotlin/|[.]kotlin_builtins$' | head -5 >&2
	fail "the APK bundles the Kotlin stdlib (kotlin/ entries or .kotlin_builtins)"
fi

# 2. NO KOTLIN TOOLING METADATA
if printf '%s\n' "$listing" | grep -q 'kotlin-tooling-metadata.json'; then
	fail "the APK contains kotlin-tooling-metadata.json"
fi

# 3. EVERY CLASS IN EVERY classes*.dex IS XIANSCAN'S OWN
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
unzip -q -o "$apk" 'classes*.dex' -d "$tmp"
shopt -s nullglob
dexes=("$tmp"/classes*.dex)
shopt -u nullglob
[ "${#dexes[@]}" -gt 0 ] || fail "no classes.dex in $apk"
classes=$("$dexdump" "${dexes[@]}" | grep 'Class descriptor' | sed "s/.*'\(.*\)'.*/\1/")
count=$(printf '%s\n' "$classes" | grep -c . || true)
offenders=$(printf '%s\n' "$classes" | grep -v "^$OWN_PREFIX" || true)
if [ -n "$offenders" ]; then
	printf '%s\n' "$offenders" | head -20 >&2
	fail "classes outside $OWN_PREFIX are packaged (the host provides them)"
fi

# 4. DEX SIZE CEILING
size=0
for d in "${dexes[@]}"; do
	size=$((size + $(wc -c <"$d" | tr -d ' ')))
done
[ "$size" -le "$DEX_CEILING_BYTES" ] || fail "classes*.dex is $size bytes, over the $DEX_CEILING_BYTES byte ceiling"

echo "verify-apk: ok ($apk: $count classes, $size bytes of dex, ceiling $DEX_CEILING_BYTES)"
