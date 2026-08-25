import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  passwordContainsForbiddenValue,
  validateRegistrationInput,
  requireNonEmptyString,
  requireValidUserContent
} from "../utils/validation.js";

test("validateEmail accepts valid email addresses", () => {
  assert.equal(validateEmail("student@example.com"), true);
});

test("validateEmail rejects invalid email addresses", () => {
  assert.equal(validateEmail("studentexample.com"), false);
  assert.equal(validateEmail("student@"), false);
  assert.equal(validateEmail("student@example..com"), false);
  assert.equal(validateEmail(`student@${"a".repeat(250)}.com`), false);
  assert.equal(validateEmail(""), false);
});

test("passwordContainsForbiddenValue rejects first name, last name, display name, and email id", () => {
  const userFields = {
    firstName: "Avery",
    lastName: "Stone",
    displayName: "averystone",
    email: "avery@example.com"
  };

  assert.equal(passwordContainsForbiddenValue("abcAvery123", userFields), true);
  assert.equal(passwordContainsForbiddenValue("abcStone123", userFields), true);
  assert.equal(passwordContainsForbiddenValue("abcaverystone123", userFields), true);
  assert.equal(passwordContainsForbiddenValue("abcavery123", userFields), true);
  assert.equal(passwordContainsForbiddenValue("SafePassword123!", userFields), false);
});

test("validateRegistrationInput enforces a minimum password length", () => {
  const result = validateRegistrationInput({
    firstName: "Ava",
    lastName: "Stone",
    displayName: "avastone",
    email: "ava@example.com",
    password: "Zx1!",
    confirmPassword: "Zx1!"
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("at least 8 characters")));
});

test("validateRegistrationInput rejects unreasonably long passwords", () => {
  const password = "x".repeat(129);
  const result = validateRegistrationInput({
    firstName: "Ava",
    lastName: "Stone",
    displayName: "avastone",
    email: "ava@example.com",
    password,
    confirmPassword: password
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("128 characters or less")));
});

test("validateRegistrationInput returns all important registration validation errors", () => {
  const result = validateRegistrationInput({
    firstName: "Ava",
    lastName: "Stone",
    displayName: "avastone",
    email: "bad-email",
    password: "Ava123",
    confirmPassword: "Different123"
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 2);
});

test("validateRegistrationInput rejects non-string and oversized identity fields", () => {
  const structured = validateRegistrationInput({
    firstName: { value: "Ava" },
    lastName: "Stone",
    displayName: "avastone",
    email: "ava@example.com",
    password: "SafePassword123!",
    confirmPassword: "SafePassword123!"
  });
  assert.equal(structured.ok, false);
  assert.ok(structured.errors.includes("First name is required."));

  const oversized = validateRegistrationInput({
    firstName: "A".repeat(51),
    lastName: "B".repeat(51),
    displayName: "C".repeat(51),
    email: "ava@example.com",
    password: "SafePassword123!",
    confirmPassword: "SafePassword123!"
  });
  assert.equal(oversized.ok, false);
  assert.ok(oversized.errors.some((message) => message.includes("First name must be 50")));
  assert.ok(oversized.errors.some((message) => message.includes("Last name must be 50")));
  assert.ok(oversized.errors.some((message) => message.includes("Display name must be 50")));
});

test("requireNonEmptyString reports client input errors as bad requests", () => {
  assert.equal(requireNonEmptyString("  hello  ", "Greeting"), "hello");

  assert.throws(
    () => requireNonEmptyString("  ", "Greeting"),
    (error) => error.message === "Greeting is required." && error.status === 400
  );
});

test("requireValidUserContent accepts secure links and rejects invalid Markdown links", () => {
  assert.equal(
    requireValidUserContent(
      "Read [the docs](https://example.com/docs) and [API](http://api.example.com)",
      "Content",
      100
    ),
    "Read [the docs](https://example.com/docs) and [API](http://api.example.com)"
  );
  assert.throws(
    () => requireValidUserContent("Read [](https://example.com)", "Content"),
    /non-empty text/
  );
  assert.throws(
    () => requireValidUserContent("Read [docs](javascript:alert(1))", "Content"),
    /http:\/\//
  );
  assert.throws(
    () => requireValidUserContent("123456", "Content", 5),
    /5 characters or less/
  );
});
