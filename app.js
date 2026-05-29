// ----------------------------------------------------
// GLOBALS
// ----------------------------------------------------
let blacklist = new Set();
let globals = null;
let lastSearch = 0;

// Logged-in user (Hive Keychain)
let loggedInUser = null;

// Per-user settings (loaded from localStorage)
let currentUserSettings = null;

// Default settings
const DEFAULT_SETTINGS = {
    cards: {
        repCard: true,
        ageCard: true,
        hpCard: true,
        delegationPctCard: true,
        keCard: true,
        postsCard: true,
        commentsCard: true,
        ratioCard: true,
        transfersCard: true,
        downvotesCard: true,
        uniqueUpvotesCard: true,
        blacklistCard: true
    },
    thresholds: {
        reputation: {
            red: 10,
            orange: 25
        }
    }
};

// Exchange accounts
const EXCHANGES = new Set([
    "deepcrypto8","binance-hot","poloniex","bittrex","upbitsteem",
    "hot.dunamu","hot1.dunamu","hot2.dunamu","hot3.dunamu","hot4.dunamu","hot5.dunamu",
    "bithumbsend2","bithumbrecv2","bt20hivedkdnel","blocktrades","huobi-withdrawal",
    "huobi-pro","user.dunamu","cold.dunamu","gateiodeposit","indodaxofficial",
    "orinoco","xbts","ionomy","cryptex24","upbitshotwallet1","upbitsusers","xbtsio",
    "mxchive","bdhivesteem"
]);

const SWAP_DEX = new Set([
    "honey-swap", "hiveswap", "hive-engine", "leodex", "uswap", "uswap.hbd",
    "keychain.swap", "graphene-swap", "swap.app", "capybaraexchange", "sw4p",
    "p-hbd", "bnb-hbd", "logicswap", "swapbase", "demotruktrade", "chaoxing",
    "market.backup", "swaplane", "swaplane2", "quikswap", "happycustomer"
]);

// Tooltips
const TOOLTIPS = {
  repCard: "Reputation score based on upvotes received.",
  ageCard: "Number of days since the account was created.",
  hpCard: "Hive Power: your effective stake used for voting.",
  delegationPctCard: "Percentage of total HP that is delegated.",
  postsCard: "Number of posts created in the last 7 days.",
  commentsCard: "Number of comments made in the last 7 days.",
  ratioCard: "Comments divided by posts.",
  transfersCard: "Total outgoing transfers in the last 30 days.",
  downvotesCard: "Number of downvotes received in the last 30 days.",
  keCard: "KE — Rewards/Stake Co-efficient.",
  blacklistCard: "Hivewatchers blacklist status.",
  uniqueUpvotesCard: "Unique authors you upvoted in the last 30 days."
};

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------
const api = (method, params = []) =>
    fetch("https://api.hive.blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 })
    }).then(r => r.json()).then(j => j.result);

const daysAgo = d => Date.now() - d * 86400000;

const setCard = (id, value, status) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelector(".value").innerHTML = value;
    el.className = "card " + status;
};

const anonId = () => {
    let id = localStorage.getItem("anon_id");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("anon_id", id);
    }
    return id;
};

function applyTooltips() {
    for (const [id, text] of Object.entries(TOOLTIPS)) {
        const el = document.getElementById(id);
        if (el) el.setAttribute("title", text);
    }
}

// ----------------------------------------------------
// SETTINGS STORAGE
// ----------------------------------------------------
function getSettingsKey(username) {
    return `hive_health_settings_${username}`;
}

function loadUserSettings(username) {
    const key = getSettingsKey(username);
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);

    try {
        const parsed = JSON.parse(raw);
        // Merge with defaults to avoid missing keys
        const merged = structuredClone(DEFAULT_SETTINGS);

        if (parsed.cards) {
            for (const k of Object.keys(merged.cards)) {
                if (k in parsed.cards) merged.cards[k] = parsed.cards[k];
            }
        }
        if (parsed.thresholds && parsed.thresholds.reputation) {
            const t = parsed.thresholds.reputation;
            if (typeof t.red === "number") merged.thresholds.reputation.red = t.red;
            if (typeof t.orange === "number") merged.thresholds.reputation.orange = t.orange;
        }
        return merged;
    } catch {
        return structuredClone(DEFAULT_SETTINGS);
    }
}

function saveUserSettings(username, settings) {
    const key = getSettingsKey(username);
    localStorage.setItem(key, JSON.stringify(settings));
}

