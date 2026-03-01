/**

chat.js — Production Chat Controller v3

Features: streaming, file upload (TXT+IMG), voice input, markdown, multi-conv
*/


import {
requireAuth, getCachedUser, getCachedProfile, fetchProfile,
getIdToken, logout, incDailyCount, getDailyCount
} from "./auth.js";

/* ── Config ─────────────────────────────────────────────────────── */
const API_URL = "https://mentorai-backend-atms.onrender.com";
const CONV_KEY    = "mentor_v3_convs";
const FREE_LIMIT  = 20;
const MAX_TXT_MB  = 2;    // max TXT file size
const MAX_IMG_MB  = 8;    // max image file size

const MODELS = [
{ id:"meta/llama-3.1-8b-instruct",            label:"Llama 3.1 8B",      plan:"free" },
{ id:"meta/llama-3.2-3b-instruct",            label:"Llama 3.2 3B",      plan:"free" },
{ id:"mistralai/mistral-7b-instruct-v0.3",    label:"Mistral 7B",        plan:"free" },
{ id:"meta/llama-3.1-70b-instruct",           label:"Llama 3.1 70B ✦",   plan:"pro"  },
{ id:"mistralai/mixtral-8x7b-instruct-v0.1",  label:"Mixtral 8×7B ✦",    plan:"pro"  },
{ id:"nvidia/nemotron-4-340b-instruct",       label:"Nemotron 340B ✦",   plan:"pro"  }
];

/* ── State ──────────────────────────────────────────────────────── */
const S = {
convs:       [],
activeId:    null,
streaming:   false,
abort:       null,
user:        null,
profile:     null,
attachments: [],   // pending attachments [{type,name,size,content,previewUrl}]
recognizing: false,
recognition: null
};

/* ── DOM ────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ════════════════════════════════════════════════════════════════
BOOTSTRAP
════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
buildModelSel();
setupInputHandlers();
setupSidebar();
setupPlusMenu();
setupMic();

requireAuth(async (user) => {
S.user    = user;
S.profile = await fetchProfile(user.uid);
updateSidebarUser();
loadConvs();
if (S.convs.length === 0) newChat();
else activateConv(S.convs[0].id);
});
});

/* ── Model selector ─────────────────────────────────────────────── */
function buildModelSel() {
const sel = $("modelSel");
if (!sel) return;
sel.innerHTML = "";
MODELS.forEach(m => {
const o = document.createElement("option");
o.value = m.id; o.textContent = m.label; o.dataset.plan = m.plan;
sel.appendChild(o);
});
sel.addEventListener("change", e => {
const plan = S.profile?.plan || "free";
const opt  = e.target.selectedOptions[0];
if (opt?.dataset.plan === "pro" && plan !== "pro") {
toast("This model requires a Pro plan.", "warn");
e.target.value = MODELS[0].id;
return;
}
const c = activeConv();
if (c) { c.model = e.target.value; saveConvs(); }
});
}

/* ════════════════════════════════════════════════════════════════
SIDEBAR USER
════════════════════════════════════════════════════════════════ */
function updateSidebarUser() {
const u = S.user, p = S.profile;
const name = p?.name || u?.displayName || "User";
const plan = p?.plan || "free";

const nameEl  = $("sbName");
const badgeEl = $("sbBadge");
const avEl    = $("sbAv");

if (nameEl)  nameEl.textContent = name;
if (badgeEl) { badgeEl.textContent = plan === "pro" ? "✦ Pro" : "Free"; badgeEl.className = `badge badge-${plan === "pro" ? "pro" : "free"}`; }
if (avEl) {
if (u?.photoURL) avEl.innerHTML = `<img src="${u.photoURL}" alt="">`;
else avEl.textContent = name.charAt(0).toUpperCase();
}

if (p?.theme) document.documentElement.setAttribute("data-theme", p.theme === "light" ? "light" : "");

updateUsage();
}

