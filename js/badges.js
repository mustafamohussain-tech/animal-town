// Supporter badges: the town's owner marks who supported Hartna (from the Wayl store orders).
// The badge shows next to the resident's name in the town and on their profile card.
export const BADGES = {
  heart: { emoji: '💛', usd: 5 },      // ☕ coffee
  star: { emoji: '⭐', usd: 10 },      // 🍕 meal
  medal: { emoji: '🏅', usd: 20 },     // 🎁 gift
  crown: { emoji: '👑', usd: 50 },     // 🌟 golden supporter
  member: { emoji: '💎', monthly: true },   // monthly membership: shown for 30 days, then renewed
};
export const BADGE_ORDER = ['heart', 'star', 'medal', 'crown', 'member'];
export const MONTH = 30 * 86400000;

// the badge a resident shows now (a monthly membership ends after its date)
export function badgeOf(c) {
  const k = c?.supporter;
  if (!k || !BADGES[k]) return null;
  if (k === 'member' && c.supporterUntil && Date.now() > c.supporterUntil) return null;
  return { key: k, ...BADGES[k] };
}
