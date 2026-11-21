import { parse } from 'parse5';

const hosts = new Set(['gmh-shop.com', 'www.gmh-shop.com']);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function siteOrigin(origin = 'https://gmh-shop.com') {
  const url = new URL(origin);
  if (!hosts.has(url.hostname) || url.protocol !== 'https:' || url.origin + '/' !== url.href) {
    throw new Error('Expected the public Aurum Desk website origin.');
  }
  if (url.port) throw new Error('Expected standard HTTPS.');
  return url.origin;
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
}

function readPost(post) {
  if (!post || typeof post.id !== 'string' || !uuid.test(post.id) || !['plan', 'news'].includes(post.kind)
    || typeof post.slug !== 'string' || post.slug.length > 220
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)
    || !isoInstant.test(post.published_at) || !Number.isFinite(Date.parse(post.published_at))
    || !clean(post.title) || !clean(post.summary)) return;
  let url;
  try {
    url = new URL(post.url);
    if (url.href !== siteOrigin(url.origin) + '/aurum/' + post.slug || post.url !== url.href) return;
  } catch { return; }
  return { id: post.id.toLowerCase(), kind: post.kind, url: url.href, title: clean(post.title),
    summary: clean(post.summary), published: Date.parse(post.published_at) };
}

async function readPublic(fetchImpl, url, mime, maxBytes) {
  const response = await fetchImpl(url, {
    redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { accept: mime, 'cache-control': 'no-cache', 'user-agent': 'AurumDeskPublisher/1.0' }
  });
  if (response.status !== 200 || (response.url && response.url !== url)
    || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== mime) {
    await response.body?.cancel();
    throw new Error('Public source did not return the expected content.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('Public source is too large.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
}

export async function readSiteFeed(fetchImpl, origin) {
  const url = siteOrigin(origin) + '/api/aurum/feed';
  const feed = JSON.parse(await readPublic(fetchImpl, url, 'application/json', 512 * 1024));
  if (!Array.isArray(feed?.posts)) throw new Error('Invalid public feed.');
  const posts = feed.posts.map(readPost).filter(Boolean);
  const ids = new Set(), urls = new Set(), invalidIds = new Set(), invalidUrls = new Set();
  for (const post of posts) {
    if (ids.has(post.id)) invalidIds.add(post.id);
    if (urls.has(post.url)) invalidUrls.add(post.url);
    ids.add(post.id);
    urls.add(post.url);
  }
  return posts.filter(post => !invalidIds.has(post.id) && !invalidUrls.has(post.url))
    .sort((left, right) => left.published - right.published);
}

export async function verifyPublicArticle(fetchImpl, post) {
  const document = parse(await readPublic(fetchImpl, post.url, 'text/html', 2 * 1024 * 1024));
  const ids = [];
  const pending = [document];
  while (pending.length) {
    const node = pending.pop();
    if (node.tagName === 'meta' && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const attrs = Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value]));
      if (attrs.name === 'aurum-article-id') ids.push(attrs.content);
    }
    // parse5 stores inert template descendants separately from childNodes.
    for (const child of node.childNodes ?? []) pending.push(child);
  }
  if (ids.length !== 1 || ids[0]?.toLowerCase() !== post.id) {
    throw new Error('Public article identity has not been verified.');
  }
}

function shorten(text, size) {
  if (text.length <= size) return text;
  const prefix = text.slice(0, size - 1);
  const lastSpace = prefix.lastIndexOf(' ');
  return (lastSpace > size / 2 ? prefix.slice(0, lastSpace) : prefix) + '…';
}

export function formatExcerpt(post) {
  const label = post.kind === 'news' ? 'Gold news' : 'Gold market plan';
  const at = new Date(post.published).toISOString().slice(0, 16).replace('T', ' ');
  return [`Aurum Desk • ${label}`, shorten(post.title, 160), shorten(post.summary, 360),
    `Published ${at} UTC\n${post.url}`].join('\n\n');
}
