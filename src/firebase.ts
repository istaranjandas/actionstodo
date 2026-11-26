import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  memoryLocalCache, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  writeBatch,
  setDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCFRmyp7gwZkYTrZFfC1gbCRS6a4Dt4Smo",
  authDomain: "leonjarvis-notes.firebaseapp.com",
  projectId: "leonjarvis-notes",
  storageBucket: "leonjarvis-notes.firebasestorage.app",
  messagingSenderId: "339393479735",
  appId: "1:339393479735:web:94386b710c87635342bb2"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Persist the cache in IndexedDB so offline edits survive a reload; fall back to memory where it is unavailable
function pickLocalCache() {
  try {
    if (typeof indexedDB !== 'undefined') {
      return persistentLocalCache({ tabManager: persistentMultipleTabManager() });
    }
  } catch {
    // Some private modes throw on any IndexedDB access
  }
  return memoryLocalCache();
}

export const db = initializeFirestore(app, { localCache: pickLocalCache() });

export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  writeBatch,
  setDoc
};
