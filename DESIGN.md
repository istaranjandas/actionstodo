---
name: Actionstodo
description: A lantern-path task manager; frosted glass consoles floating over a 3D valley.
colors:
  lantern-amber: "#d97706"
  lantern-amber-deep: "#b45309"
  lantern-amber-text: "#a84c07"
  lantern-amber-wash: "#f9ebd5"
  lantern-amber-tint: "#fcf6ec"
  lantern-amber-dusk: "#f59e0b"
  lantern-amber-text-dusk: "#fbbf24"
  lantern-core-dusk: "#fde68a"
  amber-ink: "#1c1917"
  trail-jade: "#208368"
  trail-jade-hi: "#29a383"
  trail-jade-wash: "#e6f7ed"
  trail-jade-text: "#1b7660"
  trail-jade-dusk: "#46c7ab"
  ember-red: "#d13415"
  ember-red-wash: "#feebe7"
  ember-red-dusk: "#ec7b63"
  slate-ink: "#0f172a"
  slate-ink-2: "#334155"
  slate-ink-3: "#5b6b80"
  slate-ink-faint: "#7b8ba1"
  paper-panel: "#ffffff"
  paper-plate: "#f8fafc"
  slate-well: "#f1f5f9"
  slate-well-deep: "#e2e8f0"
  dusk-ink: "#f1f5f9"
  dusk-ink-2: "#94a3b8"
  obsidian-panel: "#0c111b"
  obsidian-plate: "#0e1420"
  obsidian-raised: "#141b29"
  obsidian-well: "#070b13"
  daylight-sky: "#a7bdc8"
  dusk-sky: "#03060a"
typography:
  headline:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.05em"
  title:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 450
  body:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
    fontFeature: "\"ss01\", \"cv11\""
  label:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    letterSpacing: "0.08em"
  micro-label:
    fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.12em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 600
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  card: "14px"
  input: "10px"
  pill: "999px"
spacing:
  2xs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  2xl: "14px"
  3xl: "16px"
components:
  button-primary:
    backgroundColor: "{colors.lantern-amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.md}"
    padding: "0 10px 0 16px"
    height: "36px"
    typography: "{typography.label}"
  button-key:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink-2}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
    typography: "{typography.label}"
  button-key-hover:
    backgroundColor: "{colors.lantern-amber-tint}"
    textColor: "{colors.slate-ink}"
  button-key-latched:
    backgroundColor: "{colors.slate-well}"
    textColor: "{colors.lantern-amber-text}"
  input-quick-add:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    height: "36px"
    typography: "{typography.title}"
  nav-lens-tab:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink-3}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
    typography: "{typography.label}"
  nav-lens-tab-active:
    textColor: "{colors.slate-ink}"
  card-day-group:
    backgroundColor: "{colors.paper-plate}"
    rounded: "{rounded.lg}"
    padding: "12px 16px 8px"
  task-row:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.md}"
    padding: "5px 8px"
  checkbox-done:
    backgroundColor: "{colors.trail-jade}"
    rounded: "{rounded.xs}"
    size: "18px"
---

# Design System: Actionstodo

## Overview

**Creative North Star: "The Lantern Console"**

Actionstodo is a calm glass control panel floating over a living valley. The world outside (sky, ridges, wayposts, lanterns) carries the mood; the console carries the work. Panels are frosted glass in one material, shared by the day slate, the path ribbon, the task cards and every popover. Amber is the only voice on screen that means "active", "focused" or "yours": a lit lantern, a selected task, the primary key. Everything else stays in cool slate.

The same console exists at two hours. **Daylight** is paper-white glass with slate ink under a pale haze sky. **Dusk** is obsidian-indigo glass with cool slate-50 ink under a starry sky. Both hours share geometry, type and behaviour; only the tokens change. Density is compact and keyboard-first: 14px body, tight rows, uppercase legends for navigation and headers.

Controls are tactile and confident. Keys respond to touch: the frame lights amber on hover, and the key presses down (scale 0.97) when pressed. Floating panels are layered and lifted above the valley so the world reads as a backdrop, never as a surface you type on. The interface must never look like a generic SaaS dashboard.

**Key Characteristics:**
- One glass material for every panel, in two hours (Daylight / Dusk).
- Amber is reserved for active, focused and primary; slate for everything else.
- Trail Jade means done or success; Ember Red means danger. Nothing else uses them.
- Uppercase, letter-spaced sans for navigation, headers and legends; quiet sentence-case body.
- Tactile keys with amber hover frames and a press-down response.
- Motion is opt-in (off by default) and reduced-motion always wins.

