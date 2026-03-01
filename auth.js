/**
 * auth.js — Authentication layer
 * Supports Firebase (email/password, Google) and Demo Mode
 */

import { auth, db, DEMO_MODE } from "./firebase.js";

/* ── Lazy Firebase imports ──────────────────────────────────────── */
let _si, _cr, _gp, _so, _oac, _gp2;
let _doc, _gd, _sd, _ud;

async function loadAuth() {
  if (_si) return;
  const m = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  _si  = m.signInWithEmailAndPassword;
  _cr  = m.createUserWithEmailAndPassword;
  _gp  = m.signInWithPopup;
  _so  = m.signOut;
  _oac = m.onAuthStateChanged;
  const { GoogleAuthProvider } = m;
  window.__gp = new GoogleAuthProvider();
}

async function loadFS() {
  if (_doc) return;
  const m = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  _doc = m.doc; _gd = m.getDoc; _sd = m.setDoc; _ud = m.updateDoc;
}

/* ── Default user doc ───────────────────────────────────────────── */
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

function today() { return new Date().toISOString().split("T")[0]; }

/* ── Firestore user doc ─────────────────────────────────────────── */
export async function ensureUserDoc(user) {
  if (!db || !user) return;
  try {
    await loadFS();
    const ref  = _doc(db, "users", user.uid);
    const snap = await _gd(ref);
    if (!snap.exists()) await _sd(ref, defaultDoc(user));
  } catch (e) { console.warn("[Auth] ensureUserDoc:", e.message); }
}

/* ── Auth actions ───────────────────────────────────────────────── */
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
  if (name) Object.defineProperty(c.user, 'displayName', { get: () => name });
  await ensureUserDoc(c.user);
  cacheUser(c.user);
  return c.user;
}

export async function loginGoogle() {
  await loadAuth();
  const c = await _gp(auth, window.__gp);
  await ensureUserDoc(c.user);
  cacheUser(c.user);
  return c.user;
}

export async function logout() {
  try { if (auth) { await loadAuth(); await _so(auth); } } catch {}
  localStorage.removeItem("m_user");
  localStorage.removeItem("m_profile");
  window.location.href = "login.html";
}

export async function getIdToken() {
  if (!auth?.currentUser) return null;
  try { return await auth.currentUser.getIdToken(true); } catch { return null; }
}

/* ── Auth guard ─────────────────────────────────────────────────── */
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
    _oac(auth, (u) => {
      if (!u) { window.location.href = "login.html"; return; }
      cacheUser(u);
      cb(u);
    });
  });
}

export function redirectIfLoggedIn() {
  if (DEMO_MODE || !auth) return;
  loadAuth().then(() => { _oac(auth, (u) => { if (u) window.location.href = "index.html"; }); });
}

/* ── Profile ────────────────────────────────────────────────────── */
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

/* ── Daily count ────────────────────────────────────────────────── */
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

/* ── Cache helpers ──────────────────────────────────────────────── */
function cacheUser(u) {
  localStorage.setItem("m_user", JSON.stringify({
    uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL
  }));
}
export function getCachedUser()    { try { return JSON.parse(localStorage.getItem("m_user")    || "null"); } catch { return null; } }
export function getCachedProfile() { try { return JSON.parse(localStorage.getItem("m_profile") || "null"); } catch { return null; } }
