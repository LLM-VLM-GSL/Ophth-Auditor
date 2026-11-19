#!/usr/bin/env python3
"""Build the test fixture tests/fixture/data/ (manifest.js, images/, audio/) for the audit page.

    python tests/make_fixture.py            (needs Pillow, and ffmpeg on PATH for the mp3s)

Six dummy cases (drawn images, silent audio), in the format of the plaintext data/manifest.js (README.md), covering:
  T001 English, normal            T002 Spanish (transcript + English translation)
  T003 audio null, no transcript  T004 audio, empty transcript
  T005 long caption/transcript    T006 Arabic (right-to-left) transcript + translation
Open with: web/index.html?data=../tests/fixture/data (tests/e2e.mjs also encrypts a copy for its encrypted mode)

Also three made-up LLM runs (tests/fixture/ai_runs/run<k>.json, in the export format) and the AI pre-filled answers
built from them by tools/build_ai_prefill.py (tests/fixture/data/ai_prefill.js):
  T001 all runs agree           T002 q1 "no" by 2 of 3 runs (q2-q6 "na"), q7 "yes" by 2 of 3
  T003 q2 without a majority (angio, oct, cfp: run 1's answer)    T004-T006 other answers, a few 2-of-3 majorities
    python tests/make_fixture.py --ai-only      (only the runs and ai_prefill.js; standard library)
"""
import json
import os
import shutil
import subprocess
import sys

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


# per case: three runs' answers (q1..q7, in order) and notes
AI_RUNS = {
    "T001": [("yes oct good full partial correct no", "OCT B-scan with subretinal fluid under the fovea; the RPE looks intact."),
             ("yes oct good full partial correct no", "Subretinal fluid beneath the fovea on an OCT B-scan."),
             ("yes oct good full partial correct no", "OCT B-scan; the description matches the visible fluid.")],
    "T002": [("no na na na na na yes", "A slide with a chart, not a clinical image; a date is visible in the corner."),
             ("no na na na na na yes", "Mostly text and a graph; a visit date appears at the bottom."),
             ("yes cfp partial partial full minor no", "A fundus photograph with exudates near the macula.")],
    "T003": [("yes angio good full cant_judge correct no", "Late-phase angiogram with leakage; no narration to compare."),
             ("yes oct good full cant_judge correct no", "Looks like an OCT angiography slab; no narration."),
             ("yes cfp good full cant_judge correct no", "A green-tinted fundus image; there is no narration.")],
    "T004": [("yes uwf partial partial cant_judge minor no", "Ultra-widefield image, partly cropped; empty transcript."),
             ("yes uwf partial partial cant_judge minor no", "Peripheral hemorrhages are hard to confirm in this crop."),
             ("yes uwf good partial cant_judge minor no", "Widefield fundus image; the transcript is empty.")],
    "T005": [("yes oct good full full correct no", "Macular OCT with a serous PED and subretinal fluid, as the narration says."),
             ("yes oct good full full correct no", "The description follows the narration and fits the B-scan."),
             ("yes oct good full partial correct no", "OCT of the macula; most findings are in the narration.")],
    "T006": [("yes oct good partial full minor no", "OCT B-scan; ellipsoid zone loss is plausible but hard to see."),
             ("yes oct good partial full correct no", "Central ellipsoid zone loss on OCT, as narrated."),
             ("yes oct partial partial full minor no", "OCT B-scan, slightly cut at the edges.")],
}
QIDS = ["q1_ophthalmic", "q2_modality", "q3_crop", "q4_image_text", "q5_faithful", "q6_clinical", "q7_pii"]


def make_ai():
    """The made-up LLM runs and the AI pre-filled answers built from them (tools/build_ai_prefill.py)."""
    runs_dir = os.path.join(HERE, "fixture", "ai_runs")
    os.makedirs(runs_dir, exist_ok=True)
    paths = []
    for k in range(3):
        ann = {}
        for cid, runs in AI_RUNS.items():
            codes, note = runs[k]
            ann[cid] = dict(zip(QIDS, codes.split()), note=note, annotated_at="2026-11-18T01:0%d:00-07:00" % k, time_spent_s=4.0)
        doc = {"tool": "ophth-audit", "tool_version": "1.0", "rubric_version": "rubric-v1", "manifest_version": "fixture-v1",
               "exported_at": "2026-11-18T01:0%d:30-07:00" % k,
               "rater": {"name": "testlab/vision-model#%d" % (k + 1), "role": "llm", "years_experience": None},
               "run": {"provider": "testlab", "model": "vision-model", "repeat": str(k + 1)}, "annotations": ann}
        p = os.path.join(runs_dir, "run%d.json" % (k + 1))
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
        paths.append(p)
    root = os.path.dirname(HERE)
    subprocess.run([sys.executable, "-B", os.path.join(root, "tools", "build_ai_prefill.py"), *paths, "--data", OUT,
                    "--guidelines", os.path.join(root, "web", "guidelines.js")], check=True)


def make_image(path, size, color, label):
    from PIL import Image, ImageDraw
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
    if "--ai-only" in sys.argv[1:]:
        return make_ai()
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
    make_ai()


if __name__ == "__main__":
    main()
