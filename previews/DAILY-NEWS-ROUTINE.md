# Aurum Desk daily news routine

These four English previews can be read before connecting either channel.

| Post | Telegram | Discord |
| --- | --- | --- |
| Archived XAUUSD chart, 2 November 2026 | [Chart review](telegram-chart.txt) | [Gold market plan channel](discord-chart.txt) |
| Calendar checked 21 November for releases on 25 November 2026 | [Calendar note](telegram-calendar.txt) | [News calendar channel](discord-calendar.txt) |

### Website publishing and channel delivery

The daily research worker prepares articles for the Aurum Desk website. An article becomes eligible for channel sharing when the website publishes it and lists it in its public feed. The bot checks that the public page opens and contains the matching article ID, then sends a short excerpt and canonical link to each enabled destination. The website owns the research schedule. One research run can produce both a news article and a market plan.

Discord routes news to **news-calendar** and plans to **gold-market-plan**. Telegram routes both article types to **@AurumDeskk**. The owner previews and enables each of these four routes separately. Once enabled, the bot checks the site every five minutes and ignores existing articles, future-dated entries and posts older than 48 hours. The local archive and calendar previews above are format examples.

### Optional editorial checks

These checks are available when an editor prepares or reviews a daily article. The times in the table describe editorial opportunities.

| When | What the editor prepares |
| --- | --- |
| Before the European session | Check the BLS, BEA and Fed calendars. Write one short list with the event, reference period, scheduled time in UTC and Ljubljana, and the issuing agency link. On a quiet day, name the sources checked and the time of the check. |
| Before a scheduled US release | Reopen the issuer's schedule and check the time again. For a chart post, record the XAUUSD provider, fresh bid and ask, capture time and the last completed candle. If the quote is stale or unavailable, the calendar note can stand alone. |
| After the release | Read the issuer's release. Record the actual figure, unit, reference period, release time and any revised previous value. Link the release itself. Include a consensus estimate only if a separate named source supplies it. |
| After the first complete five-minute candle | If timestamped prices are available, compare the last completed pre-release candle with the first complete post-release candle on the same feed. State both times and the observed change. List simultaneous releases together. |
| Before publication | Review the exact text for each channel and confirm the destination. Keep the first publication manual. Preserve the source and as-of time with each edition. |

Use the institution responsible for each release. The BLS publishes CPI and the US employment report. The BEA publishes GDP and PCE inflation. The Federal Reserve publishes policy statements and minutes. [BLS calendar](https://www.bls.gov/schedule/) · [BEA calendar](https://www.bea.gov/news/schedule/full) · [Federal Reserve calendar](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)

### How to reproduce the previews

From the `aurum-desk-bot` directory, run `node src/gold-drafts.mjs chart` or `node src/gold-drafts.mjs calendar`. Add `telegram` or `discord` as the final argument for a single platform. Both commands print local preview text.

[Source records](sources.json) contain the chart's capture and analysis times, workspace-relative evidence paths and SHA-256 fingerprints, plus the calendar's check date and primary source links. The archived bid and ask were captured on 2 November. The latest complete hourly candle in that capture ended at 11:00 UTC. These timestamps describe different observations. The calendar preview preserves the schedule available on 21 November 2026. Recheck the issuer before using it for another edition.