## Colors

A cool slate neutral ramp lit by a single warm lantern colour, with jade and ember kept strictly for meaning.

### Primary
- **Lantern Amber** (`lantern-amber`; Dusk: `lantern-amber-dusk`): fills of the primary key, the active lens count, the selected-task rail (3px inset left edge) and the lit lantern in the world. In Dusk it brightens rather than darkens.
- **Deep Lantern Amber** (`lantern-amber-deep`): the frame around solid amber surfaces and the Daylight focus ring.
- **Lantern Amber Text** (`lantern-amber-text`; Dusk: `lantern-amber-text-dusk`): amber used as text or icon colour (active lens icon, latched toggle legend), tuned for contrast against glass.
- **Lantern Wash / Tint** (`lantern-amber-wash`, `lantern-amber-tint`): backgrounds of hovered keys, the selected task row and the "Next up" card. Dusk uses translucent amber (12% / 5%) in their place.
- **Lantern Core** (`lantern-core-dusk`): the hot centre of a lit element at dusk, so a lit thing reads as lit.

### Secondary
- **Trail Jade** (`trail-jade`, `trail-jade-hi`; Dusk: `trail-jade-dusk`): completion and success only. The checked checkbox, every progress gauge and day meter, the done tally on wayposts, done states and success toasts.
- **Trail Jade Text** (`trail-jade-text`; Dusk uses `trail-jade-dusk`): jade as text, such as the "done" count, held at 5:1.
- **Trail Jade Wash** (`trail-jade-wash`): the soft ring around a checked checkbox.

### Tertiary
- **Ember Red** (`ember-red`; Dusk: `ember-red-dusk`): danger only. Delete actions, danger toasts, clearing a repeat rule.
- **Ember Red Wash** (`ember-red-wash`): background behind danger states.

### Neutral
- **Slate Ink** (`slate-ink`, `slate-ink-2`, `slate-ink-3`): Daylight text: primary, secondary and tertiary (inactive lens tabs, placeholders, captions). Tertiary is held at 4.5:1 or better on every panel, well and wash; its Dusk value is `#7c8aa0`.
- **Slate Faint** (`slate-ink-faint`; Dusk `#5b6b80`): non-text marks only, such as drag handles, inactive calendar days and ticks. Never body copy or placeholders.
- **Dusk Ink** (`dusk-ink`, `dusk-ink-2`): Dusk primary and secondary text; cool greys so text never looks sepia.
- **Paper Panel / Plate** (`paper-panel`, `paper-plate`): Daylight panel and card surfaces.
- **Slate Well** (`slate-well`, `slate-well-deep`): Daylight recessed fields, latched keys and tracks.
- **Obsidian Panel / Plate / Raised / Well** (`obsidian-*`): the Dusk equivalents, cool indigo-black.
- **Sky** (`daylight-sky`, `dusk-sky`): the page background behind the 3D world and the painted fallback.
- Lines, hovers, scrims and casts are translucent slate (Daylight `rgba(15, 23, 42, …)`) or translucent cool grey (Dusk `rgba(148, 163, 184, …)`), never pure black or grey.

### Named Rules
**The One Lantern Rule.** Amber marks what is active, focused, selected or primary. If an element is none of those, it is not amber.

**The Meaning-Only Rule.** Trail Jade means done or success and Ember Red means danger. Never use either for decoration, branding or emphasis.

**The Readable Ink Rule.** Any text, placeholders included, meets 4.5:1 in both hours. Faint ink is for marks, not words.

**The No-Olive Rule.** Never darken amber with black. Dusk shadows go blue-violet, and surfaces stay cool obsidian, so amber always has a cool ground to glow against.

## Typography

**Display Font:** Geist (with Inter, system sans fallback)
**Body Font:** Geist (same family)
**Label/Mono Font:** Geist Mono, for counters, tabular numbers, keycaps and the Game mode HUD only

**Character:** One sans family carries the whole console. Hierarchy comes from case, tracking and weight, not from a second typeface: uppercase, letter-spaced legends for structure and quiet sentence-case for content.