// ----------------------------------------------------
// OUTGOING DELEGATIONS
// ----------------------------------------------------
async function getOutgoingDelegations(user) {
    const delegs = await api("condenser_api.get_vesting_delegations", [user, "", 1000]);
    const g = await loadGlobals();
    const fund = parseFloat(g.total_vesting_fund_hive);
    const shares = parseFloat(g.total_vesting_shares);

    return delegs.map(d => ({
        to: d.delegatee,
        hp: parseFloat(d.vesting_shares) * (fund / shares)
    }));
}

// ----------------------------------------------------
// LOGGING
// ----------------------------------------------------
async function logSearch(username) {
    const payload = {
        content: `🔍 Search: **${username}**\n🆔 Anonymous ID: \`${anonId()}\``
    };

    try {
        await fetch(
            "https://discord.com/api/webhooks/1506564033141018674/p0rGAjrficEBUJ0v1jobUQXeyO8FL3gIU8roaMcDIH3QlmGl3gMKUutuV38FlwSB3kIR",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }
        );
    } catch (e) {
        console.error("Webhook error:", e);
    }
}

async function logLogin(username) {
    const payload = {
        content: `🔐 Login via Hive Keychain: **${username}**`
    };

    try {
        await fetch(
            "https://discord.com/api/webhooks/1506564033141018674/p0rGAjrficEBUJ0v1jobUQXeyO8FL3gIU8roaMcDIH3QlmGl3gMKUutuV38FlwSB3kIR",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }
        );
    } catch (e) {
        console.error("Webhook error:", e);
    }
}

const throttle = () => {
    const now = Date.now();
    if (now - lastSearch < 1500) return false;
    lastSearch = now;
    return true;
};

// ----------------------------------------------------
// LOADERS
// ----------------------------------------------------
async function loadGlobals() {
    if (globals) return globals;
    globals = await api("condenser_api.get_dynamic_global_properties");
    return globals;
}

async function loadBlacklist() {
    try {
        const res = await fetch("https://spaminator.me/api/bl/all.json");
        const data = await res.json();
        blacklist = new Set(data.result || []);
    } catch (e) {
        console.error("Blacklist load error:", e);
    }
}
// ----------------------------------------------------
// ACCOUNT DATA
// ----------------------------------------------------
const getAccount = u => api("condenser_api.get_accounts", [[u]]).then(r => r?.[0] || null);
const getReputation = u => api("bridge.get_profile", [{ account: u }]).then(r => r?.reputation || 0);

async function getHP(acc) {
    const g = await loadGlobals();
    const fund = parseFloat(g.total_vesting_fund_hive);
    const shares = parseFloat(g.total_vesting_shares);

    const vs = parseFloat(acc.vesting_shares);
    const rs = parseFloat(acc.received_vesting_shares);
    const ds = parseFloat(acc.delegated_vesting_shares);

    return (vs + rs - ds) * (fund / shares);
}

async function getDelegatedHP(acc) {
    const g = await loadGlobals();
    const fund = parseFloat(g.total_vesting_fund_hive);
    const shares = parseFloat(g.total_vesting_shares);
    const ds = parseFloat(acc.delegated_vesting_shares);
    return ds * (fund / shares);
}

// ----------------------------------------------------
// HISTORY (30 DAYS)
// ----------------------------------------------------
async function getHistory30d(user) {
    const limit = 1000;
    let from = -1;
    const cutoff = daysAgo(30);
    const all = [];

    while (true) {
        const batch = await api("condenser_api.get_account_history", [user, from, limit]);
        if (!batch?.length) break;

        for (const h of batch) {
            const ts = new Date(h[1].timestamp).getTime();
            if (ts < cutoff) return all;
            all.push(h);
        }
        from = batch[0][0] - 1;
    }
    return all;
}

// ----------------------------------------------------
// METRICS
// ----------------------------------------------------
function postsComments7d(history, user) {
    const cutoff = daysAgo(7);
    let posts = 0, comments = 0;
    const seenPermlinks = new Set();

    for (const h of history) {
        const op = h[1].op;
        if (!op || op[0] !== "comment") continue;

        const c = op[1];
        if (c.author.toLowerCase() !== user) continue;

        const ts = new Date(h[1].timestamp).getTime();
        if (ts < cutoff) continue;

        if (seenPermlinks.has(c.permlink)) continue;
        seenPermlinks.add(c.permlink);

        const isPost =
            c.parent_author === "" &&
            c.title.trim().length > 0 &&
            !c.permlink.startsWith("re-");

        if (isPost) posts++;
        else comments++;
    }

    return { posts, comments, ratio: posts ? comments / posts : 0 };
}

