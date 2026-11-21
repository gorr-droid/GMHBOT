import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sources = JSON.parse(readFileSync(new URL('../previews/sources.json', import.meta.url), 'utf8'));
const price = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function day(value) {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  }).format(new Date(value));
}

function clock(value, timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone
  }).format(new Date(value));
}

function chartDrafts(record) {
  const levels = [record.bid, record.ask, record.h1Close, record.h1Ema200,
    ...record.swingLows, ...record.swingHighs];
  if (record.symbol !== 'XAUUSD' || levels.some(level => !Number.isFinite(level) || level <= 0)
    || record.ask < record.bid) {
    throw new Error('Invalid archived XAUUSD price or quote spread.');
  }
  const [bar, quote, analysis] = [record.h1CloseAt, record.observedAt, record.analysedAt].map(Date.parse);
  if (![bar, quote, analysis].every(Number.isFinite) || bar > quote || quote > analysis) {
    throw new Error('The completed bar, quote and analysis must have ordered timestamps.');
  }
  const title = `Archive chart review | XAUUSD | ${day(record.observedAt)}`;
  const close = price.format(record.h1Close);
  const ema = price.format(record.h1Ema200);
  const position = record.h1Close < record.h1Ema200 ? 'below' : record.h1Close > record.h1Ema200 ? 'above' : 'at';
  const quoteLine = `${record.provider} recorded a bid of ${price.format(record.bid)} and an ask of ${price.format(record.ask)} USD per ounce at ${clock(quote)} UTC.`;
  const barLine = `The hourly candle closed at ${close} at ${clock(bar)} UTC, ${position} its 200-hour exponential moving average of ${ema}.`;
  const range = items => items.map(value => price.format(value)).join('–');
  const structure = `Earlier hourly swing lows clustered at ${range(record.swingLows)}. The nearby swing highs were ${range(record.swingHighs)}.`;
  const source = `Source • Archived ${record.provider} XAUUSD quotes and completed hourly bars. Chart reviewed ${day(analysis)} at ${clock(analysis)} UTC.`;
  return {
    telegram: [`Aurum Desk • ${title}`, quoteLine, barLine, structure, source].join('\n\n'),
    discord: [`**${title}**`, `**The completed hour**\n${barLine} ${quoteLine}`,
      `**Reading the chart**\n${structure} Which band was closer to the bid at ${clock(quote)} UTC? Compare the distance to the nearest edge of each band.`,
      source].join('\n\n')
  };
}

function calendarDrafts(record) {
  const release = Date.parse(record.releaseAt);
  const checked = Date.parse(record.checkedDate);
  if (!Number.isFinite(release) || !Number.isFinite(checked) || checked >= release
    || !record.reportNames.length || new URL(record.url).origin !== 'https://www.bea.gov') {
    throw new Error('Invalid calendar preview date, reports or official source.');
  }
  const title = `US data calendar | ${day(release)}`;
  const times = `${clock(release, 'America/New_York')} New York • ${clock(release)} UTC • ${clock(release, 'Europe/Ljubljana')} Ljubljana`;
  const releases = [`The ${record.provider} lists these reports for the same time.`,
    ...record.reportNames.map(name => `• ${name}`)].join('\n');
  const watch = 'Both reports land together. A move in gold during that minute alone cannot tell us which figure traders reacted to.';
  const source = `Schedule checked ${day(checked)} • ${record.url}`;
  return {
    telegram: [`Aurum Desk • ${title}`, times, releases, watch, source].join('\n\n'),
    discord: [`**${title}**\n${times}`, `**Scheduled releases**\n${releases}`,
      `**For the XAUUSD review**\n${watch} Compare the GDP revision with the previous estimate and read the monthly headline and core PCE changes separately.`,
      source].join('\n\n')
  };
}

export function renderGoldDrafts(kind = 'chart', records = sources) {
  if (!['chart', 'calendar'].includes(kind)) throw new Error('Choose chart or calendar.');
  const posts = kind === 'chart' ? chartDrafts(records.chart) : calendarDrafts(records.calendar);
  if (posts.discord.length > 2000 || posts.telegram.length > 4096) {
    throw new Error('The draft exceeds the platform message limit.');
  }
  return posts;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [kind = 'chart', platform = 'both', ...extra] = process.argv.slice(2);
  try {
    if (extra.length || !['telegram', 'discord', 'both'].includes(platform)) {
      throw new Error('Usage: node src/gold-drafts.mjs [chart|calendar] [telegram|discord|both]');
    }
    const drafts = renderGoldDrafts(kind);
    if (platform === 'both') {
      console.log(`TELEGRAM\n\n${drafts.telegram}\n\nDISCORD\n\n${drafts.discord}`);
    } else {
      console.log(drafts[platform]);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
