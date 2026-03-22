# Connor's Weekly Check-In Form — Complete Reference

**Typeform Form ID:** `n3gubYfj`
**Live URL:** https://mfctransformations.typeform.com/checkingin
**Webhook destination:** `https://dashboard.myfitcoach.ie/webhooks/typeform`
**Used by:** All of Connor's MyFitCoach clients, submitted weekly

---

## How the form works

The client fills in 9 scored questions + 3 open text questions.

6 of the 9 scored questions have **conditional follow-up questions** that only appear if the client scores low (typically 5 or below on the 1-10 scale). These follow-ups are free text — the client explains what went wrong that week.

The stress question has a follow-up that triggers on HIGH scores (because high stress = bad week).

---

## Total Score

- **Maximum possible:** 45 (9 questions x 5 points each)
- **Minimum possible:** 9 (9 questions x 1 point each)
- **All questions are equally weighted** — no category counts more than another
- **The total is a straight sum** of all 9 weighted scores
- **Minimum data required:** At least 5 of the 9 scored fields must have data, otherwise score = null

### Score Bands

| Score Range | Label |
|---|---|
| 38-45 | Sharp across the board |
| 31-37 | Dialled in |
| 24-30 | In control |
| 17-23 | Not bad |
| 10-16 | Rough week |

---

## The 9 Scored Questions

Each question uses a 1-10 slider on the Typeform. The raw 1-10 answer gets converted to a weighted 1-5 score using the bracket tables below.

### Q1: How would you rate your overall performance this week?

**Database column:** `overall_performance`
**Typeform field ref:** `08a11882-5f58-44a8-9e70-5d108f2aaedc`
**Type:** Scale (1-10)
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 |

**No follow-up question.**

---

### Q2: How did your training/cardio go this week?

**Database column:** `training_rating`
**Typeform field ref:** `522e6339-ef63-49c7-9b95-4d925841afe2`
**Type:** Scale (1-10)
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 4 | 5 | 5 |

**Conditional follow-up:** If the client scores low, they see:
- "What was the issue with training?" → stored as `training_issue`
- Typeform field ref: `2f62d196-6bc3-4341-a802-a94d617fd28a`

---

### Q3: Did you hit your daily step target this week?

**Database column:** `step_rating`
**Typeform field ref:** `33b74dae-ec78-4b11-a236-ef7639ae5473`
**Type:** Scale (1-10)
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 4 | 5 |

**Conditional follow-up:** If the client scores low, they see:
- "What was the issue with steps?" → stored as `step_issue`
- Typeform field ref: `bb208412-8ca5-4467-8602-0ad2d1f7f3ad`

---

### Q4: How would you rate your nutrition this week?

**Database column:** `nutrition_rating`
**Typeform field ref:** `88b092a4-e251-47ce-a298-520ef4edc1cc`
**Type:** Scale (1-10)
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 3 | 4 | 4 | 5 | 5 | 5 |

**Conditional follow-up:** If the client scores low, they see:
- "What was the issue with nutrition?" → stored as `nutrition_issue`
- Typeform field ref: `6cdaac53-9eae-4322-a8cc-7a3e0ad6eba3`

**Second conditional follow-up:**
- "Is it an information issue or an execution issue?" → stored as `nutrition_info_vs_execution`
- Typeform field ref: `f7145682-1cf2-4a81-8206-f899673ff883`

---

### Q5: Roughly how many days this week would you say you were "on plan" with food?

**Database column:** `days_on_plan`
**Typeform field ref:** `87aa3c32-a515-4a76-a9d6-257a08bbb893`
**Type:** Multiple choice (not a slider)
**Inverted:** No

| Answer | 0-1 days | 2-3 days | 4-5 days | 6-7 days |
|---|---|---|---|---|
| **Weighted score** | 1 | 2 | 4 | 5 |

Note: There is no score of 3 for this question. The jump from 2 to 4 is intentional — it rewards consistency.

**No follow-up question.**

---

### Q6: How would you rate your sleep this week on average?

**Database column:** `sleep_rating`
**Typeform field ref:** `b56a1664-564e-4046-a1f0-b4502c5c613e`
**Type:** Scale (1-10)
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 1 | 1 | 2 | 2 | 3 | 4 | 5 | 5 |

Note: Sleep is scored generously — you need to rate 7+ to start getting good scores. This reflects the reality that most people's sleep sits around 5-6 and only truly good sleep deserves high marks.

