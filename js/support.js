// "Support us" (like Buy Me a Coffee): a small window for visitors with a few amounts and an
// "other amount" choice; each opens a payment page in a new tab.
//
// ===== EDIT HERE when the Wayl links are ready =====
// link: the Wayl payment link (or store product page) for that amount. Empty = use `fallback`.
export const SUPPORT = {
  tiers: [
    { usd: 5, emoji: '☕', link: '' },
    { usd: 10, emoji: '🍕', link: '' },
    { usd: 20, emoji: '🎁', link: '' },
    { usd: 50, emoji: '🌟', link: '' },
  ],
  custom: '',   // a page where the supporter chooses the amount (empty = `fallback`)
  fallback: 'https://joodiq.com/pages/donate.php?u=hartna01',
  iqdPerUsd: 1310,   // only to show the amount in dinars too (the payment page shows the exact price)
};
// ===================================================

import { t, getLang } from './i18n.js';

const fmtIqd = n => (Math.round(n / 250) * 250).toLocaleString(getLang() === 'ar' ? 'ar-IQ' : 'en-US');

export class SupportWindow {
  constructor(frame) {
    this.frame = frame;
    this.pick = 1;   // $10 chosen at first
  }
  open() {
    this.close();
    const S = SUPPORT, el = document.createElement('div');
    el.className = 'sup-back';
    el.innerHTML = `
      <div class="sup" role="dialog" aria-modal="true">
        <button class="sup-x" aria-label="close">✕</button>
        <div class="sup-cup">☕</div>
        <h3 class="sup-title"></h3>
        <p class="sup-lead"></p>
        <ul class="sup-why"></ul>
        <div class="sup-tiers"></div>
        <button class="sup-other"></button>
        <a class="sup-go" target="_blank" rel="noopener noreferrer"></a>
        <p class="sup-note"></p>
      </div>`;
    const $ = s => el.querySelector(s);
    $('.sup-title').textContent = t('supTitle');
    $('.sup-lead').textContent = t('supLead');
    for (const k of ['supWhy1', 'supWhy2', 'supWhy3', 'supWhy4']) { const li = document.createElement('li'); li.textContent = t(k); $('.sup-why').appendChild(li); }
    const tiers = $('.sup-tiers');
    S.tiers.forEach((tier, k) => {
      const b = document.createElement('button');
      b.className = 'sup-tier';
      const e = document.createElement('span'); e.className = 'sup-e'; e.textContent = tier.emoji;
      const a = document.createElement('b'); a.textContent = '$' + tier.usd; a.dir = 'ltr';
      const d = document.createElement('small'); d.textContent = t('supIqd', { n: fmtIqd(tier.usd * S.iqdPerUsd) });
      b.append(e, a, d);
      b.onclick = () => { this.pick = k; this.render(el); };
      tiers.appendChild(b);
    });
    $('.sup-other').textContent = '✨ ' + t('supOther');
    $('.sup-other').onclick = () => { this.pick = -1; this.render(el); };
    $('.sup-note').textContent = t('supNote');
    $('.sup-x').onclick = () => this.close();
    el.onclick = e => { if (e.target === el) this.close(); };
    $('.sup-go').addEventListener('click', () => setTimeout(() => { $('.sup-note').textContent = '💚 ' + t('supThanks'); }, 300));
    this.frame.appendChild(el);
    this.el = el;
    this.render(el);
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
    addEventListener('keydown', this.onKey);
  }
  render(el) {
    const S = SUPPORT, k = this.pick;
    el.querySelectorAll('.sup-tier').forEach((b, i) => b.classList.toggle('on', i === k));
    el.querySelector('.sup-other').classList.toggle('on', k === -1);
    const go = el.querySelector('.sup-go');
    const tier = S.tiers[k];
    go.href = (tier ? tier.link : S.custom) || S.fallback;
    go.textContent = tier ? `${tier.emoji} ${t('supGo', { a: '⁦$' + tier.usd + '⁩' })}` : `✨ ${t('supGoOther')}`;   // (the amount stays "$20" in Arabic too)
  }
  close() {
    this.el?.remove();
    this.el = null;
    if (this.onKey) removeEventListener('keydown', this.onKey);
  }
}
