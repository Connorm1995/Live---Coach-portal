# Architecture

## Project overview
A private coaching dashboard for Connor Meyler.
Pulls live client data from Trainerize and Typeform check-ins
into a single clean interface used during weekly Loom review calls.
Built for Mac full-screen browser. One coach, your clients only.

---

## Folder structure

coach-portal/
├── CLAUDE.md
├── .env
├── .gitignore
├── package.json
├── docs/
│   ├── architecture.md
│   ├── design.md
│   ├── data-map.md
│   ├── features.md
│   ├── trainerize-api.md
│   └── api-and-webhooks.md
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       └── pages/
└── backend/
    ├── package.json
    ├── server.js
    ├── routes/
    ├── controllers/
    └── db/

---

## Tech stack

- Frontend: React 18 with Vite
- Backend: Express
- Database: PostgreSQL on Railway
- Node version: v24.13.1
- Frontend and backend in same repo, separate folders
- Frontend runs on port 3000 locally
- Backend runs on port 3001 locally

---

## Domain

- Production URL: dashboard.myfitcoach.ie
- Webhook base: https://dashboard.myfitcoach.ie

---

## Webhooks

- Trainerize: POST /webhooks/trainerize
- Typeform: POST /webhooks/typeform
- Full details: see api-and-webhooks.md

---

## Environment variables

All secrets in .env only. Never hardcode any of these.
Full details: see docs/api-and-webhooks.md

DATABASE_URL
TRAINERIZE_API_KEY
TRAINERIZE_COACH_ID
TYPEFORM_API_KEY
TYPEFORM_WEBHOOK_SECRET
TYPEFORM_FORM_ID
PORT=3001
SESSION_SECRET

---

## Future features — architect for, do not build yet

- Oura ring integration
- Second coach support
- Client-facing login
- Automated check-in reminders
- PDF progress report export

Every database table must include coach_id from day one.