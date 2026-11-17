Posts a comment on an upcoming Meetup event **as the bot's Meetup account**, signed with your name so members know who wrote it.

```
/comment event:Tue Nov 17, 7:00 PM · Tuesday RPS Pickup text:We're on Field #2 tonight
```

appears on Meetup, posted by the bot's account, as:

> James: We're on Field #2 tonight

- **event** autocompletes from the upcoming events the bot tracks. Start typing a day or title to filter.
- Your **server nickname** is used as the signature (or your Discord display name if you don't have one).
- Meetup allows **700 characters including the name**.
- You get a private confirmation with a link to the event. The comment then shows up in the comments channel on the next poll, like any other.
- To reply to a specific comment or delete one of the bot's comments, use the event page on the dashboard.
- Needs the GraphQL backend (the default).
