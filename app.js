// ----------------------------------------------------
// GLOBALS
// ----------------------------------------------------
let blacklist = new Set();
let globals = null;
let lastSearch = 0;

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

// ----------------------------------------------------
// KEYCHAIN LOGIN + SETTINGS
// ----------------------------------------------------
let loggedInUser = null;
let userPreferences = { hiddenBlocks: [] };

const BLOCKS = [
    "repCard", "ageCard", "hpCard", "delegationPctCard",
    "keCard", "postsCard", "commentsCard", "ratioCard",
    "transfersCard", "downvotesCard", "uniqueUpvotesCard", "blacklistCard"
];

// ✔ Mooie labels voor settings popup
const BLOCK_LABELS = {
    repCard: "Reputation",
    ageCard: "Account age (days)",
    hpCard: "Active HP",
    delegationPctCard: "Delegation %",
    keCard: "KE (Rewards/Stake Co-efficient)",
    postsCard: "Posts (7d)",
    commentsCard: "Comments (7d)",
    ratioCard: "Comment/Post ratio",
    transfersCard: "Outgoing transfers (30d)",
    downvotesCard: "Incoming downvotes (30d)",
    uniqueUpvotesCard: "Unique author upvotes (30d)",
    blacklistCard: "Hivewatchers blacklist"
};

function updateLoginUI() {
    const btn = document.getElementById("kcLoginBtn");
    const status = document.getElementById("loginStatus");
    const input = document.getElementById("loginUserInput");

    if (loggedInUser) {
        btn.textContent = "Keychain Logout";
        status.textContent = "Logged in as @" + loggedInUser;
        input.value = loggedInUser;
        input.disabled = true;
    } else {
        btn.textContent = "Keychain Login";
        status.textContent = "Not logged in";
        input.disabled = false;
    }
}

// ----------------------------------------------------
// LOGIN / LOGOUT
// ----------------------------------------------------
async function loginWithKeychain() {
    if (loggedInUser) {
        // logout
        loggedInUser = null;
        userPreferences = { hiddenBlocks: [] };
        updateLoginUI();
        applyBlockVisibility();
        document.getElementById("settingsPanel").style.display = "none";
        return;
    }

    if (!window.hive_keychain) {
        alert("Hive Keychain is not installed.");
        return;
    }

    const username = document.getElementById("loginUserInput").value.trim();
    if (!username) {
        alert("Please enter your Hive username first.");
        return;
    }

    hive_keychain.requestSignBuffer(
        username,
        "login-" + Date.now(),
        "Posting",
        async (res) => {
            if (res.success) {
                loggedInUser = username.toLowerCase();
                updateLoginUI();
                await loadUserPreferences();
                renderSettingsPanel();
                document.getElementById("settingsPanel").style.display = "none";
            } else {
                alert("Login failed.");
            }
        }
    );
}

// ----------------------------------------------------
// LOAD USER PREFS FROM CHAIN
// ----------------------------------------------------
async function loadUserPreferences() {
    if (!loggedInUser) {
        userPreferences = { hiddenBlocks: [] };
        return;
    }

    const history = await api("condenser_api.get_account_history", [
        loggedInUser,
        -1,
        1000
    ]);

    userPreferences = { hiddenBlocks: [] };

    for (const h of history.reverse()) {
        const op = h[1].op;
        if (op[0] === "custom_json" && op[1].id === "hive-dashboard-prefs") {
            try {
                const data = JSON.parse(op[1].json);
                userPreferences = data.prefs || { hiddenBlocks: [] };
                return;
            } catch (e) {
                console.error("Prefs parse error:", e);
            }
        }
    }
}

// ----------------------------------------------------
// SAVE PREFS TO CHAIN
// ----------------------------------------------------
async function saveUserPreferences() {
    if (!loggedInUser) {
        alert("Settings can only be saved when logged in.");
        return;
    }

    const json = {
        app: "hive-account-health-dashboard",
        prefs: userPreferences
    };

    hive_keychain.requestCustomJson(
        loggedInUser,
        "hive-dashboard-prefs",
        "Posting",
        JSON.stringify(json),
        "Save dashboard preferences",
        (res) => {
            if (!res.success) {
                alert("Failed to save preferences.");
            } else {
                alert("Preferences saved.");
                document.getElementById("settingsPanel").style.display = "none";
            }
        }
    );
}

// ----------------------------------------------------
// SETTINGS PANEL
// ----------------------------------------------------
function renderSettingsPanel() {
    const panel = document.getElementById("settingsPanel");
    const content = document.getElementById("settingsContent");

    panel.style.display = "block";

    if (!loggedInUser) {
        content.innerHTML = `<p>You must log in with Hive Keychain to save settings.</p>`;
        return;
    }

    content.innerHTML = BLOCKS.map(id => `
        <label class="settings-row">
            <input type="checkbox" data-block="${id}"
                ${!userPreferences.hiddenBlocks.includes(id) ? "checked" : ""}>
            <span>${BLOCK_LABELS[id] || id}</span>
        </label>
    `).join("");

    content.querySelectorAll("input").forEach(chk => {
        chk.addEventListener("change", () => {
            const id = chk.dataset.block;
            if (!chk.checked) {
                if (!userPreferences.hiddenBlocks.includes(id))
                    userPreferences.hiddenBlocks.push(id);
            } else {
                userPreferences.hiddenBlocks =
                    userPreferences.hiddenBlocks.filter(x => x !== id);
            }
            applyBlockVisibility();
        });
    });

    applyBlockVisibility();
}

// ----------------------------------------------------
// APPLY VISIBILITY
// ----------------------------------------------------
function applyBlockVisibility() {
    for (const id of BLOCKS) {
        const el = document.getElementById(id);
        if (!el) continue;

        el.style.display = userPreferences.hiddenBlocks.includes(id)
            ? "none"
            : "block";
    }
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

function applyTooltips() {
    for (const [id, text] of Object.entries(TOOLTIPS)) {
        const el = document.getElementById(id);
        if (el) el.setAttribute("title", text);
    }
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
const getAccount = u =>
    api("condenser_api.get_accounts", [[u]]).then(r => r?.[0] || null);

const getReputation = u =>
    api("bridge.get_profile", [{ account: u }]).then(r => r?.reputation || 0);

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

// UNIQUE AUTHOR UPVOTES (30 DAYS)
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
    const dHP = await get
