# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner, plus a small group of friends they have shared it with. Each person plans their own day and week; nobody collaborates on shared tasks. The owner also reviews everyone's tasks read-only through the `/admin` portal.

## Product Purpose

Actionstodo (README name: "Todo - Do") is a daily task manager. It exists to make planning fast and to make the act of planning enjoyable, with equal weight on both. Success means capturing and scheduling a task takes seconds, and coming back to the plan each day feels calm and rewarding rather than like a chore.

## Positioning

Tasks live in a drawn valley called the Lantern Path: each day is a trail, each timed task is a lantern on it, and completing a task lights its lantern. The planning tools are serious (natural-language entry, time ranges, recurrence), and the world around them is the reward.

## Operating Context

- Daily use on desktop and phone, signed in with Google so tasks sync across devices in real time.
- Works offline through `localStorage`; optional `.json` disk sync and JSON import/export for backups.
- Quick add parses natural language ("Call Alex at 5pm", "Gym every day at 6pm").
- Keyboard-driven navigation on desktop: `Q` / `E` walk the path, `A` shows all days and folds back to today.

## Capabilities and Constraints

- One tab: today's log opens first; its "Show all days" row slides out into every day as a board of day cards (today, then the days ahead, then the past), and "Back to today" folds it back. Tasks drag between day cards.
- Desktop: the day slate floats over the valley with the task you are on (live countdown, Mark done, Details), the schedule with a NOW line, Anytime and "Left on the trail" (Move all to today). The big waypost burns for the task you are on and its plaque reads the time left; the trail along the bottom walks the day. Details open in a drawer for editing title, date, time and repeat rule.
- Profile key: the mascot in the top-right corner opens games, sound, time of day, motion and account.
- Phone app: phones skip the 3D valley for the Lantern Path. The focus lantern shows the task you are on with a live countdown (or the next one and when it starts), Mark done and Details. The day's timed tasks are lanterns on a sideways trail (time is distance) that you light to finish; the traveller marks now. Below: the week as cairns (tap a day to open it), "Left on the trail" for open tasks from past days (Move all to today, with Undo) and Anytime "in your pack". The add-task bar is at the bottom; All days slides in with Open / Done / Everything filters and folds past weeks.
- Recurring tasks create a rolling series of real daily tasks; each day completes independently.
- Game mode: a separate quest arena (lazy-loaded).
- Synthesised UI sounds and an optional ambient soundtrack, each with its own switch and volume.
- Night and Day: the valley's time of day follows the theme (the horizon dial switches it).
- **Must stay smooth on low-end PCs.** Animations are off by default; the system reduced-motion setting always wins; the Lantern Path is SVG and CSS, with 3D only in Game mode. Future work must not make heavy motion or 3D cost the default.
- **Must work on phones.** Every surface needs a working phone layout.
- Stack (existing): React 19, TypeScript, Vite, Three.js / React Three Fiber, Rapier, GSAP, Lenis, Firebase Auth and Firestore. Hosted on Firebase Hosting, with a Netlify config as an alternative.

## Evidence on Hand

No testimonials, user counts, press or case studies exist. Do not invent any.

## Product Principles

1. Planning speed comes first in every interaction; the world never slows down capturing or editing a task.
2. Delight is earned by progress: the valley responds to tasks being planned and completed.
3. The default experience runs smoothly on a low-end machine; richer motion is opt-in.
4. Phone and desktop are both first-class.
5. A personal tool for a small circle: no team, sharing or growth features unless asked.
