#!/usr/bin/env python3
"""
Flight Crew Fitness blog builder.

Articles live in blog/src/*.md with a YAML front matter block. Run this
script from the repo root (python3 blog/build.py) and it writes:

  blog/<slug>.html          one page per article
  blog/index.html           the blog home
  blog/og/<slug>.png        a 1200x630 share image per article
  sitemap.xml               regenerated with every page

Front matter fields:
  title        H1 shown on the page (catchy)
  seo_title    <title> tag, keyword first, under 60 chars (optional)
  slug         file name without .html
  description  meta description, 140 to 160 chars
  category     one of the CATEGORIES keys below
  date         YYYY-MM-DD published
  updated      YYYY-MM-DD (optional)
  takeaways    list of 3 short strings (the Key Takeaways box)
  faq          list of {q: ..., a: ...}
  references   list of {title: ..., url: ..., note: ...} (note optional)
  featured     true for the one large card on the index (optional)

Body conventions (Markdown):
  ## headings become the table of contents.
  A paragraph starting with "Captain's note:" becomes a callout box.
  Write {{CTA}} on its own line to place the mid-article app box.
"""
import glob
import html
import json
import os
import re
import sys
from datetime import date

import markdown
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "blog", "src")
OUT = os.path.join(ROOT, "blog")
SITE = "https://flightcrew.fit"
AUTHOR = "Chad Cooper"
AUTHOR_TITLE = "Airline captain and founder of Flight Crew Fitness"

CATEGORIES = {
    "training": "Training on the road",
    "nutrition": "Layover nutrition",
    "sleep": "Sleep and fatigue",
    "medical": "The FAA medical",
    "recovery": "Recovery and wearables",
}

