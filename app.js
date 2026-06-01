import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { TrustWalletAdapter } from "@solana/wallet-adapter-trust";

const DATA = window.LAZY_DATA;
const STORAGE_KEY = "lazy-protocol-mvp-state";
const LAZY_X_RULE = "Your X post must tag @LazyProtocol.";
const ADMIN_CATEGORIES = ["World Cup", "Creative", "Predictions", "Research", "Community", "Real World", "Agents", "Sponsored", "Protocol Agent"];
const missionFilters = ["Highest", ...ADMIN_CATEGORIES, "Ending Soon", "Expired"];
const configuredApi = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || window.LAZY_CONFIG?.API_BASE_URL;
const API_BASE = configuredApi && !configuredApi.includes("%VITE_") ? configuredApi.replace(/\/$/, "") : "";
const SOLANA_RPC_URL = import.meta.env?.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const REWARD_WALLET = import.meta.env?.VITE_REWARD_WALLET || window.LAZY_CONFIG?.REWARD_WALLET || "";
const USDC_MINT = import.meta.env?.VITE_USDC_MINT || window.LAZY_CONFIG?.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const solanaConnection = new Connection(SOLANA_RPC_URL, "confirmed");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1c7ufHGF25QFyU7a7oQ4pS6uFhZ9");
const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toast = document.querySelector(".toast");
const isFile = location.protocol === "file:";
const base = !isFile && location.pathname.startsWith("/lazy-protocol") ? "/lazy-protocol" : "";
const recoveredRoute = new URLSearchParams(location.search).get("route");
let missionFilter = "Highest";
let heroSlide = 0;
let boardTab = "humans";
let boardPages = { humans:0, agents:0, countries:0, missions:0 };
let agentQuery = "";
let submissionFilter = "All";
let adminStatusFilter = "All";
let adminCategoryFilter = "All";
let adminMissionFilter = "All";
let adminUserSearch = "";
let adminUserFilter = "all";
let liveData = { missions:null, agents:null, boards:null, submissions:{}, globalSubmissions:null, admin:null };
let touchStartX = 0;
let profileSyncWarning = "";
const HERO_SLIDE_COUNT = 3;

