<p align="center"><img src="icons/bullion.svg" width="96" alt="Bullion logo"></p>

# Bullion

**Gold, silver and crypto prices in your GNOME top bar.**

Bullion rotates through the assets you care about right in the panel, with live ▲/▼ 24h change
arrows. Open the menu for sparklines, the gold/silver ratio and everything at a glance.

## Features

- Gold (XAU) and silver (XAG) spot prices, plus any coin on CoinGecko
- ▲/▼ 24h change for **every** asset, coloured green/red
- 24h sparklines in the dropdown
- Gold/silver ratio
- Preferences window with a searchable coin picker, reordering, and 23 display currencies
- Configurable rotation speed and refresh interval
- Backs off and dims stale data when you're offline

## Install

**From source (development):**

```sh
git clone https://github.com/stylebarltd/bullion-gnome.git
cd bullion-gnome
make dev          # symlinks the checkout into ~/.local/share/gnome-shell/extensions
```

**From a release zip:**

```sh
gnome-extensions install --force bullion@stylebarltd.github.io.shell-extension.zip
```

Then log out and back in (Wayland needs this to discover new extensions) and enable it:

```sh
gnome-extensions enable bullion@stylebarltd.github.io
```

## Compatibility

Targets **GNOME Shell 46–50** (Ubuntu 24.04 LTS ships 46). Developed and tested on GNOME 50.

## Data sources

| Data | Source |
|---|---|
| Crypto prices, 24h change, sparklines | [CoinGecko](https://www.coingecko.com/) public API |
| Gold and silver spot (USD) | [gold-api.com](https://gold-api.com/) |
| Currency conversion for metals | [Frankfurter](https://frankfurter.dev/) (ECB rates) |

No API keys are needed. The free CoinGecko tier is rate limited, so keep the refresh interval at
60 seconds or more.

**Metals 24h change** is computed locally: Bullion stores a price sample every ~10 minutes in
`~/.cache/bullion/history.json` and compares against the price from about 24 hours ago. The
arrow and sparkline for gold and silver therefore appear after the extension has been running
for roughly a day.

Prices are informational only and not financial advice.

## Development

```sh
make dev       # symlink + compile schemas
make pack      # build dist/*.shell-extension.zip
journalctl -f -o cat /usr/bin/gnome-shell    # watch for errors
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
