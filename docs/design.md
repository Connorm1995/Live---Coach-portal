# design.md — Coach Portal (Connor Meyler)

Last updated: March 2026
Status: Source of truth for all visual decisions. Nothing gets styled that isn't in this file.

---

## Design Principles

1. **Readable at distance.** This dashboard is watched on Loom by clients. Every piece of data a client needs to see must be large enough to read comfortably on a screen recording. Small text is only acceptable for coach-only meta information.
2. **Premium, not generic.** The portal must not look like a default Claude Code or template dashboard. No common AI-aesthetic fonts, no purple gradients, no cookie-cutter component patterns.
3. **One thing at a time.** One client on screen at a time. No visual noise. White space is used generously and intentionally.
4. **Colour carries meaning.** Green, amber, and red are reserved exclusively for status indicators. Teal is the brand accent. Nothing else uses these colours decoratively.
5. **Coach-facing vs client-facing.** Some elements are for Connor only (Check-in Hub trigger, coaching notes, score hover graphs). These are visually distinguished — smaller, more subtle — without being hidden. Everything the client sees is large and clean.

---

## Colour Palette

| Name | Hex | Usage |
|---|---|---|
| Black | `#000000` | Primary text, headings |
| Slate | `#555e62` | Secondary text, labels, metadata |
| Teal Deep | `#23b8b8` | Primary brand accent, active tab indicator, buttons |
| Teal Bright | `#12dacb` | Hover states, highlights, trend lines, score accents |
| White | `#ffffff` | Page background, card backgrounds |
| Off White | `#f5f6f7` | Subtle section backgrounds, alternating rows |
| Border Grey | `#e2e5e8` | Card borders, dividers, subtle separators |

### Status Colours (reserved — do not use decoratively)

| Status | Hex | Usage |
|---|---|---|
| Green | `#22c55e` | Responded / on track / completed |
| Amber | `#f59e0b` | Needs attention / partial |
| Red | `#ef4444` | Not responded / poor / missed |

### CSS Variable Names

```css
--color-black: #000000;
--color-slate: #555e62;
--color-teal: #23b8b8;
--color-teal-bright: #12dacb;
--color-white: #ffffff;
--color-off-white: #f5f6f7;
--color-border: #e2e5e8;
--color-green: #22c55e;
--color-amber: #f59e0b;
--color-red: #ef4444;
```

---

## Typography

### Font Families

