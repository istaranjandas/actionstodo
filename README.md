# ✦ Actionstodo

A focused, full-screen task workspace and week planner with real-time Firebase Cloud Sync and offline support.

## 🚀 Features

- ⚡ **1-Click Smart Time Range Picker**: Fast preset grid (Morning / Afternoon / Evening), custom duration pills (15m, 30m, 1h, 1.5h), and micro-nudge buttons (`-30m` / `+30m`).
- ✍️ **Natural Language Parsing**: Type `"Call Alex at 5pm"` or `"Design sprint 2pm to 3:30pm"` to automatically parse and slot time.
- 🔁 **Recurring Tasks**: Add `"Gym every day at 6pm"`, `"Standup weekdays 9am"`, or `"Rent monthly"` and the app builds a rolling series of real daily tasks. Each day is completed independently, title/time edits flow to future open days, and the details panel can change the rule or add an end date.
- 🖥️ **Premium dashboard**: A full-screen workspace with a compact day header, previous/next date controls, a jump-to-date calendar, total/completed/remaining telemetry and a live amber progress bar.
- 🗒️ **Focus-first task log**: Pending tasks lead, completed work folds into a collapsible drawer. Every row keeps the full title (wrapping instead of truncating), its scheduled time range, and quick edit/delete actions.
- ⌨️ **Always-ready quick add**: One compact command bar with a clearly visible Add button, natural-language time parsing, date/time chips and recurring-task support.
- 🧭 **Compact bottom navigation**: Today, Upcoming, Week, All, Done and Planner sit in a modern dock that keeps the whole canvas usable on desktop and mobile.
- 📊 **Planner**: The week matrix opens as a full-screen time-slot board with add, edit, complete, delete, re-time and drag-and-drop between days and hours.
- 🔊 **Sound & music**: Synthesised interface sounds and an optional ambient soundtrack, each with its own switch and volume in the System menu.
- ☁️ **Real-Time Firebase Cloud Sync**: Google Sign-In with instant Firestore multi-device synchronization.
- 💾 **Offline First & Disk Sync**: Seamless offline mode with `localStorage`, direct `.json` disk sync via File System Access API, and 1-click JSON backup import/export.
- 🌗 **Dusk & Daylight**: A deep charcoal/navy dark theme and a paper-white light theme share one layout and one set of controls. Animations are **off by default** (System → Motion → Animations) so low-end machines stay smooth; the system reduced-motion setting always wins.

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Motion & Game mode**: GSAP, Lenis, Three.js, React Three Fiber, Drei and Rapier — the 3D stack is reserved for the optional Game mode and is lazy-loaded, so the dashboard never needs WebGL
- **Audio**: Web Audio API — every sound is generated at runtime, no audio files
- **Cloud Database**: Google Firebase Firestore
- **Authentication**: Firebase Auth (Google Provider)
- **Hosting**: Firebase Hosting (`firebase.json`) for the app, plus `netlify.toml` if you deploy there instead

## 🔧 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npm run build
```

### 4. Deploy to Firebase Hosting
```bash
firebase deploy
```

## 🔒 Security Rules

The Firestore security rules in `firestore.rules` ensure that each user can only read, create, update, and delete their own tasks:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{taskId} {
      allow read, update, delete: if request.auth != null && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
    }
  }
}
```

## 📁 Project Structure

```
├── index.html            # Vite entry document
├── src/
│   ├── App.tsx           # Workspace shell, routing and mode switching
│   ├── main.tsx          # React entry point
│   ├── components/       # Day slate, task feed, quick add, dock, inspector, planner
│   ├── modules/          # Store, persistence, task actions, dates, recurrence, theme
│   ├── hooks/            # Shared React hooks
│   ├── styles/           # Design tokens, dashboard and feature styles
│   ├── game/             # Optional 3D quest arena
│   └── world/            # 3D valley scenes and world bridge
├── firebase.json         # Firebase Hosting and Firestore configuration
├── firestore.rules       # User-isolated Firestore security rules
├── package.json          # Project dependencies & scripts
└── vite.config.ts        # Vite build configuration
```
