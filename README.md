# orpc-json-diff

[![npm version](https://img.shields.io/npm/v/orpc-json-diff.svg)](https://www.npmjs.com/package/orpc-json-diff)

**Lightweight** JSON patching for oRPC streaming responses. Only send deltas, not whole objects.

## Motivation

When streaming large JSON objects that update frequently, re-sending the entire payload each time is wasteful. This library compresses event streams into incremental patches so only changes are transmitted, making it ideal for dashboards, state sync, and collaborative apps.

For example, instead of handling many per-field socket events:

```typescript
socket.on("data-update", (newData) => updateData(newData));
socket.on("data-nested-field-update", (newField) => updateNested(newField));
```

You can stream the whole object once and let the client apply diffs:

```typescript
for await (const newData of await orpc.data.live()) {
  doSomethingWith(newData);
}
```

## Install

```bash
bun add orpc-json-diff
pnpm add orpc-json-diff
npm i orpc-json-diff
```

## Server Usage

```typescript
import { os, EventPublisher } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { JsonDiffPlugin } from "orpc-json-diff/server";

const pub = new EventPublisher<{ update: object }>();

const router = os.router({
  live: os.handler(async function* ({ signal }) {
    yield await getInitial();
    for await (const update of pub.subscribe("update", { signal })) {
      yield update;
    }
  }),
});

// Add the plugin to your RPC handler, applying the JSON diffing to every event iterator.
const handler = new RPCHandler(router, {
  plugins: [new JsonDiffPlugin()],
});
```

## Client Usage

```typescript
import { RPCLink } from "@orpc/client/fetch";
import { JsonDiffPlugin } from "orpc-json-diff/client";

// Add the plugin to your RPC link
const rpcLink = new RPCLink({
  url: `${window.location.origin}/rpc`,
  plugins: [new JsonDiffPlugin()],
});
```

## Behavior

- First event: `{ patch: [], data: {...} }` (full object)
- Subsequent events: `{ patch: [...] }` (incremental changes)
- Client plugin reconstructs full object automatically

## Note

- OpenAPI generation may not yet reflect streaming diffs in schemas.
