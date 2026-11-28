# ✦ Todo - Do

A minimalist, high-productivity daily task manager with real-time Firebase Cloud Sync and offline support.

## 🚀 Features

- ⚡ **1-Click Smart Time Range Picker**: Fast preset grid (Morning / Afternoon / Evening), custom duration pills (15m, 30m, 1h, 1.5h), and micro-nudge buttons (`-30m` / `+30m`).
- ✍️ **Natural Language Parsing**: Type `"Call Alex at 5pm"` or `"Design sprint 2pm to 3:30pm"` to automatically parse and slot time.
- 🔁 **Recurring Tasks**: Add `"Gym every day at 6pm"`, `"Standup weekdays 9am"`, or `"Rent monthly"` and the app builds a rolling series of real daily tasks. Each day is completed independently, title/time edits flow to future open days, and the details panel can change the rule or add an end date.
- 🏮 **The Lantern Path**: Your day is a trail through a drawn valley; every timed task is a lantern on it, and completing one lights it. The task you are on burns in a big lantern on its post, with a plaque counting down the time left. Walk the days with `Q` / `E`. Today's log opens first; **Show all days** (or `A`) slides out into every day as a board of day cards (drag a task onto another day to move it).
- 🗒️ **Day slate & details**: The day slate floats over the valley: the task you are on with a live countdown and Mark done, the schedule with a NOW line, Anytime, and tasks left on the trail from earlier days (Move all to today). Click a task to edit title, date, time and repeat in the details drawer.
- 😈 **Profile key**: The mascot in the top-right corner opens the profile panel: the games first, then sound, time of day, motion and account.
- 📱 **Phone app**: On phones the 3D valley becomes the Lantern Path, a hand-drawn valley you walk sideways. The task you are on burns in a big lantern with a live countdown, every timed task is a lantern on the trail, and lighting one marks it done. The week shows as cairns, tasks left from earlier wait on the trail with Move all to today, and Day / Night is a horizon dial in the header. The add-task bar sits at the thumb; All days keeps its Open / Done filters and folded past weeks.
- 🔊 **Sound & music**: Synthesised interface sounds and an optional ambient soundtrack, each with its own switch and volume in the System menu.
- ☁️ **Real-Time Firebase Cloud Sync**: Google Sign-In with instant Firestore multi-device synchronization.
- 💾 **Offline First & Disk Sync**: Seamless offline mode with `localStorage`, direct `.json` disk sync via File System Access API, and 1-click JSON backup import/export.
- 🌄 **Night & Day**: The valley's time of day follows your theme; the horizon dial beside the profile key switches it. Night lights the lanterns you lit. Animations are **off by default** (System → Motion → Animations) so low-end machines stay smooth, and the system reduced-motion setting always wins.

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **3D & Motion**: Three.js, React Three Fiber, Drei and Rapier (lazy-loaded Game mode), GSAP, Lenis; the Lantern Path itself is SVG and CSS
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
├── index.html         # Main application markup
├── src/
│   ├── firebase.js    # Firebase configuration & Firestore exports
│   ├── main.js        # Core Todo - Do application logic & cloud sync
│   └── style.css      # Notion-style monochrome styles & responsive layouts
├── firebase.json      # Firebase Hosting and Firestore configuration
├── .firebaserc        # Firebase project binding (leonjarvis-notes)
├── firestore.rules    # User-isolated Firestore security rules
├── package.json       # Project dependencies & scripts
└── vite.config.js     # Vite build configuration
```
