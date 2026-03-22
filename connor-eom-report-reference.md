# Connor's End-of-Month Report — Complete Reference

**Typeform Form ID:** `iISVFuRv`
**Live URL:** https://mfctransformations.typeform.com/to/iISVFuRv
**Webhook destination:** `https://dashboard.myfitcoach.ie/webhooks/typeform`
**Used by:** All of Connor's Core clients, submitted once per month

---

## How the form works

The client fills in 22 questions total:
- **9 scored questions** → weighted to a 1-5 score each → total out of 45
- **6 conditional follow-up questions** → only appear when a scored question is low (≤6) or stress is high (≥7)
- **7 unscored questions** → free text and multi-select for coach review

The form is longer than the weekly check-in because it's a monthly reflection. It includes hindsight, direction confidence, and categorised help requests that the weekly form doesn't have.

---

## Total Score

- **Maximum possible:** 45 (9 questions x 5 points each)
- **Minimum possible:** 9 (9 questions x 1 point each)
- **All questions are equally weighted** — no category counts more than another
- **The total is a straight sum** of all 9 weighted scores
- **Minimum data required:** At least 5 of the 9 scored fields must have data, otherwise score = null

### Score Bands (same as weekly)

| Score Range | Label |
|---|---|
| 38-45 | Sharp across the board |
| 31-37 | Dialled in |
| 24-30 | In control |
| 17-23 | Not bad |
| 10-16 | Rough week |

---

## Conditional Follow-Up Logic (when questions appear)

This is the key difference from the weekly form — the EOM has explicit thresholds built into Typeform's logic jumps:

| Scored question | Follow-up appears when... | Follow-up skipped when... |
|---|---|---|
| Training (≤6) | Client rates 1-6 | Client rates 7-10 |
| Steps (≤6) | Client rates 1-6 | Client rates 7-10 |
| Nutrition (≤6) | Client rates 1-6 | Client rates 7-10 |
| Sleep (≤6) | Client rates 1-6 | Client rates 7-10 |
| Digestion (≤6) | Client rates 1-6 | Client rates 7-10 |
| **Stress (≥7)** | Client rates 7-10 (high stress) | Client rates 1-6 (low stress) |

Stress is the **only question where the follow-up triggers on a HIGH score** because high stress = bad.

---

## The 9 Scored Questions

Each scale question uses a 1-10 opinion scale on Typeform. The raw 1-10 answer gets converted to a weighted 1-5 score using the bracket tables below.

**Note:** The EOM pillars are ordered differently from the weekly form. Training comes first, overall performance comes last. The scoring brackets also differ slightly from the weekly form (stress bracket at position 6 gives 4 instead of 3).

---

### Q3: How did your training/cardio go this month overall?

**Database column:** `training_rating`
**Typeform field ref:** `eom-training-rating`
**Type:** Scale 1-10 (labels: "Way off" → "Could be sharper" → "Fully dialled in")
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 |

**Conditional follow-up (appears when score ≤ 6):**
- "What best explains why training didn't go to plan?" → stored as `training_issue`
- Typeform field ref: `eom-training-issue`
- Type: Multiple choice
- Options:
  - Genuinely no time (work/childcare/travel)
  - Energy was on the floor
  - Gym access/travel issues
  - Minor injury/pain and I didn't want to push it
  - I could have trained but motivation was low
  - Other

---

### Q5: How were your steps/daily activity this month?

**Database column:** `step_rating`
**Typeform field ref:** `eom-step-rating`
**Type:** Scale 1-10 (labels: "Barely moved" → "Hit & miss" → "Nailed it daily")
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 4 | 5 |

**Conditional follow-up (appears when score ≤ 6):**
- "What got in the way of your steps/activity?" → stored as `step_issue`
- Typeform field ref: `eom-step-issue`
- Type: Multiple choice
- Options:
  - Didn't prioritise them
  - Workdays were too sedentary / stuck at desk
  - Bad weather / environment
  - Unsure what target to aim for
  - Other

---

### Q7: How would you rate your nutrition this month overall?

**Database column:** `nutrition_rating`
**Typeform field ref:** `eom-nutrition-rating`
**Type:** Scale 1-10 (labels: "Very poor" → "Hit & miss" → "Nailed it daily")
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 3 | 4 | 4 | 5 | 5 | 5 |

