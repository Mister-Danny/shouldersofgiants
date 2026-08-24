#!/usr/bin/env python3
"""
bump-cache-version.py — force student browsers to pick up a deploy.

GitHub Pages serves css/js with `cache-control: max-age=600` and the game
has no build step, so a Chromebook that already has the site cached keeps
running the OLD js/css until the cache expires — and on locked-down student
machines there is no way to clear it by hand. Appending a version query
makes each deploy a URL the cache has never seen, so it always loads fresh.

Rewrites `?v=N` on every LOCAL css/js/data reference in index.html (CDN and
Google Fonts URLs are left alone — those are versioned upstream already).

USAGE
    python3 tools/bump-cache-version.py            # bump to next integer
    python3 tools/bump-cache-version.py --set 7    # pin an explicit version
    python3 tools/bump-cache-version.py --check    # report, change nothing

Run this before every deploy that changes js/, css/ or data/.
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")

# Local assets only: src/href beginning with css/, js/ or data/. Anything
# with a scheme (https://, //cdn...) is skipped by the pattern itself.
# data/ is included because level-data.js and map-data.js are cached the
# same way — a map edit that never reaches the student is the same bug.
# This only rewrites the REFERENCE in index.html; the data files themselves
# are never opened or modified.
ASSET = re.compile(r'((?:src|href)=")((?:css|js|data)/[^"?]+\.(?:css|js))(\?v=(\d+))?(")')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=int, default=None, help="pin this version number")
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    with open(INDEX, encoding="utf-8") as fh:
        html = fh.read()

    found = ASSET.findall(html)
    if not found:
        sys.exit("No local css/js/data references found in index.html — pattern may be stale.")

    current = max((int(m[3]) for m in found if m[3]), default=0)
    version = args.set if args.set is not None else current + 1

    versioned = sum(1 for m in found if m[3])
    print("local assets: %d   currently versioned: %d   current v: %d"
          % (len(found), versioned, current))

    if args.check:
        print("check only — nothing written. Next bump would be v%d." % version)
        return

    new_html = ASSET.sub(lambda m: "%s%s?v=%d%s" % (m.group(1), m.group(2), version, m.group(5)), html)

    if new_html == html:
        print("already at v%d — nothing to do." % version)
        return

    with open(INDEX, "w", encoding="utf-8") as fh:
        fh.write(new_html)
    print("bumped %d references to ?v=%d" % (len(found), version))


if __name__ == "__main__":
    main()
