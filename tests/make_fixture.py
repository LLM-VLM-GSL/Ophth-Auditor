#!/usr/bin/env python3
"""Build the test fixture tests/fixture/data/ (manifest.js, images/, audio/) for the audit page.

    python tests/make_fixture.py            (needs Pillow, and ffmpeg on PATH for the mp3s)

Six dummy cases (drawn images, silent audio), in the format of the plaintext data/manifest.js (README.md), covering:
  T001 English, normal            T002 Spanish (transcript + English translation)
  T003 audio null, no transcript  T004 audio, empty transcript
  T005 long caption/transcript    T006 Arabic (right-to-left) transcript + translation
Open with: web/index.html?data=../tests/fixture/data (tests/e2e.mjs also encrypts a copy for its encrypted mode)
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fixture", "data")

LONG = ("So here we have a really interesting case. " * 3 + "You can see the subretinal fluid under the fovea, the pigment "
        "epithelial detachment nasally, and some hyperreflective foci in the outer nuclear layer. ") * 4

CASES = [
    dict(id="T001", size=(640, 480), color=(40, 40, 46), audio=3.0, lang="en",
         caption="Optical coherence tomography B-scan showing subretinal fluid beneath the fovea with an intact RPE.",
         transcript="Here you can see the subretinal fluid under the fovea, and the RPE is intact.",
         transcript_en="Here you can see the subretinal fluid under the fovea, and the RPE is intact."),
    dict(id="T002", size=(854, 188), color=(70, 30, 20), audio=4.0, lang="es",
         caption="Color fundus photograph showing hard exudates in a circinate pattern around the macula.",
         transcript="AquÃ­ vemos exudados duros en forma de anillo alrededor de la mÃ¡cula.",
         transcript_en="Here we see hard exudates in a ring shape around the macula."),
    dict(id="T003", size=(500, 500), color=(15, 60, 30), audio=None, lang="en",
         caption="Fluorescein angiography showing late leakage from a choroidal neovascular membrane.",
         transcript="", transcript_en=""),
    dict(id="T004", size=(300, 700), color=(30, 30, 80), audio=2.0, lang="en",
         caption="Ultra-widefield fundus image showing peripheral retinal hemorrhages.",
         transcript="", transcript_en=""),
    dict(id="T005", size=(1200, 400), color=(60, 60, 60), audio=5.0, lang="en",
         caption=("Spectral-domain optical coherence tomography of the macula demonstrating a serous pigment epithelial "
                  "detachment with overlying subretinal fluid, intraretinal hyperreflective foci and disruption of the "
                  "ellipsoid zone, consistent with neovascular age-related macular degeneration."),
         transcript=LONG.strip(), transcript_en=LONG.strip()),
    dict(id="T006", size=(900, 200), color=(80, 50, 10), audio=3.0, lang="ar",
         caption="Optical coherence tomography showing loss of the ellipsoid zone in the central macula.",
         transcript="Ù‡Ù†Ø§ Ù†Ø±Ù‰ ÙÙ‚Ø¯Ø§Ù† Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø¥Ù‡Ù„ÙŠÙ„Ø¬ÙŠØ© ÙÙŠ Ù…Ø±ÙƒØ² Ø§Ù„Ø¨Ù‚Ø¹Ø©.",
         transcript_en="Here we see loss of the ellipsoid zone in the center of the macula."),
]


def make_image(path, size, color, label):
    w, h = size
    im = Image.new("RGB", size, color)
    d = ImageDraw.Draw(im)
    for k in range(0, max(w, h), 40):                  # a grid, so zoom and pan are visible
        d.line([(k, 0), (k, h)], fill=tuple(min(255, c + 25) for c in color))
        d.line([(0, k), (w, k)], fill=tuple(min(255, c + 25) for c in color))
    d.ellipse([w * 0.3, h * 0.3, w * 0.7, h * 0.7], outline=(230, 230, 230), width=3)
    d.rectangle([8, 8, 150, 40], fill=(255, 255, 255))
    d.text((16, 16), "%s  %dx%d" % (label, w, h), fill=(0, 0, 0))
    im.save(path, "JPEG", quality=85)


def make_mp3(path, seconds):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("ffmpeg not found on PATH")
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", str(seconds),
                    "-c:a", "libmp3lame", "-q:a", "9", path], check=True)


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "images"))
    os.makedirs(os.path.join(OUT, "audio"))
    cases = []
    for c in CASES:
        make_image(os.path.join(OUT, "images", c["id"] + ".jpg"), c["size"], c["color"], c["id"])
        audio = None
        if c["audio"]:
            make_mp3(os.path.join(OUT, "audio", c["id"] + ".mp3"), c["audio"])
            audio = "data/audio/%s.mp3" % c["id"]
        cases.append({"id": c["id"], "image": "data/images/%s.jpg" % c["id"], "audio": audio,
                      "duration_s": float(c["audio"] or 0), "caption": c["caption"], "transcript": c["transcript"],
                      "lang": c["lang"], "transcript_en": c["transcript_en"]})
    manifest = {"manifest_version": "fixture-v1", "created": "2026-11-17T23:00:00", "cases": cases}
    with open(os.path.join(OUT, "manifest.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("window.AUDIT_MANIFEST = " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n")
    print("wrote %s (%d cases)" % (OUT, len(cases)))


if __name__ == "__main__":
    main()
