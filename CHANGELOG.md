# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.5] - 2026-03-19

### Fixed
- Fix Docker: symlink node binary to /usr/local/bin for custom UID user PATH access

## [1.0.4] - 2026-03-19

### Fixed
- Fix Docker build: install build tools for better-sqlite3 native compilation on Node 24

## [1.0.3] - 2026-03-19

### Fixed
- Fix Docker build: pin pnpm version and relax lockfile check for cross-platform compatibility

## [1.0.2] - 2026-03-19

### Fixed
- Update Playwright Docker base image to v1.58.2 to match npm package version

## [1.0.1] - 2026-03-19

### Added
- noVNC-based remote login for Docker — access a headed browser at `http://<host>:6080` to solve CAPTCHAs
- Xvfb + x11vnc + noVNC installed in Docker image for web-accessible browser sessions

### Fixed
- Dockerfile: replaced corepack with `npm install -g pnpm` (corepack fails in Playwright image)
- Dockerfile: default UID/GID set to 1000:1000 for NAS volume compatibility

## [1.0.0] - 2026-03-19

### Added
- Core bot with Discord.js v14, scaffolded from NameplateBot template
- Meetup.com scraping with Playwright + stealth plugin
- JSON-LD structured data extraction for reliable event details (title, date, location)
- Adaptive polling — scrapes RSVPs/comments more frequently as events approach
- RSVP tracking with delete-and-repost summary embeds showing going/waitlist/not going
- Guest count tracking per attendee (`+1 guest` badges)
- Bot Meetup account filtering via `/config botname`
- Comment tracking — posts individual embeds for new comments on upcoming events
- Configurable event reminders (day-before + hours-before)
- Slash commands: `/config`, `/events`, `/rsvps`, `/status`
- Test commands: `/test-rsvps`, `/test-comments` for previewing embeds with any event URL
- Per-guild Meetup credentials and group URL configuration
- Per-notification-type Discord channel configuration (events, RSVPs, comments, reminders)
- SQLite database for events, RSVPs, comments, RSVP message tracking, scrape health, and sent reminders
- Session persistence — browser state saved/restored between scrapes, auto-refreshed
- Remote login helper (`login-server.js`) for Docker environments via Chrome DevTools Protocol
- Meetup+ popup auto-dismissal during scraping
- Lazy-load handling — scrolls to load all events, attendees, and comments
- Handles both upcoming and past event attendee tab layouts
- First-run detection — seeds database silently without flooding Discord
- Data reset script (`pnpm run reset-data`) preserving config/credentials
- Playwright codegen integration for selector development
- Test scraper utility with login, events, rsvps, comments, debug, and codegen modes
- Docker setup using Playwright base image with browser state persistence
- GitHub Actions workflow for tag-based Docker image publishing to GHCR
- ASCII art startup banner
