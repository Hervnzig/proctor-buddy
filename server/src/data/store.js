import { v4 as uuidv4 } from "uuid";

const sessions = new Map();

export function createSession({ title, lecturerName }) {
  const now = new Date().toISOString();
  const session = {
    id: uuidv4(),
    joinCode: uuidv4().slice(0, 8).toUpperCase(),
    title,
    lecturerName,
    status: "live",
    createdAt: now,
    students: []
  };
  sessions.set(session.id, session);
  return session;
}

export function listSessions() {
  return [...sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    student.events.push(record);
  } else if (studentId) {
    return null;
  }
  session.lastEvent = record;
  return session;
}
