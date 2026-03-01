/**
 * firebase.js — Firebase SDK initialization
 */

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDXlL69d8zJNrLrq0HQYgFI2BS0BFPuf5o",
  authDomain: "testing-54ccb.firebaseapp.com",
  projectId: "testing-54ccb",
  storageBucket: "testing-54ccb.firebasestorage.app",
  messagingSenderId: "833665445588",
  appId: "1:833665445588:web:0ad8476bb8503b4a5b9541"
};

/* Since this is real config, demo mode is OFF */
export const DEMO_MODE = false;

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export default app;