**Conditional follow-up 1 (appears when score ≤ 6):**
- "What was the main issue with nutrition?" → stored as `nutrition_issue`
- Typeform field ref: `eom-nutrition-issue`
- Type: Multiple choice
- Options:
  - I didn't really track or pay attention
  - Weekends / social events derailed things
  - Overate in the evenings
  - I wasn't sure what "on plan" actually looked like
  - Missed protein targets
  - Too many takeaways / convenience food
  - Underate overall and felt low energy / binge-y after
  - Other

**Conditional follow-up 2 (also appears when nutrition score ≤ 6):**
- "Is this mostly an information problem or an execution problem?" → stored as `nutrition_info_vs_execution`
- Typeform field ref: `eom-nutrition-info-exec`
- Type: Multiple choice
- Options:
  - I don't fully know what I should be doing
  - I know what to do, I just didn't do it
  - A bit of both

---

### Q10: On average, how many days per week were you "on plan" with food?

**Database column:** `days_on_plan`
**Typeform field ref:** `eom-days-on-plan`
**Type:** Multiple choice (single select)
**Inverted:** No

| Answer | 0-1 days | 2-3 days | 4-5 days | 6-7 days |
|---|---|---|---|---|
| **Weighted score** | 1 | 2 | 4 | 5 |

Note: Same as weekly — no score of 3. The jump from 2 to 4 is intentional.

**No follow-up question.**

---

### Q11: How would you rate your sleep this month on average?

**Database column:** `sleep_rating`
**Typeform field ref:** `eom-sleep-rating`
**Type:** Scale 1-10 (labels: "Running on fumes" → "Broken but bearable" → "Sleep dialled in")
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 1 | 1 | 2 | 2 | 3 | 4 | 5 | 5 |

**Conditional follow-up (appears when score ≤ 6):**
- "What mainly affected your sleep?" → stored as `sleep_issue`
- Typeform field ref: `eom-sleep-issue`
- Type: Multiple choice
- Options:
  - Struggling to switch off / mind racing
  - Bedtime/routine all over the place
  - Kids / family interruptions
  - Work / late calls or emails
  - Pain / discomfort
  - Other

---

### Q13: How would you rate your digestion this month on average?

**Database column:** `digestion_rating`
**Typeform field ref:** `eom-digestion-rating`
**Type:** Scale 1-10 (labels: "War zone" → "Not ideal, but ok" → "Running smooth")
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 1 | 2 | 2 | 3 | 4 | 4 | 5 | 5 |

**Conditional follow-up (appears when score ≤ 6):**
- "Digestion wasn't ideal - anything you think might've triggered it?" → stored as `digestion_issue`
- Typeform field ref: `eom-digestion-issue`
- Type: Multiple choice
- Options:
  - Bloating
  - Constipation
  - Loose stools
  - Stomach pain / discomfort
  - Not sure, just didn't feel right

---

### Q15: What was your average stress level this month?

**Database column:** `stress_rating`
**Typeform field ref:** `eom-stress-rating`
**Type:** Scale 1-10 (labels: "Clear-headed" → "Manageable" → "Overloaded")
**Inverted:** YES — THIS IS THE ONLY INVERTED QUESTION
**Form description shown to client:** "*Heads up — 1 means low stress, 10 is high stress."

**How inversion works:** 1 means "no stress" and 10 means "extremely stressed." High stress is BAD, so the scoring is flipped — a high raw answer gives a LOW weighted score.

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 5 | 5 | 5 | 5 | 4 | 4 | 3 | 2 | 2 | 2 |

**Note:** This differs slightly from the weekly form. Position 6 scores **4** here (vs **3** on the weekly form). This means the EOM is marginally more forgiving on moderate stress.

**Conditional follow-up (appears when stress ≥ 7):**
- "You reported higher stress - was it work, home, or just general pressure?" → stored as `stress_source`
- Typeform field ref: `eom-stress-source`
- Type: Short text (free response)

---

### Q17: Do you feel you progressed, stayed the same, or regressed this month?

**Database column:** `progress_direction`
**Typeform field ref:** `eom-progress-direction`
**Type:** Multiple choice (single select)
**Inverted:** No

| Answer | Progressed | Stayed the same | Regressed |
|---|---|---|---|
| **Weighted score** | 5 | 3 | 1 |

**No follow-up question.**

---

### Q18: Overall, how would you rate your month?

**Database column:** `overall_performance`
**Typeform field ref:** `eom-overall-performance`
**Type:** Scale 1-10 (labels: "Tough month" → "Ticking over" → "Firing on all cylinders")
**Inverted:** No

| Raw answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Weighted score** | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 |

**No follow-up question.**

---

## The Unscored Questions

