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
  let article;
  const pending = [document];
  while (pending.length) {
    const node = pending.pop();
    if (node.tagName === 'article') article = node;
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
  // The website renders the first body paragraph and its numbered sources after the header.
  // Older verified pages can still share just their feed summary.
  const child = (node, tag) => node?.childNodes?.find(item => item.tagName === tag);
  const body = child(article, 'div');
  const context = nodeText(child(child(body, 'div'), 'p'));
  const sourceItems = child(child(body, 'section'), 'ol')?.childNodes ?? [];
  const sources = [];
  for (const item of sourceItems) {
    const id = item.attrs?.find(attr => attr.name === 'id')?.value;
    if (item.tagName !== 'li' || !/^article-source-[1-9]\d{0,2}$/.test(id ?? '')) continue;
    const title = nodeText(child(item, 'a'));
    if (title) sources.push({ title, url: post.url + '#' + id });
    if (sources.length === 2) break;
  }
  return { ...post, context, sources };
}

function nodeText(node) {
  function collect(item) {
    if (!item || ['script', 'style', 'template'].includes(item.tagName)) return '';
    return item.nodeName === '#text' ? item.value : (item.childNodes ?? []).map(collect).join('');
  }
  return clean(collect(node));
}

function shorten(text, size) {
  if (text.length <= size) return text;
  const prefix = text.slice(0, size - 1).replace(/[\uD800-\uDBFF]$/u, '');
  const lastSpace = prefix.lastIndexOf(' ');
  return (lastSpace > size / 2 ? prefix.slice(0, lastSpace) : prefix) + '…';
}

const profileMark = 'https://gmh-shop.com/aurum-desk-mark.webp';
const archiveUrl = 'https://gmh-shop.com/aurum';
const statementUrl = 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20251029a.htm';

export function sampleArticle(kind) {
  if (!['news', 'plan'].includes(kind)) throw new Error('Unknown article type.');
  const news = kind === 'news';
  return {
    kind, historical: true, published: Date.parse('2025-10-29T18:00:00Z'),
    title: news ? 'Fed cuts rates by a quarter point' : 'Reading gold after a Fed decision',
    summary: news
      ? 'On 29 October 2025, the Federal Reserve lowered its target range to 3.75–4.00%. The committee said the risks to employment had risen.'
      : 'Use the 29 October 2025 Fed decision as a chart exercise. Mark 18:00 UTC on XAU/USD, the dollar index and the US 10-year Treasury yield.',
    context: news
      ? 'Mark the announcement on the gold chart. Compare the dollar and Treasury yields over the same 15 minutes to see how all three markets responded.'
      : 'Record the direction of each market over the next 15 minutes, then repeat at one hour. If the two windows tell different stories, keep both observations in your notes.',
    sources: [{ title: 'Federal Reserve · 29 October statement', url: statementUrl }]
  };
}

function articleCopy(post) {
  const news = post.kind === 'news';
  const date = new Date(post.published);
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(date);
  const clock = date.toISOString().slice(11, 16);
  const context = clean(post.context);
  return {
    label: news ? 'Gold news' : 'Gold market plan',
    noteLabel: news ? 'In focus' : 'What to watch',
    title: shorten(clean(post.title), 126),
    summary: shorten(clean(post.summary), 600),
    context: context && context !== clean(post.summary) ? shorten(context, 360) : '',
    sources: (post.sources ?? []).slice(0, 2).map(s => ({ title: shorten(clean(s.title), 85), url: s.url })),
    footer: post.historical ? 'Historical example · ' + day : day + ' · ' + clock + ' UTC',
    link: post.historical ? archiveUrl : post.url,
    button: post.historical ? 'Open research archive' : news ? 'Read the full brief' : 'Read the market plan'
  };
}

function discordText(value) {
  // Article prose is text, even when it contains Markdown, platform mentions or custom emojis.
  return value.replace(/[\\*_~|()[\]<>#\x60]/g, '\\$&').replace(/@/g, '@\u200b');
}

function html(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function linkRow(copy) {
  return { type: 1, components: [{ type: 2, style: 5, label: copy.button, url: copy.link }] };
}

function sourceLinks(copy, platform) {
  return copy.sources.map(source => platform === 'telegram'
    ? '<a href="' + html(source.url) + '">' + html(source.title) + '</a>'
    : '[' + discordText(source.title) + '](' + source.url + ')').join('\n');
}

export function discordArticle(post) {
  const copy = articleCopy(post);
  const fields = [];
  if (copy.context) fields.push({ name: copy.noteLabel, value: discordText(copy.context) });
  if (copy.sources.length) fields.push({ name: copy.sources.length === 1 ? 'Source' : 'Sources',
    value: sourceLinks(copy, 'discord') });
  return { embeds: [{
    author: { name: 'Aurum Desk  /  ' + copy.label, icon_url: profileMark },
    color: 0xc5a45b, title: discordText(copy.title), description: discordText(copy.summary), fields,
    footer: { text: 'XAU/USD  ·  ' + copy.footer }
  }], components: [linkRow(copy)], allowedMentions: { parse: [], repliedUser: false } };
}

function telegramLines(copy, bold, italic, text, links) {
  return [bold('Aurum Desk') + '  ·  ' + copy.label + '  /  XAU/USD', bold(text(copy.title)), text(copy.summary),
    copy.context && (bold(copy.noteLabel) + '\n' + text(copy.context)),
    copy.sources.length > 0 && links, italic(copy.footer)
  ].filter(Boolean).join('\n\n');
}

export function telegramArticle(post) {
  const copy = articleCopy(post);
  const bold = s => '<b>' + s + '</b>';
  const sources = (copy.sources.length > 1 ? 'Sources' : 'Source') + '  ·  ' + sourceLinks(copy, 'telegram');
  const text = telegramLines(copy, bold, s => '<i>' + s + '</i>', html, sources);
  return { text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: copy.button, url: copy.link }]] } };
}

// Discord DMs can display the Telegram message order and emphasis using Discord's own markup.
export function discordArticlePreview(post, platform) {
  if (platform === 'discord') return discordArticle(post);
  if (platform !== 'telegram') throw new Error('Unknown preview platform.');
  const copy = articleCopy(post);
  const links = (copy.sources.length > 1 ? 'Sources' : 'Source') + '  ·  ' + sourceLinks(copy, 'discord');
  const description = telegramLines(copy, s => '**' + s + '**', s => '_' + s + '_', discordText, links);
  return { embeds: [{ color: 0x269ed4, description }], components: [linkRow(copy)],
    allowedMentions: { parse: [], repliedUser: false } };
}

export function formatExcerpt(post) {
  const copy = articleCopy(post);
  return [copy.label, copy.title, copy.summary, copy.context, copy.footer, copy.link].filter(Boolean).join('\n\n');
}
