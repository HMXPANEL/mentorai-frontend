/**
 * auth.js — Authentication Layer (Production Hardened)
 * 
 * Features:
 * - Lazy Firebase Loading (CDN)
 * - Memory-safe Auth Listeners
 * - Email Verification Enforcement
 * - Secure Token Generation for Backend
 * - WebView friendly (replace vs href)
 */

import { auth, db, DEMO_MODE } from "./firebase.js";

/* ── Lazy Firebase Imports & State ───────────────────────────────── */
let _si, _cr, _gp, _so, _oac;
let _doc, _gd, _sd, _ud;
let _googleProvider; // Local reference instead of window.__gp
let _authUnsub = null; // Listener cleanup reference

async function loadAuth() {
  if (_si) return;
  
  const m = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  
  _si  = m.signInWithEmailAndPassword;
  _cr  = m.createUserWithEmailAndPassword;
  _gp  = m.signInWithPopup;
  _so  = m.signOut;
  _oac = m.onAuthStateChanged;
  
  // Initialize Google Provider locally
  const { GoogleAuthProvider } = m;
  _googleProvider = new GoogleAuthProvider();
}

async function loadFS() {
  if (_doc) return;
  const m = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  _doc = m.doc; _gd = m.getDoc; _sd = m.setDoc; _ud = m.updateDoc;
}

/* ── Utility Functions ───────────────────────────────────────────── */
function today() { return new Date().toISOString().split("T")[0]; }

function defaultDoc(user) {
  return {
    name:               user.displayName || user.email?.split("@")[0] || "User",
    username:           (user.email || "user").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g,""),
    email:              user.email || "",
    photoURL:           user.photoURL || "",
    plan:               "free",
    theme:              "dark",
    tone:               "helpful",
    customInstructions: "",
    nickname:           "",
    occupation:         "",
    about:              "",
    memoryEnabled:      true,
    chatHistoryEnabled: true,
    dailyMessageCount:  0,
    lastResetDate:      today(),
    createdAt:          new Date().toISOString()
  };
}

/* ── Firestore User Doc ──────────────────────────────────────────── */
export async function ensureUserDoc(user) {
  if (!db || !user) return;
  try {
    await loadFS();
    const ref  = _doc(db, "users", user.uid);
    const snap = await _gd(ref);
    if (!snap.exists()) await _sd(ref, defaultDoc(user));
  } catch (e) { console.warn("[Auth] ensureUserDoc:", e.message); }
}

/* ── Auth Actions ────────────────────────────────────────────────── */

export async function loginEmail(email, password) {
  await loadAuth();
  const c = await _si(auth, email, password);
  await ensureUserDoc(c.user);
  cacheUser(c.user);
  return c.user;
}

export async function signupEmail(email, password, name) {
  await loadAuth();
  const c = await _cr(auth, email, password);

  // Persist displayName to Firebase Auth (not just local)
  if (name) {
    const { updateProfile } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"
    );
    await updateProfile(c.user, { displayName: name });
  }

  await ensureUserDoc(c.user);
  cacheUser(c.user);
  return c.user;
}

export async function loginGoogle() {
  await loadAuth();
  if (!_googleProvider) throw new Error("Google Provider not initialized");
  
  const c = await _gp(auth, _googleProvider);
  await ensureUserDoc(c.user);
  cacheUser(c.user);
  return c.user;
}

export async function logout() {
  try { 
    if (auth) { 
      await loadAuth(); 
      await _so(auth); 
    } 
  } catch {}
  
  localStorage.removeItem("m_user");
  localStorage.removeItem("m_profile");
  
  // Use replace to prevent back-button bypass in WebView
  window.location.replace("login.html");
}

/* ── Token Management ────────────────────────────────────────────── */

/**
 * Standard ID Token (use for general purpose)
 */
export async function getIdToken() {
  if (!auth?.currentUser) return null;
  try { return await auth.currentUser.getIdToken(true); } catch { return null; }
}

