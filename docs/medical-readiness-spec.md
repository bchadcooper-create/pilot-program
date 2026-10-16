# FCF Medical: FAA medical readiness (spec)

Owner decision, Oct 16 2026: build Tier 1 and Tier 2 inside FCF as a Pro section, gated to Chad's account first for testing and feedback. First-class focus, with second and third class covered by the same structure. Chad meets a senior AME the first week of December 2026 and will show it to him; possible endorsement.

## What it is, in one line

Preparation and early warning for the FAA medical, never a verdict. The app flags what an AME would look at and points the pilot to an optometrist, their doctor, or their AME before the exam. The AME decides.

## Wording rules (every screen)

- Never "you would pass" or "you would fail". Use "this would draw attention at your exam", "worth a visit to an optometrist before your medical", "talk to your AME before you take this".
- Every self-check ends with the same line: a screening aid, not the exam; the exam is done by an AME under FAA standards.
- Show "Last checked against the FAA AME Guide: <date>" on the medication lookup and the standards pages, with a link to the FAA page.
- No em dashes anywhere.

## Privacy design

- Medical answers (certificate dates, conditions, medications) live on the phone only (localStorage), never in Supabase, never sent to the AI coach, never in the CSV export unless the pilot ticks a box.
- Optional 4-digit PIN gate for the Medical section (hashed on device). Phone lock is the real protection; the PIN stops shoulder-surfing and a borrowed phone.
- The medication lookup and standards pages are reference content and store nothing.
- A "Delete all medical data" button that wipes the local record.

## Standards used (FAA AME Guide, checked Oct 16 2026)

First class unless noted.

- Distant vision 20/20 each eye, corrected OK. Near 20/40 at 16 in. Intermediate 20/40 at 32 in from age 50. (Second class: same. Third: distant 20/40, near 20/40.)
- Color vision: ability to perceive colors needed for duties. Tested at the exam; a pilot who has a Letter of Evidence or SODA is settled. App: explainer only, no screen test (phone color is not calibrated).
- Hearing: conversational voice at 6 ft, both ears; or audiogram (better ear 35/30/30/40 dB at 500/1000/2000/3000 Hz; worse ear 35/50/50/60). App: explainer, plus read the Apple Health audiogram from the AirPods Pro hearing test when the shell supports it (build 7 item: HKAudiogramSample).
- Blood pressure guideline ceiling 155/95.
- ECG: first exam at or after age 35, then annually from age 40. First class only.
- Urinalysis: glucose and protein at every exam.
- Disqualifying history (deny or defer unless FAA says otherwise): diabetes needing hypoglycemic medication, angina, treated or symptomatic coronary disease, myocardial infarction, valve replacement, pacemaker, heart transplant, psychosis, bipolar disorder, severe personality disorder, substance dependence or abuse, epilepsy, unexplained disturbance of consciousness, transient loss of nervous system control.
- Sleep apnea: BMI 40 and over triggers the FAA OSA screening path.

## Certificate duration (14 CFR 61.23(d)), from the end of the exam month

- First class: first-class privileges 12 months (under 40 at exam) or 6 months (40 and over); then second-class 12 months; then third-class 60 months (under 40) or 24 months (40 and over).
- Second class: 12 months second-class; then third-class 60 or 24.
- Third class: 60 or 24.
- Which class is needed: ATP privileges and Part 121 PIC need first; commercial privileges (most Part 135 and Part 91 commercial flying) need second; private and student need third or BasicMed. Part 135 PICs in operations that require an ATP need first class. The app asks what the pilot flies under and tracks the matching class, defaulting to first.

## Medication lookup (FAA DNI/DNF tables)

Three buckets, searchable by brand or generic name:

1. **Do Not Issue**: AME cannot certify without FAA clearance. Antidepressants (except the SSRI/bupropion special issuance path), antipsychotics, ADHD stimulants, mood stabilizers, tranquilizers, seizure medications even for migraine, controlled substances including medical marijuana, centrally acting antihypertensives (clonidine, methyldopa, guanabenz), dopamine agonists, nitrates and ranolazine, oral anticholinergics, tertiary overactive-bladder drugs, benztropine, pramlintide, mefloquine, phentermine and Contrave, prednisone over 20 mg/day, chemotherapy, investigational drugs, anything FDA-approved under 12 months.
2. **Do Not Fly, wait time**: sedating antihistamines (diphenhydramine 60 h; chlorpheniramine), benzodiazepines, muscle relaxants, narcotic and tramadol pain relievers, all sleep aids, kava, kratom, valerian, pre-procedure sedation. General rule: 5 times the maximum half-life; fallback 5 times the dosing interval. Any label with a drowsiness warning.
3. **Generally accepted, report on MedXPress**: finasteride, topical minoxidil, statins, most blood pressure drugs (ACE inhibitors, ARBs, calcium channel blockers, thiazides, beta blockers), metformin and most non-insulin diabetes drugs (insulin needs special issuance), PPIs, non-sedating antihistamines (loratadine, fexofenadine, cetirizine with caution), varenicline, GLP-1 agonists (semaglutide, tirzepatide: accepted for weight with FAA conditions; note to confirm with AME), testosterone replacement (accepted with documentation), allopurinol, levothyroxine, tamsulosin, sildenafil-type drugs with a wait.

Oral minoxidil is an antihypertensive: bucket 3 with a "talk to your AME" flag. SSRIs: fluoxetine, sertraline, citalopram, escitalopram, and bupropion (added 2023) are allowed only through a HIMS AME after 3 months stable on one drug; mark as "special issuance path, not a regular issue".

Each entry carries: generic, brands, bucket, note, wait time if any, FAA page link. Footer: "Not all-inclusive. Confirm with your AME before your exam."

## MedXPress prep (Form 8500-8)

Walk-through of the questions pilots stumble on: item 17 medications (everything, including OTC and supplements), item 18 medical history (any yes needs an explanation and often records), item 19 visits to health professionals in the last 3 years (every visit, with name, date, reason), arrests and DUIs (item 18v, reported within 60 days to the FAA separately). Flags: "this answer usually means bring records", "this answer usually means call your AME first".

## Self-checks (Tier 2)

- **Near vision**: calibrate screen with a credit card (85.6 mm wide), hold at 16 in (a tape measure or a sheet of letter paper long side is 11 in; use arm's length guidance plus a ruler), read lines from 20/100 to 20/20 using Sloan letters (C D H K N O R S V Z). Letter height for 20/20 at 16 in is 0.59 mm (5 arcmin), 20/40 is 1.18 mm. One eye at a time. Result phrased as "comfortable line" and whether it reaches the 20/40 standard, with a nudge to an optometrist if not. Instruct: full brightness, lit room, glasses on if worn for reading.
- **Distant vision**: 10 ft with a mirror or 20 ft; same calibration. Lower confidence, say so on screen; a miss means "see an optometrist", a pass means nothing more than "no obvious problem".
- **Hearing**: explain the 6 ft conversational voice test. Pull the Apple Health audiogram when the shell can read it (build 7) and compare to the FAA thresholds.
- **Color vision**: explainer only.

## Biometrics against FAA lines

From weight_log: latest BP vs 155/95; fasting glucose vs 100 (prediabetes) and 126 (diabetes); BMI vs 30 (AME notes), 35 and 40 (OSA screening tiers). Weight trend. Each with a plain flag and what the AME typically does about it.

## Phases

1. (now, owner only) Medical menu item, disclaimer, PIN, certificate tracker with expiry and ECG due, biometrics vs FAA lines, medication lookup, MedXPress prep, near-vision check, hearing and color explainers.
2. Distant vision check, Today reminders at 60 and 30 days before expiry, push notifications.
3. Build 7: read the Apple Health audiogram (HKAudiogramSample) for the hearing comparison.
4. Pro gate for all members after Chad's testing and the AME's feedback.

## Questions for the AME (December)

- Which of these flags would he want a pilot to raise before the exam vs. just bring records for?
- Near-vision self-check: useful, or more worry than help?
- Medication buckets: anything he would word differently, and how he handles GLP-1s and TRT today.
- Would he put his name to it, review it quarterly, or neither?