### Hierarchy
- **Headline** (700, 17px, uppercase, 0.05em tracking): day group names ("TODAY", weekday headers).
- **Title** (450, 15px): the quick-add input and the primary key's size. The line you type into.
- **Body** (400, 14px, 1.5 line-height, -0.005em, `ss01` + `cv11`): default text. Task titles sit slightly larger at 14.5px / 1.45.
- **Label** (600, 13.5px, uppercase, 0.05–0.08em tracking): lens tabs, toolbar keys, the primary key (700, 0.06em).
- **Micro-label** (600, 11–13px, uppercase, 0.12em tracking): popover titles, settings section legends, grid and matrix headers.
- **Mono** (600, 11–11.5px, tabular): counts in badges and day groups, keycap hints. Dates and picker values are words, so they use the sans with tabular figures.

Nothing is set below 10.5px; anything a person must read is 11px or larger.

### Named Rules
**The One Voice Rule.** The interface speaks in one sans. Mono appears only for numbers, keycaps and the Game mode HUD.

**The Stencilled Legend Rule.** Navigation, headers and section legends are uppercase with tracking; content (task titles, notes, inputs) is never uppercase.

## Layout

The 3D valley fills the viewport. The console floats over it as fixed HUD pieces, inset from the edges by `--hud-inset` (36px on desktop, 24px on narrower screens, 14px on phones): there is no dock: the day slate opens at the top-left at 456px wide (420px narrower), and the mascot profile key sits alone in the top-right corner. On phones the slate goes full-width with square corners. Phone task rows let a long title wrap to two lines; delete lives in the details sheet, not on the row.

In the All board the valley stays visible as the backdrop: a light scrim holds only the header band darker, the cards carry their own glass blur, and waypost signs are hidden so nothing drifts between cards.

Breakpoints are a fixed scale; never introduce a one-off width:
- **≤680px:** phone.
- **≤1024px:** non-desktop (narrow window or coarse pointer).
- **≥1025px:** desktop (scroll pane).
Hover styling is gated behind `(hover: hover)` so touch devices never get stuck hover states.

Spacing is a compact 2px-step rhythm (2, 4, 6, 8, 10, 12, 14, 16px). Gaps of 8–12px between controls, 10px between task rows' parts, 12–16px inside cards. Rows are tight; the valley provides the breathing room.

## Elevation & Depth

Depth is layered and lifted. Three layers stack in order: the world (sky, ridges, wayposts), the floating console panels above it, and popovers/sheets above the panels. Each layer lifts clearly off the one beneath with a soft, wide drop shadow and a crisp 1px frame, so the world always reads as backdrop. Glass panels use a backdrop blur (16px, saturate 180% Daylight; 18px, saturate 150% Dusk). Inside a panel, depth is tonal: wells are recessed (darker fill, inset 1px line), keys sit at panel level, and latched keys sit pressed in.

The current implementation leans flat (1px edges with restrained shadows). New work should push towards the layered-and-lifted intent without losing the crisp 1px frame.

### Shadow Vocabulary
- **Panel** (`inset 0 0 0 1px var(--line), 0 18px 40px -26px var(--cast)`): day groups, the quick-add box.
- **Float** (`inset 0 0 0 1px var(--line-strong), 0 24px 60px -24px var(--cast)`): popovers and anything above a panel.
- **Glass** (`--hud-glass-shadow`): the dock and frosted HUD pieces.
- **Key hover** (`inset 0 0 0 1px var(--amber-line)`): the amber frame on a hovered key.
- **Key pressed** (`inset 0 0 0 1px var(--amber-line), inset 0 0 12px -4px var(--amber-glow)`): latched and pressed keys.
- **Amber** (`0 0 0 1px var(--amber-deep), 0 0 18px -6px var(--amber-glow)`): solid amber surfaces; a faint glow, like a lit lantern.

### Named Rules
**The Single Skylight Rule.** One light source, soft skylight from above, drives every highlight and shadow. Shadows fall downward, highlights sit on top edges.

**The Lifted Panel Rule.** Anything that floats over the world gets a frame and a cast shadow. Nothing sits directly on the valley without lift.

**The Solid Sheet Rule.** A sheet that covers content (the phone details sheet) is solid panel colour, never glass, so the rows behind it never read through its fields.

## Shapes

Soft geometry: rounded glass, never a bevelled key or a sharp terminal frame. Radii step from 6px (checkboxes, small chips) through 8px (lens tabs, labels), 10px (keys, inputs, task rows), 12px (day groups, the quick-add box) to 16px (large sheets); the task card uses 14px. Badges, counts and the lens bar itself are full pills. Floating popovers carry a 2px Lantern Amber left edge as their signature. Phone-docked panels drop to square corners where they meet the screen edge.

