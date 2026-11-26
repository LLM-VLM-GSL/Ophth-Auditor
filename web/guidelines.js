window.AUDIT_GUIDELINES = {
 "version": "rubric-v1-table",
 "question": "Does the description fit the image and the narration?",
 "task": "Compare the **description** with the **image** and with what the expert said, then answer the **7 questions**.",
 "welcome": "Thank you for helping us audit a dataset of **ophthalmic images paired with text descriptions**, built from expert teaching videos. For each case, please tell us whether the **description** fits the image and what the expert said. Most cases take 20–40 seconds, about **1 hour per 100 cases**.",
 "in_short": "Judge the **description**, not the speaker; the **transcript** is the reference for what was said. When in doubt, choose the more likely answer and add a short note.",
 "intro": "Thank you for helping us audit **a dataset of ophthalmic images paired with text descriptions**, built from expert teaching videos. Each case shows **one image** taken from a video, the **description** that the dataset pairs with it, and the **narration**: what the expert said at that moment (an automatic transcript, plus the audio clip). **Judge the DESCRIPTION**: does it match the image, is it supported by the narration, is it clinically accurate? Use the **transcript as the reference** for what was said. Answer the 7 questions for each case; most cases take 20–40 seconds, so plan about **1 hour per 100 cases**. Your work is saved automatically, so you can stop and continue later. In question 7, **flag anything patient-identifying**: a face or eye-region photo, a name, ID/MRN, date of birth, or an exam/visit date.",
 "notes": [
  "Judge the **description**, not the narration or the speaker. The narration is only the reference for Q5.",
  "The transcript is produced by automatic speech recognition (and, for other languages, machine translation) and may mishear medical terms. If something looks garbled, play the audio (Space).",
  "Statements that cannot be seen in any image (age, history, symptoms, treatment, prognosis) are not errors for Q4. Check them against the narration in Q5 and against your clinical knowledge in Q6.",
  "Multi-panel images: the description may refer to any panel that is visible in the crop. For Q2, choose **Multi** only when separate panels show **different** modalities (e.g., a fundus photo next to an OCT B-scan).",
  "Q7 counts only **patient**-identifying information. Age, sex, presenter or institution logos, channel watermarks and video-call logos (e.g., Zoom) are **not** patient-identifying: answer **No**, but mention them in the note.",
  "If you hesitate between two options, choose the one you find more likely and add a short note. For Q7, when in doubt choose **Yes** and explain in the note.",
  "Please answer independently: do not discuss cases with the other raters. Do not copy, share or upload the images or texts."
 ],
 "questions": [
  {
   "id": "q1_ophthalmic",
   "title": "Is this an ophthalmic clinical image (not a slide of text, presenter, or chart)?",
   "short": "Ophthalmic image",
   "help": "**Valid** when the main content is a real clinical image of the eye (any modality); labels or arrows on it do not matter. **Invalid** for text slides, charts, schematics, people, logos or blank frames.",
   "required": true,
   "options": [
    {
     "code": "yes",
     "label": "Valid",
     "key": "1",
     "help": "A real clinical image of the eye or an ophthalmic imaging/test result (any modality); annotations, arrows or labels on it are fine."
    },
    {
     "code": "no",
     "label": "Invalid",
     "key": "2",
     "help": "Not a clinical image: a slide that is mostly text, a chart or table, a schematic or drawing, the presenter or another person, a logo or title card, or a blank frame. Questions 2-6 are then skipped.",
     "issue": true
    }
   ]
  },
  {
   "id": "q2_modality",
   "title": "What is the imaging modality?",
   "short": "Imaging modality",
   "help": "The modality of the clinical image. Choose **Multi** only when separate panels of different modalities are shown (e.g., a fundus photo next to an OCT B-scan); several panels of the same modality get that modality. OCT angiography counts as **Angio**; fundus autofluorescence, infrared/SLO and red-free images count as **Other**.",
   "required": true,
   "skip_if": {
    "q1_ophthalmic": [
     "no"
    ]
   },
   "options": [
    {
     "code": "multi",
     "label": "Multi",
     "key": "1",
     "help": "Two or more modalities shown as separate panels (e.g. a fundus photo next to an OCT B-scan)."
    },
    {
     "code": "oct",
     "label": "OCT",
     "key": "2",
     "help": "Optical coherence tomography (B-scan, thickness or en-face map)."
    },
    {
     "code": "cfp",
     "label": "CFP",
     "key": "3",
     "help": "Colour fundus photograph (standard field)."
    },
    {
     "code": "angio",
     "label": "Angio",
     "key": "4",
     "help": "Fluorescein or ICG angiography, or OCT angiography."
    },
    {
     "code": "other",
     "label": "Other",
     "key": "5",
     "help": "Another ophthalmic image: autofluorescence, infrared/SLO, red-free, anterior segment, ultrasound, visual field..."
    },
    {
     "code": "uwf",
     "label": "UWF",
     "key": "6",
     "help": "Ultra-widefield fundus image."
    }
   ]
  },
  {
   "id": "q3_crop",
   "title": "Is the clinically relevant region preserved in the crop?",
   "short": "Crop quality",
   "help": "Judge the image as shown, as it was cropped from the video frame: is the part needed to interpret it (and to check the description) inside the frame and unobstructed?",
   "required": true,
   "skip_if": {
    "q1_ophthalmic": [
     "no"
    ]
   },
   "options": [
    {
     "code": "good",
     "label": "Good",
     "key": "1",
     "help": "The clinically relevant region is fully kept, with little clutter."
    },
    {
     "code": "partial",
     "label": "Partial",
     "key": "2",
     "help": "The relevant region is partly cut off or surrounded by much unrelated slide content."
    },
    {
     "code": "bad",
     "label": "Poor",
     "key": "3",
     "help": "The relevant region is mostly lost, or the crop shows the wrong part of the frame.",
     "issue": true
    }
   ]
  },
  {
   "id": "q4_image_text",
   "title": "Does the description match what is visible in the image?",
   "short": "Image and text alignment",
   "help": "Compare the description with the image only. Count the visual claims (modality, anatomy, findings and their location); statements that no image could show (history, symptoms, treatment) neither help nor hurt.",
   "required": true,
   "skip_if": {
    "q1_ophthalmic": [
     "no"
    ]
   },
   "options": [
    {
     "code": "full",
     "label": "Full",
     "key": "1",
     "help": "The description fits what is visible (imaging type, anatomy, findings)."
    },
    {
     "code": "partial",
     "label": "Partial",
     "key": "2",
     "help": "Some of the description fits; part of it is not visible or does not fit."
    },
    {
     "code": "none",
     "label": "Mismatch",
     "key": "3",
     "help": "The description does not fit this image.",
     "issue": true
    }
   ]
  },
  {
   "id": "q5_faithful",
   "title": "Does the description invent anything (not supported by the narration or the image)?",
   "short": "Invented content",
   "help": "Only fabrication counts. Leaving things out is fine; paraphrase and standard terminology are fine; a detail that the narration does not mention but that is clearly visible in the image is fine. Your own clinical opinion belongs in Q6, not here.",
   "required": true,
   "skip_if": {
    "q1_ophthalmic": [
     "no"
    ]
   },
   "options": [
    {
     "code": "full",
     "label": "None",
     "key": "1",
     "help": "Everything in the description is said or implied in the narration, or clearly visible in the image."
    },
    {
     "code": "partial",
     "label": "Possible",
     "key": "2",
     "help": "A detail neither the narration nor the image clearly supports, but it does not change the clinical meaning."
    },
    {
     "code": "unsupported",
     "label": "Confirmed",
     "key": "3",
     "help": "States a finding, diagnosis, imaging modality, location or number that neither the narration nor the image supports, or that contradicts them.",
     "issue": true
    }
   ]
  },
  {
   "id": "q6_clinical",
   "title": "Is the description clinically accurate?",
   "short": "Clinical accuracy",
   "help": "Your own clinical judgment of the description for this image, whatever the narration said.",
   "required": true,
   "skip_if": {
    "q1_ophthalmic": [
     "no"
    ]
   },
   "options": [
    {
     "code": "correct",
     "label": "Consistent",
     "key": "1",
     "help": "The description is clinically consistent with the image and the narration."
    },
    {
     "code": "major",
     "label": "No consensus",
     "key": "2",
     "help": "The description contains a clinically questionable or incorrect statement.",
     "issue": true
    }
   ]
  },
  {
   "id": "q7_pii",
   "title": "Is any patient-identifying information visible?",
   "short": "Patient identifiers",
   "help": "Check the whole image, including corners and overlays, also when it is not a clinical image. **Yes** = a face or eye-region photo of a person, a patient name, ID/MRN, date of birth, or a date tied to the patient (exam, visit or imaging date). Age, sex, presenter or institution logos, channel watermarks and video-call logos (e.g., Zoom) are **not** patient-identifying: answer **No**, but mention them in the note.",
   "required": true,
   "options": [
    {
     "code": "no",
     "label": "Absent",
     "key": "1",
     "help": "No patient-identifying information is visible."
    },
    {
     "code": "yes",
     "label": "Present",
     "key": "2",
     "help": "A patient's face, name, ID/MRN, date of birth or a date tied to the patient is visible; say what and where in the note.",
     "issue": true,
     "ask_note": true
    }
   ]
  }
 ]
};
