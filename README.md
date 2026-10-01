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

For camera and screen capture in local development, open the student/lecturer app using **`http://localhost:5173/`**. Do not use the Vite Network URL or a LAN address such as `http://192.168.x.x:5173/`; browsers generally disable media APIs on those non-HTTPS origins. On another device, configure HTTPS before testing camera and screen sharing.

The local MVP stores sessions in memory. Restarting the API clears the data. Vite proxies API and WebSocket signaling requests to the backend.

## Try the flow

1. Open the lecturer workspace and choose **New assessment**.
2. Create a session and click **Copy invite link**.
3. Open that link in another browser window to act as a student.
4. Enter a name and student number and acknowledge the disclosure of shared screen/webcam viewing, local face-presence/count checks, background images, and event logging.
5. Enable the webcam and choose **Entire Screen** in the browser picker. Window and browser-tab shares are rejected after selection.
6. Capture left, center, and right workspace images and submit them for lecturer review.
7. The lecturer reviews the submitted images and approves the student.
8. Face-presence/count checks continue locally from webcam activation until the session ends. After approval, the lecturer can view the student-selected screen and webcam streams; events are shown in **Activity log**.

## What is recorded

- Student join and consent timestamp.
- Camera/screen permission state and submitted background-check images.
- Timestamped setup, approval, sharing-stop, tab-visibility, and heartbeat events.
- State changes from continuous, on-device face-presence/count analysis, such as no face detected across repeated checks or multiple faces detected. Frames for that analysis are processed locally and are not sent to the API by the detector.
- A screen-share evidence frame when sharing stops, if the browser exposes a final frame.
- Lecturer actions and downloadable JSON reports.

## Important limitations

- This is a local prototype, not a secure production system. It has no authentication/authorization, persistent database, retention/deletion controls, or audit-grade event immutability.
- Students must explicitly grant camera and screen permissions. If the page says `navigator.mediaDevices` is unavailable, check that the page is open at `http://localhost:5173/` or an HTTPS deployment, then reload. If a permission was denied, allow it in browser site settings. The lecturer receives live media only while the student page is open and sharing is active.
- The screen-share request asks for `displaySurface: "monitor"` and accepts only a browser-reported `monitor` surface. Browsers that don't expose the surface are rejected. Browser pickers vary; test the exact target browser/version. Deployed use requires HTTPS.
- Face detection uses MediaPipe model/WASM assets from public CDNs. Camera frames used by face detection remain in the browser; the separate live webcam feed is shared with the lecturer over WebRTC. If assets fail to load, the app reports detector unavailability.
- Detection may be inaccurate due to lighting, camera angle, disability, and other factors. Events are review prompts, not findings. The MVP does not identify people, estimate gaze/emotion, infer suspicious intent, track objects such as phones, or automatically cancel a quiz.
- WebRTC signaling is for local testing. Production deployments need authenticated signaling, an SFU, and TURN servers.
- Student images, streams, and logs are sensitive. Add school/legal review, accessibility and consent workflows, access controls, and retention/deletion policies before real student use.

## Checks

```bash
npm test
npm run build
```