## Components

### Buttons
Tactile and confident: quiet at rest, lit when touched, pressed when used.
- **Shape:** gently rounded (10px radius), 34–36px tall.
- **Primary:** solid Lantern Amber with a Deep Lantern Amber frame and a faint amber glow; dark amber-ink text in uppercase label type (700, 0.06em). The only saturated surface on screen.
- **Hover / Focus:** primary brightens (brightness 1.1) and its glow widens; keys gain an amber frame and amber tint while text darkens to full ink. Focus is always a 2px amber ring offset 2px.
- **Press:** every key scales to 0.97 in 40–70ms; the primary also dims slightly (brightness 0.94).
- **Key (secondary):** transparent fill, 1px strong slate line, secondary ink.
- **Latched toggle:** sits in a well with an amber legend and the pressed shadow, 1px lower.
- **Disabled:** 45% opacity, desaturated, no shadow, no movement.

### Chips
- **Style:** duration pills, date chips and grid-slot keys share the key styling (1px line, transparent fill).
- **State:** the selected chip becomes a solid Lantern Amber key, exactly like the primary.

### Cards / Containers
- **Corner Style:** 12px (day groups), 14px (task card).
- **Background:** glass over a top sheen gradient into the plate colour.
- **Shadow Strategy:** Panel shadow (see Elevation & Depth).
- **Border:** 1px `--line`.
- **Internal Padding:** 12px 16px 8px.

### Inputs / Fields
- **Style:** the quick-add box is a glass panel holding a borderless 36px input (15px, weight 450) with an icon and the primary key. Other fields are wells: well fill, 1px inset line, 10px radius.
- **Focus:** the box frame turns amber with a 3px amber-wash halo; the leading icon turns amber.
- **Commit:** a brief warm sweep across the bar (520ms) confirms a task was logged.

### Navigation
- **One tab:** no lens tabs. The day slate closes with a full-width footer row, "Show all days", with a count pill of open tasks on other days and an amber chevron; it opens the grid. In the grid the way back is one floating glass pill, "Back to today". `A` toggles; `Esc` goes back.
- **Profile key:** the mascot, a 46px amber disc (44px on phones), alone in the top-right corner. It opens the profile panel: who is signed in, the games, then the settings.

### Task Row (signature)
- 10px radius, 5px 8px padding, bleeding 8px into the card edge. Hover reveals the drag handle.
- **Selected:** amber wash fading right, raised fill, and a 3px Lantern Amber rail on the left.
- **Checkbox:** an 18px key, 6px radius, recessed well. Checked, it fills with a Trail Jade gradient, a white check and a 3px jade-wash ring.

### Next Up Card (signature)
- A raised card with an amber frame, amber wash and the 3px amber rail. It lifts 1px on hover. It names the next task and its time.

### Waypost Label (signature)
- World labels pinned to each day's post: 8px radius, 1px strong line, glass fill. The focused day turns amber-tinted with amber text.

## Do's and Don'ts

### Do:
- **Do** take every colour, radius, shadow and duration from `src/styles/tokens.css`; add a token before adding a value.
- **Do** design every change in both Daylight and Dusk.
- **Do** keep amber for active, focused, selected and primary states only (The One Lantern Rule).
- **Do** use the shared motion tokens: `--dur-press` (70ms), `--dur-quick` (160ms), `--dur-panel` (240ms) with `--ease-out`, `--ease-spring` or `--ease-press`.
- **Do** keep motion off by default and respect reduced motion; the app must stay smooth on low-end PCs.
- **Do** use the 680 / 1024 / 1025px breakpoints and gate hover styles behind `(hover: hover)`.
- **Do** give every floating panel a 1px frame and a cast shadow (The Lifted Panel Rule).

### Don't:
- **Don't** drift into a generic SaaS dashboard: plain white cards on grey, blue primary buttons, purple gradients.
- **Don't** darken amber with black or warm the neutrals towards sepia (The No-Olive Rule).
- **Don't** use Trail Jade or Ember Red outside done/success and danger states.
- **Don't** add a second typeface or use mono outside numbers, keycaps and the Game mode HUD.
- **Don't** uppercase content such as task titles or notes.
- **Don't** add one-off breakpoints or hard-coded colours outside the token file.
- **Don't** make a destructive action one tap without an Undo.