function downvotes(history, user) {
    const cutoff = daysAgo(30);
    const map = {};

    for (const h of history) {
        const op = h[1].op;
        if (!op || op[0] !== "vote") continue;

        const v = op[1];
        const ts = new Date(h[1].timestamp).getTime();
        if (ts < cutoff) continue;

        if (v.weight < 0 && v.author.toLowerCase() === user) {
            map[v.voter] = (map[v.voter] || 0) + 1;
        }
    }
    return map;
}

// ----------------------------------------------------
// UNIQUE AUTHOR UPVOTES (30 DAYS)
// ----------------------------------------------------
function uniqueUpvotedAuthors(history, user) {
    const cutoff = daysAgo(30);
    const authors = new Set();

    for (const h of history) {
        const op = h[1].op;
        if (!op || op[0] !== "vote") continue;

        const v = op[1];
        const ts = new Date(h[1].timestamp).getTime();
        if (ts < cutoff) continue;

        if (!v.author || v.author.trim() === "") continue;

        if (v.voter.toLowerCase() === user && v.weight > 0) {
            authors.add(v.author.toLowerCase());
        }
    }

    return authors.size;
}

// ----------------------------------------------------
// TRANSFERS
// ----------------------------------------------------
function outgoingTransfers(history, user) {
    return history
        .filter(h => h[1].op[0] === "transfer")
        .map(h => h[1].op[1])
        .filter(t => t.from.toLowerCase() === user);
}

function summarizeTransfers(list) {
    let hive = 0, hbd = 0;
    const perUser = {};

    for (const t of list) {
        const [amt, cur] = t.amount.split(" ");
        const v = parseFloat(amt);

        if (cur === "HIVE") hive += v;
        if (cur === "HBD") hbd += v;

        if (!perUser[t.to]) perUser[t.to] = { hive: 0, hbd: 0 };
        if (cur === "HIVE") perUser[t.to].hive += v;
        if (cur === "HBD") perUser[t.to].hbd += v;
    }
    return { hive, hbd, perUser };
}

// ----------------------------------------------------
// KE — KRAMPUS EFFICIENCY
// ----------------------------------------------------
async function computeKE(acc) {
    const g = await loadGlobals();

    const authorRewards = acc.posting_rewards / 1000;
    const curationRewards = acc.curation_rewards / 1000;

    const fund = parseFloat(g.total_vesting_fund_hive);
    const shares = parseFloat(g.total_vesting_shares);
    const vesting = parseFloat(acc.vesting_shares);

    const hpBalance = shares ? (fund * vesting) / shares : 0;

    const krampus = hpBalance ? (authorRewards + curationRewards) / hpBalance : -1;

    return { authorRewards, curationRewards, hpBalance, krampus };
}
// ----------------------------------------------------
// HIVE KEYCHAIN LOGIN (HANDSHAKE + SIGNBUFFER)
// ----------------------------------------------------
function renderTopBar() {
    const el = document.getElementById("topBar");
    if (!el) return;

    const userLabel = loggedInUser
        ? `<span class="topbar-user">👤 ${loggedInUser}</span>`
        : `<span class="topbar-user topbar-user-guest">Guest</span>`;

    const loginBtn = !loggedInUser
        ? `<button id="loginBtn" class="topbar-btn" title="Login with Hive Keychain">Login</button>`
        : `<button id="logoutBtn" class="topbar-btn" title="Logout">⎋</button>`;

    const settingsBtn = `<button id="settingsBtn" class="topbar-btn" title="Settings">⚙️</button>`;

    el.innerHTML = `
        <div class="topbar-inner">
            ${userLabel}
            <div class="topbar-actions">
                ${settingsBtn}
                ${loginBtn}
            </div>
        </div>
    `;

    const lb = document.getElementById("loginBtn");
    const lo = document.getElementById("logoutBtn");
    const sb = document.getElementById("settingsBtn");

    if (lb) lb.addEventListener("click", keychainLogin);
    if (lo) lo.addEventListener("click", logoutUser);
    if (sb) sb.addEventListener("click", onSettingsClick);
}

