export class AppError extends Error {
  constructor(message, { statusCode = 500, code = "INTERNAL_ERROR", details } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new AppError(message, { statusCode: 400, code: "BAD_REQUEST", details });
}

export function notFound(message, details) {
  return new AppError(message, { statusCode: 404, code: "NOT_FOUND", details });
}

export function conflict(message, details) {
  return new AppError(message, { statusCode: 409, code: "CONFLICT", details });
}

export function timeoutError(message, details) {
  return new AppError(message, { statusCode: 504, code: "TIMEOUT", details });
}

export function toErrorResponse(error) {
  return {
    error: error?.message || "Internal server error",
    code: error?.code || "INTERNAL_ERROR",
    details: error?.details || null
  };
}
