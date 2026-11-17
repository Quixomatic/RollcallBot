/**
 * Post comments to a Meetup event on behalf of an admin, as the bot's Meetup
 * account. Shared by /comment and the dashboard. The admin's name goes in
 * front of the text ("James: see you there") so members can tell who wrote it.
 */

const { queries } = require('../database');
const { getBackend } = require('./backend');
const { MAX_COMMENT_LENGTH } = require('./meetup-api');

/** The text as it will appear on Meetup. */
function formatComment(authorName, text) {
  const name = (authorName || '').trim();
  const body = (text || '').trim();
  return name ? `${name}: ${body}` : body;
}

/**
 * Post (or reply) on a stored event. Returns { text, meetupCommentId, event }.
 *   source: where it came from, for the log ("discord:<user>", "dashboard")
 *   replyTo: Meetup ID of the top-level comment to reply to
 */
async function postAsAdmin({ guildId, eventId, authorName, text, replyTo = null, source }) {
  const event = queries.getEventForGuild().get(eventId, guildId);
  if (!event) throw new Error('That event is not tracked for this server');
  if (!(text || '').trim()) throw new Error('Comment text is empty');

  const full = formatComment(authorName, text);
  if (full.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Too long: ${full.length} characters including your name; Meetup allows ${MAX_COMMENT_LENGTH}`);
  }

  const { meetupCommentId } = await getBackend().postComment(event.url, full, { replyTo });
  console.log(`[comments] ${source} posted ${replyTo ? 'a reply' : 'a comment'} on "${event.title}" as the bot account: ${JSON.stringify(full)}`);
  return { text: full, meetupCommentId, event };
}

module.exports = { postAsAdmin, formatComment, MAX_COMMENT_LENGTH };
