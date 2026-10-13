# Writing brief for flightcrew.fit blog articles

You are writing for the blog of Flight Crew Fitness (flightcrew.fit), a workout and nutrition app for airline pilots and flight crew. The author is Chad Cooper, a working airline captain (Embraer 175, Phoenix). The byline is "Chad Cooper, airline captain" and that is the ONLY credential ever claimed. Never write "as a certified trainer", "as a coach", "as a nutritionist" or anything similar. Authority comes from being a line pilot who reads the research and cites it.

## Hard rules (the build script rejects violations)
1. NO em dashes (the character —) anywhere. Use a comma, a period, or a colon. Also avoid en dashes in prose.
2. Every article is a Markdown file in blog/src/<slug>.md with the exact front matter shown in the example file blog/src/hotel-gym-workout-for-pilots.md. Read that file first and copy its structure exactly.
3. Never state a user count for the app. Never state a specific mandatory retirement age (say "mandatory retirement"). Never claim the iOS app is in the App Store; say "the web app works today, the iOS app is in App Store review".
4. Every number, statistic, study result, FAA rule or quote must have a source in the references list with a real URL from the research notes below. If you cannot source a claim, do not make it. Do not invent studies, authors, or figures.
5. Nothing diagnoses anyone or tells a specific person to change medication. Medical articles end by pointing the reader to their AME or doctor for their own case.
6. 1,300 to 1,900 words in the body. Four to seven H2 sections. One "Captain's note:" paragraph somewhere in the middle (a paragraph that starts with the literal text `Captain's note:`). One `{{CTA}}` line on its own after the intro paragraphs (before the first H2).
7. takeaways: exactly 3 bullets. The first bullet answers the search query directly. faq: 4 questions, each answer 40 to 80 words, written so it can stand alone as a featured snippet. references: 3 to 6 entries with title, url, and a short note.
8. description: 140 to 160 characters, no quotes inside it. seo_title: under 60 characters, keyword first, no brand name (the script appends it).
9. Write pilot-specific. The reader has a four-day trip, a hotel gym with 30 lb dumbbells, a 5 a.m. show, a crashpad, a reserve day, an AME appointment in six months. Use those realities. Do not write generic fitness content with "pilot" sprinkled in.

## Voice (study these, they are from the author's Facebook posts)

> Your medical is the only performance review that can end your career in a single afternoon. Nobody fails it out of nowhere. It goes slowly, across years of sitting for a living, eating what the terminal sells at 10pm, and sleeping on a schedule that moves every week.

> The most common mistake I see from people training on a layover: rushing the rest. You have 40 minutes before the van, so you cut rest to 45 seconds and try to get it all in. Feels efficient. It is not.

> Eight hours in that seat does three specific things, and all three are fixable. Hip flexors shorten. Glutes stop firing. Thoracic spine stiffens. The fix is not stretching for an hour. It is hinging, squatting and pulling two or three times a week.

> Training on a four-day is the easy half. Eating is the hard half. You are working from airport terminals, hotel breakfast, and whatever is open after 10pm in a city you have never been to. Most nutrition advice assumes a kitchen and a schedule. You have neither.

> Twenty minutes is the floor, not the goal. Set the floor low enough that you clear it on your worst day.

Short sentences. Plain words. Direct. Dry humour, never jokey. Specific numbers over vague encouragement. No "genuinely", "honestly", "straightforward", "game-changer", "unlock", "elevate", "journey", "dive in". No exclamation marks. No rhetorical questions stacked three deep. Address the reader as "you". First person is fine for the author's own experience on the line.

## App facts you may reference (only these)
- Free tier: workout logging, basic trends, hydration and pre-flight reminders, medication and supplement reminders. Pro adds the AI coach, unlimited food photo analysis, full trends history, Oura direct connect. Do not state prices.
- Environments: Commercial Gym, Hotel Gym, Hotel Room, resistance bands. Hotel Room sessions use no jumping.
- Pilot condition toggle: Go / Marginal / No-Go, auto-set from Apple Health or a 15-second self-check. Reduces or removes heavy lifting on No-Go days.
- Reads Apple Health (works with Apple Watch, Oura, Whoop, Garmin) and connects to Oura directly for readiness.
- Imports the crew schedule (duty days, layovers, commuter days) and plans around duty events.
- Protein targets paced around duty times. Food photo recognition. "Your Usual" quick-add meals.
- Hydration: 0.3 L per flight hour with a floor on no-fly days.
- Workout structure: Taxi (warmup), Takeoff (heavy), En Route (volume), Landing (decompression).
- Biometrics: weight, waist, blood pressure, fasting glucose, with the clinical measurement protocol.
- Leaderboards by DOTS score, opt-in. Badges from logged history. Injury flags swap in alternatives. Time-trimmed sessions that protect warmup and cooldown.

## Verified sources (use these URLs; do not fabricate others)

