import { compare, type Operation } from "fast-json-patch";

export interface JsonDiffResult<T> {
  patch: Operation[];
  data?: T;
}

/**
 * Higher-order async generator that wraps another generator and yields JSON patches
 * instead of full data objects (except for the initial response).
 *
 * Inspired by [trpc-live's JSON diff approach](https://github.com/strblr/trpc-live?tab=readme-ov-file#json-diff).
 *
 * @param fn - The original async generator function
 * @returns A new async generator that yields JSON patches (cast as T for type safety)
 */
export function withJsonDiff<TOpts, T>(fn: (opts: TOpts) => AsyncGenerator<T>) {
  return async function* (opts: TOpts): AsyncGenerator<T> {
    let previous: T | null = null;

    for await (const data of fn(opts)) {
      if (previous === null) {
        yield { patch: [], data: data } as T;
      } else {
        const patch = compare(previous as object, data as object);
        yield { patch } as T;
      }
      previous = data;
    }
  };
}
