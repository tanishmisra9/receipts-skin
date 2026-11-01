#!/usr/bin/env python3
"""Make ordinary and stress variants of a sample face for the stability test.

  python3 scripts/perturb.py s2                          # writes stability-src/s2/<variant>.jpg (git-ignored, derived from the sample photo)
  python3 scripts/perturb.py h1 --src stock-src/h1.jpg   # a test-only face that is not a sample face

Groups are fixed before any scan is run (the margin comes only from "ordinary"):
  ordinary: same photo again, dim (-25% brightness), warm cast, 3 degree tilt
  stress:   blur, 6% crop, JPEG q35 (reported as what breaks it, never used for the margin)
"""
import pathlib
import shutil
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
face = sys.argv[1]
src = ROOT / (sys.argv[sys.argv.index("--src") + 1] if "--src" in sys.argv else f"public/personas/{face}/photo.jpg")
out = ROOT / f"stability-src/{face}"
out.mkdir(parents=True, exist_ok=True)
im = Image.open(src).convert("RGB")
w, h = im.size

shutil.copyfile(src, out / "base.jpg")  # the unchanged photo: the baseline for a test-only face
shutil.copyfile(src, out / "again.jpg")  # identical bytes: tests whether the API itself is repeatable
ImageEnhance.Brightness(im).enhance(0.75).save(out / "dim.jpg", quality=92)
r, g, b = im.split()
Image.merge("RGB", (r.point(lambda v: min(255, int(v * 1.08))), g, b.point(lambda v: int(v * 0.90)))).save(out / "warm.jpg", quality=92)
fill = tuple(int(v) for v in ImageStat.Stat(im).mean)
im.rotate(3, resample=Image.BICUBIC, fillcolor=fill).save(out / "tilt.jpg", quality=92)
im.filter(ImageFilter.GaussianBlur(w * 0.006)).save(out / "blur.jpg", quality=92)
dx, dy = int(w * 0.06), int(h * 0.06)
im.crop((dx, dy, w - dx, h - dy)).save(out / "crop.jpg", quality=92)
im.save(out / "jpeg.jpg", quality=35)
print(sorted(p.name for p in out.iterdir()))
