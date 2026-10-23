// Checks every Flight Deck Wisdom "Read more" link. Run: node tests/check-wisdom-links.js
// 403 from cdc.gov, mayoclinic.org, heart.org and acefitness.org is bot blocking
// (their home pages 403 too); they open fine in a phone browser. Anything else
// that is not a plain 200 is listed. Reported Oct 22 2026: briefing 22 was a 404.
const fs = require('fs'), https = require('https'), http = require('http');
const s = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const start = s.indexOf('const WISDOM = ['); const end = s.indexOf('\n];', start);
const W = eval(s.slice(start + 'const WISDOM = '.length, end + 3));
const BOT_BLOCKED = /cdc\.gov|mayoclinic\.org|heart\.org|acefitness\.org/;
const head = url => new Promise(res => {
  const mod = url.startsWith('https') ? https : http;
  const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 25000 }, r => { res({ code: r.statusCode, loc: r.headers.location }); r.resume(); });
  req.on('error', e => res({ code: 'ERR ' + e.code })); req.on('timeout', () => { req.destroy(); res({ code: 'TIMEOUT' }); });
});
(async () => {
  let bad = 0;
  for (const [i, w] of W.entries()) {
    if (!w.link) { console.log('NO LINK  ' + (i + 1) + ' ' + w.title); bad++; continue; }
    const r = await head(w.link);
    const ok = r.code === 200 || (r.code === 403 && BOT_BLOCKED.test(w.link));
    if (!ok) { console.log(r.code + ' ' + (r.loc ? '-> ' + r.loc + ' ' : '') + (i + 1) + ' ' + w.title + ' ' + w.link); bad++; }
  }
  console.log(bad ? bad + ' link problems' : 'all ' + W.length + ' links ok'); process.exit(bad ? 1 : 0);
})();
