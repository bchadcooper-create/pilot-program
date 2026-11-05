"""Builds tools/faa-medication-checker.html from FAA_MEDS in app.js.

The public checker and the in-app Medication check read the same list, so
the page is generated, never edited by hand. Run after build_faa_meds.py
(which calls this at the end) or on its own:

    python3 docs/build_med_page.py

Every medication is written into the page as plain HTML, so search engines
can read all of them; the search box only filters what is already there.
"""
import html
import json
import os
import re
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'app.js')
OUT = os.path.join(ROOT, 'tools', 'faa-medication-checker.html')
URL = 'https://flightcrew.fit/tools/faa-medication-checker.html'

src = open(APP, encoding='utf-8').read()
start = src.index('const FAA_MEDS = [') + len('const FAA_MEDS = [')
end = src.index('];', start)
MEDS = json.loads('[' + src[start:end].rstrip().rstrip(',') + ']')
checked = re.search(r"const MEDICAL_GUIDE_CHECKED = '([^']+)'", src).group(1)

BUCKET = {
    'ok':  ('OK', 'ok', 'Generally accepted'),
    'dnf': ('WAIT', 'wait', 'Do not fly until the wait has passed'),
    'si':  ('SI', 'si', 'Special issuance path'),
    'dni': ('DNI', 'dni', 'Do not issue'),
}


def esc(s):
    return html.escape(s or '', quote=True)


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def find(generic):
    for m in MEDS:
        if m['g'].lower() == generic.lower():
            return m
    raise SystemExit('FAQ medication missing from FAA_MEDS: ' + generic)


def plain(m):
    """One sentence for an FAQ answer, built from the list entry itself."""
    label = BUCKET[m['k']][2]
    out = m['g'] + (' (' + m['b'] + ')' if m['b'] else '') + ': ' + label + '. '
    if m.get('wait'):
        out += 'No-fly wait: ' + m['wait'] + '. '
    return out + m['n']


# FAQ answers come from the list, so they can never disagree with it.
FAQ = [
    ('Is Zoloft (sertraline) FAA approved for pilots?', plain(find('sertraline'))),
    ('How long after taking Benadryl can a pilot fly?', plain(find('diphenhydramine'))),
    ('Can pilots take Ozempic or Wegovy?', plain(find('semaglutide'))),
    ('How long after Ambien can a pilot fly?', plain(find('zolpidem'))),
    ('Can pilots take Viagra or Cialis?', plain(find('sildenafil')) + ' ' + plain(find('tadalafil'))),
    ('What do DNI and DNF mean on the FAA medication list?',
     'The FAA groups medications into Do Not Issue (DNI), which an Aviation Medical Examiner cannot certify while you take them, and Do Not Fly (DNF), which you may take but must not fly while they are active, usually five times the drug\'s longest half-life or a specific wait the FAA sets. Source: the FAA AME Guide, Do Not Issue / Do Not Fly page.'),
]


def entry(m):
    short, cls, label = BUCKET[m['k']]
    tag = short + (' · ASK AME' if m.get('flag') else '')
    words = ' '.join([m['g'], m.get('b', ''), m.get('a', '')]).lower()
    parts = ['<div class="med" id="' + slug(m['g']) + '" data-s="' + esc(words) + '">',
             '<div class="mh"><div><h3>' + esc(m['g']) + '</h3>',
             ('<div class="brands">' + esc(m['b']) + '</div>' if m['b'] else ''),
             '</div><span class="tag ' + cls + '" title="' + esc(label) + '">' + esc(tag) + '</span></div>']
    if m.get('wait'):
        parts.append('<div class="wait"><span>No-fly wait:</span> ' + esc(m['wait']) + '</div>')
    parts.append('<p>' + esc(m['n']) + '</p></div>')
    return ''.join(parts)


letters = {}
for m in sorted(MEDS, key=lambda x: x['g'].lower()):
    ch = m['g'][0].upper()
    if not ch.isalpha():
        ch = '#'
    letters.setdefault(ch, []).append(m)