**Display / Headings: [Syne](https://fonts.google.com/specimen/Syne)**
- A geometric, modern display font with real character. Feels premium and purposeful without being aggressive.
- Used for: client name, section headings, tab labels, score numbers, large data points
- Import: `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap')`

**Body / UI: [DM Sans](https://fonts.google.com/specimen/DM+Sans)**
- Clean, highly legible, slightly rounded — professional without being cold. Exceptional at mid and large sizes.
- Used for: all body text, labels, form inputs, messages, descriptions
- Import: `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap')`

### Type Scale

| Role | Font | Size | Weight | Colour |
|---|---|---|---|---|
| Client name (header) | Syne | 28px | 700 | Black |
| Section heading | Syne | 20px | 600 | Black |
| Tab label | DM Sans | 15px | 500 | Slate (inactive) / Black (active) |
| Card heading | Syne | 16px | 600 | Black |
| Body text | DM Sans | 15px | 400 | Black |
| Data value (large) | Syne | 24px | 700 | Black |
| Data label | DM Sans | 13px | 400 | Slate |
| Score badge (total) | Syne | 22px | 800 | White on Teal Deep |
| Score block value | Syne | 20px | 700 | Contextual (status colour) |
| Meta / coach-only text | DM Sans | 12px | 400 | Slate |
| Button text | DM Sans | 14px | 500 | White |

### Typography Rules

- **Never go below 12px** for anything a client might read
- **Data values always larger than their labels** — the number is what matters, the label explains it
- **Line height:** 1.5 for body text, 1.2 for headings and large data values
- **Letter spacing:** -0.02em on Syne headings 20px and above for a tighter, more premium feel

---

## Layout & Spacing

### Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Top Nav Bar (fixed, 56px tall)                         │
│  Logo left — Tab 1: Client View | Tab 2: Coach's Corner │
├─────────────────────────────────────────────────────────┤
│  Client Header (72px tall, white, subtle bottom border) │
│  [Check-in Hub trigger] [Client name + meta]  [Loom btn]│
├─────────────────────────────────────────────────────────┤
│  Client Tab Bar (48px, secondary nav)                   │
│  Overview | Training | Nutrition | Calendar | Recovery  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Tab Content Area (scrollable)                          │
│  Max width: 1280px, centred, padding: 0 40px            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Spacing System (8px base grid)

```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  24px
--space-6:  32px
--space-7:  40px
--space-8:  48px
--space-9:  64px
--space-10: 80px
```

### Card / Section Containers

```css
.card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
}

.card-tight {
  padding: 16px;
}
```

- Cards have a **1px border**, not a shadow. Shadows feel heavy and dated.
- **Exception:** The Loom button and the Check-in Hub overlay use a subtle box-shadow for lift.
- Section cards are separated by **24px gaps** in a CSS grid layout.
- No card should be edge-to-edge — always 40px side padding on the content area.

---

## Components

### Top Navigation Bar

- Height: 56px
- Background: `#000000`
- Logo: `logo-plus-name.png` — white version — left aligned, 32px tall, left padding 24px
- Top-level tabs: "Client View" and "Coach's Corner" — right of logo, DM Sans 14px medium, white text
- Active tab: underlined with 2px Teal Deep, white text
- Inactive tab: Slate `#555e62`
- No other elements in the nav bar

### Client Header

- Height: 72px
- Background: White
- Bottom border: 1px solid `--color-border`
- **Left cluster:**
  - Check-in Hub trigger — a small, discreet icon button (inbox or checklist icon), 20px, Slate coloured. Sits left of the client name. No label. Tooltip on hover: "Check-in Hub".
  - Client name: Syne 28px bold, Black
  - Below name in a single row: Last check-in date · Tenure · Phase badge · Session count — all DM Sans 13px, Slate, separated by a mid-dot (·)
- **Right cluster:**
  - Loom button: Teal Deep background, white text, DM Sans 14px medium, "Send Loom Feedback", 10px border radius, 12px 20px padding. On hover: Teal Bright background.

### Phase Badge

Small pill badge next to client metadata. Colour coded:

| Phase | Background | Text |
|---|---|---|
| Fat Loss | `#fef3c7` | `#92400e` |
| Gaining | `#dcfce7` | `#14532d` |
| Maintenance | `#eff6ff` | `#1e40af` |
| Lifestyle | `#f3e8ff` | `#581c87` |

DM Sans 12px medium. 4px 10px padding. 20px border radius.

### Client Tab Bar

- Height: 48px
- Background: White
- Bottom border: 1px solid `--color-border`
- Tabs: DM Sans 15px medium
- Active: Black text, 2px Teal Deep underline, full tab height
- Inactive: Slate text, no underline
- Hover: Black text, no underline
- Tabs: Overview / Training / Nutrition / Calendar / Recovery
- Recovery tab: Slate text, slightly muted, no active state possible yet (placeholder)

### Score Blocks (Overview)

Seven blocks displayed in a horizontal row. Each block:

```
┌─────────────────┐
│   LABEL         │  ← DM Sans 12px, Slate, uppercase, letter-spacing 0.06em
│   ██            │  ← Status colour indicator bar (4px, full width, top)
│   42            │  ← Syne 32px bold, status colour
│   / 45          │  ← DM Sans 13px, Slate
└─────────────────┘
```

- Border: 1px solid `--color-border`
- Border radius: 10px
- Padding: 16px
- Colour indicator: a 4px bar at the top of each card, full width, in the status colour (green/amber/red)
- On hover: a tooltip card appears (see Hover Trend Graph below)

**Total Score Badge:**
- Separate element, top-right of the score row
- Pill shape: Teal Deep background
- Text: Syne 22px 800 weight, white, e.g. "35 / 45"
- Label below: DM Sans 12px, Slate, "Weekly Score"
- Same hover behaviour as score blocks

### Hover Trend Graph (Score Blocks)

Triggered on hover of any score block or the total score badge.

- Appears as a floating card above the hovered element
- Width: 260px, padding 16px
- Title: metric name, DM Sans 13px medium, Black
- Graph: 8-week sparkline trend line using Teal Bright as the line colour
- X-axis: week labels (abbreviated, e.g. "W1", "W2"), DM Sans 11px, Slate
- Y-axis: score range for that metric
- No background grid lines — clean white background only
- Subtle drop shadow: `0 4px 20px rgba(0,0,0,0.10)`
- Appears with a 120ms ease-in fade, no delay
- Disappears 200ms after mouse leaves

### Check-in Hub Overlay

- Triggered by the discreet icon in the client header (left of client name)
- Opens as a panel sliding in from the left, or as a floating card anchored to the trigger icon
- Width: 360px
- Background: White
- Border: 1px solid `--color-border`
- Box shadow: `0 8px 32px rgba(0,0,0,0.12)`
- Border radius: 14px
- Close: click outside or press Escape

**Inside the panel:**

Header row: "Check-in Hub" in Syne 16px 600, Black. Close icon right-aligned.

Filter toggle row: "All · Check-ins · Reports" — DM Sans 13px, pill toggle, active pill is Teal Deep background white text.

Sub-tabs: "Pending" and "Done" — DM Sans 14px medium, underline indicator in Teal Deep.

Client rows:

```
● Brendan Smart          My Fit Coach  🔴
● Sarah Murphy           MFC Core      🟢
```

- Client name: DM Sans 14px medium, Black
- Program label: DM Sans 12px, Slate
- Status dot: 10px circle, Red or Green
- Row hover: Off White background
- Row padding: 12px 16px
- Separator: 1px `--color-border` between rows

### Loom DM Template

A modal that opens when Connor clicks the Loom button. Not a page navigation.

- Modal width: 480px
- Pre-filled message text (editable):
  > "Hey [Client First Name], thanks for checking in. Click the link below to see your end of week feedback."
- A text input below for Connor to paste the Loom URL
- Send button: Teal Deep, full width, DM Sans 14px medium, "Send via Trainerize"
- Cancel: text link, Slate, below the button
- Sending this message triggers the check-in status to green in the Hub

### Graphs and Charts

All charts use a consistent style:

- **Library:** Recharts (already in the React ecosystem)
- **Line colour:** Teal Bright `#12dacb`
- **Reference / target lines:** Slate `#555e62`, dashed
- **Phase band overlays (weight graph):** Teal Deep at 12% opacity, no border
- **Axis labels:** DM Sans 11px, Slate
- **Grid lines:** 1px `#e2e5e8`, horizontal only, no vertical grid lines
- **No chart borders** — charts sit inside cards, the card border is sufficient
- **Tooltips:** White background, 1px border, 8px border radius, DM Sans 13px, soft shadow
- **Bar charts (steps, sleep):** Teal Deep fill, 4px border radius on top corners
- Status-coloured bars (when green/amber/red applies): use status colours, not teal

### Status Colour Indicators (Training Block Grid)

Session cells in the training block progress grid:

| State | Background | Text |
|---|---|---|
| Baseline (Session 1) | `#ffffff` | Black, border `--color-border` |
| Improved (Green) | `#f0fdf4` | `#15803d` |
| Same (Amber) | `#fffbeb` | `#b45309` |
| Declined (Red) | `#fef2f2` | `#b91c1c` |

Cell: 10px border radius, DM Sans 13px, padding 8px 12px.

### Nutrition Goals vs Actuals Table

Not a traditional table — designed as a clean card grid:

Five rows (Calories, Protein, Fats, Carbs, Fibre). Each row:

```
Calories        Goal: 2,400       Actual: 2,187      -213   🟢
```

- Metric name: DM Sans 15px medium, Black
- Goal value: DM Sans 15px, Slate
- Actual value: DM Sans 15px 500, Black
- Delta: DM Sans 14px, coloured Red if over/under by a meaningful margin, Green if on target
- Row background alternates: White / Off White
- Padding per row: 14px 20px
- Dividers: 1px `--color-border`

### Daily Nutrition Breakdown

Day rows, expandable on click:

- Day label: DM Sans 14px medium, Black (e.g. "Monday 10 Mar")
- Tracking status pill: "Tracked" (Green) / "Partial" (Amber) / "Not tracked" (Red) — DM Sans 12px
- Macros shown in collapsed row as small pills when tracked
- Expanded state: full macro breakdown in a clean grid
- Excluded days show a muted row with a note: "Excluded from average — insufficient tracking"

### Calendar View

- Month grid, 7 columns (Mon–Sun)
- Day cells: white background, 1px `--color-border`, 8px border radius
- Completed sessions: Teal Deep filled dot + session name, DM Sans 12px
- Scheduled but not completed: Slate outlined circle + session name, DM Sans 12px, italic
- Body stat logged: small Slate dot, no label (keeps cells clean)
- No sidebar. No stats panel. No legend. Navigation: left/right chevrons + month/year label in Syne 16px 600, Black.

### Direct Message Interface (Coach's Corner)

- Two-panel layout: client list left (280px), conversation right
- Client list: DM Sans 14px, client name + last message preview + timestamp
- Active client: Off White background, Teal Deep left border (3px)
- Message bubbles:
  - Connor's messages: Teal Deep background, white text, right-aligned, 10px border radius
  - Client messages: Off White background, Black text, left-aligned, 10px border radius
- Scheduled messages: shown with a clock icon and Amber border, DM Sans 13px italic "Scheduled for [date/time]"
- Timestamp: DM Sans 11px, Slate, below each bubble

### Scheduled Posts (Coach's Corner)

- Card list layout, one card per scheduled post
- Card: White, 1px border, 12px border radius, 20px padding
- Post content preview: DM Sans 14px, Black, 2 lines max then truncated
- Scheduled date/time: DM Sans 13px, Slate, with clock icon
- Status pill: "Scheduled" (Amber) / "Sent" (Green)
- Edit and Delete actions: icon buttons, Slate, right-aligned in card footer

---

## Logo Usage

- **Top nav bar:** `logo-plus-name.png` — white version, 32px tall, left-aligned
- **Check-in Hub overlay header:** `logo.png` — not used here, keep it clean
- **Loading / empty states:** `logo.png` can be used as a subtle centred mark

---

## Interaction & Motion

- **Page transitions:** None. Tab switches are instant — no animation between tabs.
- **Hover states:** 150ms ease transition on background-color and color changes
- **Score block hover graph:** 120ms ease-in fade-in, no transform
- **Check-in Hub panel:** slides in from left, 200ms ease-out. Overlay backdrop: `rgba(0,0,0,0.15)` fade 150ms.
- **Loom modal:** fade in + subtle scale from 0.97 to 1.0, 180ms ease-out
- **Expandable rows (nutrition):** height transition, 180ms ease
- **Button press:** subtle scale 0.97 on active, 80ms

---

## Responsive / Viewport

- **Target:** Mac full-screen browser only (typically 1440px–1920px width)
- **Minimum supported width:** 1280px
- **Do not build mobile or tablet layouts** — this is a desktop-only tool
- All components are designed for a full-width browser experience

---

## Accessibility Minimums

Even though this is a private tool, maintain these standards:

- All text meets WCAG AA contrast ratio (4.5:1 for body, 3:1 for large text)
- Focus states visible on all interactive elements: 2px Teal Deep outline
- All icon-only buttons have a `title` and `aria-label`
- Status colours are never the only indicator — always paired with a label or icon

---

## What Not To Do

- No shadows on cards (use borders instead)
- No purple, blue, or orange anywhere — not in the brand palette
- No Inter, Roboto, Arial, or system-ui as fonts
- No gradient backgrounds or mesh gradients
- No sidebar navigation — all navigation is top-bar tabs
- No data tables with tiny text — if it's client-facing, it must be readable at 1440px on a Loom recording
- No placeholder grey boxes or skeleton screens on initial load — use a simple spinner
- No toast notifications stacked in the corner for every action — only use them for errors and successful sends
