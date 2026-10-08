import cors from "cors";
import express from "express";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  addEvent,
  createSession,
  createStudent,
  getSession,
  getStudentStatus,
  listSessions,
  updateSession,
  updateStudent
} from "./data/store.js";

const app = express();
const PORT = process.env.PORT || 4310;
const VITE_PORT = process.env.VITE_PORT || 5173;

app.set("etag", false);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "12mb" }));

app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", `http://localhost:${VITE_PORT}`);
  next();
});

app.use("/api", (request, response, next) => {
  response.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.set("Pragma", "no-cache");
  response.set("Expires", "0");
  next();
});

app.get("/health", (_, response) => {
  response.json({ ok: true });
});

app.post("/api/sessions", (request, response) => {
  const { title, lecturerName, assignmentHost = "" } = request.body ?? {};
  if (!title || !lecturerName) {
    response.status(400).json({ error: "title and lecturerName are required" });
    return;
  }

  const session = createSession({ title, lecturerName, assignmentHost: String(assignmentHost).trim().slice(0, 160) });
  response.status(201).json(session);
});

app.get("/api/sessions", (_, response) => {
  response.json(listSessions());
});

app.get("/api/sessions/:id", (request, response) => {
  const session = getSession(request.params.id);
  if (!session) {
    response.status(404).json({ error: "session not found" });
    return;
  }

  response.json(session);
});

app.get("/api/sessions/:id/students/:studentId/status", (request, response) => {
  const status = getStudentStatus(request.params.id, request.params.studentId);
  if (!status) {
    response.status(404).json({ error: "student or session not found" });
    return;
  }
  response.json(status);
});

app.patch("/api/sessions/:id", (request, response) => {
  const { status, assignmentHost } = request.body ?? {};
  const hasStatus = typeof status !== "undefined";
  const hasAssignmentHost = typeof assignmentHost !== "undefined";
  if (!hasStatus && !hasAssignmentHost) {
    response.status(400).json({ error: "provide status and/or assignmentHost" });
    return;
  }
  if (hasStatus && status !== "ended" && status !== "live") {
    response.status(400).json({ error: "status must be live or ended" });
    return;
  }
  if (hasAssignmentHost && typeof assignmentHost !== "string") {
    response.status(400).json({ error: "assignmentHost must be a string" });
    return;
  }
  const session = updateSession(request.params.id, {
    ...(hasStatus ? { status, endedAt: status === "ended" ? new Date().toISOString() : null } : {}),
    ...(hasAssignmentHost ? { assignmentHost: assignmentHost.trim().slice(0, 160) } : {})
  });
  if (!session) {
    response.status(404).json({ error: "session not found" });
    return;
  }
  response.json(session);
});

app.post("/api/sessions/:id/students", (request, response) => {
  const { studentName, studentNumber } = request.body ?? {};
  if (!studentName || !studentNumber) {
    response.status(400).json({ error: "studentName and studentNumber are required" });
    return;
  }
  const parentSession = getSession(request.params.id);
  if (!parentSession) {
    response.status(404).json({ error: "session not found" });
    return;
  }
  if (parentSession.status !== "live") {
    response.status(410).json({ error: "this assessment has ended" });
    return;
  }
  const student = createStudent(request.params.id, { studentName, studentNumber });
  if (!student) {
    response.status(404).json({ error: "session not found" });
    return;
  }
  response.status(201).json(student);
});

app.patch("/api/sessions/:id/students/:studentId", (request, response) => {
  const changes = request.body ?? {};
  if (changes.status && !["setup", "ended"].includes(changes.status)) {
    response.status(400).json({ error: "student status can only be set to setup or ended here" });
    return;
  }
  const student = updateStudent(request.params.id, request.params.studentId, changes);
  if (!student) {
    response.status(404).json({ error: "student or session not found" });
    return;
  }
  response.json(student);
});

app.post("/api/sessions/:id/students/:studentId/precheck", (request, response) => {
  const { video, summary } = request.body ?? {};
  if (!video?.dataUrl || typeof video.dataUrl !== "string") {
    response.status(400).json({ error: "a short background-scan video under 3.5 MB is required" });
    return;
  }
  if (!/^data:video\/(webm|mp4);base64,/.test(video.dataUrl)) {
    response.status(400).json({ error: "background-scan video must be WebM or MP4" });
    return;
  }
  const encodedVideo = video.dataUrl.slice(video.dataUrl.indexOf(",") + 1);
  const padding = encodedVideo.endsWith("==") ? 2 : encodedVideo.endsWith("=") ? 1 : 0;
  const videoBytes = Math.floor(encodedVideo.length * 3 / 4) - padding;
  if (videoBytes >= 3_500_000) {
    response.status(400).json({ error: "background-scan video must be under 3.5 MB" });
    return;
  }
  const student = updateStudent(request.params.id, request.params.studentId, {
    precheckShots: [],
    precheckVideo: { dataUrl: video.dataUrl, mimeType: video.mimeType, submittedAt: new Date().toISOString() },
    precheckSummary: summary || {},
    reviewMessage: "",
    status: "awaiting-review"
  });
  if (!student) {
    response.status(404).json({ error: "student or session not found" });
    return;
  }
  addEvent(request.params.id, request.params.studentId, { type: "background-video-submitted" });
  response.json(student);
});

