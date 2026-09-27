#!/usr/bin/env python3
"""
convert-card-pngs.py — turn full-size card PNG masters into the two sized JPGs
the game ships.

CONVENTION (matches the Kush set, the newest hand-cut one)
----------------------------------------------------------
Sources sit in a per-set folder under images/cards/ as lowercase snake_case
PNGs, e.g. images/cards/china/china_paper.png. Outputs land BESIDE the source,
same stem, lowercase, no other renaming:

    <set>/<stem>.png      the master (never touched)
    <set>/<stem>.jpg      LARGE  366 x 527   — what cards.js points `image` at
    <set>/<stem>@sm.jpg   SMALL  183 x 264   — derived by js/ui.js buildCardImg
                                               (card.image with .jpg -> @sm.jpg),
                                               so cards.js needs no imageSm

Encoding matches the existing JPGs: quality 92, 4:4:4 chroma (subsampling
smears dithered pixel art), optimized Huffman tables. Downsampling is a single
LANCZOS pass from the master, as the art brief asks.

SIZES
-----
The masters are 731 x 1054. That is 0.14% narrower than 366:527 — half of 731
is 365.5, which rounds to the shipped 366 — and it is the exact master size every
existing 366 x 527 card was cut from (see the Kush note in js/cards.js). The
aspect check therefore allows a sub-pixel tolerance (--aspect-tolerance, in
output pixels, default 1.0): a source whose width at target height is off by
MORE than that is reported and the run stops before writing anything. Nothing
is ever cropped or stretched to fit.

RE-RUNS
-------
An output that already exists and is newer than its source is skipped, so a
re-run only touches new or updated masters. --force redoes everything.

REPORT
------
After converting, the script cross-checks js/cards.js: every source PNG whose
large JPG no card entry references, and every card entry whose image (or small
image, explicit or derived) is missing on disk.

USAGE
    python3 tools/convert-card-pngs.py             # convert (skips up-to-date)
    python3 tools/convert-card-pngs.py --dry-run   # report only
    python3 tools/convert-card-pngs.py --force     # redo every output
"""

import argparse
import os
import re
import sys

try:
    from PIL import Image, ImageFile
except ImportError:
    sys.exit("Pillow is required:  python3 -m pip install --user Pillow")

# optimize=True makes libjpeg buffer the WHOLE encoded image before writing
# (two-pass Huffman optimisation cannot suspend mid-stream). Pillow's default
# write buffer is 64 KB; a dense dithered card can encode larger than that, and
# libjpeg then fails with "Suspension not allowed here" / "broken data stream
# when writing image file". Give the encoder a buffer no card can overflow.
ImageFile.MAXBLOCK = max(ImageFile.MAXBLOCK, 32 * 1024 * 1024)

try:
    LANCZOS = Image.Resampling.LANCZOS          # Pillow >= 9.1
except AttributeError:                           # pragma: no cover
    LANCZOS = Image.LANCZOS

ROOT      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS_DIR = os.path.join(ROOT, "images", "cards")
CARDS_JS  = os.path.join(ROOT, "js", "cards.js")

LARGE = (366, 527)
SMALL = (183, 264)
SMALL_SUFFIX = "@sm"
QUALITY = 92


def find_sources(cards_dir):
    """Every .png under images/cards, in a stable order. Dotfiles are ignored."""
    out = []
    for root, _dirs, files in os.walk(cards_dir):
        for name in sorted(files):
            if name.startswith(".") or not name.lower().endswith(".png"):
                continue
            out.append(os.path.join(root, name))
    return sorted(out)


def outputs_for(src):
    directory, filename = os.path.split(src)
    stem, _ext = os.path.splitext(filename)
    return (os.path.join(directory, stem + ".jpg"),
            os.path.join(directory, stem + SMALL_SUFFIX + ".jpg"))


def aspect_error_px(w, h):
    """How far (in output pixels) the source's width is from 366:527 at the
    large tier's height. 731x1054 -> 0.5px."""
    return abs(w * LARGE[1] / h - LARGE[0])


