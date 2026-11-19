#!/usr/bin/env python3
"""Stamp sw.js VERSION (and the ?v= file addresses in index.html) with a hash of the app files.

Any change to a cached file changes the version, so phones always pick up
the full new version, and a forgotten manual bump can never block an update.
The ?v= addresses make every file URL unique per version, so a browser can
never combine an old module with a new one (that broke the Settings button once).

  python3 tools/stamp-sw.py          # update sw.js
  python3 tools/stamp-sw.py --check  # exit 1 if sw.js is stale (used by tests)
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SW = ROOT / 'sw.js'
INDEX = ROOT / 'index.html'
STAMP = re.compile(r'\?v=[0-9a-f]{10}')


def compute(sw_text):
    assets = re.search(r'const ASSETS = \[(.*?)\];', sw_text, re.S).group(1)
    paths = sorted(set(p for p in re.findall(r"'\./([^']*)'", assets) if p))
    h = hashlib.sha256()
    for p in paths:
        f = ROOT / p
        if not f.is_file():
            sys.exit(f'missing asset listed in sw.js: {p}')
        data = STAMP.sub('?v=', f.read_text(encoding='utf-8')).encode() if p == 'index.html' else f.read_bytes()
        h.update(p.encode() + b'\0' + data + b'\0')
    # the service worker logic itself is part of the version too (excluding the VERSION line)
    h.update(re.sub(r"const VERSION = '[^']*';", '', sw_text).encode())
    return 'tvt-' + h.hexdigest()[:10]


def main():
    text = SW.read_text(encoding='utf-8')
    current = re.search(r"const VERSION = '([^']*)';", text).group(1)
    wanted = compute(text)
    index = INDEX.read_text(encoding='utf-8')
    stamps = set(STAMP.findall(index))
    if '--check' in sys.argv:
        if current != wanted or stamps != {'?v=' + wanted[4:]}:
            print(f'sw.js VERSION is stale: {current} (expected {wanted}). Run: python3 tools/stamp-sw.py')
            sys.exit(1)
        print(f'sw.js VERSION ok: {current}')
        return
    SW.write_text(text.replace(f"const VERSION = '{current}';", f"const VERSION = '{wanted}';"), encoding='utf-8')
    INDEX.write_text(STAMP.sub('?v=' + wanted[4:], index), encoding='utf-8')
    print(f'sw.js VERSION: {current} -> {wanted}')


if __name__ == '__main__':
    main()