function updateUsage() {
const plan  = S.profile?.plan || "free";
const count = getDailyCount();
const wrap  = $("usageWrap");
const fill  = $("usageFill");
const cnt   = $("usageCnt");

if (!wrap) return;
if (plan === "pro") { wrap.style.display = "none"; return; }
wrap.style.display = "flex";

const pct = Math.min((count / FREE_LIMIT) * 100, 100);
if (fill) { fill.style.width = pct + "%"; fill.className = "usage-fill" + (pct >= 80 ? " warn" : ""); }
if (cnt)  cnt.textContent = `${count} / ${FREE_LIMIT}`;
}

/* ════════════════════════════════════════════════════════════════
CONVERSATIONS
════════════════════════════════════════════════════════════════ */
function loadConvs() {
try { S.convs = JSON.parse(localStorage.getItem(CONV_KEY) || "[]"); } catch { S.convs = []; }
renderConvList();
}

function saveConvs() {
try { localStorage.setItem(CONV_KEY, JSON.stringify(S.convs)); } catch {
if (S.convs.length > 30) { S.convs = S.convs.slice(0, 30); saveConvs(); }
}
}

function newChat() {
const id = `c_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
S.convs.unshift({ id, title:"New Chat", model:$("modelSel")?.value||MODELS[0].id, messages:[], createdAt:Date.now(), updatedAt:Date.now() });
saveConvs();
activateConv(id);
}

function deleteConv(id) {
S.convs = S.convs.filter(c => c.id !== id);
saveConvs();
if (S.activeId === id) {
if (S.convs.length > 0) activateConv(S.convs[0].id);
else newChat();
} else renderConvList();
}

function activateConv(id) {
S.activeId = id;
const c = activeConv();
if (!c) return;
const sel = $("modelSel");
if (sel && c.model) sel.value = c.model;
renderConvList();
renderMessages(c.messages);
}

function activeConv() { return S.convs.find(c => c.id === S.activeId) || null; }

function pushMsg(role, content, meta = {}) {
const c = activeConv(); if (!c) return;
c.messages.push({ role, content, ts: Date.now(), ...meta });
c.updatedAt = Date.now();
if (role === "user" && c.messages.filter(m => m.role === "user").length === 1)
c.title = content.slice(0, 46) + (content.length > 46 ? "…" : "");
saveConvs();
return c.messages[c.messages.length - 1];
}

/* ─── Render Conversation List ──────────────────────────────────── */
function renderConvList() {
const list = $("convList"); if (!list) return;
list.innerHTML = "";

if (S.convs.length === 0) {
list.innerHTML = `<div style="padding:16px 8px;color:var(--text-4);font-size:0.76rem;text-align:center;">No conversations yet</div>`;
return;
}

S.convs.forEach(c => {
const el = document.createElement("div");
el.className = "conv-item" + (c.id === S.activeId ? " active" : "");
el.innerHTML = `
  <span class="conv-icon">💬</span>
  <span class="conv-text" title="${esc(c.title)}">${esc(c.title)}</span>
  <button class="conv-del" title="Delete" aria-label="Delete conversation">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>`;
el.addEventListener("click", e => {
if (e.target.closest(".conv-del")) { e.stopPropagation(); deleteConv(c.id); }
else activateConv(c.id);
});
list.appendChild(el);
});
}

/* ════════════════════════════════════════════════════════════════
MESSAGE RENDERING
════════════════════════════════════════════════════════════════ */
function renderMessages(msgs) {
const inner   = $("msgInner");
const welcome = $("welcomeState");
if (!inner) return;
inner.innerHTML = "";

if (!msgs || msgs.length === 0) {
if (welcome) welcome.style.display = "flex";
return;
}
if (welcome) welcome.style.display = "none";
msgs.forEach(m => buildMsgDOM(m.role, m.content, false, m.attachments));
scrollBottom(false);
}

function buildMsgDOM(role, content, animate = true, attachments = []) {
const inner   = $("msgInner");
const welcome = $("welcomeState");
if (!inner) return null;
if (welcome) welcome.style.display = "none";

const u = S.user, p = S.profile;

const row = document.createElement("div");
row.className = "msg-row " + role;
if (animate) row.classList.add("fade-up");

/* Avatar */
const av = document.createElement("div");
av.className = "msg-av " + (role === "ai" ? "ai-av" : "user-av");
if (role === "ai") {
av.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
} else if (u?.photoURL) {
av.innerHTML = `<img src="${u.photoURL}" alt="">`;
} else {
av.textContent = (p?.name || u?.displayName || "U").charAt(0).toUpperCase();
}

/* Body */
const body   = document.createElement("div");
body.className = "msg-body";

/* Attachments in bubble */
if (attachments?.length) {
attachments.forEach(att => {
if (att.type === "image") {
const img = document.createElement("img");
img.src = att.previewUrl || att.content;
img.className = "img-attach";
img.alt = att.name;
img.title = "Click to expand";
img.addEventListener("click", () => { window.open(att.previewUrl || att.content, "_blank"); });
body.appendChild(img);
} else {
const chip = document.createElement("div");
chip.className = "attach-preview";
chip.innerHTML = `<span class="attach-icon">📄</span><span class="attach-name">${esc(att.name)}</span><span class="attach-size">${formatSize(att.size)}</span>`;
body.appendChild(chip);
}
});
}

/* Bubble */
const bubble = document.createElement("div");
bubble.className = `bubble ${role === "ai" ? "ai" : "user"}`;
if (role === "ai") bubble.innerHTML = content ? renderMD(content) : "";
else bubble.textContent = content || "";
body.appendChild(bubble);

/* Actions */
if (content || (attachments?.length && role === "user")) {
const acts = document.createElement("div");
acts.className = "msg-actions";

const copyBtn = document.createElement("button");  
copyBtn.className = "act-btn";  
copyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy`;  
copyBtn.addEventListener("click", () => {  
  navigator.clipboard.writeText(content).then(() => {  
    copyBtn.textContent = "✓ Copied";  
    setTimeout(() => { copyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy`; }, 2000);  
  });  
});  
acts.appendChild(copyBtn);  

if (role === "ai") {  
  const retryBtn = document.createElement("button");  
  retryBtn.className = "act-btn";  
  retryBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>Retry`;  
  retryBtn.addEventListener("click", retryLast);  
  acts.appendChild(retryBtn);  
}  
body.appendChild(acts);

}

row.appendChild(av);
row.appendChild(body);
inner.appendChild(row);
return { row, bubble };
}

/* ════════════════════════════════════════════════════════════════
PLUS BUTTON — ATTACH MENU
════════════════════════════════════════════════════════════════ */
function setupPlusMenu() {
const plusBtn    = $("plusBtn");
const attachMenu = $("attachMenu");
const optTxt     = $("optTxt");
const optImg     = $("optImg");
const fileTxt    = $("fileTxt");
const fileImg    = $("fileImg");

if (!plusBtn || !attachMenu) return;

/* Toggle menu */
plusBtn.addEventListener("click", e => {
e.stopPropagation();
const open = attachMenu.classList.toggle("open");
plusBtn.classList.toggle("open", open);
});

/* Close on outside click */
document.addEventListener("click", e => {
if (!plusBtn.contains(e.target) && !attachMenu.contains(e.target)) {
attachMenu.classList.remove("open");
plusBtn.classList.remove("open");
}
});

/* TXT option */
optTxt?.addEventListener("click", () => {
fileTxt.click();
attachMenu.classList.remove("open");
plusBtn.classList.remove("open");
});

/* IMG option */
optImg?.addEventListener("click", () => {
fileImg.click();
attachMenu.classList.remove("open");
plusBtn.classList.remove("open");
});

/* Handle TXT file */
fileTxt?.addEventListener("change", async e => {
const file = e.target.files[0]; if (!file) return;
e.target.value = "";

if (!file.name.toLowerCase().endsWith(".txt") && file.type !== "text/plain") {  
  toast("Only .txt files are supported.", "error"); return;  
}  
if (file.size > MAX_TXT_MB * 1024 * 1024) {  
  toast(`Text file must be under ${MAX_TXT_MB}MB.`, "error"); return;  
}  
if (S.attachments.length >= 3) {  
  toast("Maximum 3 attachments per message.", "warn"); return;  
}  

try {  
  const content = await readFileAsText(file);  
  const att = { type:"text", name:file.name, size:file.size, content };  
  S.attachments.push(att);  
  renderAttachChips();  
  toast(`"${file.name}" attached ✓`, "success");  
} catch {  
  toast("Failed to read file.", "error");  
}

});

/* Handle Image file */
fileImg?.addEventListener("change", async e => {
const file = e.target.files[0]; if (!file) return;
e.target.value = "";

if (!file.type.startsWith("image/")) {  
  toast("Only image files are supported.", "error"); return;  
}  
if (file.size > MAX_IMG_MB * 1024 * 1024) {  
  toast(`Image must be under ${MAX_IMG_MB}MB.`, "error"); return;  
}  
if (S.attachments.length >= 3) {  
  toast("Maximum 3 attachments per message.", "warn"); return;  
}  

try {  
  const { base64, previewUrl } = await readFileAsBase64(file);  
  const att = { type:"image", name:file.name, size:file.size, content:base64, mimeType:file.type, previewUrl };  
  S.attachments.push(att);  
  renderAttachChips();  
  toast(`"${file.name}" attached ✓`, "success");  
} catch {  
  toast("Failed to read image.", "error");  
}

});
}

/* ─── Render attachment chips above input ───────────────────────── */
function renderAttachChips() {
const row = $("attachChips"); if (!row) return;

if (S.attachments.length === 0) { row.style.display = "none"; row.innerHTML = ""; return; }
row.style.display = "flex";
row.innerHTML = "";

S.attachments.forEach((att, i) => {
const chip = document.createElement("div");
chip.className = "attach-chip";

if (att.type === "image") {  
  chip.innerHTML = `<img src="${att.previewUrl}" class="attach-chip-img" alt=""><span class="attach-chip-name">${esc(att.name)}</span><span style="color:var(--text-4);font-size:0.68rem;font-family:var(--mono);">${formatSize(att.size)}</span>`;  
} else {  
  chip.innerHTML = `<span style="font-size:0.9rem;">📄</span><span class="attach-chip-name">${esc(att.name)}</span><span style="color:var(--text-4);font-size:0.68rem;font-family:var(--mono);">${formatSize(att.size)}</span>`;  
}  

const rm = document.createElement("button");  
rm.className = "attach-chip-rm";  
rm.innerHTML = "×";  
rm.title = "Remove attachment";  
rm.addEventListener("click", () => {  
  S.attachments.splice(i, 1);  
  renderAttachChips();  
});  
chip.appendChild(rm);  
row.appendChild(chip);

});
}

/* ════════════════════════════════════════════════════════════════
MIC — VOICE INPUT
════════════════════════════════════════════════════════════════ */
function setupMic() {
const micBtn = $("micBtn");
const micSt  = $("micStatus");
if (!micBtn) return;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
micBtn.classList.add("no-support");
micBtn.title = "Speech recognition not supported in this browser";
return;
}

const recognition = new SpeechRecognition();
recognition.continuous      = false;
recognition.interimResults  = true;
recognition.lang            = "en-US";
recognition.maxAlternatives = 1;
S.recognition = recognition;

let interimTranscript = "";
let finalTranscript   = "";

recognition.addEventListener("start", () => {
S.recognizing = true;
micBtn.classList.add("listening");
micBtn.title = "Stop recording";
if (micSt) micSt.classList.add("show");
});

recognition.addEventListener("result", e => {
interimTranscript = "";
finalTranscript   = "";
for (let i = e.resultIndex; i < e.results.length; i++) {
const txt = e.results[i][0].transcript;
if (e.results[i].isFinal) finalTranscript += txt;
else interimTranscript += txt;
}
const ta = $("chatInput");
if (ta) {
const existing = ta.value;
const base     = existing.trimEnd();
ta.value = base + (base ? " " : "") + finalTranscript + interimTranscript;
ta.dispatchEvent(new Event("input"));
}
});

recognition.addEventListener("end", () => {
S.recognizing = false;
micBtn.classList.remove("listening");
micBtn.title = "Voice input";
if (micSt) micSt.classList.remove("show");
});

recognition.addEventListener("error", e => {
S.recognizing = false;
micBtn.classList.remove("listening");
if (micSt) micSt.classList.remove("show");
if (e.error !== "no-speech") toast(`Mic error: ${e.error}`, "error");
});

micBtn.addEventListener("click", () => {
if (S.recognizing) { recognition.stop(); return; }
try { recognition.start(); }
catch (e) { toast("Could not start microphone.", "error"); }
});
}

/* ════════════════════════════════════════════════════════════════
SEND MESSAGE
════════════════════════════════════════════════════════════════ */
async function sendMessage() {
if (S.streaming) return;

const ta   = $("chatInput");
const text = ta?.value?.trim() || "";

if (!text && S.attachments.length === 0) return;

/* Plan check */
const plan  = S.profile?.plan || "free";
const count = getDailyCount();
if (plan === "free" && count >= FREE_LIMIT) {
toast("Daily limit reached (20/day on Free). Upgrade to Pro for unlimited.", "warn");
return;
}

/* Snapshot + clear attachments */
const pendingAttach = [...S.attachments];
S.attachments = [];
renderAttachChips();

/* Clear input */
if (ta) { ta.value = ""; ta.style.height = "auto"; }

S.streaming = true;
setInputDisabled(true);

/* Build display text */
const displayText = text || (pendingAttach.length > 0 ? "(File attached)" : "");

/* Persist + render user message */
pushMsg("user", text, { attachments: pendingAttach.map(a => ({ type:a.type, name:a.name, size:a.size, previewUrl:a.previewUrl })) });
buildMsgDOM("user", text, true, pendingAttach.map(a => ({ type:a.type, name:a.name, size:a.size, previewUrl:a.previewUrl })));
scrollBottom();

/* Create streaming AI bubble */
const { bubble } = buildMsgDOM("ai", "", true, []);
scrollBottom();
const cursor = document.createElement("span");
cursor.className = "cursor-blink";
bubble.appendChild(cursor);

/* Build API payload */
const conv    = activeConv();
const model   = $("modelSel")?.value || MODELS[0].id;
if (conv) { conv.model = model; saveConvs(); }

const profile = S.profile || {};
const histCap = plan === "pro" ? 40 : 10;
const history = (conv?.messages || []).slice(0, -1).slice(-histCap).map(m => ({
role:    m.role === "ai" ? "assistant" : "user",
content: m.content
}));

/* Prepare attachments for API */
const apiAttachments = pendingAttach.map(a => ({
type:     a.type,
name:     a.name,
content:  a.content,          // base64 for images, raw text for txt
mimeType: a.mimeType || "text/plain"
}));

let aiText = "", errMsg = null;

try {
S.abort   = new AbortController();
const tok = await getIdToken();

if (!tok) {
errMsg = "Not authenticated. Please login again.";
throw new Error("No auth token");
}

const resp = await fetch(`${API_URL}/api/chat`, {  
  method:  "POST",  
  signal:  S.abort.signal,  
  headers: {

"Content-Type": "application/json",
"Authorization": `Bearer ${tok}`
},
body: JSON.stringify({
message:             text,
history,
model,
plan,
tone:                profile.tone              || "helpful",
custom_instructions: profile.customInstructions || "",
nickname:            profile.nickname           || "",
occupation:          profile.occupation          || "",
about:               profile.about               || "",
memory_enabled:      profile.memoryEnabled        !== false,
history_enabled:     profile.chatHistoryEnabled   !== false,
attachments:         apiAttachments
})
});

if (resp.status === 401) { errMsg = "Session expired — please log in again."; setTimeout(() => window.location.href = "login.html", 2000); }  
else if (resp.status === 429) { errMsg = "Rate limit reached. Please wait a moment."; }  
else if (resp.status === 403) { errMsg = "This model requires a Pro plan."; }  
else if (!resp.ok) {  
  const b = await resp.text().catch(() => "");  
  errMsg = `Server error (${resp.status}). ${b.slice(0, 100)}`;  
} else {  
  /* Stream SSE */  
  const reader  = resp.body.getReader();  
  const decoder = new TextDecoder();  
  let   buf     = "";  

  outer: while (true) {  
    const { done, value } = await reader.read();  
    if (done) break;  
    buf += decoder.decode(value, { stream: true });  
    const lines = buf.split("\n");  
    buf = lines.pop();  

    for (const line of lines) {  
      const t = line.trim();  
      if (!t || t === ":") continue;  
      if (t.startsWith("data: ")) {  
        const d = t.slice(6);  
        if (d === "[DONE]") break outer;  
        try {  
          const p   = JSON.parse(d);  
          const tok = p.choices?.[0]?.delta?.content ?? "";  
          if (tok) {  
            aiText += tok;  
            cursor.remove();  
            bubble.innerHTML = renderMD(aiText);  
            bubble.appendChild(cursor);  
            scrollBottom();  
          }  
        } catch {}  
      }  
    }  
  }  
}

} catch (e) {
if (e.name !== "AbortError") errMsg = `Connection error. Is the backend running at ${API_URL}?`;
}

/* Finalise */
cursor.remove();
S.abort = null;

if (errMsg) {
bubble.innerHTML = `<span style="color:#fca5a5;">⚠️ ${esc(errMsg)}</span>`;
pushMsg("ai", errMsg, { error: true });
toast(errMsg, "error");
} else if (aiText) {
bubble.innerHTML = renderMD(aiText);
pushMsg("ai", aiText);
incDailyCount(S.user?.uid);
updateUsage();
} else {
bubble.innerHTML = `<span style="color:var(--text-3)">No response received.</span>`;
pushMsg("ai", "No response received.", { error: true });
}

S.streaming = false;
setInputDisabled(false);
scrollBottom();
ta?.focus();
}

/* ─── Retry last ────────────────────────────────────────────────── */
function retryLast() {
const conv = activeConv(); if (!conv) return;
let lastUser = null;
for (let i = conv.messages.length - 1; i >= 0; i--) {
if (conv.messages[i].role === "user") { lastUser = conv.messages[i]; break; }
}
if (!lastUser) return;
if (conv.messages[conv.messages.length - 1].role === "ai") conv.messages.pop();
conv.messages.pop();
saveConvs();
const ta = $("chatInput");
if (ta) { ta.value = lastUser.content; renderMessages(conv.messages); sendMessage(); }
}

/* ─── Stop streaming ────────────────────────────────────────────── */
function stopStream() {
if (S.abort) { S.abort.abort(); S.abort = null; }
S.streaming = false;
setInputDisabled(false);
}

/* ─── Input state ───────────────────────────────────────────────── */
function setInputDisabled(v) {
const sendBtn = $("sendBtn");
const ta      = $("chatInput");
const stopWrap= $("stopWrap");
if (sendBtn) sendBtn.disabled = v;
if (ta)      ta.disabled = v;
if (stopWrap) stopWrap.style.display = v ? "inline-flex" : "none";
}

/* ─── Scroll ────────────────────────────────────────────────────── */
function scrollBottom(smooth = true) {
const el = $("msgScroll");
if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

/* ════════════════════════════════════════════════════════════════
INPUT HANDLERS
════════════════════════════════════════════════════════════════ */
function setupInputHandlers() {
/* Send on Enter */
 $("chatInput")?.addEventListener("keydown", e => {
if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

/* Auto-resize textarea */
 $("chatInput")?.addEventListener("input", () => {
const el = $("chatInput");
el.style.height = "auto";
el.style.height = Math.min(el.scrollHeight, 180) + "px";
});

 $("sendBtn")?.addEventListener("click", sendMessage);
 $("stopBtn")?.addEventListener("click", stopStream);
 $("newChatBtn")?.addEventListener("click", () => { if (S.streaming) stopStream(); newChat(); });
 $("logoutBtn")?.addEventListener("click", logout);

/* Prompt chips */
 $("welcomeState")?.addEventListener("click", e => {
const chip = e.target.closest(".p-chip");
if (chip) {
const ta = $("chatInput");
if (ta) { ta.value = chip.textContent.trim(); ta.dispatchEvent(new Event("input")); ta.focus(); sendMessage(); }
}
});
}

/* ── Sidebar toggle (mobile) ────────────────────────────────────── */
function setupSidebar() {
  const sidebar  = $("sidebar");
  const backdrop = $("sbBackdrop");
  const menuBtn  = $("menuBtn");

  if (!sidebar || !backdrop || !menuBtn) return;

  function openSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
    document.body.style.overflow = "hidden";   // prevent background scroll
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    document.body.style.overflow = "";         // restore scroll
  }

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  });

  backdrop.addEventListener("click", closeSidebar);

  // Close when clicking any conversation item (mobile UX)
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest(".conv-item")) {
      closeSidebar();
    }
  });

  // Extra safety: close on window resize to desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) {
      closeSidebar();
    }
  });
}

