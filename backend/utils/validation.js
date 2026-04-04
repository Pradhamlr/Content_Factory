import { badRequest } from "./errors.js";

export function requireNonEmptyString(value, fieldName) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw badRequest(`Request body must include a non-empty "${fieldName}" string.`, { field: fieldName });
  }

  return value.trim();
}

export function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`Request body must include "${fieldName}".`, { field: fieldName });
  }

  return value;
}

export function requireOneOf(value, fieldName, allowedValues) {
  if (!allowedValues.includes(value)) {
    throw badRequest(`Request body must include a valid "${fieldName}".`, { field: fieldName, allowedValues });
  }

  return value;
}
