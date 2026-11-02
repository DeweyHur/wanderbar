export async function confirm(message: string, _ok: string, _cancel: string): Promise<boolean> {
  return window.confirm(message);
}
