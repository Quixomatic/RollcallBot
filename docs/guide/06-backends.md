---
title: Backends
order: 6
---

# Backends: GraphQL and browser

`MEETUP_BACKEND` chooses how the bot reads Meetup. Change it in `.env` and restart the container.

| | `graphql` (default) | `browser` |
|---|---|---|
| How | Meetup's own GraphQL API over plain HTTP | Loads and scrapes Meetup pages in a headless browser |
| Speed | A full poll takes well under a second | Several seconds per page |
| Cancellations | Only when Meetup says `CANCELLED` | Inferred when an event disappears from the listing |
| RSVPs | Exact, matched to Meetup's own counts | Can miss people on long lists, and can count the bot itself |
| Capacity, pinned comments, IDs | Yes | No |
| Posting comments (`/comment`) | Yes | No |
| Breaks when | Meetup renames a field the bot uses (the daily check catches it) | Meetup restyles a page |

Both use the same session file and database and store data under the same keys, so **switching either way is safe**: nothing gets re-posted and no data needs converting. If Meetup changes its API and the daily check starts failing, switching to `browser` keeps the bot running while it's fixed.

The full technical reference is under [Meetup API](/docs/api).
