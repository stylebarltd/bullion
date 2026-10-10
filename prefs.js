// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {CURRENCIES} from './currencies.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

const COINGECKO = 'https://api.coingecko.com/api/v3';
const SEARCH_DEBOUNCE_MS = 450;

function parseCoin(entry) {
    const [id, sym, ...rest] = entry.split(':');
    return {id, sym: (sym || id).toUpperCase(), name: rest.join(':') || sym || id};
}

const formatCoin = c => `${c.id}:${c.sym}:${c.name.replaceAll(':', ' ')}`;

export default class BullionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keep alive for the lifetime of the window
        window.set_default_size(600, 760);
        window.add(this._buildGeneralPage(settings));
        window.add(this._buildCoinsPage(window, settings));
    }

    _buildGeneralPage(settings) {
        const page = new Adw.PreferencesPage({title: 'General', icon_name: 'preferences-system-symbolic'});

        const metals = new Adw.PreferencesGroup({title: 'Metals', description: 'Spot prices from gold-api.com.'});
        for (const [key, title] of [['show-gold', 'Gold'], ['show-silver', 'Silver']]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            metals.add(row);
        }
        const ratio = new Adw.SwitchRow({title: 'Gold/silver ratio', subtitle: 'Show the ratio at the bottom of the menu'});
        settings.bind('show-ratio', ratio, 'active', Gio.SettingsBindFlags.DEFAULT);
        metals.add(ratio);
        page.add(metals);

        const currency = new Adw.PreferencesGroup({title: 'Currency'});
        const combo = new Adw.ComboRow({
            title: 'Display currency',
            model: Gtk.StringList.new(CURRENCIES.map(([code, name]) => `${code.toUpperCase()} — ${name}`)),
        });
        const current = CURRENCIES.findIndex(([code]) => code === settings.get_string('currency'));
        combo.selected = current >= 0 ? current : 0;
        combo.connect('notify::selected', () => settings.set_string('currency', CURRENCIES[combo.selected][0]));
        currency.add(combo);
        page.add(currency);

        const panel = new Adw.PreferencesGroup({title: 'Panel & updates'});
        const changeRow = new Adw.SwitchRow({title: 'Show 24h change in the panel', subtitle: 'Otherwise only the ▲/▼ arrow is shown'});
        settings.bind('panel-show-change', changeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panel.add(changeRow);
        panel.add(this._spinRow(settings, 'rotate-seconds', 'Rotate every (seconds)', 'How long each asset stays in the panel', 2, 60, 1));
        panel.add(this._spinRow(settings, 'refresh-seconds', 'Refresh every (seconds)', 'CoinGecko\'s free tier is rate limited; 60 or more is safe', 30, 3600, 10));
        page.add(panel);

        return page;
    }

    _spinRow(settings, key, title, subtitle, lo, hi, step) {
        const row = new Adw.SpinRow({
            title, subtitle,
            adjustment: new Gtk.Adjustment({lower: lo, upper: hi, step_increment: step, page_increment: step * 5}),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildCoinsPage(window, settings) {
        const page = new Adw.PreferencesPage({title: 'Coins', icon_name: 'view-list-symbolic'});
        const session = new Soup.Session({timeout: 15, user_agent: 'gnome-shell-bullion-prefs/1.0'});
        const cancellable = new Gio.Cancellable();
        let searchTimer = 0;
        let coinRows = [];
        let resultRows = [];

        const tracked = new Adw.PreferencesGroup({
            title: 'Tracked coins',
            description: 'Shown in this order in the menu and panel rotation.',
        });
        const add = new Adw.PreferencesGroup({
            title: 'Add a coin',
            description: 'Showing the top coins by market cap. Type to search all of CoinGecko.',
        });
        const search = new Adw.EntryRow({title: 'Search by name or symbol'});
        add.add(search);
        page.add(tracked);
        page.add(add);

        const getCoins = () => settings.get_strv('coins');
        const setCoins = list => settings.set_strv('coins', list);

        const rebuildTracked = () => {
            for (const r of coinRows) tracked.remove(r);
            coinRows = [];
            const list = getCoins();
            list.forEach((entry, i) => {
                const c = parseCoin(entry);
                const row = new Adw.ActionRow({title: c.name, subtitle: c.sym});
                const mk = (icon, tip, cb, sensitive = true) => {
                    const b = new Gtk.Button({icon_name: icon, tooltip_text: tip, valign: Gtk.Align.CENTER, sensitive});
                    b.add_css_class('flat');
                    b.connect('clicked', cb);
                    return b;
                };
                const move = delta => () => {
                    const l = getCoins();
                    const j = i + delta;
                    [l[i], l[j]] = [l[j], l[i]];
                    setCoins(l);
                    rebuildTracked();
                    rebuildResults();
                };
                row.add_suffix(mk('go-up-symbolic', 'Move up', move(-1), i > 0));
                row.add_suffix(mk('go-down-symbolic', 'Move down', move(1), i < list.length - 1));
                const del = mk('user-trash-symbolic', 'Remove', () => {
                    setCoins(getCoins().filter((_e, k) => k !== i));
                    rebuildTracked();
                    rebuildResults();
                });
                del.add_css_class('destructive-action');
                row.add_suffix(del);
                tracked.add(row);
                coinRows.push(row);
            });
            if (!list.length) {
                const empty = new Adw.ActionRow({title: 'No coins tracked', subtitle: 'Add some below'});
                tracked.add(empty);
                coinRows.push(empty);
            }
        };

        let lastResults = [];
        const rebuildResults = () => {
            for (const r of resultRows) add.remove(r);
            resultRows = [];
            const have = new Set(getCoins().map(e => parseCoin(e).id));
            for (const c of lastResults) {
                const row = new Adw.ActionRow({title: c.name, subtitle: c.sym + (c.rank ? `  ·  #${c.rank}` : '')});
                const added = have.has(c.id);
                const btn = new Gtk.Button({
                    label: added ? 'Added' : 'Add',
                    valign: Gtk.Align.CENTER,
                    sensitive: !added,
                });
                if (!added) btn.add_css_class('suggested-action');
                btn.connect('clicked', () => {
                    setCoins([...getCoins(), formatCoin(c)]);
                    rebuildTracked();
                    rebuildResults();
                });
                row.add_suffix(btn);
                add.add(row);
                resultRows.push(row);
            }
        };

        const getJson = async url => {
            const msg = Soup.Message.new('GET', url);
            const bytes = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable);
            if (msg.status_code !== 200) throw new Error(`HTTP ${msg.status_code}`);
            return JSON.parse(new TextDecoder().decode(bytes.get_data()));
        };

        const showError = e => {
            if (cancellable.is_cancelled()) return;
            lastResults = [];
            rebuildResults();
            const row = new Adw.ActionRow({title: 'Could not reach CoinGecko', subtitle: String(e.message ?? e)});
            add.add(row);
            resultRows.push(row);
        };

        const loadTop = async () => {
            try {
                const arr = await getJson(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false`);
                if (cancellable.is_cancelled()) return;
                lastResults = arr.map(x => ({id: x.id, sym: x.symbol.toUpperCase(), name: x.name, rank: x.market_cap_rank}));
                rebuildResults();
            } catch (e) {
                showError(e);
            }
        };

        const runSearch = async q => {
            try {
                const j = await getJson(`${COINGECKO}/search?query=${encodeURIComponent(q)}`);
                if (cancellable.is_cancelled() || search.text.trim() !== q) return;
                lastResults = j.coins.slice(0, 25).map(x => ({id: x.id, sym: x.symbol.toUpperCase(), name: x.name, rank: x.market_cap_rank}));
                rebuildResults();
            } catch (e) {
                showError(e);
            }
        };

        search.connect('changed', () => {
            if (searchTimer) GLib.source_remove(searchTimer);
            const q = search.text.trim();
            searchTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SEARCH_DEBOUNCE_MS, () => {
                searchTimer = 0;
                if (q.length >= 2) runSearch(q);
                else if (!q.length) loadTop();
                return GLib.SOURCE_REMOVE;
            });
        });

        window.connect('close-request', () => {
            cancellable.cancel();
            if (searchTimer) GLib.source_remove(searchTimer);
            searchTimer = 0;
            session.abort();
            return false;
        });

        rebuildTracked();
        loadTop();
        return page;
    }
}
