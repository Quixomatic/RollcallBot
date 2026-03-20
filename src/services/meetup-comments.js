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

/**
 * Detect new comments for an event.
 * Returns array of new comments not yet in the database.
 */
function detectNewComments(eventId, scrapedComments) {
  const newComments = [];

  for (const comment of scrapedComments) {
    const exists = queries.getCommentsForEvent().all(eventId)
      .some((c) => c.comment_id === comment.comment_id);

    if (!exists) {
      newComments.push(comment);
      queries.insertComment().run(
        comment.comment_id, eventId, comment.author_name, comment.content, comment.posted_at,
        comment.likes || 0, comment.parent_comment_id || null
      );
    }
  }

  return newComments;
}

module.exports = { scrapeComments, detectNewComments };
