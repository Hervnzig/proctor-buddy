import { test } from "node:test";
import assert from "node:assert/strict";
import { isEntireDisplaySurface } from "../../src/screenShare.js";

test("only complete monitor capture is accepted", () => {
  assert.equal(isEntireDisplaySurface("monitor"), true);
  assert.equal(isEntireDisplaySurface("window"), false);
  assert.equal(isEntireDisplaySurface("browser"), false);
  assert.equal(isEntireDisplaySurface(undefined), false);
});
