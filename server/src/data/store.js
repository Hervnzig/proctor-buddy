import { v4 as uuidv4 } from "uuid";

const sessions = new Map();
const MAX_EVENTS_PER_STUDENT = 300;
const MAX_EVENTS_WITH_IMAGES_PER_STUDENT = 40;

function normalizeQuizMode(mode) {
  return mode === "inperson" ? "inperson" : "online";
}

export function createSession({ title, lecturerName, assignmentHost = "", quizUrl = "", quizMode = "online" }) {
  const now = new Date().toISOString();
  const session = {
    id: uuidv4(),
    joinCode: uuidv4().slice(0, 8).toUpperCase(),
    title,
    lecturerName,
    assignmentHost,
    quizUrl,
    quizMode: normalizeQuizMode(quizMode),
    status: "live",
    createdAt: now,
    students: []
  };
  sessions.set(session.id, session);
  return session;
}

export function listSessions() {
  return [...sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((session) => ({
    ...session,
    students: session.students.map((student) => {
      const { precheckShots, precheckVideo, ...studentSummary } = student;
      return {
        ...studentSummary,
        precheckShotCount: precheckShots.length,
        hasPrecheckVideo: Boolean(precheckVideo?.dataUrl),
        events: student.events.map((event) => ({
          ...event,
          payload: Object.fromEntries(Object.entries(event.payload || {}).filter(([key]) => key !== "imageDataUrl"))
        }))
      };
    })
  }));
}

export function getStudentStatus(sessionId, studentId) {
  const session = sessions.get(sessionId);
  const student = session?.students.find((item) => item.id === studentId);
  if (!session || !student) return null;
  return { sessionStatus: session.status, studentStatus: student.status, reviewMessage: student.reviewMessage || "" };
}

export function getSession(id) {
  return sessions.get(id) ?? null;
}

export function updateSession(id, changes) {
  const session = sessions.get(id);
  if (!session) return null;
  Object.assign(session, changes);
  if (changes.status === "ended") {
    for (const student of session.students) {
      if (student.precheckVideo?.dataUrl) {
        student.precheckVideo = {
          mimeType: student.precheckVideo.mimeType || null,
          submittedAt: student.precheckVideo.submittedAt || null,
          purgedAt: new Date().toISOString(),
          purgedReason: "session-ended"
        };
      }
      if (student.precheckShots?.length) {
        student.precheckShots = [];
      }
      student.events = (student.events || []).map((event) => {
        if (!event?.payload?.imageDataUrl) return event;
        const payload = { ...event.payload };
        delete payload.imageDataUrl;
        return { ...event, payload };
      });
      if (student.status !== "ended") {
        student.status = "ended";
        student.events.push({
          id: uuidv4(),
          type: "assessment-ended-by-lecturer",
          payload: {},
          timestamp: changes.endedAt || new Date().toISOString()
        });
      }
    }
  }
  return session;
}

export function createStudent(sessionId, { studentName, studentNumber }) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const existing = session.students.find((student) => student.studentNumber === studentNumber);
  if (existing) return existing;

  const student = {
    id: uuidv4(),
    studentName,
    studentNumber,
    status: "setup",
    consentAt: null,
    screenReady: false,
    cameraReady: false,
    joinedAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
    precheckShots: [],
    precheckVideo: null,
    precheckSummary: null,
    reviewMessage: "",
    events: []
  };
  session.students.push(student);
  return student;
}

export function updateStudent(sessionId, studentId, changes) {
  const session = sessions.get(sessionId);
  const student = session?.students.find((item) => item.id === studentId);
  if (!student) return null;
  Object.assign(student, changes);
  return student;
}

export function addEvent(sessionId, studentId, event) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const student = studentId ? session.students.find((item) => item.id === studentId) : null;
  const record = {
    id: uuidv4(),
    type: event.type,
    payload: event.payload ?? {},
    timestamp: event.timestamp || new Date().toISOString()
  };
  if (student) {
    if (record.payload.imageDataUrl) {
      const imageEvents = student.events.filter((item) => item.payload?.imageDataUrl);
      if (imageEvents.length >= MAX_EVENTS_WITH_IMAGES_PER_STUDENT) {
        const oldestImageEvent = imageEvents[0];
        oldestImageEvent.payload = { ...oldestImageEvent.payload };
        delete oldestImageEvent.payload.imageDataUrl;
      }
    }
    student.events.push(record);
    if (student.events.length > MAX_EVENTS_PER_STUDENT) student.events.splice(0, student.events.length - MAX_EVENTS_PER_STUDENT);
  } else if (studentId) {
    return null;
  }
  session.lastEvent = record;
  return session;
}
