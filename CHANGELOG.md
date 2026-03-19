# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.12] - 2026-03-19

### Added
- 3-hour grace period: keep quick polling during in-progress events (every 5 min after start time)

### Fixed
- Fix duplicate comment notifications: exclude relative timestamp from comment hash (was changing every scrape)

## [1.0.11] - 2026-03-19

### Changed
- Two-tier polling: full event listing scrape on base interval, quick poll (RSVPs, comments, event changes) only for the next imminent event
- Adaptive quick poll intervals: 15min within 24h, 5min within 8h, 2min within 2h
- Quick poll checks event detail page for time/location/title changes

## [1.0.10] - 2026-03-19

### Added
- `/config enable` and `/config disable` commands to toggle polling per server

### Fixed
- Fix events table primary key to support multiple guilds monitoring the same Meetup group

## [1.0.9] - 2026-03-19

### Added
- `/poll` command to manually trigger a scrape cycle on demand (Administrator)

## [1.0.8] - 2026-03-19

### Fixed
- Fix Docker: stop purging build tools (apt removes nodejs as a dependency)

## [1.0.7] - 2026-03-19

### Fixed
- Fix Docker: use absolute node path in CMD, explicit ENV PATH, remove autoremove, add node version check

## [1.0.6] - 2026-03-19

### Fixed
- Fix Docker: prevent apt-get autoremove from removing nodejs when purging build tools

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
