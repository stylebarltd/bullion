# Changelog

## 1.0.0

Initial release (renamed and rebuilt from the personal `prices@pola` prototype).

- Gold, silver and crypto prices in the top bar, rotating through your selection
- ▲/▼ 24h change arrows for every asset, including gold and silver
  (metals compute the change from locally stored history, so it appears after about a day)
- 24h sparklines in the menu
- Gold/silver ratio
- Preferences: searchable coin picker (all of CoinGecko), reorder/remove coins,
  23 display currencies, gold/silver toggles, rotation and refresh intervals
- Offline handling with exponential backoff; stale data is dimmed
- Supports GNOME Shell 46–50
