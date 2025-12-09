import type { Meta } from "@orpc/contract";
import type { ProcedureClientInterceptorOptions } from "@orpc/server";
import type {
  StandardHandlerOptions,
  StandardHandlerPlugin,
} from "@orpc/server/standard";
import type { Promisable, Value } from "@orpc/shared";
import { isAsyncIteratorObject, value } from "@orpc/shared";
import { compare, type Operation } from "fast-json-patch";

export interface JsonDiffResult<T> {
  patch: Operation[];
  data?: T;
}

// biome-ignore lint/suspicious/noExplicitAny: Matches oRPC's Context type definition
type Context = Record<PropertyKey, any>;

export interface JsonDiffPluginOptions<T extends Context> {
  /**
   * Filter to include specific procedures for JSON diff processing.
   *
   * This can be a boolean, or a predicate function that receives
   * `ProcedureClientInterceptorOptions` and returns a boolean/promisable boolean.
   *
   * Note: Metadata on procedures takes priority over this option.
   *
   * @default false (disabled unless enabled via metadata or this option)
   */
  include?: Value<
    Promisable<boolean>,
    [options: ProcedureClientInterceptorOptions<T, Record<never, never>, Meta>]
  >;
}

/**
 * Server-side plugin that transforms async iterator responses into JSON patches
 * to reduce bandwidth usage.
 *
 * For streaming responses:
 * - Initial response: { data: {...}, patch: [] }
 * - Updates: { patch: [...] }
 *
 * Inspired by [trpc-live's JSON diff approach](https://github.com/strblr/trpc-live?tab=readme-ov-file#json-diff).
 *
 * This plugin detects handlers that return async iterators and automatically
 * applies JSON diff compression to their output.
 */
export class JsonDiffPlugin<T extends Context = Context>
  implements StandardHandlerPlugin<T>
{
  private readonly include: Exclude<
    JsonDiffPluginOptions<T>["include"],
    undefined
  >;

  constructor(options: JsonDiffPluginOptions<T> = {}) {
    this.include = options.include ?? false;
  }

  order = 1e6; // Run late in the handler chain

  init(options: StandardHandlerOptions<T>) {
    options.clientInterceptors ??= [];

    options.clientInterceptors.push(async (interceptorOptions) => {
      const meta = interceptorOptions.procedure["~orpc"].meta;

      const included =
        meta.jsonDiff === true ||
        (await value(this.include, interceptorOptions));

      if (!included) {
        return interceptorOptions.next();
      }

      const result = await interceptorOptions.next();

      // Only process async iterators
      if (!isAsyncIteratorObject(result)) {
        return result;
      }

      // Wrap the async iterator with JSON diff logic
      return this.wrapAsyncIterator(result);
    });
  }

  private async *wrapAsyncIterator<TData>(
    iterator: AsyncIterableIterator<TData>
  ): AsyncGenerator<TData> {
    let previous: TData | null = null;

    for await (const data of iterator) {
      if (previous === null) {
        // First response includes full data
        yield { patch: [], data } as TData;
      } else {
        // Subsequent responses include only patches
        const patch = compare(previous as object, data as object);
        yield { patch } as TData;
      }
      previous = data;
    }
  }
}
