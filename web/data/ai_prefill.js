// AI pre-filled answers of the audit page, written by tools/build_ai_prefill.py: do not edit by hand.
// The majority answer of 5 runs of one model per case and question (README, "AI pre-filled answers").
window.AUDIT_AI = {
 "model": "5-model panel (gpt-6-luna, gpt-5.6-sol, gpt-5.5, gpt-5.4, gpt-5.6-terra)",
 "runs": 5,
 "created": "2026-11-18T18:53:10-07:00",
 "manifest_version": "train-v1-2026-11-18",
 "answers": {
  "B001": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The paired grayscale images appear to be autofluorescence; they do not show subretinal fluid. A Zoom logo is visible, but it is not patient-identifying."
  },
  "B002": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is a dental imaging software screenshot, not an ophthalmic clinical image. A logo/watermark is visible; no patient-identifying information is apparent."
  },
  "B003": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is a stylized illustration, not a clinical ophthalmic image."
  },
  "B004": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Standard-field color fundus photograph is well preserved, but macular edema is not visibly established; the narration discusses fundus-camera features without mentioning edema."
  },
  "B005": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 3,
    "q4_image_text": 3,
    "q5_faithful": 1,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [
    "q5_faithful"
   ],
   "note": "The slide is titled “Cuticular Drusen,” and the small fundus/OCT panels do not clearly show the described deposits. The narration does mention subretinal drusenoid deposits and reflective changes; “hypoechoic” is imprecise for OCT."
  },
  "B006": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Drusen, macular atrophy, and a circled hemorrhagic area are visible, but photoreceptor irregularity and retinal thinning are OCT-level findings not directly assessable on this color fundus photograph."
  },
  "B007": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows a gross aorta-and-kidney specimen, not an ophthalmic clinical image."
  },
  "B008": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "partial",
   "q4_image_text": "full",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 2,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 3
   },
   "no_majority": [
    "q4_image_text"
   ],
   "note": "OCT panels show macular interface/hole-type changes without retinal detachment; narration discusses macular hole mimickers, not detachment or scar. A video-call presenter face/name overlay is visible but not patient-identifying."
  },
  "B009": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 4,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The panels show AO-OCT imagery labeled COST/ROST, not retinal detachment or scar tissue. A Zoom watermark is visible."
  },
  "B010": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "This is an eye-anatomy teaching slide with diagrams, not a clinical image. Video-call participant tiles are visible but do not identify a patient."
  },
  "B011": {
   "q1_ophthalmic": "yes",
   "q2_modality": "angio",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 3,
    "q5_faithful": 5,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Grayscale widefield angiographic image shows choroidal dark spots, not macular edema/leakage; lower-right logos/Zoom overlay, and a “Nov 19” image date at top right is patient-identifying."
  },
  "B012": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "Anterior segment surgical eye image after trauma/lens removal; PVD is not visible or narrated. Patient eye-region photo is visible; Zoom/institution-style logos are also present but not PII."
  },
  "B013": {
   "q1_ophthalmic": "yes",
   "q2_modality": "angio",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Image shows fluorescein angiography in three fields, but macular edema and sub-ILM hemorrhage are not clearly visible; macular edema is not supported by narration. No patient-identifying information visible."
  },
  "B014": {
   "q1_ophthalmic": "unsure",
   "q2_modality": "unsure",
   "q3_crop": "bad",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 3,
    "q2_modality": 2,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 4
   },
   "no_majority": [
    "q2_modality"
   ],
   "note": "The tiny, blurred crop is not recognizable as retinal imaging and does not demonstrate retinal thickening or subretinal fluid; the IVF narration provides no ophthalmic support."
  },
  "B015": {
   "q1_ophthalmic": "yes",
   "q2_modality": "angio",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The angiogram labels bulb-like dilation and telangiectatic vessels, not diffuse choroidal hyperfluorescence or late leakage. A small presenter inset and Zoom watermark are visible; neither is patient-identifying."
  },
  "B016": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The fundus photograph shows a large elevated temporal retinal/chorioretinal lesion, not cornea; the optic disc is nasal and lacks the claimed traction. Surrounding slide text and slide number 29 are visible."
  },
  "B017": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 4,
    "q3_crop": 3,
    "q4_image_text": 4,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Anterior-segment OCT appears to show a post-trabeculectomy filtering bleb/scleral flap, not trabecular meshwork glaucomatous alteration. A small device/video logo is visible; no patient identifiers."
  },
  "B018": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is entirely black/blank, with no visible clinical image or patient-identifying information."
  },
  "B019": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 3,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Slide shows color fundus images of small retinoblastoma lesions, not a retinal detachment with subretinal seeds. Zoom/presenter overlay and institutional/watermark text are visible but not patient-identifying."
  },
  "B020": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Slit-lamp eye-region photograph shows corneal epithelial microcystic/irregular changes consistent with epithelial basement membrane dystrophy. The identifiable eye region is visible; a Slit Lamp Studios watermark is at lower left."
  },
  "B021": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is a slide about cell segmentation with tissue images, not an ophthalmic clinical image; no patient-identifying information is visible."
  },
  "B022": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is a labeled retinal anatomy diagram, not a clinical image; a Zoom logo is visible."
  },
  "B023": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 4,
    "q5_faithful": 3,
    "q6_clinical": 2,
    "q7_pii": 3
   },
   "no_majority": [
    "q6_clinical"
   ],
   "note": "Two fundus photographs are shown; the video-call overlay partly covers the right image. The absent midline structures are not visible here. A presenter label and logo are visible, not patient-identifying."
  },
  "B024": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is a color fundus image described in the narration as the undamaged right retina; black areas obscure parts of the image."
  },
  "B025": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is primarily a text-and-table slide with embedded clinical images; a small logo is visible at the lower right."
  },
  "B026": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 3,
    "q2_modality": 3,
    "q3_crop": 3,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is a slide of brain imaging, not an ophthalmic clinical image. A Zoom watermark is visible."
  },
  "B027": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 1,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [
    "q2_modality"
   ],
   "note": "The fundus image is visible, but macular edema is not evident. MacBook Pro branding is visible; it is not patient-identifying."
  },
  "B028": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The panels are fundus photographs centered near the optic discs; macular edema is not evident. An institutional logo is visible at the lower right."
  },
  "B029": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The visible scan is an anterior-segment OCT, not an optic-disc image; no patient-identifying information is visible."
  },
  "B030": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 3,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "Composite OCT glaucoma analysis is visible but small/cluttered; BMO rim and RNFL claims are supported by narration, though 'Double Ejiba' is garbled/imprecise terminology. No readable patient identifiers visible."
  },
  "B031": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 2,
    "q7_pii": 5
   },
   "no_majority": [
    "q6_clinical"
   ],
   "note": "The crop shows bilateral infrared images with macular stippling; it does not show OCT evidence of deposits/RPE thickening or a hypoautofluorescence image."
  },
  "B032": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The two panels are PSOCT maps, not separate imaging modalities. The bowing is supported by the narration, but the specific layer labels are not clearly discernible in the image; “interlimiting membrane” is imprecise terminology."
  },
  "B033": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is an anatomical eye illustration, not a clinical image; no patient-identifying information is visible."
  },
  "B034": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "bad",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The fundus images are severely cropped. The narration discusses hypertensive retinopathy, not arterial tortuosity syndrome."
  },
  "B035": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "The OCT is visible, but macular hole and detachment are not unequivocal in this crop. Conference branding and a Zoom watermark are visible; neither is patient-identifying."
  },
  "B036": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is an illustrative eye diagram with overlaid text, not a real clinical image; no patient-identifying information is visible."
  },
  "B037": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Both fundus photographs show optic discs; the left disc appears to have greater cupping, consistent with the narrated 20% and 40% estimates."
  },
  "B038": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Orbital cross-sectional imaging appears MRI rather than CT; choroidal detachment may be visible, but 'hyperdense' CT wording is not appropriate. No patient-identifying information visible."
  },
  "B039": {
   "q1_ophthalmic": "yes",
   "q2_modality": "uwf",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "A date-like text overlay (“05/024”) is visible near the bottom of the image."
  },
  "B040": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Fundus hemorrhages support BRVO, but scleral thickening is neither visible nor supported by the narration; blood-retinal barrier disruption is also not directly demonstrated. Diagnostic title overlay is visible; no patient identifiers."
  },
  "B041": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is an illustrative eye cross-section, not a clinical image; no patient-identifying information is visible."
  },
  "B042": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The fundus supports vascular tortuosity/dilatation, but decreased RNFL thickness cannot be confidently established from this color photograph. Large overlaid objective text partly obscures the retina; no patient identifiers are visible."
  },
  "B043": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows a stylized world map, not an ophthalmic clinical image; no patient-identifying information is visible."
  },
  "B044": {
   "q1_ophthalmic": "yes",
   "q2_modality": "angio",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is a single ultra-widefield angiogram labeled as showing nonperfusion in RVO, not multi-panel images of vasculitis or uveitis."
  },
  "B045": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 3
   },
   "no_majority": [],
   "note": "A partial person's face is visible at the upper-right edge."
  },
  "B046": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 3,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The macular area is visible, but the claimed retinal injury and scar are subtle; “macula densa” is imprecise terminology for a retinal location."
  },
  "B047": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The OCT is compatible with myopic traction changes, but scar tissue and subretinal hemorrhage are not clearly visible; a right-side overlay obscures part of the panels."
  },
  "B048": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is primarily an educational text slide, with a small angiography inset; no patient-identifying information is visible."
  },
  "B049": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "cant_judge",
   "q6_clinical": "cant_judge",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "This appears to be a surgical view, but a large black overlay obscures part of it and the retinal findings are not clear. The transcript is too fragmentary to assess support."
  },
  "B050": {
   "q1_ophthalmic": "yes",
   "q2_modality": "uwf",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 3,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The slide shows retinal images after ROP laser treatment and labels laser scars, but retinal detachment is not evident. The date in the top bar appears to be a meeting date, not a patient date."
  },
  "B051": {
   "q1_ophthalmic": "yes",
   "q2_modality": "angio",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The angiographic image is small within a largely blank blue frame, and its monochrome view cannot show the described yellow coloration. A date/time overlay appears at the lower-left of the image."
  },
  "B052": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Color fundus photo with orange cast; narration supports an artifact and small lesion near fovea, but the crop/black obstruction makes the lesion and foveal details hard to see. No patient identifiers visible."
  },
  "B053": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The operative eye shows prolapsed iris, but lens dislocation is not established; narration says its status is unknown. Patient eye-region photo is visible. Surgeon name and MECG logo are also overlaid."
  },
  "B054": {
   "q1_ophthalmic": "yes",
   "q2_modality": "unsure",
   "q3_crop": "bad",
   "q4_image_text": "partial",
   "q5_faithful": "cant_judge",
   "q6_clinical": "cant_judge",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 2,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [
    "q2_modality"
   ],
   "note": "The tiny, severely blurred orange-yellow clinical image may show retina, but retinal detachment and scar tissue cannot be reliably assessed. The transcript is too fragmentary to compare."
  },
  "B055": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows an OCT macular cube report, not the yellow lesions, optic-disc changes, or vascular tortuosity described; those findings are mentioned in the narration."
  },
  "B056": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 3,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "MRI/MRA panels support multiple ICA aneurysms, but the narration discusses nystagmus separately; associating nystagmus with the aneurysm case is unsupported and clinically misleading."
  },
  "B057": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 2,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [
    "q3_crop"
   ],
   "note": "A partially visible eye-region photo is patient-identifying; black overlays obscure much of the image. “PLEASE SUBSCRIBE” and “SUBSCRIBE” graphics are also visible."
  },
  "B058": {
   "q1_ophthalmic": "yes",
   "q2_modality": "uwf",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 2,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [
    "q5_faithful"
   ],
   "note": "The crop shows a single UWF retinal image, not the claimed multi-panel bilateral views; the narration also describes the retinal break and scleral fistula as separate examples."
  },
  "B059": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 3,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The fundus photos show hemorrhages in the diseased panel, but no visible macular edema or retinal thickening; the lower image edges are cropped."
  },
  "B060": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 3,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 3
   },
   "no_majority": [],
   "note": "The image is an anterior/surgical eye view, not retina; narration discusses fibrosis/phimosis and CTR, not retinal thickening. Patient eye-region tissue is visible in the image."
  },
  "B061": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows logos/icons rather than a clinical eye image; no patient-identifying information is apparent."
  },
  "B062": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "partial",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Multicolor, NIR, FAF, and OCT panels are visible, but this frame does not demonstrate serial stability; “minimal atrophy” is also weakly supported. A presenter, Apple logo, and small watermark/logo are visible but are not patient-identifying."
  },
  "B063": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 3,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The OCT is visible, but choroidal neovascularization is not apparent in the scan; the narration describes it as a possible late-stage complication, not a confirmed finding here."
  },
  "B064": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows histology panels labeled Normal and Early AMD, not a visible PED with atrophy or migrating RPE cells. The ages shown are not patient-identifying."
  },
  "B065": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The slide contains an eye-region photo on the right, which is patient-identifying. The slide also shows age/sex and conference logos/date; these are not patient-identifying."
  },
  "B066": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The slide shows two fundus photographs labeled “Involuted ROP”; no horseshoe tear or scleral localization marks are visible, although those details are supported by the narration."
  },
  "B067": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is a close-up eye-region photograph, which counts as patient-identifying."
  },
  "B068": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Anterior-eye images are shown; the lower panel is an identifiable eye-region photo. The description claims retinal findings not depicted in these images."
  },
  "B069": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The OCTA and B-scan panels show vessel-density information and drusen, but the narration says GCC is not flagged, contradicting the description’s claim of reduced GCC."
  },
  "B070": {
   "q1_ophthalmic": "unsure",
   "q2_modality": "unsure",
   "q3_crop": "bad",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The tiny, severely cropped frame is uninterpretable and mostly shows the word “the”; congenital abnormality is unsupported by the image or narration."
  },
  "B071": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 2,
    "q7_pii": 5
   },
   "no_majority": [
    "q6_clinical"
   ],
   "note": "OCT and color fundus panels are shown; the described autofluorescence findings are not visible in this crop, though they are supported by the narration."
  },
  "B072": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The macular lesion is visible, but edema and a definite neovascular membrane are not established; the narration describes the membrane as something that may appear."
  },
  "B073": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 4,
    "q3_crop": 5,
    "q4_image_text": 3,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The fundus view is consistent with vitreous disease; the narrated treatment context supports the injection and cryotherapy reference. No patient identifiers are visible."
  },
  "B074": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Pentacam corneal maps are partly obscured by a black overlay. The narration describes this as a disputed keratoconus diagnosis, so the description's definite diagnosis is unsupported."
  },
  "B075": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 3,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The visible MultiColor/SLO fundus image supports suspected RAM and exudation, but not the claimed multiple images, subretinal fluid, or intraretinal hyperreflective material; slide text and a small room inset add clutter."
  },
  "B076": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows labeled fundus and OCT anatomy, without a retinal detachment or foveal disruption."
  },
  "B077": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "minor",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 1,
    "q6_clinical": 4,
    "q7_pii": 4
   },
   "no_majority": [
    "q5_faithful"
   ],
   "note": "This is a single external eye image, not multiple images; marked redness is visible. A Zoom watermark appears in the lower-right corner."
  },
  "B078": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 2,
    "q4_image_text": 4,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [
    "q3_crop"
   ],
   "note": "This appears to be an intraoperative retinal view; the transcript supports laser photocoagulation in a diabetic patient, but the image does not establish a macular hole or retinal detachment."
  },
  "B079": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows a simulated control room, not an ophthalmic clinical image; no patient-identifying information is visible."
  },
  "B080": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is a schematic eye diagram labeled with posterior capsular opacity, laser beam, and intraocular lens; no patient-identifying information is visible."
  },
  "B081": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "The surgical eye is visible, but thick iris and viscoelastic-assisted irrigation/aspiration are not shown; the narration refers to floppy iris and thick epicortex. The patient’s eye-region is visible."
  },
  "B082": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows a software segmentation display, not an ophthalmic clinical image; no patient-identifying information is visible."
  },
  "B083": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "bad",
   "q4_image_text": "none",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 3,
    "q5_faithful": 5,
    "q6_clinical": 2,
    "q7_pii": 5
   },
   "no_majority": [
    "q6_clinical"
   ],
   "note": "This histology crop shows retinal tumor tissue/rosettes rather than the anterior segment, lens, or angle described; those details are nevertheless explicitly supported by the narration."
  },
  "B084": {
   "q1_ophthalmic": "yes",
   "q2_modality": "angio",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The fluorescein angiogram is visible but cluttered by slide margins and a Zoom overlay; it does not show the claimed subretinal leakage, extraretinal accumulation, or retinal detachment. Zoom and institution logos are non-identifying."
  },
  "B085": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "bad",
   "q4_image_text": "none",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 5,
    "q6_clinical": 3,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "The image is a severely blurred external eye-region photograph, not a retinal image; retinal detachment or fibrous proliferation cannot be seen. The visible eye region counts as patient-identifying."
  },
  "B086": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The fundus photographs show abnormalities near the disc, but microaneurysms are not clearly discernible; the narration does not identify specific findings."
  },
  "B087": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is a thoracic CT image, not an ophthalmic clinical image."
  },
  "B088": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The OCT and fundus/autofluorescence panels show the described photoreceptor changes and laser-treated regions; no patient-identifying information is visible."
  },
  "B089": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "none",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image shows labeled RPE, outer segments, and Bruch’s membrane, not ciliary body epithelium; the description’s claim is supported by the narration but mismatches the image."
  },
  "B090": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "minor",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Only one fluorescein contact-lens fitting image is visible, not multiple comparison images; the eye-region photograph is patient-identifying and occupies the center."
  },
  "B091": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 3,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The four fundus panels show vitreous opacity examples; the “Underreported” title obscures part of one panel. Presenter name/logo and YouTube watermark are visible, but are not patient-identifying."
  },
  "B092": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The narrow, blurry image does not show a recognizable ophthalmic clinical image or patient-identifying information."
  },
  "B093": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 4,
    "q5_faithful": 5,
    "q6_clinical": 4,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "Surgical anterior-segment view matches tilted vertically hanging IOL described; crop is interpretable despite top-right overlay. PII: close-up patient eye/anterior segment visible."
  },
  "B094": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 4,
    "q2_modality": 4,
    "q3_crop": 4,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "The image is a stylized schematic illustration, not a clinical eye image; no patient-identifying information is visible."
  },
  "B095": {
   "q1_ophthalmic": "yes",
   "q2_modality": "oct",
   "q3_crop": "good",
   "q4_image_text": "full",
   "q5_faithful": "full",
   "q6_clinical": "correct",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 4,
    "q5_faithful": 4,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "OCT labels indicate intraretinal cysts, subretinal fluid, and generalized retinal thickening; no patient-identifying information is visible."
  },
  "B096": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "minor",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 3,
    "q6_clinical": 4,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "This is an intraocular surgical view, but the image does not establish that both vitrectomy and scleral buckling were performed."
  },
  "B097": {
   "q1_ophthalmic": "no",
   "q2_modality": "na",
   "q3_crop": "na",
   "q4_image_text": "na",
   "q5_faithful": "na",
   "q6_clinical": "na",
   "q7_pii": "yes",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 4
   },
   "no_majority": [],
   "note": "A patient's face/forehead is visible in the lower-center panel."
  },
  "B098": {
   "q1_ophthalmic": "yes",
   "q2_modality": "multi",
   "q3_crop": "good",
   "q4_image_text": "partial",
   "q5_faithful": "unsupported",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 5,
    "q6_clinical": 5,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "OCTA and structural OCT are shown; GA and ellipsoid-zone disruption are supported, but pathologic choroidal neovascularization is not evident or stated in the transcript."
  },
  "B099": {
   "q1_ophthalmic": "yes",
   "q2_modality": "other",
   "q3_crop": "partial",
   "q4_image_text": "partial",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 4,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 3,
    "q7_pii": 5
   },
   "no_majority": [],
   "note": "Only one gonioscopic view is visible, so three distinct findings cannot all be verified; the description appears to combine narrated examples. Presenter name and conference logo are visible but are not patient-identifying."
  },
  "B100": {
   "q1_ophthalmic": "yes",
   "q2_modality": "cfp",
   "q3_crop": "partial",
   "q4_image_text": "none",
   "q5_faithful": "full",
   "q6_clinical": "major",
   "q7_pii": "no",
   "agree": {
    "q1_ophthalmic": 5,
    "q2_modality": 5,
    "q3_crop": 5,
    "q4_image_text": 5,
    "q5_faithful": 4,
    "q6_clinical": 5,
    "q7_pii": 3
   },
   "no_majority": [],
   "note": "The slide shows two color fundus photographs, not OCT views of retinal layers or macular edema. A Zoom interface and a participant name are visible; neither appears to identify the patient."
  }
 }
};
