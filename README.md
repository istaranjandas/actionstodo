# ✦ Todo - Do

A minimalist, high-productivity daily task manager and week planner with real-time Firebase Cloud Sync and offline support.

## 🚀 Features

- ⚡ **1-Click Smart Time Range Picker**: Fast preset grid (Morning / Afternoon / Evening), custom duration pills (15m, 30m, 1h, 1.5h), and micro-nudge buttons (`-30m` / `+30m`).
- ✍️ **Natural Language Parsing**: Type `"Call Alex at 5pm"` or `"Design sprint 2pm to 3:30pm"` to automatically parse and slot time.
- 📅 **Descending Daily Feed**: Today is always anchored at the top, followed by previous days in descending chronological order.
- ➔ **Plan Ahead**: Plan tasks for Tomorrow, Day after, Next week, or any custom future date via the quick toolbar dropdown.
- 📊 **Week Matrix View**: 2D schedule table with time slots down the left and days of the week across the top.
- ☁️ **Real-Time Firebase Cloud Sync**: Google Sign-In with instant Firestore multi-device synchronization.
- 💾 **Offline First & Disk Sync**: Seamless offline mode with `localStorage`, direct `.json` disk sync via File System Access API, and 1-click JSON backup import/export.
- 🎨 **Minimalist Aesthetic**: Clean Notion-style monochrome typography and dark / light mode.

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules) + Vite
- **Cloud Database**: Google Firebase Firestore
- **Authentication**: Firebase Auth (Google Provider)
- **Hosting**: Firebase Hosting & Vercel-ready

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
