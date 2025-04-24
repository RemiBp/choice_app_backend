class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    // Determine status based on statusCode (e.g., 4xx -> 'fail', 5xx -> 'error')
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    // Mark errors created with this class as operational (predictable errors)
    this.isOperational = true;

    // Capture the stack trace, excluding the constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError; 