These do NOT contribute to the total score. They provide context for the coach.

### Q1: Full name (as shown in Trainerize)

**Typeform field ref:** `eom-name`
**Used for:** Client matching only — not stored as a column.
**Description shown to client:** "We have built a new coaching dashboard. For the information to link, your name must be spelled as in Trainerize."

### Q2: What was your biggest win this month?

**Database column:** `biggest_win`
**Typeform field ref:** `eom-biggest-win`
**Type:** Short text

### Q19: How confident do you feel about the direction we're heading?

**Database column:** `direction_confidence`
**Typeform field ref:** `eom-direction-confidence`
**Type:** Scale 1-10 (labels: "Lost" → "I know the general gist but a little uncertain" → "I know exactly where we're heading")
**Note:** This is a scale question but it is NOT scored — it's for coach insight only.

### Q20: Is there anything specific you want my help with?

**Database column:** `help_request`
**Typeform field ref:** `eom-help-request`
**Type:** Multiple choice (multi-select, optional)
**Options are grouped by category using section dividers (filtered out during parsing):**

**Training:**
- I'm unsure about exercise technique
- I'm not confident in how hard to push / progress
- I'm struggling to fit sessions into my week
- I'm unsure about the overall plan structure

**Nutrition:**
- I'm unclear on what "on plan" looks like
- I struggled with evenings/weekends
- I'm unsure how to hit protein/calories
- I need more ideas for meals/snacks

**Lifestyle / Recovery:**
- I need help improving my sleep
- I need help managing stress
- I need help structuring my routine

**Other:**
- No, all good, just keep me accountable
- Other

### Q21: If you could go back to the start of the month, what's one thing you'd improve or do differently?

**Database column:** `advice_to_past_self`
**Typeform field ref:** `eom-hindsight`
**Type:** Short text

### Q22: Is there anything coming up next month I should know about?

**Database column:** `upcoming_notes`
**Typeform field ref:** `eom-upcoming-notes`
**Type:** Short text (optional)

---

## Differences between EOM and Weekly forms

| Difference | Weekly | EOM |
|---|---|---|
| **Pillar order** | Overall first, progress last | Training first, overall last |
| **Stress bracket at position 6** | Scores 3 | Scores 4 (slightly more forgiving) |
| **Direction confidence** | Not asked | Asked (unscored, scale 1-10) |
| **Hindsight question** | Not asked | Asked ("what would you do differently?") |
| **Help request format** | Free text | Categorised multi-select (training/nutrition/lifestyle groups) |
| **Biggest win** | Asked (free text) | Asked (free text) |
| **Follow-up trigger threshold** | Built into Typeform (assumed ≤ 6) | Explicitly ≤ 6 for all, ≥ 7 for stress |

---

## Summary of all fields

| # | Question | DB Column | Scored? | Type | Inverted? | Follow-up column |
|---|---|---|---|---|---|---|
| Q1 | Full name | *(client lookup only)* | No | Short text | — | — |
| Q2 | Biggest win | `biggest_win` | No | Short text | — | — |
| Q3 | Training | `training_rating` | Yes | Scale 1-10 | No | `training_issue` |
| Q5 | Steps | `step_rating` | Yes | Scale 1-10 | No | `step_issue` |
| Q7 | Nutrition | `nutrition_rating` | Yes | Scale 1-10 | No | `nutrition_issue` + `nutrition_info_vs_execution` |
| Q10 | Days on plan | `days_on_plan` | Yes | Choice (4 options) | No | — |
| Q11 | Sleep | `sleep_rating` | Yes | Scale 1-10 | No | `sleep_issue` |
| Q13 | Digestion | `digestion_rating` | Yes | Scale 1-10 | No | `digestion_issue` |
| Q15 | Stress | `stress_rating` | Yes | Scale 1-10 | **YES** | `stress_source` |
| Q17 | Progress direction | `progress_direction` | Yes | Choice (3 options) | No | — |
| Q18 | Overall performance | `overall_performance` | Yes | Scale 1-10 | No | — |
| Q19 | Direction confidence | `direction_confidence` | No | Scale 1-10 | — | — |
| Q20 | Help request | `help_request` | No | Multi-select | — | — |
| Q21 | Hindsight | `advice_to_past_self` | No | Short text | — | — |
| Q22 | Upcoming notes | `upcoming_notes` | No | Short text | — | — |

*Question numbers skip (Q4, Q6, Q8, Q9, Q12, Q14, Q16) because those are the conditional follow-up questions that only appear based on scores.*
