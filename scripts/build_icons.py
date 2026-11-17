#!/usr/bin/env python3
"""Builds the app's icon set.

The app's screens were written with emoji as icons. Members said that reads
as machine-made (Nov 16 2026), so every emoji on screen is drawn as a plain
single-colour line icon. This script is the one place that says which emoji
becomes which icon.

Icons: Lucide (https://lucide.dev), ISC licence, see vendor/lucide-LICENSE.txt.

Usage:  python3 scripts/build_icons.py /path/to/lucide-static/icons
  (get the icons with:  npm pack lucide-static@0.460.0  and unpack it)

It rewrites two things:
  - the block between ICONS:BEGIN and ICONS:END in app.js (icon shapes and
    the emoji-to-icon table the app uses at run time);
  - emoji in index.html, which are replaced by the icon drawing itself so
    the landing page never shows an emoji while the app loads.
"""
import json, os, re, sys

# emoji -> icon name, or "name:tone" (tone: ok, warn, err, gold).
EMOJI = {
    # goals and workout types
    '🏀': 'chevrons-up', '💪': 'biceps-flexed', '🌿': 'leaf', '🔥': 'flame', '🚶': 'footprints',
    '🏃': 'route', '🏋': 'dumbbell', '🍑': 'target', '⚡': 'zap', '🦵': 'arrow-down-to-line',
    '🎯': 'target', '🧘': 'person-standing', '❤': 'heart-pulse', '🌱': 'sprout',
    # status
    '✅': 'circle-check:ok', '⚠': 'triangle-alert:warn', '🚨': 'siren:err', '🔴': 'circle-alert:err',
    '🟢': 'circle-check:ok', '🟡': 'circle-alert:warn', '💡': 'lightbulb', '🔒': 'lock',
    # flight phases and schedule
    '🚕': 'car-taxi-front', '🛫': 'plane-takeoff', '🛬': 'plane-landing', '✈️': 'plane',
    '📅': 'calendar', '🏨': 'hotel', '🛏': 'bed', '📟': 'radio', '🎓': 'graduation-cap', '😴': 'moon',
    '🕐': 'clock', '☀': 'sun', '🌅': 'sunrise', '🌍': 'globe',
    # badges and ranks
    '⭐': 'star', '🏅': 'medal', '🏆': 'trophy', '🎖': 'award', '💯': 'badge-check', '🦾': 'shield',
    '🥇': 'medal:gold', '🥈': 'medal', '🥉': 'medal', '👟': 'footprints',
    # body, health, food
    '💧': 'droplet', '💊': 'pill', '🩹': 'bandage', '🩺': 'stethoscope', '👁': 'eye', '👂': 'ear',
    '⚖': 'scale', '🥩': 'beef', '🍽': 'utensils', '☕': 'coffee', '🥣': 'utensils', '🥤': 'cup-soda',
    # charts and records
    '📉': 'trending-down', '📈': 'trending-up', '📊': 'chart-column', '📋': 'clipboard-list',
    '📝': 'notebook-pen', '🪪': 'id-card', '📖': 'book-open', '📰': 'newspaper',
    # people and sharing
    '👤': 'user', '👥': 'users', '💬': 'message-circle', '👏': 'thumbs-up', '👍': 'thumbs-up',
    '📡': 'share-2', '📤': 'share', '📥': 'download', '⬆': 'share', '🛡': 'shield',
    # devices
    '⌚': 'watch', '💍': 'circle', '📱': 'smartphone', '📲': 'smartphone', '🔔': 'bell',
    # actions
    '📷': 'camera', '🖼': 'image', '📹': 'video', '🔎': 'search', '⚙': 'settings', '🗑': 'trash-2',
    '✏': 'pencil', '💾': 'save', '⏱': 'timer', '⏳': 'hourglass', '🛠': 'wrench', '🔁': 'repeat',
    '🔄': 'refresh-cw', '🔢': 'scan-barcode', '🚦': 'gauge', '📶': 'wifi',
}

# Plain text marks the app keeps as they are: arrows, ticks and the logo's
# aeroplane. They are type, not pictures.
KEEP = set('→←✓✕↻✦✎❖★↩↑↓⌄⇄➰✈▶◀▲▼•·')

EMOJI_RANGE = re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿←-⇿⌀-⏿]')


def icon_body(icons_dir, name):
    svg = open(os.path.join(icons_dir, name + '.svg'), encoding='utf-8').read()
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    return re.sub(r'\s+', ' ', inner).strip().replace(' />', '/>').replace('> <', '><')


def main():
    icons_dir = sys.argv[1]
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    names = sorted({v.split(':')[0] for v in EMOJI.values()})
    paths = {n: icon_body(icons_dir, n) for n in names}

    block = ['// ICONS:BEGIN  (written by scripts/build_icons.py; edit the table there, not here)',
             '// Lucide icons, ISC licence: vendor/lucide-LICENSE.txt',
             'const ICON_PATHS = ' + json.dumps(paths, ensure_ascii=False, separators=(',', ':')) + ';',
             'const EMOJI_ICONS = ' + json.dumps(EMOJI, ensure_ascii=False, separators=(',', ':')) + ';',
             'const EMOJI_KEEP = ' + json.dumps(''.join(sorted(KEEP)), ensure_ascii=False) + ';',
             '// ICONS:END']
    p = os.path.join(root, 'app.js')
    s = open(p, encoding='utf-8').read()
    i, j = s.index('// ICONS:BEGIN'), s.index('// ICONS:END') + len('// ICONS:END')
    open(p, 'w', encoding='utf-8').write(s[:i] + '\n'.join(block) + s[j:])

    # index.html: draw the icon in place of the emoji.
    p = os.path.join(root, 'index.html')
    h = open(p, encoding='utf-8').read()
    keys = sorted(EMOJI, key=len, reverse=True)
    pat = re.compile('(' + '|'.join(re.escape(k) for k in keys) + ')️?')
    def draw(m):
        name, _, tone = EMOJI[m.group(1)].partition(':')
        return '<svg class="ic' + (' ic-' + tone if tone else '') + '" viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>'
    body_at = h.index('<body')
    h2 = h[:body_at] + pat.sub(draw, h[body_at:])
    open(p, 'w', encoding='utf-8').write(h2)
    left = sorted(set(c for c in EMOJI_RANGE.findall(h2[body_at:]) if c not in KEEP))
    print('icons:', len(names), ' emoji mapped:', len(EMOJI), ' index.html emoji left:', ''.join(left) or 'none')


if __name__ == '__main__':
    main()
