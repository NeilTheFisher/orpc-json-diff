# orpc-json-diff

JSON diff utilities for oRPC streaming responses. Implements incremental patches to reduce bandwidth for streaming data updates.

Inspired by [trpc-live's JSON diff approach](https://github.com/strblr/trpc-live?tab=readme-ov-file#json-diff).

## Motivation

When streaming large JSON objects that change slightly over time, sending the entire object on each update wastes bandwidth. By sending only the differences (patches) between successive states, we can significantly reduce the amount of data transmitted. This is especially useful for applications with real-time data updates, such as dashboards or collaborative tools.

I wanted to be able to send a large JSON object that updates frequently, without re-sending the entire object each time. This library provides a simple way to achieve that with oRPC.

For example, a project using websockets to update a JSON object could be done like this:

```typescript
// Tedious, don't do this
socket.on("data-update", (newData) => updateData(newData));
socket.on("data-fieldA-update", (newFieldA) => updateDataFieldA(newFieldA));
socket.on("data-fieldB-update", (newFieldB) => updateDataFieldB(newFieldB));
// And then logic to merge the updates into the existing object somewhere and to trigger updates...
```

Or, you could just stream the entire object and let the client handle the diffs efficiently:

```typescript
// [Basic oRPC event iterator usage](https://orpc.dev/docs/client/event-iterator#basic-usage)
for await (const newData of await orpc.data.live()) {
  doSomethingWith(newData);
}
```

## Installation

```bash
npm install orpc-json-diff
```

## Server Usage

Wrap your async generator with `withJsonDiff` to automatically compute and send JSON patches:

```typescript
import { EventPublisher, os } from "@orpc/server";
import { withJsonDiff } from "orpc-json-diff/server";

const publisher = new EventPublisher<{ "large-payload-updated": object }>();

export const payloads = os.router({
  getLarge: os.handler(
    withJsonDiff(async function* ({ context, signal }) {
      yield await getLargePayload();

      for await (const largePayload of publisher.subscribe(
        "large-payload-updated",
        {
          signal,
        }
      )) {
        yield largePayload;
      }
    })
  ),
});
```

## Client Usage

Register the `JsonDiffPlugin` with your oRPC link:

```typescript
import { RPCLink } from "@orpc/client/fetch";
import { JsonDiffPlugin } from "orpc-json-diff/client";

const rpcLink = new RPCLink({
  url: `${window.location.origin}/rpc`,
  plugins: [new JsonDiffPlugin()],
});
```

The plugin automatically reconstructs full objects from patches, so your consumer code doesn't need to change.

## How It Works

**Server:**

- First yield sends full data with empty patch array: `{ patch: [], data: {...} }`
- Subsequent yields send only patches: `{ patch: [{ op: "replace", path: "/contacts/0/displayName", ... }] }`

**Client:**

- Initial response sets the current state
- Updates apply patches to reconstruct the full object
- Yields the complete, up-to-date object every time

## Limitations

- Doesn't work properly yet with OpenAPI schema generation tools due to the wrapped handler signature.
