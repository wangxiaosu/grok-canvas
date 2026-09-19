import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERATION_FAILED_MESSAGE,
  LOGIN_ACTION_LABEL,
  LOGIN_REQUIRED_MESSAGE,
  generationStatusFeedback,
  loginRequired,
} from "../lib/generation-auth-feedback.ts";

test("login-required feedback is only used when auth is known logged out", () => {
  assert.equal(loginRequired(false), true);
  assert.equal(loginRequired(true), false);
  assert.equal(loginRequired(null), false);
  assert.equal(loginRequired(undefined), false);
  assert.deepEqual(generationStatusFeedback(false), {
    message: LOGIN_REQUIRED_MESSAGE,
    actionLabel: LOGIN_ACTION_LABEL,
  });
  assert.deepEqual(generationStatusFeedback(true), { message: GENERATION_FAILED_MESSAGE });
  assert.deepEqual(generationStatusFeedback(null), { message: GENERATION_FAILED_MESSAGE });
});
