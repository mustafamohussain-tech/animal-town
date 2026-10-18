// One-click publishing: the town is saved as town.json into the GitHub repository of the website, so
// visitors see it a minute later. It uses a GitHub access token that lives only in this browser
// (never in the town file or the game's files). Works for big towns too (Git "blobs" take up to 100 MB).
import { serialize } from './save.js';

const TOKEN_KEY = 'animal-town-github-token';
const REPO_KEY = 'animal-town-github-repo';
export const DEFAULT_REPO = 'mustafamohussain-tech/animal-town';

export function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
export function setToken(v) { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } }
export function getRepo() { try { return localStorage.getItem(REPO_KEY) || DEFAULT_REPO; } catch { return DEFAULT_REPO; } }
export function setRepo(v) { try { localStorage.setItem(REPO_KEY, v || DEFAULT_REPO); } catch { /* private mode */ } }

// text -> base64 (fast, also for many megabytes)
function toBase64(text) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(new Blob([text], { type: 'application/json' }));
  });
}

export class PublishError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

// publish the town; onStep(i, n) reports progress. Returns { sha, size, at }.
export async function publishTown(game, onStep = () => {}) {
  const token = getToken(), repo = getRepo().trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!token) throw new PublishError('noToken');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new PublishError('badRepo');
  const api = async (method, path, body) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch { /* no body */ }
      throw new PublishError(r.status === 401 ? 'badToken' : r.status === 403 ? 'noRights' : r.status === 404 ? 'notFound' : 'http', `${r.status} ${msg}`);
    }
    return r.json();
  };
  const N = 6;
  onStep(1, N);
  const text = JSON.stringify(serialize(game));
  const content = await toBase64(text);
  // the newest commit on the site's branch (main), so the town goes on top of it
  onStep(2, N);
  const info = await api('GET', '');
  const branch = info.default_branch || 'main';
  const ref = await api('GET', `/git/ref/heads/${branch}`);
  const head = ref.object.sha;
  const commit = await api('GET', `/git/commits/${head}`);
  onStep(3, N);
  const blob = await api('POST', '/git/blobs', { content, encoding: 'base64' });
  onStep(4, N);
  const tree = await api('POST', '/git/trees', { base_tree: commit.tree.sha, tree: [{ path: 'town.json', mode: '100644', type: 'blob', sha: blob.sha }] });
  onStep(5, N);
  const d = new Date();
  const made = await api('POST', '/git/commits', {
    message: `Town update: ${game.chars.length} residents, ${game.town.all.length} buildings (${d.toISOString().slice(0, 16).replace('T', ' ')})`,
    tree: tree.sha, parents: [head],
  });
  onStep(6, N);
  await api('PATCH', `/git/refs/heads/${branch}`, { sha: made.sha, force: false });
  return { sha: made.sha, size: text.length, at: Date.now() };
}