FAA blood pressure: AME Guide Item 55, seated BP must not exceed 155 systolic / 95 diastolic, all classes. https://www.faa.gov/ame_guide/app_process/exam_tech/item55/et
FAA CACI Hypertension worksheet: in-office BP at or under 155/95; up to 3 antihypertensives from listed classes (ACE inhibitors, ARBs, calcium channel blockers, diuretics, beta blockers, alpha blockers, direct renin inhibitors, direct vasodilators); centrally acting agents like clonidine excluded; stable on regimen at least 7 days; AME can issue if criteria met. https://www.faa.gov/ame_guide/media/CACI_Hypertension.pdf
Mayo Clinic: roughly 1 mmHg of blood pressure per kilogram (2.2 lb) lost. https://www.mayoclinic.org/diseases-conditions/high-blood-pressure/in-depth/high-blood-pressure/art-20046974
FAA certificate validity: first class medical 12 calendar months under age 40, 6 calendar months at 40 and over. https://www.faa.gov/ame_guide/standards/duration
No FAA weight or BMI limit; BMI matters through OSA screening. https://www.leftseat.com/faa-medical-certification-obesity-osa/
FAA OSA protocol intro: over 90% of people with BMI 40 or greater have OSA requiring treatment; up to 30% of people with OSA have BMI under 30; untreated OSA is disqualifying, certification possible once effective treatment shown. https://www.faa.gov/ame_guide/media/OSA%20protocol%20intro%20sheet.pdf
FAA OSA brochure: 20 to 30% of males and 10 to 15% of females have OSA; mild to moderate OSA impairment comparable to 0.06 to 0.08% blood alcohol; a 10% weight loss reduces AHI by about 25%; CPAP most effective at six hours or more a night. https://www.faa.gov/ame_guide/media/Sleep_Apnea.pdf
FAA brochure Fatigue in Aviation: healthy adults do best with eight hours of uninterrupted sleep; avoid caffeine and alcohol 3 to 4 hours before bed; naps under 30 minutes to avoid sleep inertia; no hard exercise 2 to 3 hours before bed; no heavy meal before bed; "No degree of experience, motivation, medication, coffee, or will power can overcome fatigue." https://www.faa.gov/pilots/safety/pilotsafetybrochures/media/fatigue_aviation.pdf
FAA brochure Circadian Rhythm Disruption and Flying: shift bedtime about one hour per day for a few days before a trip; 30 minute nap before a long flight; keep naps to 30 minutes or less; caffeine used strategically during the flight; exercise regularly but not near bedtime. https://www.faa.gov/sites/faa.gov/files/Circadian_Rhythm_English_0.pdf
NASA nap study (Rosekind et al. 1995): a planned 26 minute cockpit nap improved performance up to 34% and alertness up to 54%. Summary: https://www.sleepfoundation.org/sleep-hygiene/nasa-nap
Dawson and Reid 1997, Nature: 17 hours awake roughly equals 0.05% BAC impairment, 24 hours roughly 0.10%. https://www.nature.com/articles/40775
ALPA Effects of Jet Lag (2023): daylight is the main cue; avoid screens 2 to 3 hours before bed; avoid heavy carb and fat meals before sleep. https://www.alpa.org/articles/2023/03/effects-of-jet-lag
Flight Safety Foundation 2001, Dehydration Presents Unique Risks for Pilots: flight deck humidity about 3 to 5 percent; thirst appears at about 2% body weight loss; fatigue, nausea, emotional instability around 5%; about 1.9 litres (two quarts) of water per 24 hours recommended; caffeine and alcohol are diuretics. https://flightsafety.org/hf/hf_jul-aug01.pdf
AOPA ASI Hydration helps (2025): mild dehydration of 1 to 2% body weight affects cognition, memory and decision making; dehydration can mimic hypoxia. https://www.aopa.org/news-and-media/all-news/2025/august/pilot/asi-safety-tips-hydration-helps
Drake et al. 2013, J Clin Sleep Med: 400 mg of caffeine taken 6 hours before bed cut measured total sleep by more than one hour, and subjects did not notice. https://jcsm.aasm.org/doi/10.5664/jcsm.3170
Sleep Foundation shift work coping strategies: short naps of 15 to 20 minutes, bedroom around 65 F, caffeine in small doses early in the shift. https://www.sleepfoundation.org/shift-work-disorder/tips/coping-strategies
Stronger by Science, minimum effective dose (2024): 3 to 6 weekly sets of 1 to 5 reps per lift at 0 to 3 reps in reserve produced meaningful strength gains in 6 to 12 weeks; 2 to 3 weekly sets of 6 to 12 reps for general lifters. https://www.strongerbyscience.com/minimum-effective-dose/
Examine, how much protein per day: 1.2 to 2.4 g per kg bodyweight per day for active people; about 0.4 g per kg per meal; the 30 g per meal ceiling is a myth. https://examine.com/supplements/whey-protein/faq/how-much-protein-do-i-need-per-day
Schoenfeld 2016 rest intervals: 3 min vs 1 min rest, squat 1RM +15.2% vs +7.6%, thigh thickness +13.3% vs +6.9% over 8 weeks in trained men. https://pubmed.ncbi.nlm.nih.gov/26605807/
Schoenfeld 2017 meta-analysis: similar muscle growth from light and heavy loads when taken near failure. https://pubmed.ncbi.nlm.nih.gov/28834797/
Gordji-Nejad et al. 2024, Scientific Reports: a single large creatine dose (0.35 g per kg) during 21 hours of sleep deprivation improved cognitive processing; this is an experimental dose, not a protocol. https://www.nature.com/articles/s41598-024-54249-9
Kreider et al. 2017, ISSN position stand on creatine: 3 to 5 g daily is safe and effective for healthy adults. https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0173-z
Elite HRV, when shift workers should measure HRV: take the reading after your main sleep, whenever that falls, and compare only against your own baseline. https://help.elitehrv.com/article/500-when-should-overnight-or-shift-workers-measure-hrv
AOPA Fit to fly, avoid injuries (2023): long cockpit sitting leaves the body stiff; bodyweight warm-ups before moving aircraft. https://aopa.org/news-and-media/all-news/2023/january/pilot/fit-to-fly-avoid-injuries
Mayo Clinic, sitting risks: prolonged sitting linked to higher blood pressure, blood sugar and waist circumference. https://www.mayoclinic.org/healthy-lifestyle/adult-health/expert-answers/sitting/faq-20058005
Flight Crew Fitness related articles for internal links: /blog/hotel-gym-workout-for-pilots.html (hotel gym improvisation). Link to other articles in this batch by their slug once you know it.
