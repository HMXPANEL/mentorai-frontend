# 🧠 MentorAI v3 — Full SaaS AI Chat

> Production AI chatbot with **Glass Neo-Tactile** design, file uploads, voice input, and NVIDIA NIM streaming.

---

## ⚡ Launch in 60 Seconds

```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
export NVIDIA_API_KEY=nvapi-xxxx   # get free at build.nvidia.com
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
python -m http.server 3000
# → open http://localhost:3000
```

**No key yet?** Click **"Enter Demo Mode"** on the login screen — works immediately.

---

## 🆕 v3 New Features

### 📎 PLUS Button (Attachment Menu)
Located at the **left of the input bar**. Click `+` to reveal:
- **📄 Add Text File** — Attach `.txt` files up to 2MB. Content is embedded in the prompt as context.
- **🖼️ Add Photo** — Attach JPG, PNG, GIF, WebP up to 8MB. Displayed in chat as a preview thumbnail.

You can attach up to **3 files per message**. Attachments show as chips above the input bar with a remove button.

### 🎙️ Mic Button (Voice Input)
Located **left of the Send button**. Uses the **Web Speech API**:
- Click mic → starts listening (red pulsing animation + "Listening…" indicator)
- Speak naturally → transcript appears in the input field in real time
- Click again or stop speaking → mic stops
- Supported in Chrome, Edge, Safari (not Firefox by default)

---

## 📁 File Structure

```
mentorai/
├── frontend/
│   ├── index.html      ← Chat UI (Plus button + Mic + streaming)
│   ├── login.html      ← Sign in page
│   ├── signup.html     ← Create account page
│   ├── settings.html   ← Full settings panel
│   ├── style.css       ← Glass Neo-Tactile design system
│   ├── firebase.js     ← Firebase init
│   ├── auth.js         ← Auth: email, Google, demo mode
│   ├── chat.js         ← Chat controller, file handler, mic, streaming
│   └── settings.js     ← Settings controller
├── backend/
│   ├── main.py         ← FastAPI + NVIDIA NIM streaming + file processing
│   ├── requirements.txt
│   └── .env.example
└── README.md
```

---

## 🔑 NVIDIA API Key

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign up / Log in
3. Click any model → **"Get API Key"**
4. Copy `nvapi-...`

```bash
export NVIDIA_API_KEY=nvapi-xxxxxxxxxxxx
```

---

## 🔥 Firebase Setup (Optional)

Skip Firebase → use Demo Mode (full features, no real accounts).

For real auth:
1. [Firebase Console](https://console.firebase.google.com) → New Project → Add Web App
2. Enable **Auth**: Email/Password + Google
3. Enable **Firestore**: Start in test mode
4. Edit `frontend/firebase.js` with your config

---

## 🎨 Design System

| Property | Value |
|----------|-------|
| Background | `#060810` + 5 radial atmospheric glows |
| Glass panels | `blur(22–36px)`, `rgba(255,255,255,0.04–0.12)` |
| Neo buttons | Dual shadow + spring bounce press effect |
| Typography | Sora (UI) + JetBrains Mono (code) |
| Accent | `#6366f1 → #22d3ee` gradient |
| Motion | CSS spring `cubic-bezier(0.34, 1.56, 0.64, 1)` |

---

## 🤖 Models

| Model | Plan |
|-------|------|
| Llama 3.1 8B | Free |
| Llama 3.2 3B | Free |
| Mistral 7B | Free |
| Llama 3.1 70B | Pro |
| Mixtral 8×7B | Pro |
| Nemotron 340B | Pro |

---

## 🔒 Security

- Regex prompt injection guard
- IP rate limiting (30 free / 120 pro per minute)
- Model plan gating
- Input sanitization + null byte removal
- Base64 image validation before sending
- Text file content capped at 60K chars

---

## 📱 Mobile Support

- Sidebar slides in as overlay (touch-friendly)
- Mic works on mobile Chrome/Safari
- File picker works with native mobile pickers
- Responsive down to 320px
