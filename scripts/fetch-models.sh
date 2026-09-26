#!/usr/bin/env bash
# FETCH THE ONNX MODELS PINNED IN models/manifest.tsv (FEAT-008 PHASE 3). THE SAME LIST SERVES CI AND DEVELOPERS.
#   bash scripts/fetch-models.sh                DOWNLOAD WHAT IS MISSING OR WRONG, THEN CHECK EVERYTHING
#   bash scripts/fetch-models.sh --verify-only  DOWNLOAD NOTHING; EXIT 1 IF ANY FILE IS MISSING OR DIFFERENT
# A FILE IS ACCEPTED ONLY WITH THE EXACT SIZE AND SHA-256 FROM THE MANIFEST; A BAD DOWNLOAD IS DELETED.
set -euo pipefail

cd "$(dirname "$0")/.."

VERIFY_ONLY=0
if [ "${1:-}" = "--verify-only" ]; then
	VERIFY_ONLY=1
fi

hash_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | cut -d' ' -f1
	else
		shasum -a 256 "$1" | cut -d' ' -f1
	fi
}

size_of() {
	wc -c <"$1" | tr -d ' '
}

matches() {
	# $1 PATH, $2 SIZE, $3 SHA256
	[ -f "$1" ] && [ "$(size_of "$1")" = "$2" ] && [ "$(hash_of "$1")" = "$3" ]
}

status=0
while IFS= read -r line; do
	[ -n "$line" ] || continue
	# THE MANIFEST IS TAB-SEPARATED; cut SPLITS ON TABS BY DEFAULT
	file=$(printf '%s\n' "$line" | cut -f1)
	size=$(printf '%s\n' "$line" | cut -f2)
	sha=$(printf '%s\n' "$line" | cut -f3)
	url=$(printf '%s\n' "$line" | cut -f4)
	target="models/$file"

	if matches "$target" "$size" "$sha"; then
		echo "ok       $file"
		continue
	fi
	if [ "$VERIFY_ONLY" = 1 ]; then
		if [ -f "$target" ]; then
			echo "MISMATCH $file (expected $size bytes, sha256 $sha)" >&2
		else
			echo "MISSING  $file" >&2
		fi
		status=1
		continue
	fi

	echo "fetch    $file"
	part="$target.part"
	rm -f "$part"
	curl --retry 5 --retry-delay 3 --retry-all-errors --connect-timeout 30 --max-time 300 -f -sSL -o "$part" "$url"
	if matches "$part" "$size" "$sha"; then
		mv -f "$part" "$target"
		echo "ok       $file"
	else
		echo "BAD DOWNLOAD $file: expected $size bytes sha256 $sha, got $(size_of "$part") bytes sha256 $(hash_of "$part")" >&2
		rm -f "$part"
		status=1
	fi
done < <(tail -n +2 models/manifest.tsv)

exit "$status"
