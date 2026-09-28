export function errText(err: unknown): string {
    const e = err as { code?: string; message?: string };
    return e.code || e.message || 'Unknown error';
  }
  
  export async function runWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    let index = 0;
  
    async function next() {
      while (index < items.length) {
        const current = index++;
        results[current] = await worker(items[current]);
      }
    }
  
    const workers = Array.from({ length: Math.min(limit, items.length) }, next);
    await Promise.all(workers);
    return results;
  }