/* ════════════════════════════════════════════════════════════════
MARKDOWN RENDERER
════════════════════════════════════════════════════════════════ */
function renderMD(text) {
if (!text) return "";
let h = text
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;");

/* Fenced code */
h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
`<pre><code${lang ? ` class="language-${lang}"` : ""}>${code.trim()}</code></pre>`);

/* Inline code */
h = h.replace(/`([^\n]+)`/g, "<code>$1</code>");

/* Bold + italic combos */
h = h.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
h = h.replace(/\*([^\n]+?)\*/g, "<em>$1</em>");
h = h.replace(/__(.+?)__/g, "<strong>$1</strong>");
h = h.replace(/_([^\n]+?)_/g, "<em>$1</em>");
h = h.replace(/~~(.+?)~~/g, "<del>$1</del>");

/* Headers */
h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
h = h.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
h = h.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
h = h.replace(/^---+$/gm, "<hr>");

/* Blockquotes */
h = h.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

/* Unordered lists */
h = h.replace(/^[-+] (.+)$/gm, "<li>$1</li>");
h = h.replace(/((<li>.*?<\/li>\n?)+)/g, "<ul>$1</ul>");

/* Ordered lists */
h = h.replace(/^\d+\. (.+)$/gm, "<_oli>$1</_oli>");
h = h.replace(/((<_oli>.*?<\/_oli>\n?)+)/g, m =>
"<ol>" + m.replace(/<\/?_oli>/g, t => t === "<_oli>" ? "<li>" : "</li>") + "</ol>");

