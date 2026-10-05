import { test } from "node:test";
import assert from "node:assert/strict";
import { addEvent, createSession, createStudent, getStudentStatus, listSessions, updateStudent } from "../src/data/store.js";

test("session summaries omit image payloads and event retention is bounded", () => {
  const session = createSession({ title: "Memory test", lecturerName: "Lecturer" });
  const student = createStudent(session.id, { studentName: "Student", studentNumber: `memory-${session.id}` });
  updateStudent(session.id, student.id, { precheckShots: [{ imageDataUrl: "data:image/jpeg;base64,large" }] });

  for (let index = 0; index < 310; index += 1) {
    addEvent(session.id, student.id, {
      type: "face-position-change",
      payload: { imageDataUrl: `data:image/jpeg;base64,shot-${index}`, note: "snapshot" }
    });
  }

  const summaryStudent = listSessions().find((item) => item.id === session.id).students[0];
  assert.equal(summaryStudent.events.length, 300);
  assert.equal(summaryStudent.precheckShotCount, 1);
  assert.equal("precheckShots" in summaryStudent, false);
  assert.equal(summaryStudent.events.some((event) => "imageDataUrl" in event.payload), false);

  const detailStudent = session.students[0];
  assert.equal(detailStudent.events.length, 300);
  assert.ok(detailStudent.events.filter((event) => event.payload.imageDataUrl).length <= 40);
  assert.deepEqual(getStudentStatus(session.id, student.id), { sessionStatus: "live", studentStatus: "setup", reviewMessage: "" });
});
