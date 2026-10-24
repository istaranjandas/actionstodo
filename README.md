# ✦ Todo - Do

A minimalist, high-productivity daily task manager and week planner with real-time Firebase Cloud Sync and offline support.

## 🚀 Features

- ⚡ **1-Click Smart Time Range Picker**: Fast preset grid (Morning / Afternoon / Evening), custom duration pills (15m, 30m, 1h, 1.5h), and micro-nudge buttons (`-30m` / `+30m`).
- ✍️ **Natural Language Parsing**: Type `"Call Alex at 5pm"` or `"Design sprint 2pm to 3:30pm"` to automatically parse and slot time.
- 🏮 **The Lantern Path**: Your days are wayposts along a trail through a living 3D valley; every task is a lantern on its day's post, and completing one lights it. Walk the path with `Q` / `E`, or switch lens (Today, Upcoming, Week, All, Done, Planner) with `1`–`6`.
- 🗒️ **Day slate & details**: The focused day's tasks float beside its waypost; click a task or its lantern to edit title, date and time on the details slate.
- 📅 **Path ribbon**: The top dock carries the lens tabs and a strip of day beads that doubles as the calendar — with the month, the jump-to-date dial and the system controls on its right. Phones dock it below instead. Jump a week with `«` `»`.
- 📊 **Planner**: The week matrix (time slots by weekday) opens as a full board over the valley.
- 🔊 **Sound & music**: Synthesised interface sounds and an optional ambient soundtrack, each with its own switch and volume in the System menu.
- ☁️ **Real-Time Firebase Cloud Sync**: Google Sign-In with instant Firestore multi-device synchronization.
- 💾 **Offline First & Disk Sync**: Seamless offline mode with `localStorage`, direct `.json` disk sync via File System Access API, and 1-click JSON backup import/export.
- 🌄 **Dusk & Daylight**: The valley's time of day follows your theme. Animations are **off by default** (System → Motion → Animations) so low-end machines stay smooth; turning them on adds the camera journeys, the living world and the interface transitions. The system reduced-motion setting always wins, and the app falls back to a painted valley when WebGL is unavailable.

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **3D & Motion**: Three.js, React Three Fiber (lazy-loaded world and Game mode), Drei, Rapier (Game mode), GSAP, Lenis
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
