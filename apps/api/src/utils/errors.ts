/**
 * AppError — structured application error with HTTP status code.
 * Use `throw new AppError(message, statusCode)` instead of:
 *   const e = new Error(msg); (e as Error & { statusCode: number }).statusCode = 404; throw e;
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(message, 404);
  }

  static badRequest(message: string): AppError {
    return new AppError(message, 400);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409);
  }

  static serviceUnavailable(message: string): AppError {
    return new AppError(message, 503);
  }
}
