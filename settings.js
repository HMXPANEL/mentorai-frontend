/**
 * settings.js — Settings controller v3
 */

import { requireAuth, getCachedUser, getCachedProfile, fetchProfile, updateProfile, logout } from "./auth.js";

const $ = id => document.getElementById(id);
let S = { user: null, profile: null };

document.addEventListener("DOMContentLoaded", () => {
  $("logoutBtn")?.addEventListener("click", logout);

  requireAuth(async (user) => {
    S.user    = user;
    S.profile = await fetchProfile(user.uid);
    populate();
    bindListeners();
  });

  // Second save button
  $("saveBtn2")?.addEventListener("click", () => $("saveBtn")?.click());

  // Clear chats
  $("clearChatsBtn")?.addEventListener("click", () => {
    if (confirm("Delete ALL chat history? This cannot be undone.")) {
      localStorage.removeItem("mentor_v3_convs");
      toast("All chats cleared.", "success");
      setTimeout(() => window.location.href = "index.html", 1200);
    }
  });
});

function populate() {
  const p = S.profile || {}, u = S.user || {};
  setV("fName",    p.name     || u.displayName || "");
  setV("fUser",    p.username || "");
  setV("fEmail",   p.email    || u.email       || "");
  setV("fAvatar",  p.photoURL || u.photoURL    || "");
  setV("fNick",    p.nickname  || "");
  setV("fOccup",   p.occupation|| "");
  setV("fAbout",   p.about     || "");
  setV("fTone",    p.tone      || "helpful");
  setV("fInstr",   p.customInstructions || "");
  setCh("tMem",    p.memoryEnabled     !== false);
  setCh("tHist",   p.chatHistoryEnabled!== false);
  setCh("tLight",  p.theme === "light");
  refreshAv(p.photoURL || u.photoURL || "");
  highlightPlan(p.plan || "free");
  document.documentElement.setAttribute("data-theme", p.theme === "light" ? "light" : "");
  const pb = $("planBadge");
  if (pb) { pb.textContent = (p.plan === "pro") ? "✦ Pro" : "Free"; pb.className = `badge badge-${p.plan === "pro" ? "pro" : "free"}`; }
}

function bindListeners() {
  $("fAvatar")?.addEventListener("input", e => refreshAv(e.target.value.trim()));
  $("saveBtn")?.addEventListener("click", saveProfile);
  $("tMem") ?.addEventListener("change", () => autoSave({ memoryEnabled:      $("tMem")?.checked  ?? true }));
  $("tHist")?.addEventListener("change", () => autoSave({ chatHistoryEnabled: $("tHist")?.checked ?? true }));
  $("tLight")?.addEventListener("change", e => {
    const theme = e.target.checked ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", e.target.checked ? "light" : "");
    autoSave({ theme });
  });
  $("fTone")?.addEventListener("change", e => autoSave({ tone: e.target.value }));
  document.querySelectorAll(".plan-card").forEach(card => {
    card.addEventListener("click",  () => selectPlan(card.dataset.plan));
    card.addEventListener("keydown",e => { if (e.key === "Enter" || e.key === " ") selectPlan(card.dataset.plan); });
  });
}

async function saveProfile() {
  const btn = $("saveBtn");
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px;"></span> Saving…`; }

  const updates = {
    name:               getV("fName"),
    username:           getV("fUser").toLowerCase().replace(/[^a-z0-9_]/g,""),
    photoURL:           getV("fAvatar"),
    nickname:           getV("fNick"),
    occupation:         getV("fOccup"),
    about:              getV("fAbout"),
    tone:               getV("fTone"),
    customInstructions: getV("fInstr"),
    updatedAt:          new Date().toISOString()
  };

  try {
    S.profile = await updateProfile(S.user?.uid, updates);
    refreshAv(updates.photoURL);
    toast("Profile saved!", "success");
  } catch { toast("Save failed. Try again.", "error"); }
  finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}

async function autoSave(u) {
  try { S.profile = await updateProfile(S.user?.uid, u); } catch {}
}

async function selectPlan(plan) {
  highlightPlan(plan);
  await autoSave({ plan });
  const pb = $("planBadge");
  if (pb) { pb.textContent = plan === "pro" ? "✦ Pro" : "Free"; pb.className = `badge badge-${plan === "pro" ? "pro" : "free"}`; }
  toast(plan === "pro" ? "✦ Upgraded to Pro!" : "Switched to Free", plan === "pro" ? "success" : "info");
}

function highlightPlan(plan) {
  document.querySelectorAll(".plan-card").forEach(c => c.classList.toggle("active", c.dataset.plan === plan));
}

function refreshAv(url) {
  const el = $("avPreview"); if (!el) return;
  if (url) el.innerHTML = `<img src="${url}" alt="avatar" onerror="this.parentElement.textContent='${getInit()}'">`;
  else el.textContent = getInit();
}

function getInit() { return (S.profile?.name || S.user?.displayName || "U").charAt(0).toUpperCase(); }
function setV(id, v)  { const e = $(id); if (e) e.value = v || ""; }
function getV(id)      { return $(id)?.value?.trim() || ""; }
function setCh(id, v)  { const e = $(id); if (e) e.checked = !!v; }

function toast(msg, type = "info", dur = 4000) {
  let root = document.getElementById("toast-root");
  if (!root) { root = document.createElement("div"); root.id = "toast-root"; document.body.appendChild(root); }
  const ICON = { success:"✓", error:"✕", warn:"⚠", info:"ℹ" };
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${ICON[type]||"ℹ"}</span><span>${msg}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.cssText += "opacity:0;transform:translateX(20px);transition:all 0.3s ease;"; setTimeout(() => el.remove(), 320); }, dur);
}
