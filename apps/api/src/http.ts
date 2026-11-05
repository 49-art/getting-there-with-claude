import type { Context } from 'hono';
import type { AppEnv } from './env.ts';

export type ErrorCode =
  | 'bad_request'
  | 'unauthorised'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'username_taken'
  | 'insufficient_chips'
  | 'rate_limited'
  | 'plan_limit'
  | 'invalid_message'
  | 'invalid_move'
  | 'too_fast'
  | 'server_error';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorised: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  username_taken: 409,
  insufficient_chips: 402,
  rate_limited: 429,
  plan_limit: 403,
  invalid_message: 422,
  invalid_move: 422,
  too_fast: 429,
  server_error: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const fail = (code: ErrorCode, message: string, details?: unknown): never => {
  throw new ApiError(code, message, details);
};

export function errorResponse(c: Context<AppEnv>, err: unknown): Response {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, STATUS[err.code] as 400);
  }
  console.error('Unhandled error', err);
  return c.json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } }, 500);
}

export async function readJson<T>(c: Context<AppEnv>): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return fail('bad_request', 'Request body must be JSON.');
  }
}

/** Client IP for rate limiting (Cloudflare sets this header on every request). */
export const clientIp = (c: Context<AppEnv>): string => c.req.header('cf-connecting-ip') ?? 'local';
