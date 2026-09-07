#!/usr/bin/env python3
"""
make-card-thumbs.py — batch-generate a third card-art size tier.

WHY THIS EXISTS
---------------
Card art is exported with a dither pattern. `.db-card-img` in css/style.css
carries `image-rendering: pixelated`, so Chrome downsamples with
NEAREST-NEIGHBOUR: it throws away pixels instead of averaging them, and the
dither grid beats against the sampling grid and shimmers. The fix is to ship
art at (or very near) the rendered size, downsampled OFFLINE with a filter
that actually averages neighbouring pixels — which is what this does.

FILTERING
---------
Default is a two-step reduce: an integer-factor BOX pass (true area
averaging, via PIL's Image.reduce) to get within 2x of the target, then a
single LANCZOS pass for the fractional remainder. That order matters for
dithered art: the box pass collapses the dither into flat averaged tone
BEFORE Lanczos' sharpening lobes can ring on it. Use --filter box for pure
area averaging with no sharpening at all, or --filter lanczos to force a
single direct Lanczos pass.

NAMING
------
The output name is derived from the source the same way `@sm` was:
    <source-basename-without-extension> + <suffix> + .jpg
so `sargon@0.5x.jpg` -> `sargon@0.5x@xs.jpg`, and `toolcard.jpg` ->
`toolcard@xs.jpg`. Change the tier name with --suffix.

SAFETY
------
Dry-run by default. Nothing is written without --write, and existing files
are never overwritten without --force.

USAGE
    python3 tools/make-card-thumbs.py --width 120                # preview
    python3 tools/make-card-thumbs.py --width 120 --write        # generate
    python3 tools/make-card-thumbs.py --width 120 --height 180 --write
"""

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  python3 -m pip install --user Pillow")

# Resampling enum moved in Pillow 9.1; support both spellings.
try:
    RESAMPLE = Image.Resampling
except AttributeError:                                   # pragma: no cover
    RESAMPLE = Image

CARDS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "images", "cards",
)

SOURCE_EXTS = (".jpg", ".jpeg", ".png")

# Suffixes that mark a file as an ALREADY-GENERATED small variant, not a
# source. Note that `@0.5x` is deliberately NOT in this list: for the egypt
# and mesopotamia sets the `@0.5x` file IS the full-size asset the game
# ships (366x527), and `@0.3x` / `@sm` are its thumbnails.
DERIVED_MARKERS = ("@sm", "_sm", "@0.3x", "@xs")


def out_path(src_path, suffix):
    """Derive the output path, matching how the `@sm` tier was named."""
    directory, filename = os.path.split(src_path)
    stem, _ext = os.path.splitext(filename)
    return os.path.join(directory, stem + suffix + ".jpg")


def target_size(src_w, src_h, want_w, want_h):
    """
    Resolve the output pixel size.

    --width alone  -> height follows the source aspect ratio (no crop).
    both given     -> exact box; the source is centre-cropped first to match,
                      mirroring the `object-fit: cover` the CSS applies.
    """
    if want_h is None:
        return want_w, max(1, round(src_h * want_w / src_w))
    return want_w, want_h


def cover_crop(im, want_w, want_h):
    """Centre-crop `im` to the aspect ratio of want_w:want_h."""
    src_ratio = im.width / im.height
    dst_ratio = want_w / want_h
    if abs(src_ratio - dst_ratio) < 1e-4:
        return im
    if src_ratio > dst_ratio:                    # too wide — trim sides
        new_w = round(im.height * dst_ratio)
        left = (im.width - new_w) // 2
        return im.crop((left, 0, left + new_w, im.height))
    new_h = round(im.width / dst_ratio)          # too tall — trim top/bottom
    top = (im.height - new_h) // 2
    return im.crop((0, top, im.width, top + new_h))


