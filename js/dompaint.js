// Paints the HTML shown over the game (names, speech bubbles, HUD, banners, cards) onto a 2D canvas.
// Recordings use it to stay sharp at full resolution (1080×1920) instead of capturing the screen.
// It understands the simple styles this game uses: backgrounds, rounded corners, borders, text, images.

const cache = new WeakMap();
const range = document.createRange();
const CLEAR = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/;

function style(el, now) {
  let c = cache.get(el);
  if (c && now - c.t < 300) return c;
  const cs = getComputedStyle(el);
  c = {
    t: now, vis: cs.visibility, op: +cs.opacity, bg: cs.backgroundColor, bgImg: cs.backgroundImage,
    radius: cs.borderTopLeftRadius, bw: parseFloat(cs.borderTopWidth) || 0, bc: cs.borderTopColor, bs: cs.borderTopStyle,
    fstyle: cs.fontStyle, weight: cs.fontWeight, size: parseFloat(cs.fontSize) || 14, family: cs.fontFamily,
    color: cs.color, dir: cs.direction, z: parseInt(cs.zIndex) || 0, shadow: parseShadow(cs.textShadow), clip: cs.overflow !== 'visible',
  };
  cache.set(el, c);
  return c;
}
function parseShadow(s) {
  if (!s || s === 'none') return null;
  const m = s.match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8})\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?/i);
  return m ? { color: m[1], x: +m[2], y: +m[3], blur: +(m[4] || 0) } : null;
}
function radiusOf(s, w, h) {
  const v = parseFloat(s) || 0;
  const r = s.includes('%') ? Math.min(w, h) * v / 100 : v;
  return Math.max(0, Math.min(r, w / 2, h / 2));
}

export function paintDom(ctx, root, scale) {
  const base = root.getBoundingClientRect(), now = performance.now();
  const X = x => (x - base.left) * scale, Y = y => (y - base.top) * scale;

  const box = (el, s, r, a) => {
    const w = r.width * scale, h = r.height * scale;
    if (w < .5 || h < .5) return;
    let fill = CLEAR.test(s.bg) ? null : s.bg;
    if (!fill && s.bgImg && s.bgImg !== 'none') fill = (s.bgImg.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i) || [])[0] || null;
    const stroke = s.bw > 0 && s.bs !== 'none' && !CLEAR.test(s.bc);
    if (!fill && !stroke) return;
    const rad = radiusOf(s.radius, r.width, r.height) * scale;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.roundRect(X(r.left), Y(r.top), w, h, rad);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = s.bw * scale; ctx.strokeStyle = s.bc; ctx.stroke(); }
  };

  const text = (node, s, a, clipR) => {
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    if (!rects.length) return;
    // one entry per visual line
    let lines;
    if (rects.length === 1) lines = [{ str: node.data.replace(/\s+/g, ' ').trim(), r: rects[0] }];
    else {
      lines = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(node.data))) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        let L = lines.find(l => Math.abs(l.top - r.top) < 3);
        if (!L) lines.push(L = { top: r.top, a: m.index, b: 0, l: r.left, rt: r.right, t: r.top, bt: r.bottom });
        L.b = m.index + m[0].length;
        L.l = Math.min(L.l, r.left); L.rt = Math.max(L.rt, r.right);
        L.t = Math.min(L.t, r.top); L.bt = Math.max(L.bt, r.bottom);
      }
      lines = lines.map(L => ({ str: node.data.slice(L.a, L.b).replace(/\s+/g, ' '), r: { left: L.l, right: L.rt, top: L.t, bottom: L.bt, width: L.rt - L.l } }));
    }
    ctx.globalAlpha = a;
    ctx.font = `${s.fstyle} ${s.weight} ${s.size * scale}px ${s.family}`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'middle';
    ctx.direction = s.dir === 'rtl' ? 'rtl' : 'ltr';
    if (s.shadow) Object.assign(ctx, { shadowColor: s.shadow.color, shadowOffsetX: s.shadow.x * scale, shadowOffsetY: s.shadow.y * scale, shadowBlur: s.shadow.blur * scale });
    for (const { str, r } of lines) {
      if (!str) continue;
      const rtl = s.dir === 'rtl';
      // only brackets / numbers / signs: put them in the middle of their box (avoids bidi surprises)
      const neutral = !/[A-Za-z؀-ۿ]/.test(str);
      ctx.textAlign = neutral ? 'center' : rtl ? 'right' : 'left';
      const x = neutral ? (X(r.left) + X(r.right)) / 2 : rtl ? X(r.right) : X(r.left), y = (Y(r.top) + Y(r.bottom)) / 2;
      // text cut off on screen (… ellipsis) stays inside its box
      const tooWide = ctx.measureText(str).width > r.width * scale + 3;
      if (tooWide || clipR) {
        const c = tooWide ? r : clipR;
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(c.left), Y(c.top) - 2, c.width * scale, (c.bottom - c.top) * scale + 4);
        ctx.clip();
        ctx.fillText(str, x, y);
        ctx.restore();
      } else ctx.fillText(str, x, y);
    }
    if (s.shadow) Object.assign(ctx, { shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
  };

  const walk = (el, a, clipR) => {
    // paint in stacking order (z-index), like the browser does
    const kids = [...el.childNodes];
    if (kids.some(n => n.nodeType === 1 && style(n, now).z)) kids.sort((p, q) => (p.nodeType === 1 ? style(p, now).z : 0) - (q.nodeType === 1 ? style(q, now).z : 0));
    for (const n of kids) {
      if (n.nodeType === 3) {
        if (n.data.trim()) text(n, style(el, now), a, clipR);
        continue;
      }
      if (n.nodeType !== 1 || n.tagName === 'CANVAS' || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') continue;
      if (!n.getClientRects().length) continue;              // display: none (or inside one)
      const s = style(n, now);
      if (s.vis === 'hidden' || s.op <= 0.01) continue;
      const na = a * s.op, r = n.getBoundingClientRect();
      box(n, s, r, na);
      if (n.tagName === 'IMG') {
        if (n.complete && n.naturalWidth && r.width) {
          ctx.globalAlpha = na;
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(X(r.left), Y(r.top), r.width * scale, r.height * scale, radiusOf(s.radius, r.width, r.height) * scale);
          ctx.clip();
          ctx.drawImage(n, X(r.left), Y(r.top), r.width * scale, r.height * scale);
          ctx.restore();
        }
        continue;
      }
      if (n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.tagName === 'TEXTAREA') continue;
      walk(n, na, s.clip && r.width && r.height ? r : clipR);
    }
  };
  ctx.save();
  walk(root, 1, null);
  ctx.restore();
  ctx.globalAlpha = 1;
}
