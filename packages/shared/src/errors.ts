/**
 * Custom error classes for the application.
 * Used across API, Worker, and Web services.
 */

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: Record<string, unknown>) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(404, message, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(429, message, 'RATE_LIMIT_ERROR');
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', public originalError?: Error) {
    super(500, message, 'INTERNAL_SERVER_ERROR');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(serviceName: string) {
    super(503, `${serviceName} is temporarily unavailable`, 'SERVICE_UNAVAILABLE_ERROR');
  }
}

export class DestinationError extends AppError {
  constructor(message: string) {
    super(502, message, 'DESTINATION_ERROR');
  }
}

export class SSRFProtectionError extends AppError {
  constructor(url: string) {
    super(400, `Access to URL ${url} is not permitted (SSRF protection)`, 'SSRF_PROTECTION_ERROR');
  }
}