def up_to_date(dst, src):
    return os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)


def convert(src, dst, size, dry_run):
    """Resize + encode. The JPEG is written to a temp file beside `dst` and
    renamed into place only once the encoder finishes, so an interrupted or
    failed write can never leave a truncated output that the up-to-date check
    would later skip."""
    if dry_run:
        return
    with Image.open(src) as im:
        im = im.convert("RGB")
        out = im.resize(size, LANCZOS)
    tmp = dst + ".tmp"
    try:
        out.save(tmp, "JPEG", quality=QUALITY, subsampling=0, optimize=True)
        os.replace(tmp, dst)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def card_image_paths(cards_js):
    """(large paths, small paths) referenced by js/cards.js, repo-relative.
    A card without imageSm derives its small path the way buildCardImg does."""
    with open(cards_js, encoding="utf-8") as fh:
        src = fh.read()
    large, small = [], []
    # One card object at a time: image, then an optional imageSm right after.
    for m in re.finditer(r'image:\s*"([^"]+)"(?:\s*,\s*imageSm:\s*"([^"]+)")?', src):
        img, sm = m.group(1), m.group(2)
        large.append(img)
        small.append(sm if sm else re.sub(r"\.jpg$", SMALL_SUFFIX + ".jpg", img))
    return large, small


def main():
    ap = argparse.ArgumentParser(description="Convert card PNG masters to the game's large + small JPGs.")
    ap.add_argument("--dir", default=CARDS_DIR, help="folder to walk (default: images/cards)")
    ap.add_argument("--dry-run", action="store_true", help="report what would be written; write nothing")
    ap.add_argument("--force", action="store_true", help="rewrite outputs even when they are up to date")
    ap.add_argument("--aspect-tolerance", type=float, default=1.0,
                    help="max width error, in output pixels, before a source is refused (default 1.0)")
    args = ap.parse_args()

    sources = find_sources(args.dir)
    if not sources:
        print("no .png sources under %s" % args.dir)
        return 0

    # ── Pass 1: refuse the whole run if any source would need cropping/stretching.
    bad = []
    for src in sources:
        with Image.open(src) as im:
            err = aspect_error_px(im.width, im.height)
        if err > args.aspect_tolerance:
            bad.append((src, im.width, im.height, err))
    if bad:
        print("STOP — %d source(s) do not match 366:527 (nothing written):" % len(bad))
        for src, w, h, err in bad:
            print("  %s  %dx%d  (%.2fpx off at target height)" % (os.path.relpath(src, ROOT), w, h, err))
        return 2

    # ── Pass 2: convert.
    converted = skipped = 0
    for src in sources:
        for dst, size in zip(outputs_for(src), (LARGE, SMALL)):
            rel = os.path.relpath(dst, ROOT)
            if not args.force and up_to_date(dst, src):
                skipped += 1
                continue
            convert(src, dst, size, args.dry_run)
            converted += 1
            print("  %s %3dx%-3d  %s" % ("would write" if args.dry_run else "wrote", size[0], size[1], rel))

    print("\n%s %d output(s), skipped %d up-to-date, from %d source PNG(s)"
          % ("would write" if args.dry_run else "converted", converted, skipped, len(sources)))

    # ── Cross-check against the card data.
    large_refs, small_refs = card_image_paths(CARDS_JS)
    large_set = set(large_refs)
    orphans = [src for src in sources
               if os.path.relpath(outputs_for(src)[0], ROOT) not in large_set]
    missing = [p for p in large_refs + small_refs if not os.path.exists(os.path.join(ROOT, p))]

    print("\ncards.js cross-check (%d card image entries):" % len(large_refs))
    print("  source PNGs with no card entry pointing at their large JPG: %d" % len(orphans))
    for src in orphans:
        print("    %s" % os.path.relpath(src, ROOT))
    print("  card image paths with no file on disk: %d" % len(missing))
    for p in missing:
        print("    %s" % p)
    if args.dry_run:
        print("\nDry run — nothing was written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
