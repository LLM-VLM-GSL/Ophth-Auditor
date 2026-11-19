// AI pre-filled answers of the audit page, written by tools/build_ai_prefill.py: do not edit by hand.
// The majority answer of 3 runs of one model per case and question (README, "AI pre-filled answers").
window.AUDIT_AI = {
 "model": "testlab/vision-model",
 "runs": 3,
 "created": "2026-11-18T01:02:30-07:00",
 "manifest_version": "fixture-v1",
 "answers": {
  "T001": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "partial",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 3,
    "q2_modality": 3,
    "q3_crop": 3,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 3
   },
   "no_majority": [],
   "note": "OCT B-scan with subretinal fluid under the fovea; the RPE looks intact."
  },
  "T002": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 2,
    "q2_modality": 2,
    "q3_crop": 2,
    "q4_image_text": 2,
    "q5_faithful": 2,
    "q6_clinical": 2,
    "q7_pii": 2
   },
   "no_majority": [],
   "note": "A slide with a chart, not a clinical image; a date is visible in the corner."
  },
  "T003": {
   "q1_ophthalmic": "yes",
   "q2_modality": "angio",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "cant_judge",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 3,
    "q2_modality": 1,
    "q3_crop": 3,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 3
   },
   "no_majority": [
    "q2_modality"
   ],
   "note": "Late-phase angiogram with leakage; no narration to compare."
  },
  "T004": {
   "q1_ophthalmic": "yes",
   "q2_modality": "uwf",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "cant_judge",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 3,
    "q2_modality": 3,
    "q3_crop": 2,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 3
   },
   "no_majority": [],
   "note": "Ultra-widefield image, partly cropped; empty transcript."
  },
  "T005": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 3,
    "q2_modality": 3,
    "q3_crop": 3,
    "q4_image_text": 3,
    "q5_faithful": 2,
    "q6_clinical": 3,
    "q7_pii": 3
   },
   "no_majority": [],
   "note": "Macular OCT with a serous PED and subretinal fluid, as the narration says."
  },
  "T006": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 3,
    "q2_modality": 3,
    "q3_crop": 2,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 2,
    "q7_pii": 3
   },
   "no_majority": [],
   "note": "OCT B-scan; ellipsoid zone loss is plausible but hard to see."
  }
 }
};