async function keychainLogin() {
    if (!window.hive_keychain) {
        alert("Hive Keychain extension not detected.");
        return;
    }

    try {
        await new Promise((resolve, reject) => {
            window.hive_keychain.requestHandshake(res => {
                if (res && res.success) resolve(res);
                else reject(new Error("Handshake failed"));
            });
        });

        const nonce = `HiveHealthLogin-${Date.now()}-${Math.random()}`;

        const signRes = await new Promise((resolve, reject) => {
            window.hive_keychain.requestSignBuffer(
                null,
                nonce,
                "Posting",
                res => {
                    if (res && res.success) resolve(res);
                    else reject(new Error("SignBuffer failed"));
                }
            );
        });

        const username = signRes.data && signRes.data.username
            ? signRes.data.username
            : signRes.username || null;

        if (!username) throw new Error("No username returned from Keychain");

        loggedInUser = username;
        currentUserSettings = loadUserSettings(loggedInUser);
        renderTopBar();
        applySettingsToDashboard();
        await logLogin(loggedInUser);
    } catch (e) {
        console.error("Keychain login error:", e);
        alert("Login failed or was cancelled.");
    }
}

function logoutUser() {
    loggedInUser = null;
    currentUserSettings = null;
    renderTopBar();
    applySettingsToDashboard();
}

