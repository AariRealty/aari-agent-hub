# The preview route, the half that has to be pasted in

`hub.joinaari.com/?preview=next` is meant to serve the new portal build
instead of the live payload, so the new Hub can be looked at without
replacing anything.

Two halves. One is in this repo. One is not.

## Done, in this repo

`index.html` passes `&preview=next` through to `realty-hub` when the page URL
carries `?preview=next`. Without the query string the request is byte for byte
what it was before.

## Not done: `realty-hub`

The edge function is not in this repo, there is no Supabase CLI in the build
container, and no credentials to pull it. Deploying it would mean retyping a
roughly 300 line production function by hand from a tool result, and that
function serves the Hub the agents use every day. A single transcription slip
takes the Hub down. That is not a reasonable trade for a preview.

So it needs pasting in through the Supabase dashboard: Edge Functions,
`realty-hub`, edit, then deploy.

**Find this line**, near the bottom, just after the POST block closes:

```ts
  let html = await loadModule('hub_payload.html')
```

**Insert immediately above it:**

```ts
  // Preview route. Broker only, opt in by query string. Serves the new portal
  // build straight from the bucket with no fragment slots, since it does not
  // have them. Falls through to the normal payload for everyone else, so
  // default behaviour is unchanged.
  if (new URL(req.url).searchParams.get('preview') === 'next' && member.role === 'broker') {
    const next = await loadModule('hub_next.html')
    if (!next) return json({ error: 'preview_unavailable' }, 404)
    await audit(user.id, 'realty_member', 'realty_hub_preview', 'realty_members', user.id, { build: 'hub_next.html' }, req)
    return new Response(next, { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }

```

Nothing else changes. An agent who adds the query string still gets the normal
Hub, because the role check fails for them.

## Why this is safe to sit unpasted

The new build is not in the bucket yet either. Until `hub_next.html` is added
to the publish workflow and pushed to main, the route would answer 404. Both
halves have to be in place before anything is visible, and neither one alters
the live Hub on its own.

## Why the host page can serve a whole document

`index.html` already does `document.open(); document.write(html); document.close()`,
so it replaces the page rather than injecting a fragment. A complete HTML
document is exactly what it wants. The new build's own sign in gate then finds
the session already in local storage, same origin and same project, and passes
straight through without asking twice.
