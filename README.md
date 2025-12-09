# orpc-json-diff

JSON diff utilities for oRPC streaming responses. Implements incremental patches to reduce bandwidth for streaming data updates.

Inspired by [trpc-live's JSON diff approach](https://github.com/strblr/trpc-live?tab=readme-ov-file#json-diff).

## Installation

```bash
npm install orpc-json-diff
```

## Server Usage

Wrap your async generator with `withJsonDiff` to automatically compute and send JSON patches:

```typescript
import { withJsonDiff } from "orpc-json-diff/server";

export const contacts = base.router({
  liveList: base.use(oboMiddleware).handler(
    withJsonDiff(async function* ({ context, signal }) {
      yield await getContactsList(context.graphClient);

      const publisher = await getOrCreateContactsSubscription(
        context.graphClient,
        context.sessionId,
      );

      try {
        for await (const _ of publisher.subscribe("contact-updated", {
          signal,
        })) {
          yield await getContactsList(context.graphClient);
        }
      } finally {
        await releaseContactsSubscription(
          context.sessionId,
          context.graphClient,
        );
      }
    }),
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
