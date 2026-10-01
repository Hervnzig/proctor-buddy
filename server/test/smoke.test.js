import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const BASE_URL = "http://127.0.0.1:4310";

async function request(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  return { response, body: await response.json() };
}

test("lecturer creates a quiz session and student session", async (context) => {
  const server = spawn("node", ["src/index.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore"
  });
  context.after(() => server.kill());

  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    try {
      ready = (await fetch(`${BASE_URL}/health`)).ok;
    } catch {
      await wait(100);
    }
  }
  assert.equal(ready, true, "API server should start");

  const health = await request("/health");
  assert.equal(health.body.ok, true);

  const created = await request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Biology unit quiz", lecturerName: "Jordan Miller" })
  });
  assert.equal(created.response.status, 201);
  assert.ok(created.body.id);
  assert.ok(created.body.joinCode);

  const sessionId = created.body.id;
  const joined = await request(`/api/sessions/${sessionId}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentName: "Avery Chen", studentNumber: "S-1042" })
  });
  assert.equal(joined.response.status, 201);

  const studentId = joined.body.id;
  const precheck = await request(`/api/sessions/${sessionId}/students/${studentId}/precheck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shots: [
      { label: "left", imageDataUrl: "data:image/jpeg;base64,a" },
      { label: "center", imageDataUrl: "data:image/jpeg;base64,b" },
      { label: "right", imageDataUrl: "data:image/jpeg;base64,c" }
    ] })
  });
  assert.equal(precheck.response.status, 200);
  assert.equal(precheck.body.status, "awaiting-review");

  const approved = await request(`/api/sessions/${sessionId}/students/${studentId}/approval`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved: true, reviewer: "Jordan Miller" })
  });
  assert.equal(approved.body.status, "approved");

  const event = await request(`/api/sessions/${sessionId}/students/${studentId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "monitoring-heartbeat", payload: { screenEnabled: true } })
  });
  assert.equal(event.response.status, 202);

  const detail = await request(`/api/sessions/${sessionId}`);
  assert.equal(detail.body.students[0].events.length, 3);
});