// ----------------------------------------------------
// SETTINGS PANEL
// ----------------------------------------------------
function ensureSettingsPanel() {
    let panel = document.getElementById("settingsPanel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "settingsPanel";
    panel.className = "settings-panel hidden";
    document.body.appendChild(panel);
    return panel;
}

function onSettingsClick() {
    if (!loggedInUser) {
        alert("Settings can only be stored when you are logged in.");
        return;
    }
    if (!currentUserSettings) {
        currentUserSettings = loadUserSettings(loggedInUser);
    }
    const panel = ensureSettingsPanel();
    buildSettingsPanel(panel);
    panel.classList.toggle("hidden");
}

function buildSettingsPanel(panel) {
    const s = currentUserSettings || DEFAULT_SETTINGS;

    const cardRows = [
        { id: "repCard", label: "Reputation" },
        { id: "ageCard", label: "Account age" },
        { id: "hpCard", label: "Active HP" },
        { id: "delegationPctCard", label: "Delegation %" },
        { id: "keCard", label: "KE (Rewards/Stake)" },
        { id: "postsCard", label: "Posts (7d)" },
        { id: "commentsCard", label: "Comments (7d)" },
        { id: "ratioCard", label: "Comment/Post ratio" },
        { id: "transfersCard", label: "Outgoing transfers (30d)" },
        { id: "downvotesCard", label: "Incoming downvotes (30d)" },
        { id: "uniqueUpvotesCard", label: "Unique author upvotes (30d)" },
        { id: "blacklistCard", label: "Hivewatchers blacklist" }
    ];

    const repRed = s.thresholds.reputation.red;
    const repOrange = s.thresholds.reputation.orange;

    panel.innerHTML = `
        <div class="settings-header">
            <span>Dashboard settings</span>
            <button id="settingsCloseBtn" class="settings-close">✕</button>
        </div>
        <div class="settings-body">
            <h4>Cards</h4>
            <div class="settings-list">
                ${cardRows.map(row => `
                    <div class="settings-row">
                        <span>${row.label}</span>
                        <label class="switch">
                            <input type="checkbox" data-card-id="${row.id}" ${s.cards[row.id] ? "checked" : ""}>
                            <span class="slider"></span>
                        </label>
                    </div>
                `).join("")}
            </div>

            <h4>Reputation thresholds</h4>
            <div class="settings-row thresholds-row">
                <span>Red</span>
                <input type="number" id="repRedInput" value="${repRed}" />
            </div>
            <div class="settings-row thresholds-row">
                <span>Orange</span>
                <input type="number" id="repOrangeInput" value="${repOrange}" />
            </div>
        </div>
    `;

    document.getElementById("settingsCloseBtn")
        .addEventListener("click", () => panel.classList.add("hidden"));

    panel.querySelectorAll("input[type=checkbox][data-card-id]").forEach(input => {
        input.addEventListener("change", e => {
            const id = e.target.getAttribute("data-card-id");
            const checked = e.target.checked;
            currentUserSettings.cards[id] = checked;
            if (loggedInUser) saveUserSettings(loggedInUser, currentUserSettings);
            applySettingsToDashboard();
        });
    });

    const redInput = document.getElementById("repRedInput");
    const orangeInput = document.getElementById("repOrangeInput");

    redInput.addEventListener("change", () => {
        const v = parseFloat(redInput.value);
        if (!isNaN(v)) {
            currentUserSettings.thresholds.reputation.red = v;
            if (loggedInUser) saveUserSettings(loggedInUser, currentUserSettings);
            applySettingsToDashboard();
        }
    });

    orangeInput.addEventListener("change", () => {
        const v = parseFloat(orangeInput.value);
        if (!isNaN(v)) {
            currentUserSettings.thresholds.reputation.orange = v;
            if (loggedInUser) saveUserSettings(loggedInUser, currentUserSettings);
            applySettingsToDashboard();
        }
    });
}

// ----------------------------------------------------
// APPLY SETTINGS TO DASHBOARD
// ----------------------------------------------------
function applySettingsToDashboard() {
    const s = currentUserSettings || DEFAULT_SETTINGS;

    const cardIds = Object.keys(s.cards);
    for (const id of cardIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.style.display = s.cards[id] ? "" : "none";
    }

    const repEl = document.getElementById("repCard");
    if (repEl) {
        const valEl = repEl.querySelector(".value");
        if (valEl) {
            const rep = parseFloat(valEl.textContent);
            if (!isNaN(rep)) {
                const red = s.thresholds.reputation.red;
                const orange = s.thresholds.reputation.orange;
                const status = rep <= red ? "danger" : rep < orange ? "warning" : "ok";
                setCard("repCard", rep, status);
            }
        }
    }
}
// ----------------------------------------------------
// MAIN
// ----------------------------------------------------
async function checkUser() {
    const user = document.getElementById("username").value.trim().toLowerCase();
    if (!user || !throttle()) return;

    logSearch(user);

    const dash = document.getElementById("dashboard");
    dash.innerHTML = "Loading…";

    const acc = await getAccount(user);
    if (!acc) return dash.innerHTML = "Account not found";

    if (!blacklist.size) await loadBlacklist();

    const rep = await getReputation(user);
    const age = Math.floor((Date.now() - new Date(acc.created)) / 86400000);
    const hp = await getHP(acc);
    const dHP = await getDelegatedHP(acc);
    const dPct = (hp + dHP) > 0 ? (dHP / (hp + dHP)) * 100 : 0;
    const isBL = blacklist.has(user);
    const ke = await computeKE(acc);

    const s = currentUserSettings || DEFAULT_SETTINGS;
    const repRed = s.thresholds.reputation.red;
    const repOrange = s.thresholds.reputation.orange;

    dash.innerHTML = `
        <div class="grid">
            <div class="card" id="repCard"><div class="label">Reputation</div><div class="value">${rep}</div></div>
            <div class="card" id="ageCard"><div class="label">Account age (days)</div><div class="value">${age}</div></div>
            <div class="card" id="hpCard"><div class="label">Active HP</div><div class="value">${hp.toFixed(3)}</div></div>

            <div class="card" id="delegationPctCard"><div class="label">Delegation %</div><div class="value">${dPct.toFixed(1)}%</div></div>

            <div class="card" id="keCard"><div class="label">KE (Rewards/Stake Co-efficient)</div><div class="value">${ke.krampus.toFixed(4)}</div></div>

            <div class="card loading" id="postsCard"><div class="label">Posts (7d)</div><div class="value">Loading…</div></div>
            <div class="card loading" id="commentsCard"><div class="label">Comments (7d)</div><div class="value">Loading…</div></div>
            <div class="card loading" id="ratioCard"><div class="label">Comment/Post ratio</div><div class="value">Loading…</div></div>

            <div class="card loading" id="transfersCard"><div class="label">Outgoing transfers (30d)</div><div class="value">Loading…</div></div>
            <div class="card loading" id="downvotesCard"><div class="label">Incoming downvotes (30d)</div><div class="value">Loading…</div></div>

            <div class="card loading" id="uniqueUpvotesCard">
                <div class="label">Unique author upvotes (30d)</div>
                <div class="value">Loading…</div>
            </div>

            <div class="card" id="blacklistCard"><div class="label">Hivewatchers blacklist</div><div class="value">${isBL ? "YES" : "NO"}</div></div>
        </div>

        <div id="transferTable"></div>
        <div id="downvoteTable"></div>
        <div id="delegationTable"></div>
    `;

    applyTooltips();

    const repStatus = rep <= repRed ? "danger" : rep < repOrange ? "warning" : "ok";
    setCard("repCard", rep, repStatus);
    setCard("ageCard", age, age < 31 ? "danger" : "ok");
    setCard("hpCard", hp.toFixed(3), hp < 100 ? "danger" : "ok");

    setCard("delegationPctCard", dPct.toFixed(1) + "%", dPct > 50 ? "danger" : dPct > 25 ? "warning" : "ok");

    setCard("blacklistCard", isBL ? "YES" : "NO", isBL ? "danger" : "ok");

    const keStatus =
        ke.krampus < 2 ? "ok" :
        ke.krampus < 5 ? "warning" :
        "danger";

    setCard("keCard", ke.krampus.toFixed(4), keStatus);

    const hist = await getHistory30d(user);

    const pc = postsComments7d(hist, user);
    setCard("postsCard", pc.posts, pc.posts > 10 ? "danger" : pc.posts >= 8 ? "warning" : "ok");
    setCard("commentsCard", pc.comments, pc.comments < 7 ? "danger" : pc.comments < 14 ? "warning" : "ok");

    const ratioStatus =
        pc.posts === 0 ? "ok" :
        pc.ratio < 0 ? "warning" :
        "ok";

    setCard("ratioCard", pc.ratio.toFixed(2), ratioStatus);

    const uniqueUp = uniqueUpvotedAuthors(hist, user);
    const upStatus =
        uniqueUp < 25 ? "danger" :
        uniqueUp < 100 ? "warning" :
        "ok";

    setCard("uniqueUpvotesCard", uniqueUp, upStatus);

    const transfers = outgoingTransfers(hist, user);
    const sum = summarizeTransfers(transfers);

    const tStatus = (sum.hive > 10 || sum.hbd > 5) ? "warning" : "ok";
    setCard("transfersCard", `${sum.hive.toFixed(3)} HIVE<br>${sum.hbd.toFixed(3)} HBD`, tStatus);

    if (Object.keys(sum.perUser).length) {
        document.getElementById("transferTable").innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th colspan="2">Outgoing transfers (30d)</th></tr>
                    <tr><th>Recipient</th><th>Total</th></tr>
                </thead>
                <tbody>
                    ${Object.entries(sum.perUser).map(([to, v]) => `
                        <tr class="danger-row">
                           <td>${
    EXCHANGES.has(to.toLowerCase()) 
        ? to + " (exchange)" 
        : SWAP_DEX.has(to.toLowerCase())
            ? to + " (swap/dex)"
            : to
}</td>
                            <td>${v.hive.toFixed(3)} HIVE<br>${v.hbd.toFixed(3)} HBD</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    const dv = downvotes(hist, user);
    const totalDV = Object.values(dv).reduce((a, b) => a + b, 0);

    const dvStatus =
        totalDV >= 10 ? "danger" :
        totalDV > 0 ? "warning" :
        "ok";

    setCard("downvotesCard", totalDV, dvStatus);

    if (totalDV > 0) {
        document.getElementById("downvoteTable").innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th colspan="2">Incoming downvotes (30d)</th></tr>
                    <tr><th>User</th><th>Count</th></tr>
                </thead>
                <tbody>
                    ${Object.entries(dv)
                        .sort((a, b) => b[1] - a[1])
                        .map(([u, c]) => `
                            <tr class="danger-row">
                                <td>${u}</td>
                                <td>${c}</td>
                            </tr>
                        `).join("")}
                </tbody>
            </table>
        `;
    }

    const delegs = await getOutgoingDelegations(user);

    if (delegs.length > 0) {
        document.getElementById("delegationTable").innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th colspan="2">Outgoing delegations</th></tr>
                    <tr><th>Delegatee</th><th>HP delegated</th></tr>
                </thead>
                <tbody>
                    ${delegs.map(d => `
                        <tr class="danger-row">
                            <td>${EXCHANGES.has(d.to.toLowerCase()) ? d.to + " (exchange)" : d.to}</td>
                            <td>${d.hp.toFixed(3)} HP</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    applySettingsToDashboard();
}

// ----------------------------------------------------
// EVENTS
// ----------------------------------------------------
document.getElementById("checkBtn").addEventListener("click", checkUser);

document.getElementById("username").addEventListener("keydown", e => {
    if (e.key === "Enter") checkUser();
});

window.checkUser = checkUser;

// Initial top bar render
renderTopBar();
