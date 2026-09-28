export function errText(err: unknown): string {
    const e = err as { code?: string; message?: string };
    return e.code || e.message || 'Unknown error';
  }