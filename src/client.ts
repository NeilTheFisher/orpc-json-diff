import { type ClientContext, mapEventIterator } from "@orpc/client";
import type {
  StandardLinkOptions,
  StandardLinkPlugin,
} from "@orpc/client/standard";
import { isAsyncIteratorObject } from "@orpc/shared";
import { applyPatch, type Operation } from "fast-json-patch";

interface JsonDiffResult<T> {
  patch: Operation[];
  data?: T;
}

/**
 * Checks if a value looks like a JSON diff result
 */
function isJsonDiffResult(value: unknown): value is JsonDiffResult<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "patch" in value &&
    Array.isArray((value as JsonDiffResult<unknown>).patch)
  );
}

/**
 * Client-side plugin that reconstructs full objects from JSON patches
 * sent by the server's `withJsonDiff` utility.
 *
 * For streaming responses:
 * - Initial response: { data: {...}, patch: [] }
 * - Updates: { patch: [...] }
 *
 * This plugin applies patches to reconstruct the full object before
 * yielding to the consumer.
 */
export class JsonDiffPlugin<T extends ClientContext = ClientContext>
  implements StandardLinkPlugin<T>
{
  order = 1e6; // Run early in the interceptor chain

  init(options: StandardLinkOptions<T>) {
    options.clientInterceptors ??= [];

    options.clientInterceptors.push(async (interceptorOptions) => {
      const response = await interceptorOptions.next();

      let currentState: unknown = null;

      return {
        ...response,
        body: async () => {
          const bodyValue = await response.body();

          if (!isAsyncIteratorObject(bodyValue)) {
            return bodyValue;
          }

          return mapEventIterator(bodyValue, {
            value(value, _done) {
              const chunk = (value as { json: unknown }).json;

              if (!chunk) {
                console.warn(
                  "[JsonDiffPlugin] Received chunk without json property"
                );
                return Promise.resolve(value);
              }

              if (!isJsonDiffResult(chunk)) {
                return Promise.resolve(value);
              }

              if (chunk.data !== undefined) {
                // Initial response
                currentState = chunk.data;
              } else {
                // mutate current state with patch
                applyPatch(currentState, chunk.patch);
              }

              return Promise.resolve({ json: currentState });
            },
            error(error) {
              throw error;
            },
          });
        },
      };
    });
  }
}