def downsample(im, want_w, want_h, mode):
    """Resize `im` down to exactly want_w x want_h."""
    if mode == "lanczos":
        return im.resize((want_w, want_h), RESAMPLE.LANCZOS)
    if mode == "box":
        return im.resize((want_w, want_h), RESAMPLE.BOX)

    # mode == "reduce-lanczos" (default): integer area-average, then Lanczos
    # for whatever fractional scale is left over.
    fx = im.width // (want_w * 2) or 1
    fy = im.height // (want_h * 2) or 1
    factor = min(fx, fy)
    if factor > 1:
        im = im.reduce(factor)                   # pure box / area averaging
    return im.resize((want_w, want_h), RESAMPLE.LANCZOS)


def main():
    ap = argparse.ArgumentParser(
        description="Generate a downsampled card-art tier from the full-size files."
    )
    ap.add_argument("--width", type=int, required=True,
                    help="target width in pixels (measure the rendered size first)")
    ap.add_argument("--height", type=int, default=None,
                    help="target height; omit to follow the source aspect ratio")
    ap.add_argument("--suffix", default="@xs",
                    help="tier suffix appended to the source stem (default: @xs)")
    ap.add_argument("--dir", default=CARDS_DIR,
                    help="root directory to walk (default: images/cards)")
    ap.add_argument("--filter", dest="mode", default="reduce-lanczos",
                    choices=("reduce-lanczos", "lanczos", "box"),
                    help="downsampling filter (default: reduce-lanczos)")
    ap.add_argument("--ext", default=None,
                    help="only use sources with this extension (e.g. jpeg). Without it "
                         "every image type is a source — and since outputs are always "
                         ".jpg, a folder holding both foo.png and foo.jpeg would derive "
                         "the SAME output name twice and silently clobber one.")
    ap.add_argument("--quality", type=int, default=92,
                    help="JPEG quality, 4:4:4 chroma (default: 92)")
    ap.add_argument("--write", action="store_true",
                    help="actually write files; without this it only reports")
    ap.add_argument("--force", action="store_true",
                    help="overwrite outputs that already exist")
    args = ap.parse_args()

    # Keep the new tier out of its own source set on re-runs. An EMPTY suffix is
    # deliberately not added: `stem.endswith('')` is always true, so including it
    # would skip every file. An empty suffix is legitimate — it re-encodes a
    # master down to the shipped full-size name (foo.jpeg -> foo.jpg) — and is
    # safe here only because the output extension differs from the source's.
    markers = tuple(set(DERIVED_MARKERS + ((args.suffix,) if args.suffix else ())))

    written = skipped = failed = 0
    for root, _dirs, files in os.walk(args.dir):
        for filename in sorted(files):
            stem, ext = os.path.splitext(filename)
            if ext.lower() not in SOURCE_EXTS or filename.startswith("."):
                continue
            if args.ext and ext.lower() != "." + args.ext.lower().lstrip("."):
                continue
            if any(stem.endswith(m) for m in markers):
                continue

            src = os.path.join(root, filename)
            dst = out_path(src, args.suffix)
            rel = os.path.relpath(dst, args.dir)

            if os.path.exists(dst) and not args.force:
                print("  skip (exists)  %s" % rel)
                skipped += 1
                continue

            try:
                with Image.open(src) as im:
                    im = im.convert("RGB")
                    w, h = target_size(im.width, im.height, args.width, args.height)
                    if args.height is not None:
                        im = cover_crop(im, w, h)
                    small = downsample(im, w, h, args.mode)
                    label = "%4dx%-4d -> %3dx%-3d" % (im.width, im.height, w, h)
                    if args.write:
                        small.save(dst, "JPEG", quality=args.quality,
                                   subsampling=0,      # 4:4:4 — subsampling
                                                       # smears dithered colour
                                   optimize=True)
                        print("  wrote  %s  %s" % (label, rel))
                    else:
                        print("  would write  %s  %s" % (label, rel))
                    written += 1
            except Exception as exc:              # noqa: BLE001 — report and continue
                print("  FAILED %s: %s" % (rel, exc), file=sys.stderr)
                failed += 1

    verb = "wrote" if args.write else "would write"
    print("\n%s %d, skipped %d, failed %d" % (verb, written, skipped, failed))
    if not args.write:
        print("Dry run — nothing was written. Re-run with --write.")


if __name__ == "__main__":
    main()