/**
 * Verified ID Token (REQUIRED for Backend API calls)
 * 1. Reloads user state from Firebase server
 * 2. Checks email verification
 * 3. Forces token refresh
 */
export async function getVerifiedIdToken() {
  if (!auth?.currentUser) return null;

  try {
    await auth.currentUser.reload();
    if (!auth.currentUser.emailVerified) return null;
    return await auth.currentUser.getIdToken(true);
  } catch {
    return null;
  }
}

/* ── Auth Guards ─────────────────────────────────────────────────── */

/**
 * Route Guard: Enforces Auth & Verification
 * FIX: Unsubscribes previous listener to prevent memory leaks
 */
export function requireAuth(cb) {
  if (DEMO_MODE || !auth) {
    let user = getCachedUser();
    if (!user) {
      user = { uid:"demo-001", email:"demo@mentorai.app", displayName:"Demo User", photoURL:"" };
      cacheUser(user);
    }
    if (!getCachedProfile()) {
      localStorage.setItem("m_profile", JSON.stringify(defaultDoc(user)));
    }
    cb(user);
    return;
  }

  loadAuth().then(() => {
    // Cleanup previous listener if exists
    if (_authUnsub) _authUnsub();

    _authUnsub = _oac(auth, (u) => {
      if (!u) {
        window.location.replace("login.html");
        return;
      }

      if (!u.emailVerified) {
        window.location.replace("verify.html");
        return;
      }

      cacheUser(u);
      cb(u);
    });
  });
}

/**
 * Redirect Guard: Prevents login page access if already verified
 */
export function redirectIfLoggedIn() {
  if (DEMO_MODE || !auth) return;
  
  loadAuth().then(() => { 
    _oac(auth, (u) => { 
      if (u && u.emailVerified) {
        window.location.replace("index.html");
      }
    }); 
  });
}

/* ── Profile Management ──────────────────────────────────────────── */

export async function fetchProfile(uid) {
  if (!db || !uid) return getCachedProfile();
  try {
    await loadFS();
    const snap = await _gd(_doc(db, "users", uid));
    if (snap.exists()) {
      const d = snap.data();
      localStorage.setItem("m_profile", JSON.stringify(d));
      return d;
    }
  } catch (e) { console.warn("[Auth] fetchProfile:", e.message); }
  return getCachedProfile();
}

export async function updateProfile(uid, updates) {
  const merged = { ...(getCachedProfile() || {}), ...updates };
  localStorage.setItem("m_profile", JSON.stringify(merged));
  if (db && uid) {
    try { await loadFS(); await _ud(_doc(db, "users", uid), updates); } catch {}
  }
  return merged;
}

/* ── Daily Count ─────────────────────────────────────────────────── */

export function incDailyCount(uid) {
  const p = getCachedProfile() || {};
  const t = today();
  if (p.lastResetDate !== t) { p.lastResetDate = t; p.dailyMessageCount = 0; }
  p.dailyMessageCount = (p.dailyMessageCount || 0) + 1;
  localStorage.setItem("m_profile", JSON.stringify(p));
  if (db && uid) {
    updateProfile(uid, { dailyMessageCount: p.dailyMessageCount, lastResetDate: t }).catch(() => {});
  }
  return p.dailyMessageCount;
}

export function getDailyCount() {
  const p = getCachedProfile() || {};
  return p.lastResetDate === today() ? (p.dailyMessageCount || 0) : 0;
}

/* ── Cache Helpers ───────────────────────────────────────────────── */

function cacheUser(u) {
  localStorage.setItem("m_user", JSON.stringify({
    uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL
  }));
}
export function getCachedUser()    { try { return JSON.parse(localStorage.getItem("m_user")    || "null"); } catch { return null; } }
export function getCachedProfile() { try { return JSON.parse(localStorage.getItem("m_profile") || "null"); } catch { return null; } }

export async function isEmailVerifiedFresh() {
  if (!auth?.currentUser) return false;
  try {
    await auth.currentUser.reload();
    return auth.currentUser.emailVerified;
  } catch {
    return false;
  }
}