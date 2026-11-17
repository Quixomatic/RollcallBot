Runs a full poll and a quick poll for this server right now, the same as pressing **Poll now** on the dashboard.

- Also clears a "session expired" pause and re-reads the session file, so it's handy right after replacing `state.json` by hand.
- If a poll is already running, it says so instead of starting a second one. Try again a moment later.
- Anything that changed is posted to the usual channels.