# Shared stylesheet, written once to blog/blog.css
CSS = r"""
:root{--bg:#080d17;--bg2:#0d1520;--panel:#141e30;--border:#1e2d45;--gold:#c9a84c;--gold2:#e8c46a;
--gold-grad:linear-gradient(135deg,#b8922e 0%,#e8c46a 50%,#c9a84c 100%);--text:#e8eef6;--muted:#8899b4;
--body:#cbd5e1;--mono:'Share Tech Mono',monospace;--sans:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--body);font-family:var(--sans);line-height:1.65;font-size:1.0625rem;-webkit-font-smoothing:antialiased}
a{color:var(--gold2)}
a:hover{color:#fff}
.wrap{max-width:720px;margin:0 auto;padding:0 20px}
.wide{max-width:1040px}
header.top{border-bottom:1px solid var(--border);background:var(--bg2)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-family:var(--mono);color:var(--gold);letter-spacing:.12em;text-decoration:none;font-size:.9375rem;white-space:nowrap}
.logo:hover{color:var(--gold2)}
nav.topnav a{color:var(--muted);text-decoration:none;font-size:.8125rem;margin-left:18px;font-weight:600}
nav.topnav a.cta{background:var(--gold-grad);color:#080d17;padding:8px 14px;border-radius:8px;letter-spacing:.04em;text-transform:uppercase;font-size:.75rem;white-space:nowrap}
nav.topnav a:hover{color:#fff}
nav.topnav a.cta:hover{color:#080d17;filter:brightness(1.08)}
.crumbs{font-size:.75rem;color:var(--muted);margin:22px 0 6px;font-family:var(--mono);letter-spacing:.04em}
.crumbs a{color:var(--muted);text-decoration:none}
.crumbs a:hover{color:var(--gold)}
.cat{display:inline-block;font-family:var(--mono);font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}
h1{font-size:2.125rem;line-height:1.18;font-weight:800;color:#fff;margin:8px 0 14px;letter-spacing:-.01em}
.byline{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.8125rem;color:var(--muted);margin-bottom:26px;align-items:center}
.byline b{color:var(--text);font-weight:600}
.hero{border-radius:16px;overflow:hidden;margin:0 0 28px;border:1px solid var(--border);background:var(--bg2)}
.hero img{display:block;width:100%;height:auto}
.takeaways{background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:0 12px 12px 0;padding:18px 20px;margin:0 0 28px}
.takeaways h2{font-family:var(--mono);font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin:0 0 10px}
.takeaways ul{margin:0;padding-left:20px}
.takeaways li{margin:6px 0;color:var(--text)}
.toc{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin:0 0 30px;font-size:.9375rem}
.toc h2{font-family:var(--mono);font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.toc ol{margin:0;padding-left:20px}
.toc li{margin:4px 0}
.toc a{color:var(--body);text-decoration:none}
.toc a:hover{color:var(--gold2)}
article h2{font-size:1.5rem;color:#fff;margin:40px 0 12px;line-height:1.25;letter-spacing:-.01em;scroll-margin-top:80px}
article h3{font-size:1.125rem;color:#fff;margin:26px 0 8px}
article p{margin:0 0 18px}
article ul,article ol{margin:0 0 18px;padding-left:24px}
article li{margin:6px 0}
article li p{margin:0}
article strong{color:#fff;font-weight:700}
article table{border-collapse:collapse;width:100%;margin:0 0 22px;font-size:.9375rem}
article th,article td{border:1px solid var(--border);padding:9px 11px;text-align:left;vertical-align:top}
article th{background:var(--bg2);color:#fff;font-weight:600}
article blockquote{margin:0 0 22px;padding:14px 18px;border-left:3px solid var(--border);color:var(--muted);font-style:italic}
.note{background:linear-gradient(135deg,rgba(201,168,76,.10),rgba(201,168,76,.03));border:1px solid rgba(201,168,76,.35);border-radius:12px;padding:16px 20px;margin:0 0 24px;color:var(--text)}
.note b.lbl{display:block;font-family:var(--mono);font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
.ctabox{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px 22px;margin:28px 0;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.ctabox .txt{flex:1 1 260px}
.ctabox .txt b{color:#fff;display:block;margin-bottom:4px;font-size:1rem}
.ctabox .txt span{font-size:.9rem;color:var(--muted)}
.btn{display:inline-block;background:var(--gold-grad);color:#080d17;text-decoration:none;font-weight:800;letter-spacing:.05em;text-transform:uppercase;font-size:.8125rem;padding:13px 20px;border-radius:10px;box-shadow:0 2px 16px rgba(201,168,76,.3);white-space:nowrap}
.btn:hover{color:#080d17;filter:brightness(1.08)}
.faq h2{margin-top:44px}
.faq details{border-top:1px solid var(--border);padding:14px 0}
.faq details:last-of-type{border-bottom:1px solid var(--border)}
.faq summary{cursor:pointer;color:#fff;font-weight:600;font-size:1.0625rem;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';color:var(--gold);font-family:var(--mono);font-size:1.25rem;flex-shrink:0}
.faq details[open] summary::after{content:'\2013'}
.faq details p{margin:10px 0 0;color:var(--body)}
.refs{margin-top:40px;font-size:.875rem;color:var(--muted)}
.refs h2{font-size:1.125rem;color:#fff;margin-bottom:10px}
.refs ol{padding-left:22px}
.refs li{margin:7px 0;word-break:break-word}
.refs a{color:var(--muted)}
.refs a:hover{color:var(--gold2)}
.author{display:flex;gap:16px;align-items:flex-start;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin:36px 0}
.author .av{width:52px;height:52px;border-radius:50%;background:var(--gold-grad);color:#080d17;font-family:var(--mono);font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.125rem}
.author b{color:#fff;display:block;margin-bottom:2px}
.author p{margin:0;font-size:.9rem;color:var(--muted)}
.related{margin:40px 0 20px}
.related h2{font-family:var(--mono);font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.card{display:block;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px 18px;text-decoration:none;color:var(--body);transition:border-color .15s,transform .15s}
.card:hover{border-color:var(--gold);transform:translateY(-2px);color:var(--body)}
.card .cat{margin-bottom:6px}
.card h3{color:#fff;font-size:1.0625rem;line-height:1.3;margin:0 0 8px}
.card p{font-size:.875rem;color:var(--muted);margin:0 0 10px}
.card .meta{font-size:.75rem;color:var(--muted);font-family:var(--mono)}
.card.feat{grid-column:1/-1;padding:26px 28px;background:linear-gradient(135deg,var(--panel),var(--bg2))}
.card.feat h3{font-size:1.625rem}
.card.feat p{font-size:1rem;color:var(--body)}
.sec{margin:38px 0 10px;display:flex;justify-content:space-between;align-items:baseline}
.sec h2{font-size:1.25rem;color:#fff;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 8px}
.chips a{font-size:.8125rem;text-decoration:none;color:var(--text);background:var(--panel);border:1px solid var(--border);padding:7px 12px;border-radius:999px}
.chips a:hover{border-color:var(--gold);color:var(--gold2)}
.disc{font-size:.75rem;color:var(--muted);line-height:1.6;margin:30px 0 0}
footer.bottom{border-top:1px solid var(--border);margin-top:50px;padding:28px 0 40px;font-size:.8125rem;color:var(--muted)}
footer.bottom a{color:var(--muted);text-decoration:none;margin-right:16px}
footer.bottom a:hover{color:var(--gold)}
.intro{font-size:1.125rem;color:var(--text)}
@media (max-width:600px){.logo{font-size:.8125rem;letter-spacing:.08em}h1{font-size:1.75rem}body{font-size:1rem}nav.topnav a:not(.cta){display:none}.card.feat h3{font-size:1.375rem}}
"""

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{seo_title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Flight Crew Fitness">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{og_title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{og_image}">
<meta name="theme-color" content="#0a0f1a">
<link rel="icon" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">{jsonld}</script>
</head>
<body>
<header class="top"><div class="wrap wide">
  <a class="logo" href="/">✈ FLIGHT CREW FITNESS</a>
  <nav class="topnav"><a href="/blog/">Blog</a><a href="/#faq">FAQ</a><a class="cta" href="/">Start free</a></nav>
</div></header>
"""

FOOT = """
<footer class="bottom"><div class="wrap wide">
  <a href="/">Flight Crew Fitness</a><a href="/blog/">Blog</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="https://www.facebook.com/1374735345726996">Facebook</a>
  <p class="disc">Flight Crew Fitness is a training tool, not medical advice. Nothing on this site diagnoses a condition or replaces your doctor or your AME. Consult a physician before beginning any new exercise program.</p>
</div></footer>
</body>
</html>
"""

CTA_HTML = """<div class="ctabox"><div class="txt"><b>{head}</b><span>{sub}</span></div><a class="btn" href="/?utm_source=blog&amp;utm_medium=cta&amp;utm_campaign={slug}">Start free</a></div>"""

CTA_BY_CAT = {
    "training": ("Flying a four-day with hotel gyms only?", "Flight Crew Fitness builds the session around what is actually in the room, and backs off on the days your sleep says to."),
    "nutrition": ("Eating out of a flight bag?", "Flight Crew Fitness paces your protein around duty times, reads a plate from a photo, and remembers your six road meals."),
    "sleep": ("Training around a schedule that moves every week?", "Flight Crew Fitness reads your duty days and your wearable, and plans the session for the day you are actually having."),
    "medical": ("Want the numbers your AME reads moving the right way?", "Flight Crew Fitness tracks weight, waist, blood pressure and glucose with the proper protocol, and builds the training that moves them."),
    "recovery": ("Already wearing an Oura or Apple Watch?", "Flight Crew Fitness turns readiness, sleep and HRV into a training decision for today, so a red day becomes a lighter session instead of a skipped one."),
}


def esc(s):
    return html.escape(str(s), quote=True)


def read_articles():
    arts = []
    for path in sorted(glob.glob(os.path.join(SRC, "*.md"))):
        if os.path.basename(path) == "BRIEF.md":
            continue  # writing brief, not an article
        raw = open(path, encoding="utf-8").read()
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
        if not m:
            sys.exit(f"{path}: missing front matter")
        meta = yaml.safe_load(m.group(1))
        body = m.group(2).strip()
        meta["body_md"] = body
        meta["words"] = len(re.findall(r"\w+", body))
        meta["minutes"] = max(2, round(meta["words"] / 230))
        if meta.get("category") not in CATEGORIES:
            sys.exit(f"{path}: unknown category {meta.get('category')}")
        for k in ("title", "slug", "description", "date", "takeaways", "faq", "references"):
            if k not in meta:
                sys.exit(f"{path}: missing {k}")
        if "—" in raw:
            sys.exit(f"{path}: contains an em dash")
        arts.append(meta)
    arts.sort(key=lambda a: str(a["date"]), reverse=True)
    return arts


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def render_body(meta, arts):
    md = markdown.Markdown(extensions=["tables", "sane_lists"])
    lines = []
    for para in meta["body_md"].split("\n\n"):
        p = para.strip()
        if p.startswith("Captain's note:") or p.startswith("Captain’s note:"):
            text = p.split(":", 1)[1].strip()
            inner = md.convert(text)
            md.reset()
            lines.append(f'<div class="note"><b class="lbl">Captain\'s note</b>{inner}</div>')
        elif p == "{{CTA}}":
            head, sub = CTA_BY_CAT[meta["category"]]
            lines.append(CTA_HTML.format(head=esc(head), sub=esc(sub), slug=meta["slug"]))
        else:
            lines.append(md.convert(p))
            md.reset()
    body = "\n".join(lines)
    # ids on h2 for the TOC
    toc = []

    def h2(m):
        text = re.sub(r"<[^>]+>", "", m.group(1))
        hid = slugify(text)
        toc.append((hid, text))
        return f'<h2 id="{hid}">{m.group(1)}</h2>'

    body = re.sub(r"<h2>(.*?)</h2>", h2, body)
    # first paragraph gets the intro style
    body = body.replace("<p>", '<p class="intro">', 1)
    return body, toc


def jsonld_article(meta, url, og):
    faq = [{"@type": "Question", "name": q["q"], "acceptedAnswer": {"@type": "Answer", "text": q["a"]}} for q in meta["faq"]]
    graph = [
        {
            "@type": "BlogPosting",
            "@id": url + "#article",
            "headline": meta["title"],
            "description": meta["description"],
            "image": og,
            "url": url,
            "mainEntityOfPage": url,
            "datePublished": str(meta["date"]),
            "dateModified": str(meta.get("updated", meta["date"])),
            "wordCount": meta["words"],
            "articleSection": CATEGORIES[meta["category"]],
            "inLanguage": "en-US",
            "author": {"@type": "Person", "name": AUTHOR, "jobTitle": "Airline Captain", "url": SITE + "/blog/"},
            "publisher": {"@type": "Organization", "name": "Flight Crew Fitness", "url": SITE + "/", "logo": {"@type": "ImageObject", "url": SITE + "/icon-512.png"}},
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Flight Crew Fitness", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Blog", "item": SITE + "/blog/"},
                {"@type": "ListItem", "position": 3, "name": meta["title"], "item": url},
            ],
        },
        {"@type": "FAQPage", "mainEntity": faq},
    ]
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)


def card(a, feat=False):
    cls = "card feat" if feat else "card"
    return (
        f'<a class="{cls}" href="/blog/{a["slug"]}.html"><span class="cat">{esc(CATEGORIES[a["category"]])}</span>'
        f'<h3>{esc(a["title"])}</h3><p>{esc(a["description"])}</p>'
        f'<span class="meta">{a["minutes"]} min read · {fmt_date(a["date"])}</span></a>'
    )


def fmt_date(d):
    d = date.fromisoformat(str(d))
    return d.strftime("%b %-d, %Y")


def render_article(meta, arts):
    url = f"{SITE}/blog/{meta['slug']}.html"
    og = f"{SITE}/blog/og/{meta['slug']}.png"
    body, toc = render_body(meta, arts)
    seo_title = meta.get("seo_title") or meta["title"]
    if "Flight Crew Fitness" not in seo_title:
        seo_title += " | Flight Crew Fitness"
    out = [HEAD.format(seo_title=esc(seo_title), description=esc(meta["description"]), url=url, og_type="article",
                       og_title=esc(meta["title"]), og_image=og, jsonld=jsonld_article(meta, url, og))]
    out.append('<main class="wrap"><article>')
    out.append(f'<div class="crumbs"><a href="/">Home</a> / <a href="/blog/">Blog</a> / {esc(CATEGORIES[meta["category"]])}</div>')
    out.append(f'<span class="cat">{esc(CATEGORIES[meta["category"]])}</span>')
    out.append(f'<h1>{esc(meta["title"])}</h1>')
    upd = f' · Updated {fmt_date(meta["updated"])}' if meta.get("updated") else ""
    out.append(f'<div class="byline"><span>By <b>{AUTHOR}</b>, airline captain</span><span>{fmt_date(meta["date"])}{upd}</span><span>{meta["minutes"]} min read</span></div>')
    out.append('<div class="takeaways"><h2>Key takeaways</h2><ul>' + "".join(f"<li>{esc(t)}</li>" for t in meta["takeaways"]) + "</ul></div>")
    if toc:
        out.append('<div class="toc"><h2>In this article</h2><ol>' + "".join(f'<li><a href="#{h}">{esc(t)}</a></li>' for h, t in toc) + '<li><a href="#faq">Questions pilots ask</a></li></ol></div>')
    out.append(body)
    head, sub = CTA_BY_CAT[meta["category"]]
    out.append(CTA_HTML.format(head=esc(head), sub=esc(sub), slug=meta["slug"] + "-end"))
    out.append('<section class="faq"><h2 id="faq">Questions pilots ask</h2>')
    for q in meta["faq"]:
        out.append(f'<details><summary>{esc(q["q"])}</summary><p>{esc(q["a"])}</p></details>')
    out.append("</section>")
    out.append('<section class="refs"><h2>Sources</h2><ol>')
    for r in meta["references"]:
        note = f' {esc(r["note"])}' if r.get("note") else ""
        out.append(f'<li><a href="{esc(r["url"])}" rel="noopener" target="_blank">{esc(r["title"])}</a>.{note}</li>')
    out.append("</ol></section>")
    out.append(f'<div class="author"><div class="av">CC</div><div><b>{AUTHOR}</b><p>{AUTHOR_TITLE}. Flies the Embraer 175 out of Phoenix and has trained in more hotel gyms than he can count. Every article here cites its sources so you can check the work.</p></div></div>')
    rel = [a for a in arts if a["slug"] != meta["slug"] and a["category"] == meta["category"]][:3]
    if len(rel) < 3:
        rel += [a for a in arts if a["slug"] != meta["slug"] and a not in rel][: 3 - len(rel)]
    out.append('<section class="related"><h2>Keep reading</h2><div class="grid">' + "".join(card(a) for a in rel) + "</div></section>")
    out.append("</article></main>")
    out.append(FOOT)
    return "".join(out)


def render_index(arts):
    url = f"{SITE}/blog/"
    feat = next((a for a in arts if a.get("featured")), arts[0])
    rest = [a for a in arts if a is not feat]
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "CollectionPage", "@id": url, "name": "Flight Crew Fitness Blog", "url": url,
             "description": "Fitness, nutrition, sleep and FAA medical articles for airline pilots and flight crew, written by a working airline captain.",
             "isPartOf": {"@type": "WebSite", "url": SITE + "/", "name": "Flight Crew Fitness"}},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Flight Crew Fitness", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Blog", "item": url}]},
        ],
    }
    desc = "Workouts, layover nutrition, sleep and FAA medical guidance for airline pilots and flight crew, written by a working airline captain. Every article cites its sources."
    out = [HEAD.format(seo_title="Pilot Fitness Blog | Flight Crew Fitness", description=esc(desc), url=url,
                       og_type="website", og_title="The Flight Crew Fitness Blog", og_image=SITE + "/og-image.png", jsonld=json.dumps(graph))]
    out.append('<main class="wrap wide">')
    out.append('<div class="crumbs"><a href="/">Home</a> / Blog</div>')
    out.append('<h1>Fitness for people who fly for a living</h1>')
    out.append('<p class="intro" style="max-width:640px">Training, nutrition, sleep and the FAA medical, written by a working airline captain for pilots and flight crew. No stock advice that assumes a kitchen and a nine to five. Every article cites its sources.</p>')
    out.append('<div class="chips">' + "".join(f'<a href="#{k}">{esc(v)}</a>' for k, v in CATEGORIES.items()) + "</div>")
    out.append('<div class="grid" style="margin-top:22px">' + card(feat, True) + "".join(card(a) for a in rest[:3]) + "</div>")
    for k, v in CATEGORIES.items():
        items = [a for a in arts if a["category"] == k]
        if not items:
            continue
        out.append(f'<div class="sec" id="{k}"><h2>{esc(v)}</h2></div><div class="grid">' + "".join(card(a) for a in items) + "</div>")
    head, sub = CTA_BY_CAT["training"]
    out.append(CTA_HTML.format(head=esc(head), sub=esc(sub), slug="blog-index"))
    out.append("</main>")
    out.append(FOOT)
    return "".join(out)


def make_og(meta):
    from PIL import Image, ImageDraw, ImageFont
    os.makedirs(os.path.join(OUT, "og"), exist_ok=True)
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), "#080d17")
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(8 + int(5 * t), 13 + int(8 * t), 23 + int(9 * t)))
    d.rectangle([(0, 0), (12, H)], fill="#c9a84c")
    mono = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 26)
    bold = ImageFont.truetype(glob.glob("/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf")[0], 58)
    reg = ImageFont.truetype(glob.glob("/usr/share/fonts/opentype/inter/Inter-Regular.otf")[0], 26)
    d.text((80, 70), "FLIGHT CREW FITNESS  ·  " + CATEGORIES[meta["category"]].upper(), font=mono, fill="#c9a84c")
    # wrap title
    words, lines, cur = meta["title"].split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=bold) > 1020:
            lines.append(cur)
            cur = w
        else:
            cur = t
    lines.append(cur)
    y = 150
    for ln in lines[:4]:
        d.text((80, y), ln, font=bold, fill="#e8eef6")
        y += 70
    d.text((80, 540), "By Chad Cooper, airline captain  ·  flightcrew.fit/blog", font=reg, fill="#8899b4")
    img.save(os.path.join(OUT, "og", meta["slug"] + ".png"), optimize=True)


def write_sitemap(arts):
    today = date.today().isoformat()
    rows = [
        f"  <url><loc>{SITE}/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>",
        f"  <url><loc>{SITE}/blog/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>",
    ]
    for a in arts:
        rows.append(f"  <url><loc>{SITE}/blog/{a['slug']}.html</loc><lastmod>{a.get('updated', a['date'])}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>")
    rows.append(f"  <url><loc>{SITE}/privacy.html</loc><lastmod>2026-10-13</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url>")
    rows.append(f"  <url><loc>{SITE}/terms.html</loc><lastmod>2026-10-13</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"
    open(os.path.join(ROOT, "sitemap.xml"), "w").write(xml)


def main():
    arts = read_articles()
    open(os.path.join(OUT, "blog.css"), "w").write(CSS.strip() + "\n")
    for a in arts:
        open(os.path.join(OUT, a["slug"] + ".html"), "w", encoding="utf-8").write(render_article(a, arts))
        make_og(a)
        print(f"  {a['slug']}.html  ({a['words']} words)")
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(render_index(arts))
    write_sitemap(arts)
    print(f"built {len(arts)} articles + index + sitemap")


if __name__ == "__main__":
    main()
