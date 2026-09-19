import type { ErrorRequestHandler, Request } from "express";
import { logger } from "../lib/logger";

type ErrorWithMetadata = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  type?: unknown;
};

function asErrorMetadata(error: unknown): ErrorWithMetadata {
  return typeof error === "object" && error !== null
    ? (error as ErrorWithMetadata)
    : {};
}

function isDatabaseError(error: unknown) {
  const code = asErrorMetadata(error).code;
  return typeof code === "string" && /^(23|08|40|53)/.test(code);
}

function statusForError(error: unknown) {
  const metadata = asErrorMetadata(error);
  if (metadata.name === "ZodError") return 400;
  if (metadata.code === "origin_not_allowed") return 403;
  if (metadata.type === "entity.parse.failed") return 400;
  if (metadata.code === "entity.too.large") return 413;
  if (metadata.code === "23505") return 409;
  if (isDatabaseError(error)) return 503;

  const status = metadata.statusCode ?? metadata.status;
  return typeof status === "number" && status >= 400 && status < 500
    ? status
    : 500;
}

function messageForStatus(status: number, error: unknown) {
  switch (status) {
    case 400:
      return "Invalid request.";
    case 401:
      return "Authentication required.";
    case 403:
      return "Access denied.";
    case 404:
      return "Not found.";
    case 409:
      return "The request conflicts with existing data.";
    case 413:
      return "Request body is too large.";
    case 429:
      return "Too many requests.";
    case 503:
      return "The service is temporarily unavailable.";
    default:
      // Only use a message for an explicitly-created 4xx error. Unexpected
      // failures must never disclose driver, SQL, or Clerk implementation data.
      if (status < 500) {
        const message = asErrorMetadata(error).message;
        return typeof message === "string" && message.length < 200
          ? message
          : "Request failed.";
      }
      return "Internal server error.";
  }
}

function requestContext(req: Request, status: number) {
  return {
    requestId: req.id,
    method: req.method,
    path: req.path,
    status,
  };
}

export const apiErrorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = statusForError(error);
  const context = requestContext(req, status);
  if (status >= 500) {
    logger.error(
      {
        ...context,
        err: error,
      },
      "API request failed",
    );
  } else {
    logger.warn(
      {
        ...context,
        errorName: asErrorMetadata(error).name,
        errorCode: asErrorMetadata(error).code,
      },
      "API request rejected",
    );
  }

  res.status(status).json({ error: messageForStatus(status, error) });
};