**Conditional follow-up:** If the client scores low, they see:
- "What was the issue with sleep?" → stored as `sleep_issue`
- Typeform field ref: `c26c1eb4-ce78-4f8d-9542-c3d0a168ae94`

---

### Q7: How would you rate your digestion this week on average?

**Database column:** `digestion_rating`
**Typeform field ref:** `b4ec8f22-da73-4b69-9d13-bbde511d7b5e`
**Type:** Scale (1-10)
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 1 | 2 | 2 | 3 | 4 | 4 | 5 | 5 |

**Conditional follow-up:** If the client scores low, they see:
- "What was the issue with digestion?" → stored as `digestion_issue`
- Typeform field ref: `c3d0c143-ea9e-4f0a-a8cb-9306e24c1517`

---

### Q8: What was your average stress level this week?

**Database column:** `stress_rating`
**Typeform field ref:** `1f75d0a7-b810-4f00-821a-e8151e27d8fe`
**Type:** Scale (1-10)
**Inverted:** YES — THIS IS THE ONLY INVERTED QUESTION

**How inversion works:** On this question, 1 means "no stress" and 10 means "extremely stressed." Since HIGH stress is BAD, the scoring is flipped — a high raw answer gives a LOW weighted score.

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 5 | 5 | 5 | 5 | 4 | 3 | 3 | 2 | 2 | 2 |

So:
- Client says stress was 1-4 (low stress) → they get 5 points (great week)
- Client says stress was 5 (moderate) → they get 4 points
- Client says stress was 6-7 (high) → they get 3 points
- Client says stress was 8-10 (very high) → they get 2 points (bad week)

**Conditional follow-up:** If the client reports high stress, they see:
- "What was the main source of stress?" → stored as `stress_source`
- Typeform field ref: `6f1349a2-e67a-42e5-90ca-48752037f4c6`

---

### Q9: Do you feel you progressed, regressed, or stayed the same last week?

**Database column:** `progress_direction`
**Typeform field ref:** `1a1768d8-ed8f-4780-aece-f06e9221e7ad`
**Type:** Multiple choice (3 options)
**Inverted:** No

| Answer | Progressed | Stayed the same | Regressed |
|---|---|---|---|
| **Weighted score** | 5 | 3 | 1 |

**No follow-up question.**

---

## The 3 Unscored Open Text Questions

These do NOT contribute to the total score. They are free text fields for the coach to read.

### Q10: What was your biggest win this week?

**Database column:** `biggest_win`
**Typeform field ref:** `72dfa035-75f0-4401-be78-84f8cb5da3cf`

### Q11: Where would you like extra help/support from me this week?

**Database column:** `help_request`
**Typeform field ref:** `0c8bb709-de48-480e-b4da-8232827200ae`

### Q12: Is there anything coming up this week I should know about?

**Database column:** `upcoming_notes`
**Typeform field ref:** `147c7a86-c8fd-4782-8f45-0995a5dad8e7`

---

## Client Name Field

The form starts by asking for the client's name. This is used to match the submission to the correct client in the database.

**Typeform field ref:** `be65ced6-dd03-44dd-86a8-e09d7d48f334`
**Not stored as a column** — it's used for client lookup only.

---

## Summary of all fields

| # | Question | DB Column | Scored? | Type | Inverted? | Follow-up column |
|---|---|---|---|---|---|---|
| Q1 | Overall performance | `overall_performance` | Yes | Scale 1-10 | No | — |
| Q2 | Training/cardio | `training_rating` | Yes | Scale 1-10 | No | `training_issue` |
| Q3 | Step target | `step_rating` | Yes | Scale 1-10 | No | `step_issue` |
| Q4 | Nutrition | `nutrition_rating` | Yes | Scale 1-10 | No | `nutrition_issue` + `nutrition_info_vs_execution` |
| Q5 | Days on plan | `days_on_plan` | Yes | Choice (4 options) | No | — |
| Q6 | Sleep | `sleep_rating` | Yes | Scale 1-10 | No | `sleep_issue` |
| Q7 | Digestion | `digestion_rating` | Yes | Scale 1-10 | No | `digestion_issue` |
| Q8 | Stress | `stress_rating` | Yes | Scale 1-10 | **YES** | `stress_source` |
| Q9 | Progress direction | `progress_direction` | Yes | Choice (3 options) | No | — |
| Q10 | Biggest win | `biggest_win` | No | Free text | — | — |
| Q11 | Help request | `help_request` | No | Free text | — | — |
| Q12 | Upcoming notes | `upcoming_notes` | No | Free text | — | — |
