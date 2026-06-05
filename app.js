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
  "honey-swap","hiveswap","hive-engine","leodex","uswap","uswap.hbd",
  "keychain.swap","graphene-swap","swap.app","capybaraexchange","sw4p",
  "p-hbd","bnb-hbd","logicswap","swapbase","demotruktrade","chaoxing",
  "market.backup","swaplane","swaplane2","quikswap","happycustomer"
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
  downvotesCard: "Incoming downvotes in the last 30 days.",
  keCard: "KE — Rewards/Stake Co-efficient.",
  blacklistCard: "Hivewatchers blacklist status.",
  uniqueUpvotesCard: "Unique authors you upvoted in the last 30 days."
};

// Human‑readable labels
const BLOCK_LABELS = {
  repCard: "Reputation",
  ageCard: "Account age (days)",
  hpCard: "Active HP",
  delegationPctCard: "Delegation %",
  postsCard: "Posts (7d)",
  commentsCard: "Comments (7d)",
  ratioCard: "Comment/Post ratio",
  transfersCard: "Outgoing transfers (30d)",
  downvotesCard: "Incoming downvotes (30d)",
  keCard: "KE (Rewards/Stake Co-efficient)",
  blacklistCard: "Hivewatchers blacklist",
  uniqueUpvotesCard: "Unique author upvotes (30d)"
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
// LOGIN STATE
// ----------------------------------------------------
let loggedInUser = null;
let userPreferences = { hiddenBlocks: [] };

const BLOCKS = [
  "repCard","ageCard","hpCard","delegationPctCard","keCard",
  "postsCard","commentsCard","ratioCard","transfersCard",
  "downvotesCard","uniqueUpvotesCard","blacklistCard"
];

// ----------------------------------------------------
// LOGOUT
// ----------------------------------------------------
function logoutUser() {
  loggedInUser = null;
  userPreferences = { hiddenBlocks: [] };

  document.getElementById("loginStatus").innerHTML = "";
  const btn = document.getElementById("kcLoginBtn");
  btn.innerHTML = "Keychain Login";
  btn.onclick = loginWithKeychain;

  alert("You are now logged out.");
}

// ----------------------------------------------------
// KEYCHAIN LOGIN
// ----------------------------------------------------
async function loginWithKeychain() {
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
        document.getElementById("loginStatus").innerHTML =
          "Logged in as @" + loggedInUser;

        const btn = document.getElementById("kcLoginBtn");
        btn.innerHTML = "Keychain Logout";
        btn.onclick = logoutUser;

        await logLogin(loggedInUser);
        await loadUserPreferences();
        renderSettingsPanel();
      } else {
        alert("Login failed.");
      }
    }
  );
}

// ----------------------------------------------------
// LOAD USER PREFS
// ----------------------------------------------------
async function loadUserPreferences() {
  if (!loggedInUser) {
    userPreferences = { hiddenBlocks: [] };
    return;
  }

  const history = await api("condenser_api.get_account_history", [
    loggedInUser, -1, 1000
  ]);

  userPreferences = { hiddenBlocks: [] };

  for (const h of history.reverse()) {
    const op = h[1].op;
    if (op[0] === "custom_json" && op[1].id === "hive-dashboard-prefs") {
      try {
        const data = JSON.parse(op[1].json);
        userPreferences = data.prefs || { hiddenBlocks: [] };
        return;
      } catch {}
    }
  }
}

// ----------------------------------------------------
// SAVE PREFS
// ----------------------------------------------------
async function saveUserPreferences() {
  if (!loggedInUser) {
    alert("Settings can only be saved when logged in.");
    return;
  }

  hive_keychain.requestCustomJson(
    loggedInUser,
    "hive-dashboard-prefs",
    "Posting",
    JSON.stringify({
      app: "hive-account-health-dashboard",
      prefs: userPreferences
    }),
    "Save dashboard preferences",
    (res) => {
      if (!res.success) alert("Failed to save preferences.");
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

  // Add close button
  if (!document.getElementById("settingsCloseBtn")) {
    const x = document.createElement("button");
    x.id = "settingsCloseBtn";
    x.innerHTML = "×";
    x.style.position = "absolute";
    x.style.top = "8px";
    x.style.right = "8px";
    x.style.fontSize = "20px";
    x.style.border = "none";
    x.style.background = "transparent";
    x.style.cursor = "pointer";
    x.onclick = () => panel.style.display = "none";
    panel.appendChild(x);
  }

  content.innerHTML = BLOCKS.map(id => `
    <label style="display:block; margin:6px 0;">
      <input type="checkbox" data-block="${id}" ${!userPreferences.hiddenBlocks.includes(id) ? "checked" : ""}>
      ${BLOCK_LABELS[id]}
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
// LOGGING
// ----------------------------------------------------
async function logSearch(username) {
  const payload = {
    content: `🔍 Search: **${username}**\n🆔 Anonymous ID: \`${anonId()}\``
  };

  try {
    await fetch(
      "https://discord.com/api/webhooks/1506564033141018674/p0rGAjrficEBUJ0v1jobUQXeyO8FL3gIU8roaMcDIH3QlmGl3gMKUutuV38FlwSB3kIR",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
  } catch {}
}

async function logLogin(username) {
  const payload = {
    content: `🔐 Login via Keychain: **@${username}**\n🆔 Anonymous ID: \`${anonId()}\``
  };

  try {
    await fetch(
      "https://discord.com/api/webhooks/1506564033141018674/p0rGAjrficEBUJ0v1jobUQXeyO8FL3gIU8roaMcDIH3QlmGl3gMKUutuV38FlwSB3kIR",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
  } catch {}
}

// ----------------------------------------------------
// INITIAL EMPTY CARDS (fix for hiding before search)
// ----------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  const dash = document.getElementById("dashboard");
  dash.innerHTML = `
    <div class="grid">
      ${BLOCKS.map(id => `
        <div class="card" id="${id}">
          <div class="label">${BLOCK_LABELS[id]}</div>
          <div class="value">—</div>
        </div>
      `).join("")}
    </div>
  `;
  applyBlockVisibility();
});

// ----------------------------------------------------
// EVENTS
// ----------------------------------------------------
document.getElementById("kcLoginBtn").onclick = loginWithKeychain;

document.getElementById("loginUserInput")
  .addEventListener("keydown", e => {
    if (e.key === "Enter") loginWithKeychain();
  });

document.getElementById("settingsBtn")
  .addEventListener("click", renderSettingsPanel);

document.getElementById("savePrefsBtn")
  .addEventListener("click", saveUserPreferences);