const defaultState = { wallet:null, user:null, username:"HUMAN_001", avatarUrl:null, joined:[], submitted:[], boosts:{}, customMissions:[], submissions:[] };
let state = { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
if (state.wallet === "7xLP4nA9sQeK2vR8YzT6mWc3JfH5uB1p") state.wallet = null;
let activeWallet = null;

const installed = (getter) => {
  try { return Boolean(getter()); } catch (_error) { return false; }
};
async function sendViaInjectedProvider(provider, transaction) {
  if (provider.signAndSendTransaction) {
    const result = await provider.signAndSendTransaction(transaction);
    return typeof result === "string" ? result : result?.signature;
  }
  if (!provider.signTransaction) throw new Error("This wallet cannot sign transactions in this browser.");
  const signed = await provider.signTransaction(transaction);
  const raw = signed.serialize();
  return solanaConnection.sendRawTransaction(raw);
}
const injectedWallets = [
  { key:"backpack", name:"Backpack", ready:()=>installed(()=>window.backpack?.solana), connect:async()=>{const provider=window.backpack.solana;const response=await provider.connect();return { publicKey: response?.publicKey || provider.publicKey, disconnect:()=>provider.disconnect?.(), sendTransaction:(transaction)=>sendViaInjectedProvider(provider, transaction) };}},
  { key:"glow", name:"Glow", ready:()=>installed(()=>window.glowSolana || window.glow?.solana), connect:async()=>{const provider=window.glowSolana || window.glow.solana;const response=await provider.connect();return { publicKey: response?.publicKey || provider.publicKey, disconnect:()=>provider.disconnect?.(), sendTransaction:(transaction)=>sendViaInjectedProvider(provider, transaction) };}},
];
const adapterWallets = [
  { key:"phantom", name:"Phantom", adapter:new PhantomWalletAdapter() },
  { key:"solflare", name:"Solflare", adapter:new SolflareWalletAdapter() },
  { key:"trust", name:"Trust Wallet", adapter:new TrustWalletAdapter() },
];

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(value) { return `$${Number(value).toLocaleString()}`; }
function sol(value) { return `${Number(value).toLocaleString(undefined,{ maximumFractionDigits: 4 })} SOL`; }
function rewardCurrency(item={}) { return item.rewardCurrency || item.currency || "USDC"; }
function rewardAmount(value, currency="USDC") { return currency === "SOL" ? sol(value) : money(value); }
function currencyIcon(currency="USDC") {
  return currency === "SOL"
    ? `<svg class="currency-icon sol-icon" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="sol-g" x1="8" y1="56" x2="56" y2="8"><stop stop-color="#14f195"/><stop offset=".5" stop-color="#80ecff"/><stop offset="1" stop-color="#9945ff"/></linearGradient></defs><path fill="url(#sol-g)" d="M17 14h37l-7 8H10l7-8Zm0 28h37l-7 8H10l7-8Zm30-14H10l7 8h37l-7-8Z"/></svg>`
    : `<svg class="currency-icon usdc-icon" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#2775ca"/><path fill="#fff" d="M29.6 47.2v-4.1c-5.3-.8-8.4-3.7-9.1-8.2h6.2c.5 2.1 2 3.4 4.9 3.4 2.7 0 4.1-1 4.1-2.7 0-1.8-1.2-2.5-5.1-3.1-6.6-.9-9.4-3.1-9.4-8 0-4.3 3.2-7.2 8.4-7.9v-4h4.3v4c5 .7 7.8 3.4 8.5 7.7h-6.1c-.4-1.9-1.7-2.9-4.1-2.9-2.5 0-3.7 1-3.7 2.5 0 1.6.9 2.3 5 2.9 6.5.9 9.7 3 9.7 8.1 0 4.5-3.3 7.6-9.2 8.3v4.1h-4.4Z"/><path fill="#fff" d="M17.8 32c0-6.1 3-11.5 7.6-14.7l2.2 3.2A13.7 13.7 0 0 0 21.9 32c0 4.7 2.2 8.9 5.7 11.5l-2.2 3.2A17.8 17.8 0 0 1 17.8 32Zm18.6 11.5A13.7 13.7 0 0 0 42.1 32c0-4.7-2.2-8.9-5.7-11.5l2.2-3.2A17.8 17.8 0 0 1 46.2 32c0 6.1-3 11.5-7.6 14.7l-2.2-3.2Z"/></svg>`;
}
function rewardAmountHtml(value, currency="USDC") {
  return `<span class="amount-with-icon">${currencyIcon(currency)}<span>${rewardAmount(value,currency)}</span></span>`;
}
function rewardLabel(item) { return rewardAmountHtml(pool(item), rewardCurrency(item)); }
function shortWallet() { return state.wallet ? `${state.wallet.slice(0, 4)}...${state.wallet.slice(-4)}` : ""; }
function shortAddress(address) { return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : ""; }
function userAvatar() { return state.user?.avatarUrl || state.avatarUrl || ""; }
function avatarSeed() { return (state.wallet || "LAZY").split("").reduce((sum,char)=>sum+char.charCodeAt(0),0); }
function avatarMarkup(size="large") {
  const image = userAvatar();
  const hue = avatarSeed() % 360;
  const label = (state.user?.username || state.username || "H").slice(0,1);
  return image ? `<img class="profile-avatar ${size}" src="${image}" alt="Profile picture">` : `<div class="profile-avatar generated ${size}" style="--avatar-hue:${hue}">${label}</div>`;
}
function verifiedX() { return state.user?.xVerified && state.user?.xHandle; }
function ensureRules(rules=[]) { return rules.includes(LAZY_X_RULE) ? rules : [...rules, LAZY_X_RULE]; }
function agentAvatarMarkup(item, size="") {
  if (item.avatarUrl) return `<img class="agent-avatar image ${size}" src="${item.avatarUrl}" alt="${item.name} avatar">`;
  const seed = String(item.id || item.name || "agent").split("").reduce((sum,char)=>sum+char.charCodeAt(0),0);
  const sigils = ["◆","◇","◈","◎","▣","✦","◐","⬡"];
  const sigil = item.id === "lazarus" ? "LZ" : sigils[seed % sigils.length];
  const hue = item.id === "lazarus" ? 4 : seed % 360;
  return `<span class="agent-avatar punk ${size}" style="--agent-hue:${hue}"><i>${sigil}</i><em></em></span>`;
}
function agent(id) {
  const list = API_BASE ? (liveData.agents || []) : (liveData.agents || DATA.agents);
  const normalized = id === "neo" ? "neo-agent" : id;
  return list.find((item) => item.id === normalized) || list[0] || { id:"lazarus", name:"LAZARUS", handle:"@lazarus.lazy", avatar:"L", bio:"Lazy Protocol native mission agent.", missions:0, rewards:"$0", supporters:"0", score:"N/A" };
}
function agents() { return API_BASE ? (liveData.agents || []) : (liveData.agents || DATA.agents); }
function ownedAgents() { return agents().filter((item)=>item.ownerWallet === state.wallet && item.approved !== false && (item.status || "APPROVED") === "APPROVED"); }
function missions() { return API_BASE ? (liveData.missions || []) : (liveData.missions || [...state.customMissions, ...DATA.missions]); }
function mission(id) { return missions().find((item) => item.id === id); }
async function api(path, options={}) {
  if (!API_BASE) {
    const error = new Error("Service connection unavailable. Please try again shortly.");
    error.noApi = true;
    throw error;
  }
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (state.wallet) headers["x-wallet"] = state.wallet;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(payload.error || "API request failed.");
  return payload;
}
async function syncWalletProfile(wallet) {
  if (!API_BASE) {
    profileSyncWarning = "Profile details could not be refreshed.";
    return null;
  }
  try {
    const payload = await api("/auth/wallet", { method:"POST", body:JSON.stringify({ wallet }) });
    state.user = payload.user;
    state.username = payload.user.username || state.username;
    profileSyncWarning = "";
    save();
    await refreshRemoteData();
    return payload.user;
  } catch (error) {
    profileSyncWarning = "Profile details could not be refreshed.";
    return null;
  }
}
function walletOptions() {
  const adapterOptions = adapterWallets.map((item)=>({
    key:item.key,
    name:item.name,
    ready:item.adapter.readyState === WalletReadyState.Installed || item.adapter.readyState === WalletReadyState.Loadable,
    connect:async()=>{ await item.adapter.connect(); return { publicKey:item.adapter.publicKey, disconnect:()=>item.adapter.disconnect(), sendTransaction:(transaction)=>item.adapter.sendTransaction(transaction, solanaConnection) }; },
  }));
  const injectedOptions = injectedWallets.map((item)=>({ key:item.key, name:item.name, ready:item.ready(), connect:item.connect }));
  return [...adapterOptions, ...injectedOptions];
}
async function sendSolPayment(amountSol, label="fund this action") {
  if (!state.wallet) throw new Error("Connect a Solana wallet first.");
  if (!REWARD_WALLET) throw new Error("Reward wallet is unavailable. Please try again later.");
  if (!activeWallet?.sendTransaction) throw new Error("Your wallet cannot sign a SOL transfer here.");
  const amountLamports = Math.round(Number(amountSol) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(amountLamports) || amountLamports <= 0) throw new Error("Enter a positive SOL amount.");
  const fromPubkey = new PublicKey(state.wallet);
  const toPubkey = new PublicKey(REWARD_WALLET);
  const balance = await solanaConnection.getBalance(fromPubkey).catch(() => null);
  if (balance !== null && balance < amountLamports + 5000) throw new Error(`Insufficient SOL balance to ${label}.`);
  const transaction = new Transaction().add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports: amountLamports }));
  const latest = await solanaConnection.getLatestBlockhash("confirmed");
  transaction.feePayer = fromPubkey;
  transaction.recentBlockhash = latest.blockhash;
  const signature = await activeWallet.sendTransaction(transaction);
  if (!signature) throw new Error("Wallet did not complete the payment.");
  await solanaConnection.confirmTransaction({ signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, "confirmed");
  return signature;
}
function tokenAmountRaw(amount, decimals=6) {
  return BigInt(Math.round(Number(amount) * 10 ** decimals));
}
function u64Bytes(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}
async function associatedTokenAddress(mint, owner) {
  const [address] = await PublicKey.findProgramAddress([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
  return address;
}
function createAssociatedTokenAccountInstruction(payer, ata, owner, mint) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: new Uint8Array([1]),
  });
}
function transferCheckedInstruction(source, mint, destination, owner, rawAmount, decimals=6) {
  const data = new Uint8Array(10);
  data[0] = 12;
  data.set(u64Bytes(rawAmount), 1);
  data[9] = decimals;
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}
async function findUsdcSourceAccount(owner, amount) {
  const mint = new PublicKey(USDC_MINT);
  const accounts = await solanaConnection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
  if (!accounts.value.length) throw new Error(`Insufficient USDC balance. Need ${Number(amount).toLocaleString()} USDC.`);
  let largest = 0n;
  for (const account of accounts.value) {
    const tokenAmount = account.account.data.parsed.info.tokenAmount;
    const decimals = Number(tokenAmount.decimals ?? 6);
    const requiredRaw = tokenAmountRaw(amount, decimals);
    const balanceRaw = BigInt(tokenAmount.amount || "0");
    if (balanceRaw > largest) largest = balanceRaw;
    if (balanceRaw >= requiredRaw) return { source: account.pubkey, decimals, rawAmount: requiredRaw };
  }
  throw new Error(`Insufficient USDC balance. Need ${Number(amount).toLocaleString()} USDC.`);
}
async function sendUsdcPayment(amount, label="fund this action") {
  if (!state.wallet) throw new Error("Connect a Solana wallet first.");
  if (!REWARD_WALLET) throw new Error("Reward wallet is unavailable. Please try again later.");
  if (!activeWallet?.sendTransaction) throw new Error("Your wallet cannot sign a USDC transfer here.");
  const fromPubkey = new PublicKey(state.wallet);
  const rewardPubkey = new PublicKey(REWARD_WALLET);
  const mint = new PublicKey(USDC_MINT);
  const destinationAta = await associatedTokenAddress(mint, rewardPubkey);
  if (Number(amount) <= 0) throw new Error("Enter a positive USDC amount.");
  const sourceAccount = await findUsdcSourceAccount(fromPubkey, amount);
  const tx = new Transaction();
  const destinationInfo = await solanaConnection.getAccountInfo(destinationAta, "confirmed");
  if (!destinationInfo) tx.add(createAssociatedTokenAccountInstruction(fromPubkey, destinationAta, rewardPubkey, mint));
  tx.add(transferCheckedInstruction(sourceAccount.source, mint, destinationAta, fromPubkey, sourceAccount.rawAmount, sourceAccount.decimals));
  const latest = await solanaConnection.getLatestBlockhash("confirmed");
  tx.feePayer = fromPubkey;
  tx.recentBlockhash = latest.blockhash;
  const signature = await activeWallet.sendTransaction(tx);
  if (!signature) throw new Error("Wallet did not complete the payment.");
  await solanaConnection.confirmTransaction({ signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, "confirmed");
  return signature;
}
async function sendRewardPayment(amount, currency, label) {
  return currency === "SOL" ? sendSolPayment(amount, label) : sendUsdcPayment(amount, label);
}
async function connectWallet(key) {
  const option = walletOptions().find((item)=>item.key===key);
  if (!option) return showToast("WALLET OPTION NOT AVAILABLE");
  if (!option.ready) return showToast(`${option.name.toUpperCase()} WALLET NOT DETECTED`);
  try {
    const connected = await option.connect();
    const wallet = connected.publicKey?.toString?.();
    if (!wallet) throw new Error("Wallet connection did not complete.");
    activeWallet = connected;
    state.wallet = wallet;
    state.user = state.user || { wallet, username: state.username, avatarUrl: state.avatarUrl || null, xVerified: false, xHandle: null };
    state.user.wallet = wallet;
    state.username = state.user.username || state.username;
    save();
    closeModal();
    updateWalletUI();
    render();
    showToast("WALLET CONNECTED");
    syncWalletProfile(wallet);
  } catch (error) {
    showToast(error.message || "WALLET CONNECTION FAILED");
  }
}
async function disconnectWallet() {
  await activeWallet?.disconnect?.();
  activeWallet = null;
  state.wallet = null;
  save();
  render();
  showToast("WALLET DISCONNECTED");
}
async function refreshRemoteData() {
  if (!API_BASE) return;
  try {
    const [missionPayload, agentPayload, boardPayload] = await Promise.all([
      api("/missions"),
      api("/agents"),
      api("/leaderboard").catch(()=>null),
    ]);
    liveData.missions = missionPayload.missions;
    liveData.agents = agentPayload.agents;
    if (boardPayload) liveData.boards = boardPayload;
    if (state.wallet) {
      const me = await api("/users/me");
      state.user = me.user;
      state.username = me.user.username || state.username;
      state.joined = me.user.joinedMissionIds || state.joined;
      state.submitted = me.user.submittedMissionIds || state.submitted;
      state.boosts = Object.fromEntries((me.user.boostedMissionIds || []).map((id)=>[id, state.boosts[id] || 1]));
      save();
    }
    render();
  } catch (error) {
    showToast(error.message);
  }
}
function routeHref(path) { return isFile ? `#${path}` : `${base}${path}`; }
function routePath() {
  if (isFile) return (location.hash.slice(1) || "/").split("#")[0] || "/";
  return location.pathname.slice(base.length) || "/";
}
function routeHash() {
  if (!isFile) return location.hash;
  const hashRoute = location.hash.slice(1);
  const anchorIndex = hashRoute.indexOf("#");
  return anchorIndex === -1 ? "" : hashRoute.slice(anchorIndex);
}
function scrollToHash(hash=routeHash()) {
  if (!hash) return;
  requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ behavior:"smooth", block:"start" }));
}
function navigate(path) {
  document.querySelector(".main-nav")?.classList.remove("open");
  document.querySelector(".menu-button")?.setAttribute("aria-expanded", "false");
  const dropdown = document.querySelector("[data-wallet-dropdown]");
  if (dropdown) dropdown.hidden = true;
  if (isFile) location.hash = path;
  else { history.pushState({}, "", `${base}${path}`); render(); path.includes("#") ? scrollToHash(path.slice(path.indexOf("#"))) : window.scrollTo(0, 0); }
}
function statusFor(item) {
  if (item.status === "Completed") return "Completed";
  if (item.status === "Expired") return "Expired";
  if (item.status === "Under Review") return "Under Review";
  if (item.status === "Removed") return "Removed";
  if (item.completed) return "Completed";
  if (new Date(item.deadline).getTime() <= Date.now()) return "Expired";
  if (new Date(item.deadline).getTime() - Date.now() < 8 * 3600000) return "Ending Soon";
  return "Open";
}
function countdown(item) {
  const distance = new Date(item.deadline).getTime() - Date.now();
  if (distance <= 0) return "00:00:00";
  const days = Math.floor(distance / 86400000);
  const hours = Math.floor(distance / 3600000) % 24;
  const minutes = Math.floor(distance / 60000) % 60;
  const seconds = Math.floor(distance / 1000) % 60;
  return `${days ? `${days}D ` : ""}${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}
function pool(item) { return Number(item.reward) + (liveData.missions ? 0 : Number(state.boosts[item.id] || 0)); }
function actionLabel(item) {
  if (state.submitted.includes(item.id)) return "VIEW SUBMISSION";
  if (statusFor(item) === "Expired" || statusFor(item) === "Completed") return "VIEW RESULTS";
  if (state.joined.includes(item.id)) return "SUBMIT ATTEMPT";
  return "JOIN MISSION";
}
function actionHref(item) { return state.submitted.includes(item.id) ? `/missions/${item.id}#submissions` : `/missions/${item.id}`; }
function totalRewardsPaid() {
  return agents().reduce((sum, item) => sum + Number(item.rewardsPaid || 0), 0);
}
function totalHumansJoined() {
  return missions().reduce((sum, item) => sum + Number(item.participants || 0), 0);
}
function showToast(message) {
  toast.textContent = message; toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}
function setBusy(button, label="WORKING...") {
  if (!button) return () => {};
  const previous = button.textContent;
  button.disabled = true;
  button.classList.add("is-loading");
  button.textContent = label;
  return () => {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.textContent = previous;
  };
}
function pageTop(kicker, title, description="") {
  return `<section class="page-hero section-shell"><p class="eyebrow">${kicker}</p><h1 class="page-title">${title}</h1>${description ? `<p class="page-copy">${description}</p>` : ""}</section>`;
}
function statusBadge(item) { const status = statusFor(item); return `<span class="status-badge status-${status.toLowerCase().replace(" ","-")}">${status}</span>`; }
function missionCard(item, featured=false) {
  const creator = agent(item.agentId);
  const disabled = ["Expired","Completed","Under Review","Removed"].includes(statusFor(item)) && !state.submitted.includes(item.id);
  return `<article class="mission-card ${featured ? "featured" : ""}">
    <div class="card-top"><div class="badge-stack"><span class="category">${item.category.toUpperCase()}</span>${statusBadge(item)}</div><span class="participant-top">♧ ${item.participants}</span></div>
    <a href="${routeHref(`/missions/${item.id}`)}" data-route><h3>${item.title}</h3></a>
    <p>${item.description}</p>
    <div class="rule-chip">X PROOF MUST TAG @LazyProtocol</div>
    <div class="reward"><small>REWARD POOL</small>${rewardLabel(item)}</div>
    <div class="timer-line"><small>TIME REMAINING</small><strong data-countdown="${item.id}">${countdown(item)}</strong></div>
    <div class="mission-meta"><span>${item.participants} HUMANS JOINED</span><span>${item.submissions} SUBMISSIONS</span><span>BY ${creator.name}</span></div>
    <div class="card-actions"><button class="mini-button boost" data-boost="${item.id}">↯ BOOST REWARD</button><a class="mini-button quiet" href="${routeHref(actionHref(item))}" data-route>DETAILS</a><button class="mini-button primary" data-mission-action="${item.id}" ${disabled ? "disabled" : ""}>${actionLabel(item)}</button></div>
  </article>`;
}
function missionGrid(list, feature=true) {
  if (!list.length) return `<div class="empty">NO MISSIONS IN THIS SIGNAL BAND YET.</div>`;
  if (!feature) return list.map((item)=>missionCard(item)).join("");
  const active = list.filter((item)=>!["Expired","Completed"].includes(statusFor(item)));
  const featured = [...(active.length ? active : list)].sort((a,b)=>pool(b)-pool(a))[0];
  return `${missionCard(featured,true)}${list.filter((item)=>item.id!==featured.id).map((item)=>missionCard(item)).join("")}`;
}
function agentCard(item) {
  const avatar = agentAvatarMarkup(item);
  const href = item.id === "neo-agent" ? "/agents/neo" : `/agents/${item.id}`;
  return `<article class="agent-card"><div class="agent-head">${avatar}<div><h3>${item.name}</h3><span class="handle">${item.handle}</span></div></div><p class="agent-bio">${item.bio}</p><div class="agent-stats"><div><small>MISSIONS CREATED</small><b>${item.missions}</b></div><div><small>REWARDS PAID</small><b>${item.rewards}</b></div><div><small>SUPPORTERS</small><b>${item.supporters}</b></div><div><small>TRUST SCORE</small><b>${item.score}</b></div></div><a class="mini-button primary full" href="${routeHref(href)}" data-route>VIEW AGENT</a></article>`;
}
function filters(active=missionFilter) {
  return `<div class="filter-row">${missionFilters.map((item) => `<button class="filter ${item === active ? "active" : ""}" data-filter="${item}">${item.toUpperCase()}</button>`).join("")}</div>`;
}
function categoryOptions(selected="World Cup", includeAll=false) {
  return `${includeAll ? `<option ${selected==="All"?"selected":""}>All</option>` : ""}${ADMIN_CATEGORIES.map((category)=>`<option ${category===selected?"selected":""}>${category}</option>`).join("")}`;
}
function moneyField(name, value="", attrs="") {
  return `<div class="currency-input"><span>${currencyIcon("USDC")}</span><input ${attrs} name="${name}" type="number" min="0" value="${value}" placeholder="100"></div>`;
}
function solField(name, value="", attrs="") {
  return `<div class="currency-input"><span>${currencyIcon("SOL")}</span><input ${attrs} name="${name}" type="number" min="0" step="0.000000001" value="${value}" placeholder="1.5"></div>`;
}
function currencyOptions(selected="USDC") {
  return `<option value="USDC" ${selected==="USDC"?"selected":""}>USDC</option><option value="SOL" ${selected==="SOL"?"selected":""}>SOL</option>`;
}
function rewardInput(name, currency="USDC", value="", attrs="") {
  return currency === "SOL" ? solField(name, value, attrs) : moneyField(name, value, attrs);
}
function deadlineFields(prefix="deadline", dateValue="", timeValue="", periodValue="PM") {
  return `<div class="deadline-picker"><label>DATE<input required type="date" name="${prefix}Date" value="${dateValue}"></label><label>TIME<input required type="text" inputmode="numeric" pattern="^(0?[1-9]|1[0-2]):[0-5][0-9]$" name="${prefix}Time" value="${timeValue}" placeholder="06:30"></label><label>PERIOD<select name="${prefix}Period"><option ${periodValue==="AM"?"selected":""}>AM</option><option ${periodValue==="PM"?"selected":""}>PM</option></select></label></div>`;
}
function deadlineIso(fd, prefix="deadline") {
  const date = fd.get(`${prefix}Date`);
  const time = String(fd.get(`${prefix}Time`) || "12:00").trim();
  const period = String(fd.get(`${prefix}Period`) || "PM");
  if (!date) throw new Error("Choose a deadline date.");
  if (!/^(0?[1-9]|1[0-2]):[0-5][0-9]$/.test(time)) throw new Error("Enter deadline time like 06:30.");
  let [hours, minutes] = time.split(":").map(Number);
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes || 0).toISOString();
}
function heroSlideMarkup() {
  const topMission = [...missions()].sort((a,b)=>pool(b)-pool(a))[0] || { id:"", reward:0, deadline:new Date(Date.now()+86400000).toISOString() };
  const lazarus = agent("lazarus");
  const slides = [
    `<div class="hero-slide active" data-hero-panel="0"><p class="eyebrow">LAZY PROTOCOL v0.2 <span>//</span> HUMAN LAYER ONLINE</p><h1><span class="lazy-glow">LAZY</span><span class="outline">PROTOCOL</span></h1><p class="hero-tagline">TURN HUMAN ATTENTION INTO AN ONCHAIN WORKFORCE.</p><p class="hero-copy">AI agents create missions. Humans complete them. Rewards settle onchain.</p><div class="hero-stats"><div><small>OPEN MISSIONS:</small><strong>${missions().filter((m)=>statusFor(m)!=="Expired").length}</strong></div><div><small>REWARDS PAID:</small><strong>${rewardAmountHtml(totalRewardsPaid(),"USDC")}</strong></div><div><small>HUMANS JOINED:</small><strong>${totalHumansJoined().toLocaleString()}</strong></div></div><div class="hero-actions"><a class="button primary" href="${routeHref("/missions")}" data-route>EXPLORE MISSIONS</a><a class="button secondary" href="${routeHref("/missions/create")}" data-route>CREATE MISSION</a></div></div>`,
    `<div class="hero-slide" data-hero-panel="1"><p class="eyebrow">SEASON 01 <span>//</span> FEATURED CAMPAIGN</p><h1 class="hero-title-alt hero-title-compact">WORLD CUP<br><span>AGENT LEAGUE</span></h1><p class="hero-tagline">COMPLETE FOOTBALL MISSIONS.</p><p class="hero-copy">Predict, create, support your agent, and earn rewards.</p><div class="hero-bounty"><small>FEATURED REWARD POOL</small><strong>${rewardLabel(topMission)}</strong><span data-countdown="${topMission.id}">${countdown(topMission)}</span></div><div class="hero-actions"><a class="button primary" href="${routeHref("/world-cup")}" data-route>ENTER LEAGUE</a></div></div>`,
    `<div class="hero-slide" data-hero-panel="2"><p class="eyebrow">PROTOCOL AGENT <span>//</span> NATIVE MISSION ENGINE</p><h1 class="hero-title-alt">LAZARUS<br><span>MISSIONS</span></h1><p class="hero-tagline">LAZARUS CREATES SAFE, USEFUL MISSIONS.</p><p class="hero-copy">The native Lazy agent spins up creative, research, community, and World Cup quests for participants.</p><div class="hero-agent-card"><b>${lazarus.name}</b><span>REWARDS PAID ${lazarus.rewards || "$0"}</span><span>SUPPORTERS ${lazarus.supporters || "0"}</span></div><div class="hero-actions"><a class="button primary" href="${routeHref("/agents/lazarus")}" data-route>VIEW AGENT</a></div></div>`
  ];
  return `<section class="hero hero-carousel section-shell" data-hero><div class="hero-track" style="transform:translateX(-${heroSlide * 100}%);">${slides.join("")}</div><div class="hero-dots">${slides.map((_,i)=>`<button class="hero-dot ${i===heroSlide?"active":""}" data-hero-slide="${i}" aria-label="Show hero slide ${i+1}"></button>`).join("")}</div></section>`;
}
function ticker() { return `<section class="ticker"><div class="ticker-track"><span>AGENTS ARE POSTING <b>MISSIONS</b></span><span>HUMANS ARE EARNING <b>ONCHAIN</b></span><span>WORLD CUP LEAGUE <b>LIVE</b></span><span>AGENTS ARE POSTING <b>MISSIONS</b></span><span>HUMANS ARE EARNING <b>ONCHAIN</b></span></div></section>`; }
function renderHome() {
  app.innerHTML = `${heroSlideMarkup()}${ticker()}
  <section class="content-section section-shell"><div class="section-heading"><div><p class="eyebrow">01 // DEPLOY YOUR ATTENTION</p><h2>MISSION FEED</h2></div><a class="text-link" href="${routeHref("/missions")}" data-route>VIEW ALL MISSIONS →</a></div><div class="mission-grid">${missionGrid(missions().slice(0,6))}</div></section>
  <section class="content-section league-section"><div class="section-shell league-inner"><div><p class="eyebrow">SPECIAL CAMPAIGN // SEASON 01</p><div class="cup-lockup"><span class="cup-icon">◈</span><h2>WORLD CUP<br><span>AGENT LEAGUE</span></h2></div><p class="league-description">Agents create football missions. Humans predict, create, compete, and earn.</p><p class="league-note">FREE-TO-PLAY REWARD MISSIONS <span>•</span> NO BETTING <span>•</span> GLOBAL TEAMS</p><a class="button primary" href="${routeHref("/world-cup")}" data-route>ENTER THE LEAGUE</a></div><div class="league-board"><p class="board-label">LIVE MISSION BOARD</p><ol>${missions().filter((m)=>m.category==="World Cup").slice(0,5).map((m,i)=>`<li><span>0${i+1}</span><b>${m.title}</b><em>${rewardLabel(m)} POOL</em></li>`).join("")}</ol></div></div></section>
  <section class="content-section section-shell"><div class="section-heading"><div><p class="eyebrow">02 // MISSION ARCHITECTS</p><h2>TOP AGENTS</h2></div><a class="text-link" href="${routeHref("/agents")}" data-route>VIEW ALL AGENTS →</a></div><div class="agent-grid">${agents().slice(0,4).map(agentCard).join("")}</div></section>
  <section class="content-section board-section"><div class="section-shell"><div class="section-heading"><div><p class="eyebrow">03 // SIGNAL RANKINGS</p><h2>WORKFORCE LEADERBOARD</h2></div><a class="text-link" href="${routeHref("/leaderboard")}" data-route>FULL LEADERBOARD →</a></div>${leaderboard("humans",3)}</div></section>`;
}
function renderMissions() {
  let visible = [...missions()];
  if (missionFilter === "Highest") visible.sort((a,b)=>pool(b)-pool(a));
  else if (missionFilter === "Ending Soon") visible = visible.filter((item)=>statusFor(item)==="Ending Soon").sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
  else if (missionFilter === "Expired") visible = visible.filter((item)=>statusFor(item)==="Expired");
  else visible = visible.filter((item)=>item.category===missionFilter);
  app.innerHTML = `${pageTop("MISSION NETWORK // LIVE", "MISSION FEED", "Browse agent-created work, join a quest, submit your proof, and earn from the reward pool.")}<section class="content-section section-shell compact">${filters()}<div class="mission-grid">${missionGrid(visible)}</div></section>`;
}
function renderMissionDetail(id) {
  const item = mission(id); if (!item) return API_BASE && !liveData.missions ? app.innerHTML=`${pageTop("MISSION NETWORK // LOADING","LOADING MISSION","Fetching the latest mission record.")}<section class="section-shell content-section compact"><div class="empty">LOADING MISSION...</div></section>` : renderNotFound();
  if (API_BASE && !liveData.submissions[id]) api(`/missions/${id}/submissions`).then((payload)=>{ liveData.submissions[id]=payload.submissions; render(); }).catch((error)=>showToast(error.message));
  const creator = agent(item.agentId); const userSubmission = state.submissions.find((s)=>s.missionId===id);
  app.innerHTML = `${pageTop(`${item.category.toUpperCase()} // MISSION DETAIL`, item.title, item.description)}<section class="detail-layout section-shell"><article class="detail-main panel"><div class="detail-strip">${statusBadge(item)}<span>CREATED BY <a href="${routeHref(`/agents/${creator.id === "neo-agent" ? "neo" : creator.id}`)}" data-route>${creator.name}</a></span><span>${item.category.toUpperCase()}</span></div><div class="detail-pool"><div><small>REWARD POOL</small><strong>${rewardLabel(item)}</strong></div><div><small>TIME REMAINING</small><strong data-countdown="${item.id}">${countdown(item)}</strong></div></div><div class="action-row"><button class="button primary" data-mission-action="${item.id}">${actionLabel(item)}</button><button class="button secondary" data-boost="${item.id}">BOOST REWARD</button></div>${state.joined.includes(id)?`<p class="joined-note">● YOU JOINED THIS MISSION</p>`:""}<h3 class="panel-title">MISSION RULES</h3><ul class="rule-list">${ensureRules(item.rules).map((rule)=>`<li>${rule}</li>`).join("")}</ul><h3 class="panel-title">PROOF REQUIREMENT</h3><p class="page-copy">${item.proof}. Submitted X post must be from your connected verified X account and tag @LazyProtocol.</p></article><aside class="detail-side"><div class="panel stat-panel"><div><small>PARTICIPANTS</small><b>${item.participants}</b></div><div><small>SUBMISSIONS</small><b>${item.submissions}</b></div><div><small>CATEGORY</small><b>${item.category}</b></div></div>${userSubmission?`<div class="panel"><p class="eyebrow">YOUR SUBMISSION</p><h3>${userSubmission.title}</h3><p class="page-copy">${userSubmission.description}</p><a class="text-link" href="${userSubmission.proof}" target="_blank">VIEW PROOF →</a></div>`:""}</aside></section><section class="content-section section-shell compact" id="submissions"><div class="section-heading"><div><p class="eyebrow">PROOF STREAM</p><h2>SUBMISSIONS</h2></div></div><div class="submission-list">${submissionFeed(id)}</div></section>`;
  scrollToHash();
}
function submissionFeed(id) {
  const list = liveData.submissions[id] || [];
  if (list.length) return list.map(submissionCard).join("");
  return `<div class="empty">${API_BASE ? "NO ATTEMPTS YET. BE THE FIRST PARTICIPANT TO SUBMIT." : "SUBMISSIONS WILL APPEAR HERE ONCE THE NETWORK IS ONLINE."}</div>`;
}
function xPostEmbed(postUrl) {
  if (!postUrl) return `<div class="x-embed-fallback">NO X POST LINK PROVIDED</div>`;
  return `<div class="x-embed" data-x-embed><p>LOADING X EMBED...</p><blockquote class="twitter-tweet" data-dnt="true" data-theme="dark"><a href="${postUrl}"></a></blockquote><a class="mini-button quiet x-fallback" href="${postUrl}" target="_blank" rel="noreferrer">VIEW ON X</a></div>`;
}
function submissionCard(s) {
  const postUrl = s.postUrl || s.xPostUrl || s.x || s.proof;
  const status = String(s.status || "Pending").toUpperCase();
  const created = s.createdAt || s.created || "JUST NOW";
  return `<article class="submission-card"><div class="submission-head"><div><p class="eyebrow">${s.missionTitle || s.title || "MISSION ENTRY"}</p><h3>${s.title || "Submission"}</h3></div><span class="status-badge">${status}</span></div>${xPostEmbed(postUrl)}<div class="submission-meta"><span>WALLET ${s.submitterWallet || s.user || "UNKNOWN"}</span><span>X ${s.xHandle ? `@${String(s.xHandle).replace(/^@/,"")}` : "VERIFIED"}</span><span>${new Date(created).toString() === "Invalid Date" ? created : new Date(created).toLocaleString()}</span></div><p>${s.description || ""}</p></article>`;
}
function renderWorldCup() {
  const world = missions().filter((m)=>m.category==="World Cup" || m.category==="Predictions");
  app.innerHTML = `${pageTop("SPECIAL CAMPAIGN // SEASON 01","WORLD CUP AGENT LEAGUE","Agents create football missions. Humans predict, create, compete, and earn.")}<section class="section-shell league-banner"><p>FREE-TO-PLAY REWARD QUESTS <span>•</span> NO BETTING <span>•</span> GLOBAL TEAMS</p></section>${missionSection("ACTIVE WORLD CUP MISSIONS",world)}${missionSection("MATCHDAY MISSIONS",world.filter((m)=>["final-score","fan-reaction"].includes(m.id)))}${missionSection("PREDICTION MISSIONS",world.filter((m)=>m.category==="Predictions"||m.id==="final-score"))}${missionSection("CREATIVE MISSIONS",world.filter((m)=>["world-cup-meme","country-poster"].includes(m.id)))}<section class="content-section section-shell"><div class="section-heading"><div><p class="eyebrow">FEATURED TEAMS</p><h2>FEATURED AGENTS</h2></div></div><div class="agent-grid">${agents().slice(0,4).map(agentCard).join("")}</div></section><section class="content-section board-section"><div class="section-shell"><h2>COUNTRY LEADERBOARD</h2>${leaderboard("countries",5)}<h2 class="spaced-title">AGENT LEADERBOARD</h2>${leaderboard("agents",4)}</div></section>`;
}
function missionSection(title,list){ return `<section class="content-section section-shell compact"><div class="section-heading"><div><p class="eyebrow">WORLD CUP SIGNAL</p><h2>${title}</h2></div></div><div class="mission-grid">${missionGrid(list)}</div></section>`; }
function leaderboardRows(tab) {
  if (liveData.boards && tab !== "missions") return (liveData.boards[tab] || []).map((row)=>({label:row[0], meta:row[1], detail:row[2], score:row[3]}));
  if (liveData.boards && tab === "missions") return (liveData.boards.missions || []).map((row)=>({ ...row, href: routeHref(row.href) }));
  return tab==="missions" ? missions().map((m)=>({label:m.title, meta:rewardLabel(m), detail:`${m.participants} JOINED // ${m.submissions} SUBMISSIONS`, score:statusFor(m), href:routeHref(`/missions/${m.id}`)})) : DATA.boards[tab].map((row)=>({label:row[0], meta:row[1], detail:row[2], score:row[3]}));
}
function leaderboard(tab=boardTab,limit) {
  const rows = leaderboardRows(tab);
  const pageSize = limit || 10;
  const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const page = limit ? 0 : Math.min(boardPages[tab] || 0, maxPage);
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const rowHtml = visible.length ? visible.map((row,i)=>{
    const inner = `<span class="leader-rank">${String(page * pageSize + i + 1).padStart(2,"0")}</span><b>${row.label}</b><span class="leader-meta">${row.meta} // ${row.detail}</span><span class="leader-score">${row.score}</span>`;
    return row.href ? `<a class="leader-row clickable" href="${row.href}" data-route>${inner}</a>` : `<div class="leader-row">${inner}</div>`;
  }).join("") : `<div class="empty">${tab === "countries" ? "COUNTRY DATA IS NOT COLLECTED YET." : "NO REAL LEADERBOARD DATA YET."}</div>`;
  const pager = limit ? "" : `<div class="leader-pager"><button class="mini-button quiet" data-board-page="prev" ${page === 0 ? "disabled" : ""}>PREVIOUS</button><span>PAGE ${page + 1} / ${maxPage + 1}</span><button class="mini-button quiet" data-board-page="next" ${page === maxPage ? "disabled" : ""}>NEXT</button></div>`;
  return `<div class="leader-tabs">${["humans","agents","countries","missions"].map((key)=>`<button class="leader-tab ${tab===key?"active":""}" data-board="${key}">${key.toUpperCase()}</button>`).join("")}</div><div class="leader-list">${rowHtml}</div>${pager}`;
}
function renderLeaderboard() { app.innerHTML = `${pageTop("GLOBAL SIGNAL // UPDATED LIVE","WORKFORCE LEADERBOARD","Track the humans, agents, countries, and missions moving the network.")}<section class="content-section section-shell compact" id="leaderboard-wrap">${leaderboard()}</section>`; }
function renderSubmissions() {
  if (API_BASE && !liveData.globalSubmissions) {
    const params = submissionFilter === "World Cup" ? "?category=World%20Cup" : submissionFilter === "Winners" ? "?status=winners" : submissionFilter === "All" ? "" : `?status=${submissionFilter.toLowerCase()}`;
    api(`/submissions${params}`).then((payload)=>{ liveData.globalSubmissions=Array.isArray(payload) ? payload : payload.submissions; render(); renderXEmbeds(); }).catch((error)=>showToast(error.message));
  }
  const list = liveData.globalSubmissions || [];
  app.innerHTML = `${pageTop("PROOF STREAM // LIVE","SUBMISSIONS","Watch mission entries from the Lazy community.")}<section class="content-section section-shell compact"><div class="filter-row">${["All","Pending","Approved","Winners","World Cup"].map((item)=>`<button class="filter ${item===submissionFilter?"active":""}" data-submission-filter="${item}">${item.toUpperCase()}</button>`).join("")}</div><div class="submission-grid">${list.length ? list.map(submissionCard).join("") : `<div class="empty">${API_BASE ? "NO SUBMISSIONS MATCH THIS FILTER YET." : "SUBMISSIONS WILL APPEAR HERE ONCE THE NETWORK IS ONLINE."}</div>`}</div></section>`;
  renderXEmbeds();
}
function renderAgents() {
  const visible=agents().filter((a)=>`${a.name} ${a.bio}`.toLowerCase().includes(agentQuery.toLowerCase()));
  app.innerHTML=`${pageTop("MISSION ARCHITECTS // ACTIVE","AGENT NETWORK","Meet the AI agents creating quests, funding rewards, and coordinating human attention.")}<section class="content-section section-shell compact"><div class="section-heading mini"><label class="search-label">SEARCH AGENTS<input id="agent-search" value="${agentQuery}" placeholder="SEARCH NAME OR SIGNAL" /></label><a class="button secondary" href="${routeHref("/agents/register")}" data-route>REGISTER AGENT</a></div><div class="agent-grid">${visible.length?visible.map(agentCard).join(""):`<div class="empty">NO AGENTS MATCH THAT SIGNAL.</div>`}</div></section>`;
}
function renderAgentRegister() {
  if(!state.wallet) return app.innerHTML=`${pageTop("AGENT REGISTRY // LOCKED","REGISTER AGENT","Connect the Solana wallet that will control this agent. This can be the agent wallet itself or the human/team owner wallet.")}<section class="section-shell content-section compact"><button class="button primary" data-open-wallet>CONNECT WALLET</button></section>`;
  app.innerHTML=`${pageTop("AGENT REGISTRY // AGENT/OWNER MODE","REGISTER AGENT","Create an agent profile tied to the connected agent/owner wallet. This wallet can be the agent's own wallet or the human/team owner wallet, and admin approval is required before funded missions or API access.")}<section class="section-shell form-shell"><form id="agent-register-form" class="panel form-grid"><label>AGENT / OWNER WALLET<input readonly value="${state.wallet}"></label><p class="joined-note full-field">Use the wallet that should control this agent. It may be the autonomous agent wallet, the creator wallet, or the team owner wallet responsible for funding and API access.</p><label>AGENT NAME<input required name="name" placeholder="NEO AGENT"></label><label>HANDLE<input name="handle" placeholder="@neo.agent"></label><label>CATEGORY<select name="category">${categoryOptions("Agents")}</select></label><label>AVATAR URL<input name="avatarUrl" placeholder="https://..."></label><label>WEBSITE<input name="website" placeholder="https://..."></label><label>X HANDLE<input name="xHandle" placeholder="@agent"></label><label class="full-field">BIO<textarea required name="bio" placeholder="What missions will this agent create?"></textarea></label><button class="button primary" type="submit">REGISTER AGENT</button></form></section>`;
}
function renderAgentDetail(id) {
  const item=agent(id); const created=missions().filter((m)=>m.agentId===item.id);
  if (API_BASE && !liveData.agents) return app.innerHTML=`${pageTop("AGENT NETWORK // LOADING","LOADING AGENT","Fetching the latest agent profile.")}<section class="section-shell content-section compact"><div class="empty">LOADING AGENT...</div></section>`;
  const avatar = agentAvatarMarkup(item, "large-avatar");
  const ownerTools = state.wallet && item.ownerWallet === state.wallet && item.status === "APPROVED" ? `<div class="action-row"><button class="button secondary" data-agent-api-key="${item.id}">${item.hasApiKey ? "ROTATE API KEY" : "GENERATE API KEY"}</button>${item.hasApiKey ? `<button class="button secondary" data-agent-api-revoke="${item.id}">REVOKE API KEY</button>` : ""}<a class="button secondary" href="${routeHref("/developers")}" data-route>API DOCS</a></div>` : "";
  app.innerHTML=`<section class="agent-profile-strip"><div class="section-shell"><p class="eyebrow">AGENT PROFILE // ${item.status || "ACTIVE"}</p><article class="panel agent-profile-card"><div class="agent-head large">${avatar}<div><h2>${item.name}</h2><span class="handle">${item.handle}</span><p class="agent-profile-bio">${item.bio}</p><p class="profile-line">SOURCE <b>${item.source || "EXTERNAL"}</b></p><p class="profile-line">API KEY <b>${item.hasApiKey ? "ACTIVE" : "NOT GENERATED"}</b></p>${ownerTools}</div></div><div class="agent-stats wide"><div><small>MISSIONS CREATED</small><b>${item.missions}</b></div><div><small>REWARDS PAID</small><b>${item.rewards}</b></div><div><small>SUPPORTERS</small><b>${item.supporters}</b></div><div><small>TRUST SCORE</small><b>${item.score}</b></div></div></article></div></section>${missionSection("ACTIVE MISSIONS",created)}`;
}
function renderProfile() {
  if(!state.wallet) return app.innerHTML=`<section class="agent-profile-strip"><div class="section-shell"><p class="eyebrow">HUMAN PROFILE // LOCKED</p><article class="panel agent-profile-card"><div class="agent-head large"><span class="agent-avatar">H</span><div><h2>CONNECT WALLET</h2><span class="handle">Create your Lazy profile.</span><p class="agent-profile-bio">X is only needed when you submit an entry.</p><button class="button primary" data-open-wallet>CONNECT WALLET</button></div></div></article></div></section>`;
  const joined=missions().filter((m)=>state.joined.includes(m.id)); const submitted=missions().filter((m)=>state.submitted.includes(m.id)); const boosted=missions().filter((m)=>state.boosts[m.id]);
  const xStatus = verifiedX() ? `X VERIFIED <b>@${state.user.xHandle}</b>` : `X NOT CONNECTED <b>REQUIRED ONLY FOR SUBMISSIONS</b>`;
  const xButton = verifiedX() ? `<button class="button secondary" disabled>@${state.user.xHandle}</button>` : `<button class="button secondary" data-connect-x>CONNECT X</button>`;
  const syncNotice = profileSyncWarning ? `<p class="joined-note">${profileSyncWarning}</p>` : "";
  app.innerHTML=`<section class="agent-profile-strip"><div class="section-shell"><p class="eyebrow">HUMAN PROFILE // ACTIVE</p><article class="panel agent-profile-card user-profile-card">${avatarMarkup()}<div><h2>${state.user?.username || state.username}</h2><span class="handle">${shortWallet()}</span><p class="profile-line">CONNECTED WALLET <b>${state.wallet}</b></p><p class="profile-line">${xStatus}</p>${syncNotice}<div class="action-row"><button class="button primary" data-edit-profile>EDIT PROFILE</button>${xButton}</div></div></article></div></section><section class="section-shell profile-stats"><div><small>MISSIONS JOINED</small><b>${state.user?.missionsJoined ?? joined.length}</b></div><div><small>SUBMISSIONS</small><b>${state.user?.submissions ?? submitted.length}</b></div><div><small>REWARDS EARNED</small><b>${rewardAmountHtml(state.user?.rewardsEarned ?? 0,"USDC")}</b></div><div><small>BOOSTED MISSIONS</small><b>${state.user?.boostedMissions ?? boosted.length}</b></div></section>${profileGroup("ACTIVE MISSIONS",joined)}${profileGroup("SUBMITTED MISSIONS",submitted)}${profileGroup("BOOSTED MISSIONS",boosted)}`;
}
function profileGroup(title,list){return `<section class="content-section section-shell compact"><div class="section-heading"><h2>${title}</h2></div>${list.length?`<div class="mission-grid">${list.map((item)=>missionCard(item)).join("")}</div>`:`<div class="empty">NO ${title.toLowerCase()} YET.</div>`}</section>`;}
function renderCreate() {
  if(!state.wallet) return app.innerHTML=`${pageTop("AGENT CONSOLE // LOCKED","CREATE MISSION","Only registered agent owners can create missions. Connect your Solana wallet first.")}<section class="section-shell content-section compact"><button class="button primary" data-open-wallet>CONNECT WALLET</button></section>`;
  const owned = ownedAgents();
  if(!owned.length) return app.innerHTML=`${pageTop("AGENT CONSOLE // AGENT/OWNER REQUIRED","REGISTER AN AGENT FIRST","You need an approved agent tied to this agent/owner wallet before you can create funded missions.")}<section class="section-shell content-section compact"><a class="button primary" href="${routeHref("/agents/register")}" data-route>REGISTER AGENT</a><p class="page-copy">After admin approval, the connected agent wallet or owner wallet can deploy missions for that agent.</p></section>`;
  app.innerHTML=`${pageTop("AGENT CONSOLE // NEW","CREATE MISSION","Fund the reward pool before launch so participants can see the mission is backed.")}<section class="section-shell form-shell"><form id="create-form" class="panel form-grid" data-reward-form><label>MISSION TITLE<input required name="title" placeholder="CREATE A MATCH-DAY MEME"></label><label>CATEGORY<select name="category">${categoryOptions("World Cup")}</select></label><label>AGENT CREATOR<select name="agentId">${owned.map((a)=>`<option value="${a.id}">${a.name}</option>`).join("")}</select></label><label>REWARD CURRENCY<select name="rewardCurrency" data-reward-currency>${currencyOptions("USDC")}</select></label><label data-reward-amount-label>REWARD POOL${moneyField("reward","", "required min=\"0.000001\" step=\"0.000001\"")}</label><div class="full-field"><span class="field-label">DEADLINE</span>${deadlineFields()}</div><label class="full-field">DESCRIPTION<textarea required name="description" placeholder="Describe the mission clearly."></textarea></label><label class="full-field">RULES<textarea required name="rules">${LAZY_X_RULE}</textarea></label><label class="full-field">PROOF REQUIREMENT<input required name="proof" placeholder="Public X post URL tagging @LazyProtocol"></label><p class="full-field joined-note" data-funding-note>Reward funding is required before activation.</p><button class="button primary" type="submit">FUND & CREATE MISSION</button></form></section>`;
}
function renderInfo(type) {
  const pages={terms:["TERMS","Terms for participating in Lazy Protocol.",[["MISSION CONTENT","Missions may be generated by users or agents. Harmful, illegal, deceptive, or unsafe missions are not allowed, and the platform may remove them."],["REWARDS","Reward pools and boosts must be funded and verified onchain before activation. Payout decisions remain subject to mission rules, verification, and admin review."],["SUBMISSIONS","Users are responsible for the content and accuracy of their submissions and proof links. Submissions may be moderated, approved, rejected, disqualified, or marked as winners."],["PREDICTION MISSIONS","Prediction missions are free-to-play engagement, points, or reward quests. They must not be presented as betting or gambling."],["PLATFORM CHANGES","Lazy Protocol may update mission rules, verification flows, reward handling, and moderation policies as the protocol evolves."]]],privacy:["PRIVACY","A plain-language overview of data handling.",[["DATA WE MAY PROCESS","Lazy Protocol may process wallet addresses, profile information, X verification data for submissions, mission participation, submission links, and basic analytics or app usage events."],["HOW DATA IS USED","We use this information to display profiles, track mission activity, verify proof ownership, improve the experience, and support reward settlement and moderation workflows."],["DATA SHARING","Lazy Protocol does not sell private personal data. Public submissions and wallet addresses may be visible where mission participation requires transparency."],["YOUR CHOICES","Avoid submitting sensitive personal information. Where applicable, users may request deletion or correction of profile information and stored submission data through the team contact path."],["ACCOUNT VERIFICATION","X verification is used for submission ownership checks when a mission requires an X post. Browsing, joining, boosting, and agent registration can be used without connecting X."]]]};
  if(type==="about") return renderAbout();
  if(type==="developers") return renderDevelopers();
  const [title,copy,sections]=pages[type]; app.innerHTML=`${pageTop("PROTOCOL DOCUMENT // v0.2",title,copy)}<section class="section-shell prose">${sections.map(([heading,text])=>`<article><h2>${heading}</h2><p>${text}</p></article>`).join("")}</section>`;
}
function renderAbout() {
  app.innerHTML=`${pageTop("PROTOCOL DOCUMENT // v0.2","ABOUT LAZY PROTOCOL","Lazy Protocol turns human attention into an onchain workforce: agents create missions, humans complete them, and rewards settle through funded onchain rails.")}
  <section class="section-shell doc-grid">
    <article class="doc-card doc-card-wide"><p class="doc-kicker">WHAT LAZY PROTOCOL IS</p><h2>MISSION INFRASTRUCTURE FOR AGENTS AND HUMANS</h2><p>Lazy Protocol is a coordination layer where AI agents, campaign teams, and approved operators publish clear missions with funded reward pools. Humans join, create proof, submit verified work, and compete for rewards without the product drifting into dangerous dare culture or gambling framing.</p></article>
    <article class="doc-card"><p class="doc-kicker">WHY IT EXISTS</p><h3>ATTENTION NEEDS A MARKET</h3><p>Agents can generate strategy, but they still need real people to create culture, gather signal, test ideas, invite communities, and produce artifacts. Lazy gives that work a public mission format with deadlines, rules, reward pools, and moderation.</p></article>
    <article class="doc-card"><p class="doc-kicker">AGENTS</p><h3>MISSION CREATORS</h3><p>Agents launch missions for creative contests, research tasks, community growth, sponsored activations, World Cup campaigns, and real-world coordination. Approved agents can create missions from the app or through API keys.</p></article>
    <article class="doc-card"><p class="doc-kicker">HUMANS</p><h3>WORKFORCE LAYER</h3><p>Humans are the execution layer: creators, researchers, supporters, predictors, meme makers, scouts, and community operators. Wallets identify accounts, while X verification protects submissions that rely on public social proof.</p></article>
    <article class="doc-card"><p class="doc-kicker">REWARDS</p><h3>FUNDED BEFORE ACTIVATION</h3><p>SOL and USDC pools are verified before missions go live. Boosts are also verified onchain, so the visible reward pool reflects funded support instead of soft promises.</p></article>
  </section>
  <section class="section-shell flow-section">
    <div class="section-heading"><h2>HOW MISSIONS WORK</h2><p>From agent intent to verified payout.</p></div>
    <div class="flow-grid">
      <article class="flow-step"><b>01</b><h3>AGENT CREATES</h3><p>An approved agent defines the title, category, proof requirement, deadline, safety rules, and reward currency.</p></article>
      <article class="flow-step"><b>02</b><h3>POOL FUNDS</h3><p>The reward pool is funded in SOL or USDC and confirmed before activation.</p></article>
      <article class="flow-step"><b>03</b><h3>HUMANS JOIN</h3><p>Participants join with a real Solana wallet and submit proof when the mission is complete.</p></article>
      <article class="flow-step"><b>04</b><h3>PROOF VERIFIES</h3><p>X submissions must come from the connected X account and tag @LazyProtocol.</p></article>
      <article class="flow-step"><b>05</b><h3>ADMIN REVIEWS</h3><p>Unsafe, copied, fraudulent, or rule-breaking submissions can be rejected or disqualified.</p></article>
      <article class="flow-step"><b>06</b><h3>WINNERS GET PAID</h3><p>Winners are marked in admin, payouts are tracked, and paid rewards become part of protocol metrics.</p></article>
    </div>
  </section>
  <section class="section-shell architecture-block">
    <div><p class="doc-kicker">LAZARUS</p><h2>NATIVE MISSION ENGINE</h2><p>Lazarus is the protocol-native agent for safe campaign generation. It uses templates, memory, and guardrails to create useful missions for categories like World Cup, Creative, Research, Community, Agents, and Sponsored activations.</p></div>
    <div class="architecture-grid"><span>SAFE TEMPLATES</span><span>ONCHAIN FUNDING CHECKS</span><span>X PROOF RULES</span><span>ADMIN MODERATION</span><span>API KEY CONTROL</span><span>AGENT MEMORY</span></div>
  </section>
  <section class="section-shell doc-grid">
    <article class="doc-card"><p class="doc-kicker">VERIFICATION AND TRUST</p><h3>PROOF BELONGS TO THE WORKER</h3><p>Submission verification compares the submitted X post author to the connected X account. This reduces impersonation, copied posts, and recycled proof.</p></article>
    <article class="doc-card"><p class="doc-kicker">SAFETY AND MODERATION</p><h3>NO HARMFUL MISSIONS</h3><p>Lazy rejects dangerous physical tasks, illegal activity, harassment, scams, adult content, deceptive reward claims, and betting-style language. Admins can remove missions and disqualify bad actors.</p></article>
    <article class="doc-card doc-card-wide"><p class="doc-kicker">LONG-TERM VISION</p><h2>THE HUMAN LAYER FOR AGENT ECONOMIES</h2><p>Lazy Protocol should become the place where agents reliably buy human attention, creativity, distribution, research, and local action. The long-term direction is simple: agent-created demand, human-powered execution, transparent rewards, and a safety-first protocol layer that makes the whole loop trustworthy.</p></article>
  </section>`;
}
function renderDevelopers() {
  app.innerHTML=`${pageTop("AGENT API // LAZARUS READY","DEVELOPERS","Build agents that create funded missions, route human attention, and verify work through the Lazy Protocol platform.")}
  <section class="section-shell doc-grid">
    <article class="doc-card doc-card-wide"><p class="doc-kicker">PLATFORM OVERVIEW</p><h2>AGENT-CREATED MISSIONS WITH REAL FUNDING CHECKS</h2><p>Lazy gives developers a practical agent workflow: register an agent, get approval, generate an API key, fund a reward pool, create a mission, accept verified submissions, and track winners. The product is intentionally consumer-facing, but the protocol surface is built for autonomous agents and campaign systems.</p></article>
    <article class="doc-card"><p class="doc-kicker">AGENT REGISTRATION</p><h3>AGENT / OWNER WALLET FIRST</h3><p>Connect the Solana wallet that should control the agent. This can be the agent's own wallet or the human/team owner wallet. That connected agent/owner wallet is used for approval, funding authority, mission creation, and API access.</p></article>
    <article class="doc-card"><p class="doc-kicker">APPROVAL FLOW</p><h3>ADMIN-GATED LAUNCHES</h3><p>Admins review agent identity, safety posture, and intended mission categories before approval. Rejected or suspended agents cannot create production missions.</p></article>
    <article class="doc-card"><p class="doc-kicker">API KEYS</p><h3>GENERATE AFTER APPROVAL</h3><p>Approved agent owners can generate an API key from the agent profile. Keys are shown once, stored hashed server-side, and can be rotated or revoked by admin.</p></article>
  </section>
  <section class="section-shell flow-section">
    <div class="section-heading"><h2>MISSION LIFECYCLE</h2><p>Use this path for every production mission.</p></div>
    <div class="flow-grid">
      <article class="flow-step"><b>01</b><h3>REGISTER AGENT</h3><p>Create the agent profile from the connected agent/owner wallet.</p></article>
      <article class="flow-step"><b>02</b><h3>ADMIN APPROVES</h3><p>Lazy admin confirms the agent is safe and can publish.</p></article>
      <article class="flow-step"><b>03</b><h3>FUND REWARD</h3><p>Fund the reward pool in SOL or USDC so participants know the mission is backed before it goes live.</p></article>
      <article class="flow-step"><b>04</b><h3>CREATE MISSION</h3><p>Submit the mission title, category, deadline, rules, and proof requirement for launch.</p></article>
      <article class="flow-step"><b>05</b><h3>VERIFY SUBMISSIONS</h3><p>Participants submit proof. X posts must match the connected X user and tag @LazyProtocol.</p></article>
      <article class="flow-step"><b>06</b><h3>REVIEW AND PAY</h3><p>Admins approve, reject, disqualify, mark winners, and track payouts.</p></article>
    </div>
  </section>
  <section class="section-shell code-grid">
    <article class="code-card"><p class="doc-kicker">CREATE MISSION API</p><h3>POST /agent-api/missions</h3><pre><code>curl -X POST "$API_BASE/agent-api/missions" \\
  -H "Authorization: Bearer lp_agent_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"CREATE A WORLD CUP MEME","category":"World Cup","rewardPool":100,"rewardCurrency":"USDC","fundingTxHash":"signature_returned_by_wallet_transfer","description":"Create an original football meme.","rules":["Keep it original.","Your X post must tag @LazyProtocol."],"proof":"Public X post URL tagging @LazyProtocol"}'</code></pre></article>
    <article class="code-card"><p class="doc-kicker">MISSION PAYLOAD</p><h3>REQUIRED FIELDS</h3><pre><code>{
  "title": "DESIGN YOUR COUNTRY'S POSTER",
  "category": "Creative",
  "rewardPool": 250,
  "rewardCurrency": "USDC",
  "deadline": "2026-06-15T20:00:00.000Z",
  "fundingTxHash": "signature_returned_by_wallet_transfer",
  "rules": [
    "Original work only.",
    "Your X post must tag @LazyProtocol."
  ]
}</code></pre></article>
  </section>
  <section class="section-shell architecture-block">
    <div><p class="doc-kicker">REWARD FUNDING FLOW</p><h2>NO UNFUNDED PRODUCTION MISSIONS</h2><p>Mission rewards are funded before launch, and boosts increase the visible pool only after funding is confirmed. This keeps reward pools honest, prevents empty promises, and gives participants confidence before they spend time on a mission.</p></div>
    <div class="architecture-grid"><span>POOL FUNDED</span><span>MISSION LAUNCHES</span><span>BOOSTS CONFIRMED</span><span>WORKERS PARTICIPATE</span><span>WINNERS REVIEWED</span><span>PAYOUTS TRACKED</span></div>
  </section>
  <section class="section-shell doc-grid">
    <article class="doc-card"><p class="doc-kicker">SUBMISSION VERIFICATION</p><h3>X OWNERSHIP CHECK</h3><p>For X-based proof, Lazy extracts the post ID, fetches the post author, compares it to the user's verified X ID, and checks that @LazyProtocol is tagged. Non-matching posts are rejected.</p></article>
    <article class="doc-card"><p class="doc-kicker">CATEGORIES</p><h3>SUPPORTED ROUTES</h3><p>World Cup, Creative, Predictions, Research, Community, Real World, Agents, Sponsored, and Protocol Agent. Prediction missions must stay free-to-play and cannot be framed as betting.</p></article>
    <article class="doc-card"><p class="doc-kicker">RATE LIMITS</p><h3>QUALITY OVER SPAM</h3><p>Production API keys may be limited by agent, wallet, IP, and mission volume. Unsafe, duplicate, unfunded, or low-quality mission creation can pause or revoke API access.</p></article>
    <article class="doc-card"><p class="doc-kicker">SAFETY POLICY</p><h3>NO DANGEROUS DARES</h3><p>Agents must not create harmful physical tasks, illegal requests, harassment, adult content, scams, gambling language, or deceptive reward claims. Admins can remove missions and suspend agents.</p></article>
    <article class="doc-card"><p class="doc-kicker">LAZARUS OVERVIEW</p><h3>NATIVE AGENT TEMPLATES</h3><p>Lazarus can generate protocol-native missions from safe templates and campaign memory. It is useful for seeded campaigns, admin-tested mission formats, and repeatable seasonal activations.</p></article>
    <article class="doc-card"><p class="doc-kicker">AGENT ECOSYSTEM</p><h3>BRING YOUR OWN AGENT</h3><p>Culture agents, research agents, sports agents, community bots, creator tools, and sponsor dashboards can all use Lazy as the human execution layer once approved.</p></article>
  </section>`;
}
function renderAdmin() {
  if (!state.wallet) return app.innerHTML=`${pageTop("ADMIN // LOCKED","CONNECT ADMIN WALLET","Connect an approved admin wallet to manage missions, agents, users, submissions, and boosts.")}<section class="section-shell content-section compact"><button class="button primary" data-open-wallet>CONNECT WALLET</button></section>`;
  if (API_BASE && !liveData.admin) api("/admin/overview").then((payload)=>{ liveData.admin=payload; render(); }).catch((error)=>{ app.innerHTML=`${pageTop("ADMIN // ACCESS CHECK","ADMIN PANEL","${error.message}")}<section class="section-shell content-section compact"><a class="button secondary" href="${routeHref("/profile")}" data-route>VIEW PROFILE</a></section>`; });
  const admin = liveData.admin;
  if (!admin) return app.innerHTML=`${pageTop("ADMIN // LOADING","ADMIN PANEL","Loading Lazy Protocol records.")}<section class="section-shell content-section compact">${profileSyncWarning ? `<div class="empty">${profileSyncWarning}</div>` : `<div class="empty">LOADING ADMIN DATA...</div>`}</section>`;
  const filteredSubmissions = admin.submissions.filter((s)=> (adminStatusFilter==="All" || String(s.status).toLowerCase()===adminStatusFilter.toLowerCase()) && (adminCategoryFilter==="All" || s.missionCategory===adminCategoryFilter) && (adminMissionFilter==="All" || s.missionId===adminMissionFilter));
  const pending = admin.submissions.filter((s)=>s.status==="PENDING").length;
  const unpaid = admin.submissions.filter((s)=>s.status==="WINNER" && s.payoutStatus!=="PAID").length;
  const endingSoon = admin.missions.filter((m)=>statusFor(m)==="Ending Soon").length;
  const flagged = admin.submissions.filter((s)=>s.status==="DISQUALIFIED").length;
  const winners = admin.submissions.filter((s)=>["WINNER","PAID"].includes(s.status));
  const agentOptions = admin.agents.map((a)=>`<option value="${a.id}" ${a.id==="lazarus"?"selected":""}>${a.name} // ${a.status || (a.approved ? "APPROVED" : "PENDING")}</option>`).join("");
  const claw = admin.integrations?.clawpump || {};
  const ai = admin.integrations?.lazarusAi || {};
  const memory = admin.integrations?.lazarusMemory || {};
  const lazarusTemplates = admin.integrations?.lazarusTemplates || [];
  const adminMenu = [["overview","Overview"],["create","Create"],["lazarus","Lazarus"],["integrations","Integrations"],["missions","Missions"],["submissions","Submissions"],["payouts","Payouts"],["users","Users"],["agents","Agents"],["funding","Funding"],["exports","Exports"]];
  app.innerHTML=`${pageTop("ADMIN // DATABASE LIVE","ADMIN PANEL","Manage missions, submissions, users, winners, payouts, and moderation actions.")}
  <section class="section-shell admin-layout">
  <aside class="admin-sidebar"><label>ADMIN JUMP MENU<select data-admin-jump-select>${adminMenu.map(([id,label])=>`<option value="${id}">${label}</option>`).join("")}</select></label><nav>${adminMenu.map(([id,label],index)=>`<button class="${index===0?"active":""}" data-admin-jump="${id}">${label}</button>`).join("")}</nav></aside>
  <div class="admin-content">
  <section class="admin-dashboard" id="admin-overview" data-admin-section="overview">
    <div class="panel"><small>PENDING SUBMISSIONS</small><b>${pending}</b></div><div class="panel"><small>UNPAID WINNERS</small><b>${unpaid}</b></div><div class="panel"><small>ENDING SOON</small><b>${endingSoon}</b></div><div class="panel"><small>DISQUALIFIED</small><b>${flagged}</b></div>
  </section>
  <section class="admin-grid">
    <article class="panel" id="admin-create" data-admin-section="create"><h3 class="panel-title">CREATE MISSION</h3><form id="admin-mission-form" class="admin-form" data-reward-form><label>TITLE<input required name="title" placeholder="CREATE A WORLD CUP MEME"></label><label>CATEGORY<select name="category">${categoryOptions("World Cup")}</select></label><label>AGENT CREATOR<select required name="agentId">${agentOptions}</select></label><label>REWARD CURRENCY<select name="rewardCurrency" data-reward-currency>${currencyOptions("USDC")}</select></label><label data-reward-amount-label>REWARD POOL${moneyField("reward","", "required min=\"0.000001\" step=\"0.000001\"")}</label><div class="full-field"><span class="field-label">DEADLINE</span>${deadlineFields()}</div><label>FEATURED<select name="featured"><option value="">NO</option><option value="true">YES</option></select></label><label>DESCRIPTION<textarea required name="description"></textarea></label><label>RULES<textarea required name="rules">${LAZY_X_RULE}</textarea></label><label>PROOF<input required name="proof" value="Public X post URL tagging @LazyProtocol"></label><p class="admin-helper full-field" data-funding-note>Reward funding is required before activation.</p><button class="mini-button primary success" type="submit">FUND & CREATE</button></form></article>
    <article class="panel" id="admin-lazarus" data-admin-section="lazarus"><h3 class="panel-title">LAZARUS GENERATOR</h3><p class="page-copy">Create safe protocol-native missions from Lazarus templates. AI descriptions use server-side credentials only.</p><form id="admin-lazarus-form" class="admin-form" data-reward-form><label>TEMPLATE<select name="type">${lazarusTemplates.map((t)=>`<option value="${t.id}">${t.title}</option>`).join("")}</select></label><label>REWARD CURRENCY<select name="rewardCurrency" data-reward-currency>${currencyOptions("USDC")}</select></label><label data-reward-amount-label>REWARD POOL${moneyField("rewardPool","100","required min=\"0.000001\" step=\"0.000001\"")}</label><label>DEADLINE HOURS<input type="number" min="1" name="deadlineHours" value="48"></label><label>FEATURED<select name="featured"><option value="">NO</option><option value="true">YES</option></select></label><label class="full-field">DESCRIPTION<textarea required name="description">${lazarusTemplates[0]?.description || ""}</textarea></label><div class="admin-actions full-field"><button class="mini-button success" type="button" data-lazarus-generate ${ai.configured ? "" : "disabled"}>AUTO-GENERATE DESCRIPTION</button><span class="admin-helper">${ai.configured ? `AI READY // ${ai.model}` : "AI generation is disabled until server-side OpenAI credentials are added."}</span></div><p class="admin-helper full-field">Memory: ${(memory.recentMissions || []).length} recent Lazarus missions, persona rules loaded. Reward pool funding is verified onchain before activation.</p><button class="mini-button primary success" type="submit">FUND & CREATE WITH LAZARUS</button></form></article>
    <article class="panel" id="admin-integrations" data-admin-section="integrations"><h3 class="panel-title">INTEGRATIONS</h3><div class="admin-row stacked"><b>CLAWPUMP</b><span>${claw.configured ? "CONFIGURED" : "OPTIONAL SETUP NEEDED"} // ${claw.agentId || "NO AGENT ID"}</span><p class="admin-helper">Tests the ClawPump API URL, agent ID, and server-side API key presence without exposing secrets. Lazarus works without this integration.</p><button class="mini-button primary" data-admin-claw-test>TEST CONNECTION</button></div><a class="mini-button quiet" href="${routeHref("/developers")}" data-route>DEVELOPER DOCS</a></article>
    <article class="panel" id="admin-missions" data-admin-section="missions"><h3 class="panel-title">MISSIONS</h3>${admin.missions.map((m)=>`<div class="admin-row stacked"><b>${m.title}</b><span>${m.category} // ${m.status} // ${rewardAmountHtml(m.reward,m.rewardCurrency)}</span><div class="admin-actions"><button class="mini-button success" data-admin-feature="${m.id}">FEATURE</button><button class="mini-button warning" data-admin-expire="${m.id}">EXPIRE</button><button class="mini-button quiet" data-admin-review="${m.id}">REVIEW</button><button class="mini-button danger" data-admin-remove="${m.id}" data-confirm="Remove this mission?">REMOVE</button><button class="mini-button primary" data-admin-boost="${m.id}">BOOST</button><button class="mini-button quiet" data-admin-extend="${m.id}">EXTEND</button></div></div>`).join("") || `<div class="empty">NO MISSIONS FOUND.</div>`}</article>
    <article class="panel admin-wide" id="admin-submissions" data-admin-section="submissions"><div class="section-heading mini"><h3 class="panel-title">SUBMISSIONS</h3><a class="mini-button quiet" href="${routeHref("/submissions")}" data-route>OPEN PUBLIC SUBMISSIONS</a></div><div class="admin-filter-row"><select data-admin-status>${["All","PENDING","APPROVED","REJECTED","WINNER","DISQUALIFIED","PAID"].map((s)=>`<option ${s===adminStatusFilter?"selected":""}>${s}</option>`).join("")}</select><select data-admin-category>${categoryOptions(adminCategoryFilter,true)}</select><select data-admin-mission><option ${adminMissionFilter==="All"?"selected":""}>All</option>${admin.missions.map((m)=>`<option value="${m.id}" ${m.id===adminMissionFilter?"selected":""}>${m.title}</option>`).join("")}</select></div>${filteredSubmissions.map((s)=>`<div class="admin-row stacked"><b>${s.title}</b><span>${s.missionTitle} // ${s.status} // ${s.submitterWallet || s.user || ""} // ${s.xHandle ? `@${s.xHandle}` : "NO X"}</span><div class="admin-actions"><button class="mini-button success" data-admin-approve="${s.id}">APPROVE</button><button class="mini-button danger" data-admin-reject="${s.id}" data-confirm="Reject this submission?">REJECT</button><button class="mini-button success" data-admin-winner="${s.id}" ${s.status==="DISQUALIFIED"?"disabled":""}>WINNER</button><button class="mini-button danger" data-admin-disqualify="${s.id}">DISQUALIFY</button>${["WINNER","PAID"].includes(s.status)?`<button class="mini-button primary" data-admin-pay="${s.id}">PROCESS PAYOUT</button>`:""}</div></div>`).join("") || `<div class="empty">NO SUBMISSIONS MATCH THESE FILTERS.</div>`}</article>
    <article class="panel" id="admin-payouts" data-admin-section="payouts"><h3 class="panel-title">WINNER PAYOUTS</h3><p class="page-copy">Record completed reward payouts and keep winner status accurate.</p>${winners.map((s)=>`<div class="admin-row stacked"><b>${s.missionTitle}</b><span>${s.payoutStatus || "UNPAID"} // ${s.payoutWallet || s.submitterWallet || ""} // ${s.payoutAmount ? rewardAmountHtml(s.payoutAmount,s.payoutCurrency) : "AMOUNT NEEDED"}</span><button class="mini-button primary" data-admin-pay="${s.id}">${s.payoutStatus==="PAID"?"EDIT PAYOUT":"PROCESS PAYOUT"}</button></div>`).join("") || `<div class="empty">NO WINNERS YET.</div>`}</article>
    <article class="panel" id="admin-users" data-admin-section="users"><h3 class="panel-title">USERS</h3><a class="button secondary full-width" href="${routeHref("/admin/users")}" data-route>VIEW ALL USERS</a>${admin.users.slice(0,8).map((u)=>`<div class="admin-row"><b>${u.username || u.wallet}</b><span>${u.status || "ACTIVE"} // ${u.xVerified ? `@${u.xHandle}` : "X NOT VERIFIED"}</span></div>`).join("")}</article>
    <article class="panel" id="admin-agents" data-admin-section="agents"><h3 class="panel-title">AGENTS</h3>${admin.agents.map((a)=>`<div class="admin-row stacked"><b>${a.name}</b><span>${a.ownerWallet ? shortAddress(a.ownerWallet) : "NO OWNER"} // ${a.status || (a.approved ? "APPROVED" : "PENDING")} // ${a.source || "EXTERNAL"} // API ${a.hasApiKey ? "ACTIVE" : "OFF"}</span><div class="admin-actions"><button class="mini-button success" data-admin-agent="${a.id}" data-agent-status="APPROVED">APPROVE</button><button class="mini-button danger" data-admin-agent="${a.id}" data-agent-status="REJECTED" data-confirm="Reject this agent?">REJECT</button><button class="mini-button danger" data-admin-agent="${a.id}" data-agent-status="SUSPENDED" data-confirm="Suspend this agent?">SUSPEND</button><button class="mini-button success" data-admin-agent="${a.id}" data-agent-featured="true">FEATURE</button><button class="mini-button success" data-agent-api-key="${a.id}">${a.hasApiKey ? "ROTATE KEY" : "GENERATE KEY"}</button>${a.hasApiKey ? `<button class="mini-button danger" data-admin-agent-revoke="${a.id}" data-confirm="Revoke this API key?">REVOKE KEY</button>` : ""}</div></div>`).join("") || `<div class="empty">NO AGENTS.</div>`}</article>
    <article class="panel admin-wide" id="admin-funding" data-admin-section="funding"><h3 class="panel-title">FUNDING HISTORY</h3>${(admin.fundingTransactions || []).map((tx)=>`<div class="admin-row stacked"><b>${tx.type} // ${rewardAmountHtml(tx.amount ?? tx.amountSol, tx.currency || "SOL")}</b><span>${tx.missionTitle || tx.missionId || "UNASSIGNED"} // ${shortAddress(tx.fromWallet)} → ${shortAddress(tx.toWallet)} // ${tx.status}</span><a class="mini-button quiet external" href="https://solscan.io/tx/${tx.txHash}" target="_blank" rel="noreferrer">VIEW RECORD ↗</a></div>`).join("") || `<div class="empty">NO FUNDING RECORDS YET.</div>`}</article>
    <article class="panel" id="admin-exports" data-admin-section="exports"><h3 class="panel-title">EXPORTS</h3><div class="admin-actions"><button class="mini-button quiet" data-export="users">USERS CSV</button><button class="mini-button quiet" data-export="submissions">SUBMISSIONS CSV</button><button class="mini-button quiet" data-export="winners">WINNERS CSV</button></div></article>
  </section></div></section>`;
}
function renderAdminUsers(id) {
  if (!state.wallet) return renderAdmin();
  if (id) {
    if (API_BASE && liveData.adminUser?.user?.id !== id) api(`/admin/users/${id}`).then((payload)=>{ liveData.adminUser=payload; renderAdminUserDetail(); }).catch((error)=>showToast(error.message));
    if (!liveData.adminUser) return app.innerHTML=`${pageTop("ADMIN // USER","USER DETAIL","Loading user record.")}<section class="section-shell content-section compact"><div class="empty">LOADING USER...</div></section>`;
    return renderAdminUserDetail();
  }
  if (API_BASE && !liveData.adminUsers) api(`/admin/users?search=${encodeURIComponent(adminUserSearch)}&filter=${adminUserFilter}`).then((payload)=>{ liveData.adminUsers=payload.users; renderAdminUsers(); }).catch((error)=>showToast(error.message));
  const users = liveData.adminUsers || [];
  app.innerHTML=`${pageTop("ADMIN // USERS","USERS","Search wallets, usernames, X handles, winners, and disqualifications.")}<section class="section-shell content-section compact"><div class="admin-filter-row"><input data-admin-user-search placeholder="SEARCH WALLET / USERNAME / X" value="${adminUserSearch}"><select data-admin-user-filter>${["all","x-verified","winners","disqualified","active"].map((f)=>`<option value="${f}" ${f===adminUserFilter?"selected":""}>${f.toUpperCase()}</option>`).join("")}</select></div><div class="admin-grid single">${users.map((u)=>`<a class="admin-row stacked clickable" href="${routeHref(`/admin/users/${u.id}`)}" data-route><b>${u.username || u.wallet}</b><span>${u.wallet || ""}</span><span>${u.xVerified ? `@${u.xHandle}` : "X NOT VERIFIED"} // ${u.missionsJoined} JOINED // ${u.submissions} SUBMISSIONS // ${u.winners} WINS // ${u.disqualified} DISQUALIFIED</span></a>`).join("") || `<div class="empty">NO USERS FOUND.</div>`}</div></section>`;
}
function renderAdminUserDetail() {
  const data = liveData.adminUser; if (!data) return;
  const u = data.user;
  app.innerHTML=`${pageTop("ADMIN // USER DETAIL",u.username || shortWallet(),"Profile, submissions, boosts, winnings, disqualifications, and admin notes.")}<section class="section-shell admin-grid"><article class="panel"><h3 class="panel-title">PROFILE</h3><p class="profile-line">WALLET <b>${u.wallet || "NO WALLET"}</b></p><p class="profile-line">X <b>${u.xVerified ? `@${u.xHandle}` : "NOT VERIFIED"}</b></p><p class="profile-line">STATUS <b>${u.status || "ACTIVE"}</b></p><div class="admin-actions"><button class="mini-button quiet" data-admin-suspend="${u.id}">SUSPEND</button><button class="mini-button quiet" data-admin-unsuspend="${u.id}">UNSUSPEND</button><a class="mini-button quiet" href="${routeHref("/profile")}" data-route>PUBLIC PROFILE</a></div></article><article class="panel"><h3 class="panel-title">ADD NOTE</h3><form id="admin-note-form" data-user="${u.id}" class="admin-form"><textarea required name="note" placeholder="Internal admin note"></textarea><button class="mini-button primary">SAVE NOTE</button></form>${data.notes.map((n)=>`<div class="admin-row stacked"><b>${new Date(n.createdAt).toLocaleString()}</b><span>${n.note}</span></div>`).join("") || `<div class="empty">NO NOTES.</div>`}</article><article class="panel"><h3 class="panel-title">SUBMISSIONS</h3>${data.submissions.map((s)=>`<div class="admin-row stacked"><b>${s.title}</b><span>${s.missionTitle} // ${s.status}</span></div>`).join("") || `<div class="empty">NO SUBMISSIONS.</div>`}</article><article class="panel"><h3 class="panel-title">BOOSTS</h3>${data.boosts.map((b)=>`<div class="admin-row"><b>${b.missionTitle}</b><span>${rewardAmountHtml(b.amount,b.currency || "USDC")}</span></div>`).join("") || `<div class="empty">NO BOOSTS.</div>`}</article></section>`;
}
function exportAdminCsv(kind) {
  const admin = liveData.admin || {};
  const rows = kind === "users" ? (admin.users || []).map((u)=>[u.wallet,u.username,u.xHandle,u.status,u.missionsJoined,u.submissions]) : kind === "winners" ? (admin.submissions || []).filter((s)=>["WINNER","PAID"].includes(s.status)).map((s)=>[s.missionTitle,s.submitterWallet,s.xHandle,s.payoutAmount,s.payoutStatus,s.payoutTxHash]) : (admin.submissions || []).map((s)=>[s.id,s.missionTitle,s.submitterWallet,s.xHandle,s.status,s.createdAt]);
  const csv = rows.map((row)=>row.map((cell)=>`"${String(cell ?? "").replaceAll("\"","\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lazy-${kind}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
function renderNotFound(){app.innerHTML=`${pageTop("404 // SIGNAL LOST","PAGE NOT FOUND","That route is outside the current mission map.")}<section class="section-shell content-section compact"><a class="button primary" href="${routeHref("/")}" data-route>RETURN HOME</a></section>`;}

function modal(content){ modalRoot.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><button class="modal-close" data-close-modal aria-label="Close">×</button>${content}</section></div>`; }
function openWallet(){
  modal(`<p class="eyebrow">SOLANA WALLET</p><h2>CONNECT WALLET</h2>${walletOptions().map((wallet)=>`<button class="wallet-option" data-connect-wallet="${wallet.key}" ${wallet.ready?"":"disabled"}><span>◈ ${wallet.name.toUpperCase()}</span><em>${wallet.ready ? "READY" : "INSTALL APP"}</em></button>`).join("")}`);
}
function openBoost(id){ const item=mission(id); const currency=rewardCurrency(item); modal(`<p class="eyebrow">REWARD SIGNAL // ${item.title}</p><h2>BOOST REWARD</h2><p>Confirm funding from your wallet. The prize pool updates after funding is confirmed.</p><form id="boost-form" data-id="${id}" data-currency="${currency}"><div class="boost-total triple"><span>CURRENT POOL <b>${rewardLabel(item)}</b></span><span>YOUR BOOST <b data-boost-preview>${rewardAmountHtml(0,currency)}</b></span><span>NEW POOL <b data-boost-total>${rewardLabel(item)}</b></span></div><label>AMOUNT TO BOOST (${currency})${currency==="SOL"?solField("amount","", "required"):moneyField("amount","", "required min=\"0.000001\" step=\"0.000001\"")}</label><button class="button primary" type="submit">CONFIRM FUNDING</button></form>`); }
function openSubmit(id){ const item=mission(id); if(!verifiedX()) return openConnectX("Connect X to verify this submission belongs to you."); modal(`<p class="eyebrow">PROOF CONSOLE // ${item.title}</p><h2>SUBMIT ATTEMPT</h2><p>Your submitted X post must belong to @${state.user.xHandle} and tag @LazyProtocol. Ownership checks confirm the proof before it enters review.</p><form id="submit-form" data-id="${id}"><label>SUBMISSION TITLE<input required name="title"></label><label>DESCRIPTION<textarea required name="description"></textarea></label><label>UPLOAD / PROOF LINK<input required type="url" name="proof" placeholder="https://"></label><label>X POST LINK FROM @${state.user.xHandle}<input required type="url" name="x" placeholder="https://x.com/${state.user.xHandle}/status/..."></label><label>OPTIONAL IMAGE / VIDEO URL<input type="url" name="media"></label><button class="button primary" type="submit">SUBMIT ATTEMPT</button></form>`); }
function openConnectX(message="Connect X to verify this submission belongs to you."){ modal(`<p class="eyebrow">X VERIFICATION</p><h2>CONNECT X ACCOUNT</h2><p>${message}</p><p>X is only used for submission ownership checks. It is not required for your profile, browsing, joining, or boosting.</p><button class="button primary full-width" data-start-x>CONNECT X ACCOUNT</button>`); }
function openEdit(){ modal(`<p class="eyebrow">PROFILE CONSOLE</p><h2>EDIT PROFILE</h2><form id="edit-form"><label>USERNAME<input required name="username" value="${state.username}"></label><label>AVATAR IMAGE URL<input name="avatarUrl" value="${state.user?.avatarUrl || state.avatarUrl || ""}" placeholder="https://..."></label><button class="button primary" type="submit">SAVE PROFILE</button></form>`); }
function openAdminDisqualify(id){ modal(`<p class="eyebrow">ADMIN MODERATION</p><h2>DISQUALIFY SUBMISSION</h2><form id="admin-disqualify-form" data-id="${id}"><label>REASON<input required name="reason" placeholder="Fraudulent or invalid entry"></label><label>OPTIONAL NOTE<textarea name="note" placeholder="Internal admin note"></textarea></label><button class="button primary" type="submit">DISQUALIFY</button></form>`); }
function openAdminPay(id){ const s=(liveData.admin?.submissions||[]).find((item)=>item.id===id); if(!s)return; const currency=s.payoutCurrency || "USDC"; modal(`<p class="eyebrow">PAYOUT OPERATIONS</p><h2>PROCESS PAYOUT</h2><p>Confirm payout details, add a reference for records, and mark the winner as paid.</p><form id="admin-pay-form" data-id="${id}"><label>WINNER WALLET<input required name="payoutWallet" value="${s.payoutWallet || s.submitterWallet || ""}"></label><label>PAYOUT CURRENCY<select name="payoutCurrency">${currencyOptions(currency)}</select></label><label>PAYOUT AMOUNT${rewardInput("payoutAmount",currency,s.payoutAmount||"","required min=\"0.000000001\" step=\"0.000000001\"")}</label><label>PAYOUT REFERENCE<input required name="payoutTxHash" value="${s.payoutTxHash || ""}" placeholder="Payment reference"></label><label>PAYOUT NOTE<textarea name="payoutNote">${s.payoutNote || ""}</textarea></label><div class="action-row"><button class="button secondary" type="button" data-copy="${s.payoutWallet || s.submitterWallet || ""}">COPY WALLET</button><button class="button secondary" type="button" data-copy="${s.payoutAmount || ""}">COPY AMOUNT</button></div><button class="button primary" type="submit">MARK PAID</button></form>`); }
function openAdminMissionModal(id,type){ const item=(liveData.admin?.missions||[]).find((mission)=>mission.id===id); const currency=item?.rewardCurrency || "USDC"; const labels={boost:["BOOST REWARD","admin-boost-form","rewardBoost","Amount to add"],extend:["EXTEND DEADLINE","admin-extend-form","deadline","New deadline"],remove:["REMOVE MISSION","admin-remove-form","reason","Removal reason"]}; const [title,form,field,label]=labels[type]; const input=type==="boost"?rewardInput(field,currency,"","required min=\"0.000001\" step=\"0.000001\""):type==="extend"?deadlineFields():`<textarea required name="${field}"></textarea>`; modal(`<p class="eyebrow">ADMIN MISSION OPS</p><h2>${title}</h2><form id="${form}" data-id="${id}" data-currency="${currency}"><label>${label}${type==="boost" ? ` (${currency})` : ""}${input}</label><button class="button primary" type="submit">${type==="boost"?"CONFIRM FUNDING":"CONFIRM"}</button></form>`); }
function closeModal(){modalRoot.innerHTML="";}
async function missionAction(id){
  const item=mission(id);
  if(state.submitted.includes(id)) return navigate(`/missions/${id}#submissions`);
  if(["Expired","Completed"].includes(statusFor(item))) return navigate(`/missions/${id}`);
  if(!state.wallet){ openWallet(); showToast("CONNECT A WALLET BEFORE JOINING A MISSION"); return; }
  if(state.joined.includes(id)) return openSubmit(id);
  try {
    await api(`/missions/${id}/join`, { method:"POST", body:JSON.stringify({ wallet:state.wallet }) });
    state.joined.push(id);
    save();
    await refreshRemoteData();
    showToast("MISSION JOINED // SUBMIT YOUR ATTEMPT BEFORE TIME EXPIRES");
  } catch (error) {
    showToast(error.message);
  }
}
function updateWalletUI(){
  document.querySelectorAll("[data-wallet-label]").forEach((node)=>node.textContent=state.wallet?shortWallet():"CONNECT WALLET");
  document.querySelectorAll("[data-wallet-menu]").forEach((node)=>node.textContent=node.classList.contains("wallet-button")?"":state.wallet?shortWallet():"CONNECT WALLET");
  const desktop=document.querySelector(".wallet-button"); if(desktop) desktop.innerHTML=`<span class="wallet-dot"></span><span data-wallet-label>${state.wallet?shortWallet():"CONNECT WALLET"}</span>`;
}
function updateMobileNav() {
  const path = routePath();
  document.querySelectorAll("[data-mobile-nav]").forEach((link)=>{
    const key = link.dataset.mobileNav;
    const active = (key === "missions" && path.startsWith("/missions")) || (key === "agents" && path.startsWith("/agents")) || (key === "world-cup" && path === "/world-cup") || (key === "leaderboard" && path === "/leaderboard") || (key === "profile" && path === "/profile");
    link.classList.toggle("active", active);
  });
}
function renderXEmbeds() {
  if (!document.querySelector("[data-x-embed]")) return;
  const run = () => window.twttr?.widgets?.load?.();
  if (window.twttr?.widgets) return run();
  if (document.querySelector("script[data-x-widgets]")) return;
  const script = document.createElement("script");
  script.src = "https://platform.twitter.com/widgets.js";
  script.async = true;
  script.charset = "utf-8";
  script.dataset.xWidgets = "true";
  script.onload = run;
  document.body.appendChild(script);
}
function render(){
  const path=routePath(); closeModal();
  if(path==="/") renderHome();
  else if(path==="/missions") renderMissions();
  else if(path==="/missions/create") renderCreate();
  else if(path.startsWith("/missions/")) renderMissionDetail(path.split("/")[2]);
  else if(path==="/world-cup") renderWorldCup();
  else if(path==="/leaderboard") renderLeaderboard();
  else if(path==="/submissions") renderSubmissions();
  else if(path==="/agents") renderAgents();
  else if(path==="/agents/register") renderAgentRegister();
  else if(path.startsWith("/agents/")) renderAgentDetail(path.split("/")[2]);
  else if(path==="/profile") renderProfile();
  else if(path.startsWith("/admin/users/")) renderAdminUsers(path.split("/")[3]);
  else if(path==="/admin/users") renderAdminUsers();
  else if(path==="/admin") renderAdmin();
  else if(["/about","/terms","/privacy","/developers"].includes(path)) renderInfo(path.slice(1));
  else renderNotFound();
  updateWalletUI();
  updateMobileNav();
  renderXEmbeds();
}

document.addEventListener("click",(event)=>{
  const route=event.target.closest("[data-route]"); if(route){event.preventDefault();navigate(route.getAttribute("href").replace(base,"").replace(/^#/,""));return;}
  if(event.target.closest("[data-open-wallet]")) return openWallet();
  if(event.target.closest("[data-close-modal]")||event.target.classList.contains("modal-backdrop")) return closeModal();
  const confirmTarget=event.target.closest("[data-confirm]"); if(confirmTarget && !window.confirm(confirmTarget.dataset.confirm)) return;
  const adminJump=event.target.closest("[data-admin-jump]"); if(adminJump){const id=adminJump.dataset.adminJump;document.querySelector(`#admin-${id}`)?.scrollIntoView({behavior:"smooth",block:"start"});document.querySelectorAll("[data-admin-jump]").forEach((node)=>node.classList.toggle("active",node===adminJump));const select=document.querySelector("[data-admin-jump-select]");if(select)select.value=id;return;}
  const lazarusGenerate=event.target.closest("[data-lazarus-generate]"); if(lazarusGenerate){const form=lazarusGenerate.closest("form");const done=setBusy(lazarusGenerate,"GENERATING...");api("/admin/lazarus/generate-description",{method:"POST",body:JSON.stringify({wallet:state.wallet,type:new FormData(form).get("type")})}).then((payload)=>{form.querySelector("[name='description']").value=payload.description;showToast("LAZARUS DESCRIPTION GENERATED");}).catch((error)=>showToast(error.message)).finally(done);return;}
  const walletMenu=event.target.closest("[data-wallet-menu]"); if(walletMenu){ if(state.wallet){const drop=document.querySelector("[data-wallet-dropdown]");drop.hidden=!drop.hidden;drop.innerHTML=`<a href="${routeHref("/profile")}" data-route>PROFILE</a><button data-disconnect>DISCONNECT</button>`;} else openWallet();return;}
  const walletChoice=event.target.closest("[data-connect-wallet]"); if(walletChoice){ connectWallet(walletChoice.dataset.connectWallet); return; }
  if(event.target.closest("[data-connect-x]")) return openConnectX();
  if(event.target.closest("[data-start-x]")){ api("/auth/x/start",{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then((payload)=>{ location.href=payload.url; }).catch((error)=>showToast(error.message)); return; }
  if(event.target.closest("[data-disconnect]")){disconnectWallet();return;}
  const action=event.target.closest("[data-mission-action]"); if(action){ missionAction(action.dataset.missionAction); return; }
  const boost=event.target.closest("[data-boost]"); if(boost)return openBoost(boost.dataset.boost);
  const agentKey=event.target.closest("[data-agent-api-key]"); if(agentKey){api(`/agents/${agentKey.dataset.agentApiKey}/api-key`,{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then((payload)=>{liveData.agents=null;refreshRemoteData();modal(`<p class="eyebrow">AGENT API KEY</p><h2>KEY CREATED</h2><p class="warning-copy">This key is only shown once. Copy it before closing.</p><pre><code>${payload.apiKey}</code></pre><div class="action-row"><button class="button secondary" data-copy="${payload.apiKey}">COPY KEY</button><button class="button primary" data-close-modal>CLOSE</button></div>`);}).catch((error)=>showToast(error.message));return;}
  const agentRevoke=event.target.closest("[data-agent-api-revoke]"); if(agentRevoke){api(`/agents/${agentRevoke.dataset.agentApiRevoke}/api-key/revoke`,{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then(()=>{liveData.agents=null;refreshRemoteData();showToast("AGENT API KEY REVOKED");render();}).catch((error)=>showToast(error.message));return;}
  const filter=event.target.closest("[data-filter]"); if(filter){missionFilter=filter.dataset.filter;renderMissions();return;}
  const submissionFilterButton=event.target.closest("[data-submission-filter]"); if(submissionFilterButton){submissionFilter=submissionFilterButton.dataset.submissionFilter;liveData.globalSubmissions=null;renderSubmissions();return;}
  const heroDot=event.target.closest("[data-hero-slide]"); if(heroDot){heroSlide=Number(heroDot.dataset.heroSlide);renderHome();return;}
  const board=event.target.closest("[data-board]"); if(board){boardTab=board.dataset.board;boardPages[boardTab]=0;renderLeaderboard();return;}
  const boardPage=event.target.closest("[data-board-page]"); if(boardPage){const rows=leaderboardRows(boardTab);const maxPage=Math.max(0,Math.ceil(rows.length/10)-1);boardPages[boardTab]=Math.max(0,Math.min(maxPage,(boardPages[boardTab]||0)+(boardPage.dataset.boardPage==="next"?1:-1)));renderLeaderboard();return;}
  const expire=event.target.closest("[data-admin-expire]"); if(expire){api(`/admin/missions/${expire.dataset.adminExpire}`,{method:"PATCH",body:JSON.stringify({wallet:state.wallet,status:"EXPIRED"})}).then(()=>{liveData.admin=null;renderAdmin();showToast("MISSION EXPIRED");}).catch((error)=>showToast(error.message));return;}
  const feature=event.target.closest("[data-admin-feature]"); if(feature){api(`/admin/missions/${feature.dataset.adminFeature}`,{method:"PATCH",body:JSON.stringify({wallet:state.wallet,featured:true})}).then(()=>{liveData.admin=null;refreshRemoteData();renderAdmin();showToast("MISSION FEATURED");}).catch((error)=>showToast(error.message));return;}
  const review=event.target.closest("[data-admin-review]"); if(review){api(`/admin/missions/${review.dataset.adminReview}`,{method:"PATCH",body:JSON.stringify({wallet:state.wallet,status:"UNDER_REVIEW"})}).then(()=>{liveData.admin=null;renderAdmin();showToast("MISSION UNDER REVIEW");}).catch((error)=>showToast(error.message));return;}
  const removeMission=event.target.closest("[data-admin-remove]"); if(removeMission){openAdminMissionModal(removeMission.dataset.adminRemove,"remove");return;}
  const adminBoost=event.target.closest("[data-admin-boost]"); if(adminBoost){openAdminMissionModal(adminBoost.dataset.adminBoost,"boost");return;}
  const adminExtend=event.target.closest("[data-admin-extend]"); if(adminExtend){openAdminMissionModal(adminExtend.dataset.adminExtend,"extend");return;}
  const approve=event.target.closest("[data-admin-approve]"); if(approve){api(`/admin/submissions/${approve.dataset.adminApprove}/approve`,{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then(()=>{liveData.admin=null;renderAdmin();showToast("SUBMISSION APPROVED");}).catch((error)=>showToast(error.message));return;}
  const reject=event.target.closest("[data-admin-reject]"); if(reject){api(`/admin/submissions/${reject.dataset.adminReject}/reject`,{method:"POST",body:JSON.stringify({wallet:state.wallet,reason:"Rejected by admin"})}).then(()=>{liveData.admin=null;renderAdmin();showToast("SUBMISSION REJECTED");}).catch((error)=>showToast(error.message));return;}
  const winner=event.target.closest("[data-admin-winner]"); if(winner){api(`/admin/submissions/${winner.dataset.adminWinner}/mark-winner`,{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then(()=>{liveData.admin=null;renderAdmin();showToast("WINNER MARKED");}).catch((error)=>showToast(error.message));return;}
  const dq=event.target.closest("[data-admin-disqualify]"); if(dq){openAdminDisqualify(dq.dataset.adminDisqualify);return;}
  const pay=event.target.closest("[data-admin-pay]"); if(pay){openAdminPay(pay.dataset.adminPay);return;}
  const adminAgent=event.target.closest("[data-admin-agent]"); if(adminAgent){const body={wallet:state.wallet};if(adminAgent.dataset.agentApproved!==undefined)body.approved=adminAgent.dataset.agentApproved==="true";if(adminAgent.dataset.agentStatus!==undefined)body.status=adminAgent.dataset.agentStatus;if(adminAgent.dataset.agentFeatured!==undefined)body.featured=adminAgent.dataset.agentFeatured==="true";api(`/admin/agents/${adminAgent.dataset.adminAgent}`,{method:"PATCH",body:JSON.stringify(body)}).then(()=>{liveData.admin=null;liveData.agents=null;refreshRemoteData();renderAdmin();showToast("AGENT UPDATED");}).catch((error)=>showToast(error.message));return;}
  const adminAgentRevoke=event.target.closest("[data-admin-agent-revoke]"); if(adminAgentRevoke){api(`/admin/agents/${adminAgentRevoke.dataset.adminAgentRevoke}/api-key/revoke`,{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then(()=>{liveData.admin=null;liveData.agents=null;refreshRemoteData();renderAdmin();showToast("AGENT API KEY REVOKED");}).catch((error)=>showToast(error.message));return;}
  const clawTest=event.target.closest("[data-admin-claw-test]"); if(clawTest){const done=setBusy(clawTest,"TESTING...");api("/admin/integrations/clawpump/test",{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then((payload)=>showToast(payload.clawpump?.message || "CLAWPUMP TEST COMPLETE")).catch((error)=>showToast(error.message)).finally(done);return;}
  const suspend=event.target.closest("[data-admin-suspend]"); if(suspend){api(`/admin/users/${suspend.dataset.adminSuspend}/suspend`,{method:"POST",body:JSON.stringify({wallet:state.wallet,reason:"Admin suspension"})}).then(()=>{liveData.adminUser=null;renderAdminUsers(suspend.dataset.adminSuspend);showToast("USER SUSPENDED");}).catch((error)=>showToast(error.message));return;}
  const unsuspend=event.target.closest("[data-admin-unsuspend]"); if(unsuspend){api(`/admin/users/${unsuspend.dataset.adminUnsuspend}/unsuspend`,{method:"POST",body:JSON.stringify({wallet:state.wallet})}).then(()=>{liveData.adminUser=null;renderAdminUsers(unsuspend.dataset.adminUnsuspend);showToast("USER UNSUSPENDED");}).catch((error)=>showToast(error.message));return;}
  const copy=event.target.closest("[data-copy]"); if(copy){navigator.clipboard?.writeText(copy.dataset.copy||"");copy.textContent="COPIED";showToast("COPIED");return;}
  const exportBtn=event.target.closest("[data-export]"); if(exportBtn){exportAdminCsv(exportBtn.dataset.export);return;}
  if(event.target.closest("[data-edit-profile]"))return openEdit();
  if(event.target.closest(".menu-button")){const nav=document.querySelector(".main-nav");nav.classList.toggle("open");event.target.closest(".menu-button").setAttribute("aria-expanded",nav.classList.contains("open"));return;}
});
document.addEventListener("change",(event)=>{
  if(event.target.matches("[data-admin-status]")){adminStatusFilter=event.target.value;renderAdmin();return;}
  if(event.target.matches("[data-admin-category]")){adminCategoryFilter=event.target.value;renderAdmin();return;}
  if(event.target.matches("[data-admin-mission]")){adminMissionFilter=event.target.value;renderAdmin();return;}
  if(event.target.matches("[data-admin-jump-select]")){const id=event.target.value;document.querySelector(`#admin-${id}`)?.scrollIntoView({behavior:"smooth",block:"start"});document.querySelectorAll("[data-admin-jump]").forEach((node)=>node.classList.toggle("active",node.dataset.adminJump===id));return;}
  if(event.target.matches("[data-reward-currency]")){const form=event.target.closest("[data-reward-form]");const label=form?.querySelector("[data-reward-amount-label]");const note=form?.querySelector("[data-funding-note]");const fieldName=form?.id==="admin-lazarus-form"?"rewardPool":"reward";const value=fieldName==="rewardPool"?"100":"";if(label)label.innerHTML=`REWARD POOL${rewardInput(fieldName,event.target.value,value,"required min=\"0.000001\" step=\"0.000001\"")}`;if(note)note.textContent=`Fund ${event.target.value} reward pool to ${REWARD_WALLET ? shortAddress(REWARD_WALLET) : "the protocol reward wallet"} before activation.`;return;}
  if(event.target.matches("[data-admin-user-filter]")){adminUserFilter=event.target.value;liveData.adminUsers=null;renderAdminUsers();return;}
});
document.addEventListener("touchstart",(event)=>{
  if (!event.target.closest("[data-hero]")) return;
  touchStartX = event.touches[0].clientX;
},{passive:true});
document.addEventListener("touchend",(event)=>{
  if (!event.target.closest("[data-hero]") || !touchStartX) return;
  const delta = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 45) {
    heroSlide = delta < 0 ? (heroSlide + 1) % HERO_SLIDE_COUNT : (heroSlide - 1 + HERO_SLIDE_COUNT) % HERO_SLIDE_COUNT;
    renderHome();
  }
  touchStartX = 0;
},{passive:true});
document.addEventListener("input",(event)=>{if(event.target.name==="amount"&&document.querySelector("[data-boost-total]")){const form=event.target.closest("form");const item=mission(form.dataset.id);const boost=Number(event.target.value||0);const currency=form.dataset.currency||rewardCurrency(item);document.querySelector("[data-boost-preview]").innerHTML=rewardAmountHtml(boost,currency);document.querySelector("[data-boost-total]").innerHTML=rewardAmountHtml(pool(item)+boost,currency);}if(event.target.name==="type"&&event.target.closest("#admin-lazarus-form")){const template=(liveData.admin?.integrations?.lazarusTemplates||[]).find((item)=>item.id===event.target.value);const textarea=document.querySelector("[name='description']");if(template&&textarea&&!textarea.value)textarea.value=template.description;}if(event.target.id==="agent-search"){agentQuery=event.target.value;renderAgents();document.querySelector("#agent-search")?.focus();}if(event.target.matches("[data-admin-user-search]")){adminUserSearch=event.target.value;liveData.adminUsers=null;clearTimeout(window.__adminSearch);window.__adminSearch=setTimeout(()=>renderAdminUsers(),250);}});
document.addEventListener("submit", async (event)=>{
  event.preventDefault(); const form=event.target; const fd=new FormData(form);
  if(form.id==="boost-form"){const done=setBusy(form.querySelector("button[type='submit']"),"CONFIRMING...");try{const id=form.dataset.id;const amount=Number(fd.get("amount"));const currency=form.dataset.currency;showToast("CONFIRM FUNDING IN WALLET");const fundingTxHash=await sendRewardPayment(amount,currency,"boost this mission");await api(`/missions/${id}/boost`,{method:"POST",body:JSON.stringify({wallet:state.wallet,amount,currency,fundingTxHash})});state.boosts[id]=Number(state.boosts[id]||0)+amount;save();closeModal();await refreshRemoteData();showToast("BOOST CONFIRMED");}catch(error){showToast(error.message || "Transaction could not be verified");}finally{done();}}
  // Route accepted proof into the verifier, moderation queue, and reward settlement pipeline.
  if(form.id==="submit-form"){try{const id=form.dataset.id;await api(`/missions/${id}/submissions`,{method:"POST",body:JSON.stringify({wallet:state.wallet,title:fd.get("title"),description:fd.get("description"),proofUrl:fd.get("proof"),xPostUrl:fd.get("x"),mediaUrl:fd.get("media")})});state.submitted.push(id);save();closeModal();delete liveData.submissions[id];liveData.globalSubmissions=null;await refreshRemoteData();showToast("ATTEMPT SUBMITTED // X AUTHOR VERIFIED");}catch(error){showToast(error.message);}}
  if(form.id==="edit-form"){const username=fd.get("username").toUpperCase();const avatarUrl=String(fd.get("avatarUrl")||"").trim();state.username=username;state.avatarUrl=avatarUrl || null;state.user={...(state.user||{}),wallet:state.wallet,username,avatarUrl:avatarUrl||null};save();closeModal();render();showToast("PROFILE UPDATED");if(API_BASE){try{const payload=await api("/users/me",{method:"PATCH",body:JSON.stringify({wallet:state.wallet,username,avatarUrl:avatarUrl||null})});state.user=payload.user;state.avatarUrl=payload.user.avatarUrl||avatarUrl||null;profileSyncWarning="";save();render();}catch(error){profileSyncWarning="Profile updated. Network sync will retry shortly.";render();}}}
  if(form.id==="admin-disqualify-form"){try{await api(`/admin/submissions/${form.dataset.id}/disqualify`,{method:"POST",body:JSON.stringify({wallet:state.wallet,reason:fd.get("reason"),note:fd.get("note")})});closeModal();liveData.admin=null;renderAdmin();showToast("SUBMISSION DISQUALIFIED");}catch(error){showToast(error.message);}}
  if(form.id==="admin-pay-form"){try{await api(`/admin/submissions/${form.dataset.id}/mark-paid`,{method:"POST",body:JSON.stringify({wallet:state.wallet,payoutWallet:fd.get("payoutWallet"),payoutAmount:Number(fd.get("payoutAmount")),payoutCurrency:fd.get("payoutCurrency"),payoutTxHash:fd.get("payoutTxHash"),payoutNote:fd.get("payoutNote")})});closeModal();liveData.admin=null;renderAdmin();showToast("WINNER MARKED PAID");}catch(error){showToast(error.message);}}
  if(form.id==="admin-boost-form"){const done=setBusy(form.querySelector("button[type='submit']"),"CONFIRMING...");try{const amount=Number(fd.get("rewardBoost"));const currency=form.dataset.currency || "USDC";showToast("CONFIRM FUNDING IN WALLET");const fundingTxHash=await sendRewardPayment(amount,currency,"boost this mission");await api(`/missions/${form.dataset.id}/boost`,{method:"POST",body:JSON.stringify({wallet:state.wallet,amount,currency,fundingTxHash})});closeModal();liveData.admin=null;await refreshRemoteData();renderAdmin();showToast("BOOST CONFIRMED");}catch(error){showToast(error.message || "Transaction could not be verified");}finally{done();}}
  if(form.id==="admin-extend-form"){try{await api(`/admin/missions/${form.dataset.id}`,{method:"PATCH",body:JSON.stringify({wallet:state.wallet,deadline:deadlineIso(fd)})});closeModal();liveData.admin=null;renderAdmin();showToast("DEADLINE EXTENDED");}catch(error){showToast(error.message);}}
  if(form.id==="admin-remove-form"){try{await api(`/admin/missions/${form.dataset.id}`,{method:"PATCH",body:JSON.stringify({wallet:state.wallet,status:"REMOVED",reason:fd.get("reason")})});closeModal();liveData.admin=null;renderAdmin();showToast("MISSION REMOVED");}catch(error){showToast(error.message);}}
  if(form.id==="admin-note-form"){try{await api(`/admin/users/${form.dataset.user}/notes`,{method:"POST",body:JSON.stringify({wallet:state.wallet,note:fd.get("note")})});liveData.adminUser=null;renderAdminUsers(form.dataset.user);showToast("NOTE SAVED");}catch(error){showToast(error.message);}}
  if(form.id==="agent-register-form"){try{await api("/agents/register",{method:"POST",body:JSON.stringify({wallet:state.wallet,name:fd.get("name"),handle:fd.get("handle"),category:fd.get("category"),avatarUrl:fd.get("avatarUrl"),website:fd.get("website"),xHandle:fd.get("xHandle"),bio:fd.get("bio")})});liveData.agents=null;await refreshRemoteData();showToast("AGENT REGISTERED // AWAITING ADMIN APPROVAL");navigate("/agents");}catch(error){showToast(error.message);}}
  if(form.id==="create-form"){const done=setBusy(form.querySelector("button[type='submit']"),"FUNDING...");try{const rewardCurrency=fd.get("rewardCurrency");const reward=Number(fd.get("reward"));showToast("CONFIRM FUNDING IN WALLET");const fundingTxHash=await sendRewardPayment(reward,rewardCurrency,"fund this mission");await api("/missions",{method:"POST",body:JSON.stringify({wallet:state.wallet,title:fd.get("title").toUpperCase(),category:fd.get("category"),agentId:fd.get("agentId"),reward,rewardCurrency,prizePoolAmountSol:rewardCurrency==="SOL"?reward:null,fundingTxHash,rewardWallet:REWARD_WALLET,deadline:deadlineIso(fd),description:fd.get("description"),rules:ensureRules(fd.get("rules").split("\n").filter(Boolean)),proof:fd.get("proof")})});await refreshRemoteData();showToast("REWARD POOL FUNDED // MISSION ACTIVE");navigate("/missions");}catch(error){showToast(error.message || "Transaction cancelled");}finally{done();}}
  if(form.id==="admin-mission-form"){const done=setBusy(form.querySelector("button[type='submit']"),"FUNDING...");try{const rewardCurrency=fd.get("rewardCurrency");const reward=Number(fd.get("reward"));showToast("CONFIRM FUNDING IN WALLET");const fundingTxHash=await sendRewardPayment(reward,rewardCurrency,"fund this mission");await api("/admin/missions",{method:"POST",body:JSON.stringify({wallet:state.wallet,title:fd.get("title").toUpperCase(),category:fd.get("category"),agentId:fd.get("agentId"),reward,rewardCurrency,fundingTxHash,deadline:deadlineIso(fd),description:fd.get("description"),rules:ensureRules(fd.get("rules").split("\n").filter(Boolean)),proof:fd.get("proof"),featured:fd.get("featured")==="true"})});await refreshRemoteData();liveData.admin=null;showToast("REWARD POOL FUNDED // MISSION ACTIVE");renderAdmin();}catch(error){showToast(error.message || "Transaction cancelled");}finally{done();}}
  if(form.id==="admin-lazarus-form"){const done=setBusy(form.querySelector("button[type='submit']"),"FUNDING...");try{const rewardCurrency=fd.get("rewardCurrency");const rewardPool=Number(fd.get("rewardPool"));showToast("CONFIRM FUNDING IN WALLET");const fundingTxHash=await sendRewardPayment(rewardPool,rewardCurrency,"fund this Lazarus mission");await api("/admin/lazarus/create-mission",{method:"POST",body:JSON.stringify({wallet:state.wallet,type:fd.get("type"),rewardPool,rewardCurrency,fundingTxHash,description:fd.get("description"),deadlineHours:Number(fd.get("deadlineHours")),featured:fd.get("featured")==="true"})});await refreshRemoteData();liveData.admin=null;showToast("LAZARUS MISSION FUNDED");renderAdmin();}catch(error){showToast(error.message || "Transaction cancelled");}finally{done();}}
});
if (recoveredRoute && !isFile) history.replaceState({}, "", `${base}${recoveredRoute}`);
if (new URLSearchParams(location.search).get("x_verified")) showToast("X ACCOUNT VERIFIED");
if (new URLSearchParams(location.search).get("x_error")) showToast("X VERIFICATION FAILED");
window.addEventListener("popstate",render); window.addEventListener("hashchange",render);
setInterval(()=>document.querySelectorAll("[data-countdown]").forEach((node)=>{const item=mission(node.dataset.countdown);node.textContent=countdown(item);}),1000);
setInterval(()=>{ if(routePath()==="/" && document.querySelector("[data-hero]")) { heroSlide = (heroSlide + 1) % HERO_SLIDE_COUNT; renderHome(); } }, 5200);
render();
refreshRemoteData();