app.patch("/api/sessions/:id/students/:studentId/approval", (request, response) => {
  const { approved, reviewer = "lecturer", message = "", reviewedEvidence, confirmedObjects = [] } = request.body ?? {};
  if (typeof approved !== "boolean") {
    response.status(400).json({ error: "approved must be true or false" });
    return;
  }
  if (!approved && !String(message).trim()) {
    response.status(400).json({ error: "a personalized retry message is required" });
    return;
  }
  if (reviewedEvidence !== true) {
    response.status(400).json({ error: "confirm that the submitted walkthrough video was reviewed" });
    return;
  }
  const currentSession = getSession(request.params.id);
  const currentStudent = currentSession?.students.find((item) => item.id === request.params.studentId);
  if (!currentStudent || currentStudent.status !== "awaiting-review" || !currentStudent.precheckVideo?.dataUrl) {
    response.status(409).json({ error: "a submitted video must be awaiting review" });
    return;
  }
  const detectedObjectLabels = (currentStudent.precheckSummary?.objectAnalysis?.objects || []).map((item) => item.label);
  if (approved && (!Array.isArray(confirmedObjects) || detectedObjectLabels.some((label) => !confirmedObjects.includes(label)))) {
    response.status(400).json({ error: "confirm each detected object category before approval" });
    return;
  }
  const student = updateStudent(request.params.id, request.params.studentId, {
    status: approved ? "approved" : "changes-requested",
    approvedAt: approved ? new Date().toISOString() : null,
    approvedBy: approved ? reviewer : null,
    reviewMessage: String(message).slice(0, 1000),
    lecturerReviewedEvidence: true,
    lecturerConfirmedObjects: approved ? detectedObjectLabels : []
  });
  if (!student) {
    response.status(404).json({ error: "student or session not found" });
    return;
  }
  addEvent(request.params.id, request.params.studentId, {
    type: approved ? "student-approved" : "scan-changes-requested",
    payload: { message: String(message).slice(0, 1000), reviewer, reviewedEvidence: true, confirmedObjects: approved ? detectedObjectLabels : [] }
  });
  response.json(student);
});

app.post("/api/sessions/:id/events", (request, response) => {
  const { type, payload, timestamp, studentId } = request.body ?? {};
  if (!type) {
    response.status(400).json({ error: "event type is required" });
    return;
  }

  const session = addEvent(request.params.id, studentId || null, { type, payload, timestamp });
  if (!session) {
    response.status(404).json({ error: "session not found" });
    return;
  }

  response.status(202).json({ ok: true });
});

app.post("/api/sessions/:id/students/:studentId/events", (request, response) => {
  const { type, payload, timestamp } = request.body ?? {};
  if (!type) {
    response.status(400).json({ error: "event type is required" });
    return;
  }
  const session = addEvent(request.params.id, request.params.studentId, { type, payload, timestamp });
  if (!session) {
    response.status(404).json({ error: "student or session not found" });
    return;
  }
  response.status(202).json({ ok: true });
});

const webDistDir = path.resolve(__dirname, "../../dist");
app.use(express.static(webDistDir));
app.get("*", (request, response, next) => {
  if (request.path.startsWith("/api/")) return next();
  response.sendFile(path.join(webDistDir, "index.html"), (error) => {
    if (error) next(error);
  });
});

const server = app.listen(PORT, () => {
  console.log(`Proctor API listening on http://localhost:${PORT}`);
});

const sockets = new WebSocketServer({ server, path: "/signaling" });
const peers = new Map();
sockets.on("connection", (socket, request) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get("sessionId");
  const studentId = url.searchParams.get("studentId") || "lecturer";
  if (!sessionId) return socket.close(1008, "sessionId required");
  const roomKey = `${sessionId}:${studentId}`;
  if (!peers.has(roomKey)) peers.set(roomKey, new Set());
  const room = peers.get(roomKey);
  room.add(socket);
  socket.on("message", (message) => {
    for (const peer of room) {
      if (peer !== socket && peer.readyState === 1) peer.send(message.toString());
    }
  });
  socket.on("close", () => {
    room.delete(socket);
    if (!room.size) peers.delete(roomKey);
  });
});
