# Verity — web-based proctoring MVP

Standalone React web app for lecturer-led quiz sessions. No browser extension is required.

## Run locally

From the project root:

```bash
npm install
npm --prefix server install
npm run dev
```

- Lecturer workspace: `http://localhost:5173/`
- API health check: `http://localhost:4310/health`

The local MVP stores sessions in memory. Restarting the API clears the data. The React development server proxies API and WebSocket signaling requests to the backend.

## Try the flow

1. Open the lecturer workspace and choose **New assessment**.
2. Create a session and use **Copy invite link** in its detail panel.
3. Open the invite link in another browser window (or a private window) to act as a student.
4. Enter a name and student number and acknowledge the disclosure.
5. Explicitly enable webcam and screen sharing through the browser prompts.
6. Capture left, center, and right workspace images, then submit for review.
7. Return to the lecturer workspace, select that student, inspect the submitted images, and approve.
8. The approved student page begins WebRTC streaming to the selected student's dashboard media tiles; session events appear in **Activity log**.

## What the MVP records

- Student join and consent timestamp.
- Browser camera/screen permission state and background-check images.
- Timestamped setup, approval, sharing-stop, tab-visibility, and heartbeat events.
- A screen-share evidence frame when the student stops sharing (when the browser still exposes a final frame).
- Live webcam and screen feeds after lecturer approval, using peer-to-peer WebRTC for local testing.

## Important limitations before real use

- This is a local prototype, not a secure production system: there is no authentication, authorization, persistent database, encryption-at-rest configuration, retention/deletion tooling, or audit-grade event immutability.
- Screen and camera capture require student action and browser permission. The lecturer can receive video only while the student page is open and sharing is active.
- WebRTC signaling is included for local flow validation. Production multi-student streaming should use an authenticated SFU service and TURN servers; peer-to-peer networking may fail across restrictive networks.
- Browser screen-sharing support and HTTPS requirements vary. `getDisplayMedia()` works on localhost for development; deployed use requires HTTPS.
- The background images and monitoring events are sensitive student data. Do not use with real students until consent, accessibility accommodations, school policy, legal review, restricted access, and retention/deletion requirements are addressed.
- The MVP does not infer cheating, monitor eye movements, listen to speech, or automatically cancel assessments. Human review is required.

## Checks

```bash
npm test
npm run build
```# Quiz Proctoring MVP (Extension + Dashboard)

This project is a **starter MVP** for monitored online assessments, with a browser extension for students and a dashboard for proctors.

## What this MVP does

- Creates a monitored quiz session from a browser extension.
- Captures **3 background scan images** (left/center/right) before approval.
- Lets a proctor approve/revoke each session from a dashboard.
- Monitors quiz/monitor tab behavior (visibility, focus/blur, copy/paste attempts).
- Sends periodic monitoring heartbeats and optional face-count anomalies.

## Project structure

```
personal-project/
├─ extension/
│  ├─ manifest.json
│  ├─ popup.html / popup.js / popup.css
│  ├─ monitor.html / monitor.js / monitor.css
│  ├─ background.js
│  └─ content-script.js
├─ server/
│  ├─ src/index.js
│  ├─ src/data/store.js
│  ├─ public/dashboard.html
│  └─ test/smoke.test.js
└─ package.json
```

## Run locally

1. Install dependencies:

```bash
cd /Users/apple/Desktop/frontend_web_dev/personal-project/server
npm install
```

2. Start backend:

```bash
cd /Users/apple/Desktop/frontend_web_dev/personal-project
npm run dev
```

3. Open proctor dashboard:

- `http://localhost:4310/dashboard`

4. Load extension in Chrome/Edge:

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select `/Users/apple/Desktop/frontend_web_dev/personal-project/extension`

## Student flow

1. Open quiz tab.
2. Click extension icon.
3. Enter `Student ID` and `Quiz ID`.
4. Start session.
5. In monitor tab, capture left/center/right background views.
6. Submit pre-check and wait for proctor approval.
7. Continue quiz while monitoring events are recorded.

## Proctor flow

1. Open dashboard.
2. Select student session.
3. Review background scan images.
4. Click **Approve** or **Revoke**.
5. Watch incoming live events.

## Test

```bash
cd /Users/apple/Desktop/frontend_web_dev/personal-project/server
npm test
```

## Privacy and policy notes (important)

Before using with real students, add:

- Written consent and transparent disclosure.
- Data minimization and retention policy.
- Role-based access control and audit logs.
- Encryption in transit/at rest.
- Regional legal compliance (FERPA/GDPR/local laws).

This MVP stores data in memory only (for demo/testing), and is not production-ready.
