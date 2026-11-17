const { getPage, saveSession } = require('./scraper');
const { queries } = require('../database');
const { dismissMeetupPlusPopup, extractComments } = require('../utils/selectors');
const crypto = require('crypto');

/**
 * Scrape comments for a specific event page.
 */
async function scrapeComments(eventUrl) {
  const page = await getPage();
  const comments = [];

  try {
    console.log(`[meetup-comments] Scraping comments: ${eventUrl}`);
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissMeetupPlusPopup(page);

    const extracted = await extractComments(page);

    // First pass: assign comment_id hashes to all comments
    // Build a list of top-level comment hashes indexed by parent_index
    const topLevelHashes = {};
    for (const c of extracted) {
      // Hash on author + content only — timestamp is relative ("3 minutes ago") and changes every scrape
      const commentId = crypto.createHash('md5').update(`${c.author_name}:${c.content}`).digest('hex');
      if (!c.is_reply) {
        topLevelHashes[comments.length] = commentId;
      }
      // Compute parent_comment_id for replies
      let parentCommentId = null;
      if (c.is_reply && c.parent_index != null) {
        // Find the parent comment in extracted array and hash its author+content
        const parentComment = extracted.filter((p) => !p.is_reply)[c.parent_index];
        if (parentComment) {
          parentCommentId = crypto.createHash('md5').update(`${parentComment.author_name}:${parentComment.content}`).digest('hex');
        }
      }
      comments.push({ comment_id: commentId, ...c, parent_comment_id: parentCommentId });
    }

    console.log(`[meetup-comments] Found ${comments.length} comment(s)`);
    await saveSession();
  } catch (err) {
    console.error('[meetup-comments] Scrape error:', err.message);
    throw err;
  } finally {
    await page.close();
  }

  return comments;
}

const normalizeText = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Detect new comments for an event.
 * Returns array of new comments not yet in the database.
 *
 * Both backends key comments by md5(author:content). The GraphQL backend also
 * supplies Meetup's comment ID and creation time, which catch two cases the
 * hash alone gets wrong:
 *   - an edited comment keeps its Meetup ID, so it isn't re-posted as new;
 *   - after switching from the browser backend, text that rendered slightly
 *     differently in the DOM still matches by normalized text, and anything
 *     created before the last comment we stored for this event was already
 *     visible to an earlier poll, so it is recorded silently, not re-posted.
 */
function detectNewComments(eventId, scrapedComments) {
  const newComments = [];
  const stored = queries.getCommentsForEvent().all(eventId);
  const storedIds = new Set(stored.map((c) => c.comment_id));
  const storedMeetupIds = new Set(stored.map((c) => c.meetup_comment_id).filter(Boolean));
  const storedText = new Set(stored.map((c) => `${normalizeText(c.author_name)}\0${normalizeText(c.content)}`));
  const lastStoredAt = stored.reduce((max, c) => {
    const t = Date.parse(`${c.first_seen_at}Z`); // SQLite stores UTC without a zone
    return isNaN(t) ? max : Math.max(max, t);
  }, 0);

  const insert = (comment) => queries.insertComment().run(
    comment.comment_id, eventId, comment.author_name, comment.content, comment.posted_at,
    comment.likes || 0, comment.parent_comment_id || null, comment.meetup_comment_id || null
  );

  for (const comment of scrapedComments) {
    if (storedIds.has(comment.comment_id)) {
      if (comment.meetup_comment_id) queries.setCommentMeetupId().run(comment.meetup_comment_id, comment.comment_id);
      continue;
    }

    if (comment.meetup_comment_id) {
      const created = Date.parse(comment.created || '');
      const alreadySeen = storedMeetupIds.has(comment.meetup_comment_id)
        || storedText.has(`${normalizeText(comment.author_name)}\0${normalizeText(comment.content)}`)
        || (lastStoredAt > 0 && !isNaN(created) && created < lastStoredAt);
      if (alreadySeen) {
        insert(comment); // record under this key so later polls match directly
        continue;
      }
    }

    newComments.push(comment);
    insert(comment);
  }

  return newComments;
}

module.exports = { scrapeComments, detectNewComments };
