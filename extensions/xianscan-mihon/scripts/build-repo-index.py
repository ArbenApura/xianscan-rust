#!/usr/bin/env python3
# MIHON / TACHIYOMI EXTENSION REPO INDEX, DERIVED FROM THE BUILD (FEAT-005 PHASE 10, ADR-006).
#   python3 extensions/xianscan-mihon/scripts/build-repo-index.py <out-dir> [output-metadata.json]
# READS versionCode / versionName / outputFile FROM THE APK'S output-metadata.json, SO THE INDEX CAN NEVER DESCRIBE A
# DIFFERENT APK THAN THE ONE BUILT. WRITES <out-dir>/{,apk/}tachiyomi-all.xianscan-v<version>.apk, index.json,
# index.min.json AND index.pb (GZIPPED PROTOBUF, MIHON NETWORKEXTENSIONSTORE MODEL). repo.json IS NOT WRITTEN HERE.
import gzip
import hashlib
import json
import os
import shutil
import sys

PKG = 'eu.kanade.tachiyomi.extension.all.xianscan'
SOURCE_NAME = 'XianScan'
SOURCE_LANG = 'all'
SOURCE_VERSION_ID = 1
BASE_URL = 'http://127.0.0.1:8124'
REPO_RAW = 'https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo'
ICON_URL = 'https://raw.githubusercontent.com/ArbenApura/xianscan-rust/main/extensions/xianscan-mihon/app/src/main/res/mipmap-xhdpi/ic_launcher.png'
WEBSITE = 'https://github.com/ArbenApura/xianscan-rust'
# SIGNING KEY FINGERPRINT: OWNED BY FEAT-008 (UNCHANGED HERE)
SIGNING_FINGERPRINT = '2d2bfe33f124f582d6f2f60ed4192b79cb51afc3a17f6dd92d7df87e6886dfa6'
# THE SOURCE ID MIHON COMPUTES FOR "xianscan/all/1"; A RENAME OR LANG CHANGE WOULD SILENTLY ORPHAN USER LIBRARIES
EXPECTED_SOURCE_ID = 1922189614592757037
CONTENT_WARNING_SAFE = 1


def source_id(name, lang, version_id):
    # SAME FORMULA AS HttpSource.generateId: FIRST 8 BYTES OF md5("<name lowercased>/<lang>/<versionId>") AS A
    # BIG-ENDIAN LONG, MASKED TO A NON-NEGATIVE VALUE
    digest = hashlib.md5(f'{name.lower()}/{lang}/{version_id}'.encode('utf-8')).digest()
    return int.from_bytes(digest[:8], 'big') & 0x7FFFFFFFFFFFFFFF


def encode_varint(val):
    out = bytearray()
    while val > 0x7F:
        out.append((val & 0x7F) | 0x80)
        val >>= 7
    out.append(val & 0x7F)
    return bytes(out)


def field(num, wire, data):
    return encode_varint((num << 3) | wire) + data


def varint_field(num, val):
    return field(num, 0, encode_varint(val))


def bytes_field(num, data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return field(num, 2, encode_varint(len(data)) + data)


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: build-repo-index.py <out-dir> [output-metadata.json]')
    out_dir = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    meta_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'app', 'build', 'outputs', 'apk', 'release', 'output-metadata.json')
    with open(meta_path, encoding='utf-8') as f:
        meta = json.load(f)
    elements = meta.get('elements', [])
    if len(elements) != 1:
        sys.exit(f'expected exactly one APK in {meta_path}, found {len(elements)}')
    element = elements[0]
    version_code = int(element['versionCode'])
    version_name = str(element['versionName'])
    apk_src = os.path.join(os.path.dirname(meta_path), element['outputFile'])
    if not os.path.isfile(apk_src):
        sys.exit(f'APK named in {meta_path} not found: {apk_src}')
    apk_name = f'tachiyomi-all.xianscan-v{version_name}.apk'
    ext_lib = version_name.rsplit('.', 1)[0]

    sid = source_id(SOURCE_NAME, SOURCE_LANG, SOURCE_VERSION_ID)
    if sid != EXPECTED_SOURCE_ID:
        sys.exit(f'source id changed: {sid} != {EXPECTED_SOURCE_ID} (did the source name or language change?)')

    os.makedirs(os.path.join(out_dir, 'apk'), exist_ok=True)
    shutil.copyfile(apk_src, os.path.join(out_dir, apk_name))
    shutil.copyfile(apk_src, os.path.join(out_dir, 'apk', apk_name))

    index = [
        {
            'name': SOURCE_NAME,
            'pkg': PKG,
            'apk': apk_name,
            'lang': SOURCE_LANG,
            'code': version_code,
            'version': version_name,
            'nsfw': 0,
            'hasReadme': 1,
            'hasChangelog': 0,
            'sources': [{'name': SOURCE_NAME, 'lang': SOURCE_LANG, 'id': sid, 'baseUrl': BASE_URL}],
        }
    ]
    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
        f.write('\n')
    with open(os.path.join(out_dir, 'index.min.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, separators=(',', ':'))

    source_bytes = varint_field(1, sid) + bytes_field(2, SOURCE_NAME) + bytes_field(3, SOURCE_LANG) + bytes_field(4, BASE_URL)
    assets_bytes = bytes_field(1, f'{REPO_RAW}/{apk_name}') + bytes_field(2, ICON_URL)
    ext_bytes = (
        bytes_field(1, SOURCE_NAME)
        + bytes_field(2, PKG)
        + bytes_field(3, assets_bytes)
        + bytes_field(4, ext_lib)
        + varint_field(5, version_code)
        + bytes_field(6, version_name)
        + varint_field(7, CONTENT_WARNING_SAFE)
        + bytes_field(8, source_bytes)
    )
    root_bytes = (
        bytes_field(1, SOURCE_NAME)
        + bytes_field(2, 'XIAN')
        + bytes_field(3, SIGNING_FINGERPRINT)
        + bytes_field(4, bytes_field(1, WEBSITE))
        + bytes_field(101, bytes_field(1, ext_bytes))
    )
    with open(os.path.join(out_dir, 'index.pb'), 'wb') as f:
        f.write(gzip.compress(root_bytes))
    print(f'repo index: {apk_name} (code {version_code}, lib {ext_lib}, source id {sid}), index.pb {len(root_bytes)} bytes')


if __name__ == '__main__':
    main()
