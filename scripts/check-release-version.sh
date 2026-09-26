#!/usr/bin/env bash
# RELEASE VERSION GATE (FEAT-008 PHASE 2). SELF-CONTAINED: CI CANNOT READ .agents/, SO THE RULE LIVES HERE.
#   bash scripts/check-release-version.sh v0.5.0-beta.7   CHECK THE TAG AGAINST THE FILES
#   bash scripts/check-release-version.sh                 JUST CHECK THAT THE FILES AGREE
# FAILS (EXIT 1) WHEN Cargo.toml, web/package.json AND Cargo.lock DISAGREE, WHEN A WEB FALLBACK VERSION LITERAL
# DIFFERS FROM THEM, OR WHEN THE TAG IS MALFORMED OR NAMES ANOTHER VERSION. EXTENSION VERSIONS ARE NOT CHECKED.
set -euo pipefail

cd "$(dirname "$0")/.."

TAG="${1:-}"
SEMVER='[0-9]+[.][0-9]+[.][0-9]+(-[0-9A-Za-z.]+)?'

fail() {
	echo "check-release-version: $*" >&2
	exit 1
}

if [ -n "$TAG" ] && ! printf '%s' "$TAG" | grep -Eq "^v${SEMVER}\$"; then
	fail "tag '$TAG' is not v<major>.<minor>.<patch>[-prerelease]"
fi

# FIRST version = "..." INSIDE [package]
cargo_toml=$(awk '/^\[package\]/{p=1; next} /^\[/{p=0} p && /^version *=/{gsub(/.*= *"|".*/, ""); print; exit}' Cargo.toml)
web_pkg=$(node -p "require('./web/package.json').version")
# THE version LINE DIRECTLY AFTER name = "xianscan-rust"
cargo_lock=$(awk '/^name = "xianscan-rust"$/{getline; gsub(/.*= *"|".*/, ""); print; exit}' Cargo.lock)

echo "tag=${TAG:-<none>} Cargo.toml=$cargo_toml web/package.json=$web_pkg Cargo.lock=$cargo_lock"

[ -n "$cargo_toml" ] || fail "could not read the version from Cargo.toml"
[ "$cargo_toml" = "$web_pkg" ] || fail "Cargo.toml ($cargo_toml) and web/package.json ($web_pkg) differ"
[ "$cargo_toml" = "$cargo_lock" ] || fail "Cargo.toml ($cargo_toml) and Cargo.lock ($cargo_lock) differ"
if [ -n "$TAG" ] && [ "${TAG#v}" != "$cargo_toml" ]; then
	fail "tag $TAG does not match the files ($cargo_toml)"
fi

# WEB FALLBACK LITERALS (ADR-006): EVERY VERSION-LOOKING STRING IN THESE FILES, WITH A +dev SUFFIX STRIPPED
fallback_files="web/src/routes/api/system/version/+server.ts web/src/routes/api/system/hardware/+server.ts web/src/lib/stores/version-check.ts"
bad=0
for f in $fallback_files; do
	[ -f "$f" ] || fail "fallback file $f is missing"
	for v in $(grep -Eo "'${SEMVER}([+]dev)?'" "$f" | tr -d "'" | sed 's/[+]dev$//' | sort -u); do
		if [ "$v" != "$cargo_toml" ]; then
			echo "  $f has fallback version $v (expected $cargo_toml)" >&2
			bad=1
		fi
	done
done
[ "$bad" = 0 ] || fail "web fallback version literals are out of date"

echo "check-release-version: ok ($cargo_toml)"
