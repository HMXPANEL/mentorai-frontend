/**
 * firebase.js — Firebase SDK initialization
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDXlL69d8zJNrLrq0HQYgFI2BS0BFPuf5o",
  authDomain: "testing-54ccb.firebaseapp.com",
  projectId: "testing-54ccb",
  storageBucket: "testing-54ccb.firebasestorage.app",
  messagingSenderId: "833665445588",
  appId: "1:833665445588:web:0ad8476bb8503b4a5b9541"
};

export const DEMO_MODE = false;

// Prevents crash if Firebase loads twice (Hot-reload safety)
const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

// Professional Improvement: Async wrapper ensures persistence is set deterministically
(async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {}
})();

export default app;