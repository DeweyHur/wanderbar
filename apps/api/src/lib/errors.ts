export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "로그인이 필요해요");
/** Used for "not a member" too, so outsiders can't tell whether a group exists. */
export const notFound = () => new HttpError(404, "찾을 수 없어요");
export const forbidden = (msg = "권한이 없어요") => new HttpError(403, msg);
