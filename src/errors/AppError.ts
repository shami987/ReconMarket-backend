export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
  }
}
