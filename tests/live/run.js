// `pnpm test:live`: run the live (read-only) Meetup tests with LIVE=1 set,
// the same way on Windows and Linux.
const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(process.execPath, ['--test', 'tests/live/*.test.js'], {
  cwd: path.join(__dirname, '..', '..'),
  stdio: 'inherit',
  env: { ...process.env, LIVE: '1' },
});
process.exit(result.status ?? 1);
