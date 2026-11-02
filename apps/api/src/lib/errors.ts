/**
 * API errors carry a stable code (e.g. "invite.expired"); the apps translate codes into text.
 * Never put user-facing sentences here.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export const unauthorized = (code = "auth.required") => new HttpError(401, code);
/** Used for "not a member" too, so outsiders can't tell whether a group exists. */
export const notFound = (code = "not_found") => new HttpError(404, code);
export const forbidden = (code = "forbidden") => new HttpError(403, code);
export const badRequest = (code = "bad_request") => new HttpError(400, code);
