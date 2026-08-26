import mongoose from "mongoose";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const FIRST_NAME_MAX_LENGTH = 50;
export const LAST_NAME_MAX_LENGTH = 50;
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const POST_CONTENT_MAX_LENGTH = 20000;

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function validateEmail(email) {
  if (typeof email !== "string") return false;
  const normalized = email.trim();
  if (normalized.length < 3 || normalized.length > 254) return false;

  const atIndex = normalized.indexOf("@");
  if (
    atIndex <= 0 ||
    atIndex !== normalized.lastIndexOf("@") ||
    atIndex > 64
  ) {
    return false;
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    !domain.includes(".") ||
    localPart.includes("..") ||
    domain.includes("..")
  ) {
    return false;
  }

  for (const character of normalized) {
    if (character.trim() === "") return false;
  }
  return true;
}

export function emailIdPart(email) {
  if (typeof email !== "string") return "";
  return email.split("@")[0].toLowerCase();
}

export function passwordContainsForbiddenValue(password, userFields) {
  if (typeof password !== "string") return true;

  const normalizedPassword = password.toLowerCase();

  const forbiddenValues = [
    userFields?.firstName,
    userFields?.lastName,
    userFields?.displayName,
    emailIdPart(userFields?.email || "")
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => value.length > 0);

  return forbiddenValues.some((value) => normalizedPassword.includes(value));
}

export function validateRegistrationInput(input) {
  const errors = [];

  if (typeof input?.firstName !== "string" || !input.firstName.trim()) {
    errors.push("First name is required.");
  } else if (input.firstName.trim().length > FIRST_NAME_MAX_LENGTH) {
    errors.push(`First name must be ${FIRST_NAME_MAX_LENGTH} characters or less.`);
  }
  if (typeof input?.lastName !== "string" || !input.lastName.trim()) {
    errors.push("Last name is required.");
  } else if (input.lastName.trim().length > LAST_NAME_MAX_LENGTH) {
    errors.push(`Last name must be ${LAST_NAME_MAX_LENGTH} characters or less.`);
  }
  if (typeof input?.displayName !== "string" || !input.displayName.trim()) {
    errors.push("Display name is required.");
  } else if (input.displayName.trim().length > DISPLAY_NAME_MAX_LENGTH) {
    errors.push(`Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or less.`);
  }
  if (!validateEmail(input?.email)) {
    errors.push("A valid email address is required.");
  }
  if (typeof input?.password !== "string" || !input.password) {
    errors.push("Password is required.");
  } else if (input.password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  } else if (input.password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be ${PASSWORD_MAX_LENGTH} characters or less.`);
  }
  if (typeof input?.confirmPassword !== "string" || input.password !== input.confirmPassword) {
    errors.push("Passwords must match.");
  }

  if (
    input?.password &&
    passwordContainsForbiddenValue(input.password, {
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      email: input.email
    })
  ) {
    errors.push("Password cannot contain your first name, last name, display name, or email id.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError(`${fieldName} is required.`);
  }
  return value.trim();
}

export function requireValidObjectId(value, fieldName) {
  const normalized = requireNonEmptyString(value, fieldName);
  if (!mongoose.isValidObjectId(normalized)) {
    throw validationError(`Invalid ${fieldName.toLowerCase()} id.`);
  }
  return new mongoose.Types.ObjectId(normalized);
}

export function requireLength(value, fieldName, maxLength) {
  const normalized = requireNonEmptyString(value, fieldName);
  if (normalized.length > maxLength) {
    throw validationError(`${fieldName} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

export function requireValidUserContent(value, fieldName, maxLength = null) {
  const normalized = requireNonEmptyString(value, fieldName);
  if (maxLength && normalized.length > maxLength) {
    throw validationError(`${fieldName} must be ${maxLength} characters or less.`);
  }

  let cursor = 0;
  while (cursor < normalized.length) {
    const labelStart = normalized.indexOf("[", cursor);
    if (labelStart === -1) break;
    const labelEnd = normalized.indexOf("]", labelStart + 1);
    if (labelEnd === -1) break;
    if (normalized[labelEnd + 1] !== "(") {
      cursor = labelEnd + 1;
      continue;
    }
    const urlEnd = normalized.indexOf(")", labelEnd + 2);
    if (urlEnd === -1) break;

    const label = normalized.slice(labelStart + 1, labelEnd).trim();
    const url = normalized.slice(labelEnd + 2, urlEnd).trim();
    let parsedUrl = null;
    try {
      parsedUrl = new URL(url);
    } catch {
      // The common validation error below intentionally covers malformed URLs.
    }
    if (
      !label ||
      !parsedUrl ||
      !["http:", "https:"].includes(parsedUrl.protocol)
    ) {
      throw validationError(
        `${fieldName} links must use non-empty text and an http:// or https:// URL.`
      );
    }
    cursor = urlEnd + 1;
  }

  return normalized;
}
