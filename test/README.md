# FCF Test Harness

`test_overlays.js` is a hand-built test harness — DOM/Supabase/localStorage
stubs plus ~488 assertions accumulated across every development session.
It is NOT a standalone script; it gets concatenated with the live `app.js`
before running, so tests always run against current code, not a snapshot.

## Running the tests

```bash
python3 - << 'PYEOF'
tests = open('test/test_overlays.js').read()
stubs, _, body = tests.partition("eval(require('fs').readFileSync('/home/claude/pilot-program/app.js','utf8'));")
app = open('app.js').read()
open('/tmp/combined_test.js','w').write(stubs + "\n" + app + "\n" + body)
PYEOF
node --check /tmp/combined_test.js
TZ=America/Phoenix node /tmp/combined_test.js
```

Always run with `TZ=America/Phoenix` (Chad's real timezone) AND with the
sandbox's default timezone (just `node /tmp/combined_test.js`, no TZ set).
Several real bugs only this session were timezone-dependent — see commit
history around v5.19.35 and v5.19.43 for what that looked like in practice.

## Adding new tests

1. Find the marker near the end of the file: `\n})();\n` (closes the async
   IIFE everything runs inside). Insert new test blocks BEFORE this marker,
   not after — code after it runs outside the IIFE and can silently
   execute in the wrong order relative to async setup earlier in the file.
2. Rebuild the combined file (same snippet as above) after every edit to
   either `test_overlays.js` or `app.js`, then rerun.
3. Prefer dedicated `{ innerHTML: '' }` elements over the shared `_fakeEl`
   for anything that renders sub-elements asynchronously (leaderboards,
   nutrition builder) — reusing `_fakeEl` for both the main render target
   and a sub-element's `document.getElementById` mock causes fire-and-forget
   async renders from OTHER tests to race and overwrite it. This produced
   two false failures in the v5.19.46 session; see that commit message.

## History

An earlier ~400-test version of this suite existed only in a sandbox's
`/tmp` directory and was lost when that sandbox reset — visible in this
file's own boilerplate comment ("the sandbox reset wiped the ~400-test
suite built up over the prior session"). This file is now committed to
the repo specifically so that can't happen again.