index_links = ' '.join('<a href="#letter-' + ch + '">' + ch + '</a>' for ch in letters)
groups = ''.join('<section class="letter" id="letter-' + ch + '"><h2>' + ch + '</h2>' + ''.join(entry(m) for m in ms) + '</section>'
                 for ch, ms in letters.items())
counts = {k: sum(1 for m in MEDS if m['k'] == k) for k in BUCKET}

ld = {
    '@context': 'https://schema.org',
    '@graph': [
        {'@type': 'WebApplication', '@id': URL + '#app', 'name': 'FAA Medication Checker for Pilots', 'url': URL,
         'applicationCategory': 'HealthApplication', 'operatingSystem': 'Any', 'isAccessibleForFree': True,
         'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
         'description': 'Search %d medications against the FAA Do Not Issue and Do Not Fly lists, with the FAA wait times.' % len(MEDS),
         'publisher': {'@type': 'Organization', 'name': 'Flight Crew Fitness', 'url': 'https://flightcrew.fit/'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://flightcrew.fit/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'FAA medication checker', 'item': URL}]},
        {'@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in FAQ]},
    ],
}

faq_html = ''.join('<details><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>' for q, a in FAQ)

page = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FAA Approved Medications for Pilots: Free Checker | Flight Crew Fitness</title>
<meta name="description" content="Is your medication FAA approved? Search %(n)d prescription and over-the-counter drugs against the FAA Do Not Issue and Do Not Fly lists, with wait times. Free, no signup.">
<link rel="canonical" href="%(url)s">
<meta property="og:type" content="website">
<meta property="og:title" content="Is my medication FAA approved? Free checker for pilots">
<meta property="og:description" content="%(n)d medications checked against the FAA AME Guide: accepted, wait times, special issuance and do not issue. Free, no signup.">
<meta property="og:url" content="%(url)s">
<meta property="og:image" content="https://flightcrew.fit/og-image.png">
<meta property="og:site_name" content="Flight Crew Fitness">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0a0f1a">
<link rel="icon" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">%(ld)s</script>
<style>
.tool{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;margin:0 0 22px}
.tool label{display:block;font-size:.8125rem;color:var(--text);font-weight:600;margin:0 0 6px}
.tool input{width:100%%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:10px;padding:12px;font-size:1rem;font-family:var(--sans);min-height:46px;-webkit-appearance:none;appearance:none}
.tool input:focus{outline:2px solid var(--gold);outline-offset:1px}
.count{font-size:.8125rem;color:var(--muted);margin:10px 0 0}
.legend{font-size:.8125rem;line-height:1.8;margin:0 0 20px}
.legend .tag{margin-right:6px}
.tag{font-family:var(--mono);font-size:.6875rem;letter-spacing:.08em;border:1px solid;border-radius:5px;padding:2px 7px;white-space:nowrap}
.tag.ok{color:#4ade80;border-color:rgba(74,222,128,.6)}.tag.wait,.tag.si{color:#fbbf24;border-color:rgba(251,191,36,.6)}.tag.dni{color:#f87171;border-color:rgba(248,113,113,.7)}
.az{font-family:var(--mono);font-size:.8125rem;line-height:2;margin:0 0 10px;word-spacing:6px}
.az a{color:var(--gold2)}
.letter h2{font-family:var(--mono);color:var(--gold);font-size:1rem;letter-spacing:.12em;border-bottom:1px solid var(--border);padding-bottom:6px;margin:26px 0 4px}
.med{padding:12px 0;border-bottom:1px solid var(--border)}
.med .mh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.med h3{font-size:1rem;margin:0;color:#fff;text-transform:capitalize}
.med .brands{font-size:.8125rem;color:var(--muted);margin-top:2px}
.med .wait{font-size:.875rem;margin-top:6px}.med .wait span{color:var(--muted)}
.med p{font-size:.875rem;color:var(--muted);line-height:1.55;margin:6px 0 0}
.none{display:none;font-size:.875rem;color:var(--muted);padding:10px 0}
details{border-bottom:1px solid var(--border);padding:10px 0}
details summary{cursor:pointer;font-weight:600;color:#fff}
details p{color:var(--muted);font-size:.9rem;line-height:1.6}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.btn2{display:inline-block;background:transparent;border:1px solid var(--gold);color:var(--gold2);font-weight:700;font-size:.8125rem;letter-spacing:.04em;text-transform:uppercase;padding:12px 16px;border-radius:10px;cursor:pointer;font-family:var(--sans)}
.btn2:hover{background:rgba(201,168,76,.1)}
.private{font-size:.75rem;color:var(--muted);margin-top:12px}
.more{font-size:.9rem;color:var(--muted);line-height:1.6;margin:0 0 12px}
.hide{display:none}
</style>
</head>
<body>
<header class="top"><div class="wrap wide">
  <a class="logo" href="/">✈ FLIGHT CREW FITNESS</a>
  <nav class="topnav"><a href="/blog/">Blog</a><a href="/tools/faa-medication-checker.html">Medication checker</a><a href="/tools/faa-medical-expiration-calculator.html">Medical calculator</a><a class="cta" href="/?utm_source=tool&amp;utm_medium=nav&amp;utm_campaign=medication-checker">Start free</a></nav>
</div></header>
<main class="wrap"><article>
<div class="crumbs"><a href="/">Home</a> / Free tools / FAA medication checker</div>
<span class="cat">Free tool · no signup</span>
<h1>Is my medication FAA approved?</h1>
<p class="intro">%(n)d prescription drugs, over-the-counter medicines and supplements, checked against the FAA AME Guide on %(checked)s.</p>

<div class="tool">
  <label for="q">Medication or brand name</label>
  <input id="q" type="search" placeholder="e.g. Zoloft, Benadryl, Ozempic, finasteride" autocomplete="off" autocapitalize="none" spellcheck="false">
  <div class="count" id="count">%(n)d medications listed. Type to search.</div>
  <div class="none" id="none">Not in this list. That does not mean it is accepted or not. Check the <a href="https://www.faa.gov/ame_guide/pharm/dni_dnf" rel="noopener">FAA Do Not Issue / Do Not Fly page</a>.</div>
  <p class="private">Nothing you type leaves this page. The search runs in your browser.</p>
  <div class="actions"><button class="btn2" type="button" id="shareBtn">Send to a crew member</button></div>
</div>

<p class="more" id="more">Each entry says whether the FAA generally accepts it, wants a wait before you fly, handles it through special issuance, or will not let an AME issue a medical while you take it.</p>
<div class="legend" id="legend">
<span class="tag ok">OK</span> Generally accepted. Still list it on MedXPress. (%(ok)d)<br>
<span class="tag wait">WAIT</span> Do not fly until the wait has passed; routine use is a problem. (%(dnf)d)<br>
<span class="tag si">SI</span> Allowed only through FAA special issuance. (%(si)d)<br>
<span class="tag dni">DNI</span> The AME cannot issue while you take it. (%(dni)d)<br>
<span class="tag ok">ASK AME</span> Accepted in general, with a condition worth checking first.
</div>

<nav class="az" id="az" aria-label="Medications A to Z">%(az)s</nav>
<div id="list">%(groups)s</div>

<h2 style="margin-top:34px">Common questions</h2>
%(faq)s

<p style="font-size:.875rem;color:var(--muted);line-height:1.6;margin-top:22px">General FAA rule for anything sedating: wait five times the drug's longest half-life, or five times the dosing interval if the half-life is unknown. Any label that says "may cause drowsiness" means no flying while it is active. A new medication of any kind calls for a 48-hour ground trial after the first dose.</p>
<p style="font-size:.875rem;color:var(--muted);line-height:1.6">This checker is a guide built from public FAA material, not medical advice and not a certification decision. Sources: <a href="https://www.faa.gov/ame_guide/pharm/dni_dnf" rel="noopener">FAA Do Not Issue / Do Not Fly</a>, <a href="https://www.faa.gov/ame_guide" rel="noopener">FAA Guide for Aviation Medical Examiners</a>. The list is not all-inclusive.</p>

<div class="ctabox"><div class="txt"><b>The medication is one line on MedXPress.</b><span>Blood pressure, weight and sleep decide the rest. Flight Crew Fitness tracks them with the proper protocol and builds training around your trips.</span></div><a class="btn" href="/?utm_source=tool&amp;utm_medium=cta&amp;utm_campaign=medication-checker">Start free</a></div>
<div class="author"><div class="av">CC</div><div><b>Chad Cooper</b><p>Airline captain and founder of Flight Crew Fitness. More on the medical: <a href="/tools/faa-medical-expiration-calculator.html">when your medical expires</a>, <a href="/blog/faa-blood-pressure-limits.html">FAA blood pressure limits</a>, <a href="/blog/faa-weight-bmi-sleep-apnea.html">weight, BMI and sleep apnea</a>.</p></div></div>
</article></main>
<footer class="bottom"><div class="wrap wide">
  <a href="/">Flight Crew Fitness</a><a href="/blog/">Blog</a><a href="/tools/faa-medication-checker.html">FAA medication checker</a><a href="/tools/faa-medical-expiration-calculator.html">FAA medical calculator</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="https://www.facebook.com/1374735345726996">Facebook</a>
  <p class="disc">Flight Crew Fitness is a training tool, not medical advice. Nothing on this site diagnoses a condition or replaces your doctor or your AME.</p>
</div></footer>
<script>
(function () {
  var q = document.getElementById('q'), meds = [].slice.call(document.querySelectorAll('.med')),
      letters = [].slice.call(document.querySelectorAll('.letter')), count = document.getElementById('count'),
      none = document.getElementById('none'), az = document.getElementById('az'), total = meds.length;
  function run() {
    var s = q.value.trim().toLowerCase().replace(/[^a-z0-9+' .\\/-]/g, '');
    var words = s.split(/\\s+/).filter(Boolean), shown = 0;
    meds.forEach(function (el) {
      var hay = el.getAttribute('data-s');
      var hit = !s || words.every(function (w) { return hay.indexOf(w) !== -1; });
      el.classList.toggle('hide', !hit); if (hit) shown++;
    });
    letters.forEach(function (sec) { sec.classList.toggle('hide', !sec.querySelector('.med:not(.hide)')); });
    az.classList.toggle('hide', !!s);
    document.getElementById('legend').classList.toggle('hide', !!s);
    document.getElementById('more').classList.toggle('hide', !!s);
    none.style.display = s && !shown ? 'block' : 'none';
    count.textContent = s ? shown + ' match' + (shown === 1 ? '' : 'es') : total + ' medications listed. Type to search.';
  }
  q.addEventListener('input', run);
  var start = new URLSearchParams(location.search).get('q');
  if (start) { q.value = start; run(); }
  var b = document.getElementById('shareBtn'), url = '%(url)s';
  b.onclick = function () {
    if (navigator.share) { navigator.share({ title: 'FAA medication checker for pilots', url: url }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = 'Send to a crew member'; }, 2000); });
  };
})();
</script>
</body>
</html>
''' % {
    'n': len(MEDS), 'url': URL, 'checked': esc(checked), 'ld': json.dumps(ld, ensure_ascii=False),
    'az': index_links, 'groups': groups, 'faq': faq_html,
    'ok': counts['ok'], 'dnf': counts['dnf'], 'si': counts['si'], 'dni': counts['dni'],
}

assert '—' not in page, 'em dash in the page'
open(OUT, 'w', encoding='utf-8').write(page)
print('wrote', os.path.relpath(OUT, ROOT), len(MEDS), 'medications, checked', checked, date.today().isoformat())