/* Links */
h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

/* Paragraphs */
h = h.split(/\n{2,}/).map(p => {
p = p.trim();
if (!p) return "";
if (/^<(h[1-6]|ul|ol|blockquote|pre|hr)/.test(p)) return p;
return `<p>${p.replace(/\n/g, "<br>")}</p>`;
}).filter(Boolean).join("\n");

return h;
}

/* ════════════════════════════════════════════════════════════════
UTILITIES
════════════════════════════════════════════════════════════════ */
function esc(s) {
  return String(s || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function formatSize(bytes) {
if (!bytes) return "";
if (bytes < 1024) return `${bytes}B`;
if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)}KB`;
return `${(bytes/(1024*1024)).toFixed(1)}MB`;
}

function readFileAsText(file) {
return new Promise((res, rej) => {
const r = new FileReader();
r.onload  = () => res(r.result);
r.onerror = () => rej(new Error("Read failed"));
r.readAsText(file, "utf-8");
});
}

function readFileAsBase64(file) {
return new Promise((res, rej) => {
const r = new FileReader();
r.onload  = () => {
const result = r.result;        // data:image/png;base64,xxx
const base64 = result.split(",")[1];
res({ base64, previewUrl: result });
};
r.onerror = () => rej(new Error("Read failed"));
r.readAsDataURL(file);
});
}

function toast(msg, type = "info", dur = 4500) {
let root = $("toast-root");
if (!root) { root = document.createElement("div"); root.id = "toast-root"; document.body.appendChild(root); }
const ICON = { success:"✓", error:"✕", warn:"⚠", info:"ℹ" };
const el = document.createElement("div");
el.className = `toast toast-${type}`;
el.innerHTML = `<span style="flex-shrink:0">${ICON[type]||"ℹ"}</span><span>${esc(msg)}</span>`;
root.appendChild(el);
setTimeout(() => { el.style.cssText += "opacity:0;transform:translateX(20px);transition:all 0.3s ease;"; setTimeout(() => el.remove(), 320); }, dur);
}

/* Expose globally */
window.__mentor = { S, newChat, stopStream, toast };