# Aurum Desk 2.1 • nadgradnja GMH bota

To je nadgradnja za **isto aplikacijo Discord**. Gostovanje še naprej zaganja `node index.js` in uporablja obstoječo nastavitev `BOT_TOKEN` ali `DISCORD_TOKEN`. Podatki o članih in kanalih ostanejo v istem strežniku. Starega panela za prodajo, dostavo licenc in dnevnega brisanja kanalov novi program ne zaganja.

## Posodobitev obstoječe storitve

1. Lokalno ali na testni kopiji uporabi Node.js 24, nato `npm ci --ignore-scripts`, `npm test` in `npm run preview`. Zadnji ukaz prikaže angleški primer brez prijave.
2. Na obstoječem gostovanju shrani prejšnjo različico. Kopiraj vse datoteke iz paketa nad obstoječi izvor bota. Ohrani njegove nastavitve okolja in žeton. Ohranjen je tudi ukaz `npm start`. Uporabi **eno instanco** in obstojno mapo `AURUM_DATA_DIR` (npr. `/data/aurum` na trajnem disku gostitelja). Na lokalnem računalniku je privzeta mapa `.aurum-data`.
3. Že nameščeni aplikaciji pripadata **Server Members Intent** za prihode in **Message Content Intent** za obstoječe ukaze s predpono `!`. `npm run check-config` preveri prisotnost nastavitev. Ob uvedbi znova zaženi isti proces. Povezavo s strežnikom preveri z ukazom `!ping`.
4. Prvi preizkus opravi z novim članom, ki pristane na preizkus. Član prejme angleško dobrodošlico, ti pa zasebno obvestilo. Bot ne pošilja dobrodošlice za nazaj. Discordove nastavitve zasebnosti lahko preprečijo DM. Preveri oba prejemnika.

Po zagonu posodobljeni bot prikazuje dejavnost **Watching XAUUSD • Aurum Desk**. Za globalni profil sta priloženi datoteki `branding/avatar.png` in `branding/banner.png`. Če Discord na seznamu članov še kaže staro ime, lahko lastnik uporabi spodnji ukaz za vzdevek.

## Ukazi za lastnika

| Ukaz | Učinek |
| --- | --- |
| `!help` ali `!ping` | Prikaže razpoložljive ukaze oziroma odziv bota. |
| `!fix-bot-nickname` | Nastavi prikazno ime istega bota na **Aurum Desk** v tem strežniku. Če je globalno ime že pravilno, odstrani odvečni stari vzdevek. |
| `!setup-welcome` | Odpre upravljanje dobrodošlice. |
| `!sendwelcome` | Prikaže dobrodošlico lastniku v predogled. |
| `!ticket-preview` | V zasebnem pogovoru pokaže kartico za tickete. Klik na temo pokaže uvodno vprašanje za člana. |
| `!activate` / `!pause-welcome` | Vključi ali začasno ustavi dobrodošlico. Obvestila lastniku o prihodih so ločena. |
| `!spawn-tickets` ali `!setup-tickets` | Namesti panel s tremi vrstami zasebnih zahtevkov v obstoječi **👋・start-here**. |
| `!send-verify` | V **👋・start-here** namesti pravila z gumbom **Accept rules**. Ob ponovitvi preveri obstoječi panel. |
| `!setup-news` | Odpre zasebno upravljanje predogledov in deljenja objav. |
| `!news-preview discord-plan` | Pokaže kartico s kratkim načrtom za Discord. Uporabi `telegram-plan` za Telegramovo postavitev, `discord-news` ali `telegram-news` za novico. |
| `!news-status` / `!news-pause` | Prikaže stanje ali ustavi deljenje. |

Po nadgradnji na 2.1 vsi štirje cilji čakajo na novo potrditev. Predogled vidiš v zasebnem pogovoru z botom. Če za cilj še ni preverjenega članka, dobiš označen zgodovinski primer z virom. Gumb za arhiv v primeru odpre spletni arhiv, pri objavljenem članku pa gumb odpre članek. Vsak cilj lahko posebej vključiš po pregledu.

`discord-news` piše v **🗓️・news-calendar**, `discord-plan` v **📊・gold-market-plan**, `telegram-news` in `telegram-plan` pa v **@AurumDeskk**. Za poznejše objavljanje na Telegramu nastavi `AURUM_TELEGRAM_BOT_TOKEN` na gostovanju tega bota in omogoči Telegram aplikaciji objavljanje v kanalu.

Član izbere **Gold education**, **Chart review** ali **Community / VIP access**. Vidnost novega pogovora je omejena na člana, lastnika in bota; Discordovi administratorji lahko vidijo zasebne kanale. Ob zaprtju se članu odvzame dostop in pogovor ostane lastniku. Nov panel nastane samo na ukaz lastnika. Za ustvarjanje kanalov je potrebno Manage Channels, za urejanje dostopa pri zapiranju Manage Roles in za panel branje/pisanje v start-here. Namestitev bota ne spreminja vlog obstoječih članov.

Za sprejemanje pravil ima bot dovoljenje **Manage Roles**, njegova vloga pa mora biti nad običajno vlogo **Member**. Lastnik med delovanjem pošlje `!send-verify` v zasebnem pogovoru z botom ali v strežniku. Bot uporabi nastavljeni `DISCORD_MEMBER_ROLE_ID` ali že shranjeni ID. Ob prvi namestitvi lahko sam poišče eno samo vlogo s točnim imenom **Member**. Če jih je več, na gostovanju določi ID želene vloge. Pred namestitvijo preveri dovoljenja in vidnost kanalov, nato shrani preverjeni ID. Ob vsakem kliku člana dovoljenja preveri znova. Za ročno namestitev na ustavljeni instanci lahko še vedno uporabiš izrecni `DISCORD_MEMBER_ROLE_ID` in `npm run install-rules` z isto trajno mapo.

## Kako deluje deljenje

Bot na pet minut pregleda javni vir spletne strani, ko je vsaj en cilj vključen. Pred objavo preveri tudi javno stran članka in njegov identifikator. Discord dobi kartico z gumbom, Telegram oblikovano sporočilo z gumbom pod besedilom. Če se odgovor pri pošiljanju izgubi, poglej `!news-status` in dejanski kanal. Bot takega pošiljanja samodejno ne ponovi. Začetni vklop prezre stare objave. Javni arhiv je na [gmh-shop.com/aurum](https://gmh-shop.com/aurum).

Za povratek uporabi prejšnjo različico iste storitve. Izvorne štiri datoteke iz Downloads so se pri pripravi te nadgradnje ujemale z obstoječim arhivom `GMHBOT-main.zip`. Povrnitev stare kode znova omogoči tudi njene prvotne prodajne funkcije in časovnike.
