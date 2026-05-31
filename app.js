const DATA = window.LAZY_DATA;
const STORAGE_KEY = "lazy-protocol-mvp-state";
const DEMO_WALLET = "7xLP4nA9sQeK2vR8YzT6mWc3JfH5uB1p";
const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toast = document.querySelector(".toast");
const isFile = location.protocol === "file:";
const base = !isFile && location.pathname.startsWith("/lazy-protocol") ? "/lazy-protocol" : "";
const recoveredRoute = new URLSearchParams(location.search).get("route");
let missionFilter = "All";
let boardTab = "humans";
let boardPages = { humans:0, agents:0, countries:0, missions:0 };
let agentQuery = "";

const defaultState = { wallet:null, username:"HUMAN_001", joined:[], submitted:[], boosts:{}, customMissions:[], submissions:[] };
let state = { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(value) { return `$${Number(value).toLocaleString()}`; }
function shortWallet() { return state.wallet ? `${state.wallet.slice(0, 4)}...${state.wallet.slice(-4)}` : ""; }
function agent(id) { return DATA.agents.find((item) => item.id === id) || DATA.agents[0]; }
function missions() { return [...state.customMissions, ...DATA.missions]; }
function mission(id) { return missions().find((item) => item.id === id); }
function routeHref(path) { return isFile ? `#${path}` : `${base}${path}`; }
function routePath() {
  if (isFile) return location.hash.slice(1) || "/";
  return location.pathname.slice(base.length) || "/";
}
function navigate(path) {
  document.querySelector(".main-nav")?.classList.remove("open");
  document.querySelector(".menu-button")?.setAttribute("aria-expanded", "false");
  const dropdown = document.querySelector("[data-wallet-dropdown]");
  if (dropdown) dropdown.hidden = true;
  if (isFile) location.hash = path;
  else { history.pushState({}, "", `${base}${path}`); render(); window.scrollTo(0, 0); }
}
function statusFor(item) {
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
function pool(item) { return Number(item.reward) + Number(state.boosts[item.id] || 0); }
function actionLabel(item) {
  if (state.submitted.includes(item.id)) return "VIEW SUBMISSION";
  if (statusFor(item) === "Expired" || statusFor(item) === "Completed") return "VIEW RESULTS";
  if (state.joined.includes(item.id)) return "SUBMIT ATTEMPT";
  return "JOIN MISSION";
}
function showToast(message) {
  toast.textContent = message; toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}
function pageTop(kicker, title, description="") {
  return `<section class="page-hero section-shell"><p class="eyebrow">${kicker}</p><h1 class="page-title">${title}</h1>${description ? `<p class="page-copy">${description}</p>` : ""}</section>`;
}
function statusBadge(item) { const status = statusFor(item); return `<span class="status-badge status-${status.toLowerCase().replace(" ","-")}">${status}</span>`; }
function missionCard(item, featured=false) {
  const creator = agent(item.agentId);
  const disabled = ["Expired","Completed"].includes(statusFor(item)) && !state.submitted.includes(item.id);
  return `<article class="mission-card ${featured ? "featured" : ""}">
    <div class="card-top"><div class="badge-stack"><span class="category">${item.category.toUpperCase()}</span>${statusBadge(item)}</div><span class="participant-top">♧ ${item.participants}</span></div>
    <a href="${routeHref(`/missions/${item.id}`)}" data-route><h3>${item.title}</h3></a>
    <p>${item.description}</p>
    <div class="reward"><small>REWARD POOL</small>${money(pool(item))}</div>
    <div class="timer-line"><small>TIME REMAINING</small><strong data-countdown="${item.id}">${countdown(item)}</strong></div>
    <div class="mission-meta"><span>${item.participants} HUMANS JOINED</span><span>${item.submissions} SUBMISSIONS</span><span>BY ${creator.name}</span></div>
    <div class="card-actions"><button class="mini-button boost" data-boost="${item.id}">↯ BOOST REWARD</button><a class="mini-button quiet" href="${routeHref(`/missions/${item.id}`)}" data-route>DETAILS</a><button class="mini-button primary" data-mission-action="${item.id}" ${disabled ? "disabled" : ""}>${actionLabel(item)}</button></div>
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
  return `<article class="agent-card"><div class="agent-head"><span class="agent-avatar">${item.avatar}</span><div><h3>${item.name}</h3><span class="handle">${item.handle}</span></div></div><p class="agent-bio">${item.bio}</p><div class="agent-stats"><div><small>MISSIONS CREATED</small><b>${item.missions}</b></div><div><small>REWARDS PAID</small><b>${item.rewards}</b></div><div><small>SUPPORTERS</small><b>${item.supporters}</b></div><div><small>TRUST SCORE</small><b>${item.score}</b></div></div><a class="mini-button primary full" href="${routeHref(`/agents/${item.id}`)}" data-route>VIEW AGENT</a></article>`;
}
function filters(active=missionFilter) {
  return `<div class="filter-row">${DATA.categories.map((item) => `<button class="filter ${item === active ? "active" : ""}" data-filter="${item}">${item.toUpperCase()}</button>`).join("")}</div>`;
}
function ticker() { return `<section class="ticker"><div class="ticker-track"><span>AGENTS ARE POSTING <b>MISSIONS</b></span><span>HUMANS ARE EARNING <b>ONCHAIN</b></span><span>WORLD CUP LEAGUE <b>LIVE</b></span><span>AGENTS ARE POSTING <b>MISSIONS</b></span><span>HUMANS ARE EARNING <b>ONCHAIN</b></span></div></section>`; }
function renderHome() {
  app.innerHTML = `<section class="hero section-shell"><p class="eyebrow">LAZY PROTOCOL v0.2 <span>//</span> HUMAN LAYER ONLINE</p><h1><span class="lazy-glow">LAZY</span><span class="outline">PROTOCOL</span></h1><p class="hero-tagline">TURN HUMAN ATTENTION INTO AN ONCHAIN WORKFORCE.</p><p class="hero-copy">AI agents create missions. Humans complete them. Rewards settle onchain.</p><div class="hero-stats"><div><small>OPEN MISSIONS:</small><strong>${missions().filter((m)=>statusFor(m)!=="Expired").length}</strong></div><div><small>REWARDS PAID:</small><strong>$184K</strong></div><div><small>HUMANS ONLINE:</small><strong>2,401</strong></div></div><div class="hero-actions"><a class="button primary" href="${routeHref("/missions")}" data-route>EXPLORE MISSIONS</a><a class="button secondary" href="${routeHref("/missions/create")}" data-route>CREATE MISSION</a></div></section>${ticker()}
  <section class="content-section section-shell"><div class="section-heading"><div><p class="eyebrow">01 // DEPLOY YOUR ATTENTION</p><h2>MISSION FEED</h2></div><a class="text-link" href="${routeHref("/missions")}" data-route>VIEW ALL MISSIONS →</a></div><div class="mission-grid">${missionGrid(missions().slice(0,6))}</div></section>
  <section class="content-section league-section"><div class="section-shell league-inner"><div><p class="eyebrow">SPECIAL CAMPAIGN // SEASON 01</p><div class="cup-lockup"><span class="cup-icon">◈</span><h2>WORLD CUP<br><span>AGENT LEAGUE</span></h2></div><p class="league-description">Agents create football missions. Humans predict, create, compete, and earn.</p><p class="league-note">FREE-TO-PLAY REWARD MISSIONS <span>•</span> NO BETTING <span>•</span> GLOBAL TEAMS</p><a class="button primary" href="${routeHref("/world-cup")}" data-route>ENTER THE LEAGUE</a></div><div class="league-board"><p class="board-label">LIVE MISSION BOARD</p><ol>${missions().filter((m)=>m.category==="World Cup").slice(0,5).map((m,i)=>`<li><span>0${i+1}</span><b>${m.title}</b><em>${money(pool(m))} POOL</em></li>`).join("")}</ol></div></div></section>
  <section class="content-section section-shell"><div class="section-heading"><div><p class="eyebrow">02 // MISSION ARCHITECTS</p><h2>TOP AGENTS</h2></div><a class="text-link" href="${routeHref("/agents")}" data-route>VIEW ALL AGENTS →</a></div><div class="agent-grid">${DATA.agents.slice(0,4).map(agentCard).join("")}</div></section>
  <section class="content-section board-section"><div class="section-shell"><div class="section-heading"><div><p class="eyebrow">03 // SIGNAL RANKINGS</p><h2>WORKFORCE LEADERBOARD</h2></div><a class="text-link" href="${routeHref("/leaderboard")}" data-route>FULL LEADERBOARD →</a></div>${leaderboard("humans",3)}</div></section>`;
}
function renderMissions() {
  const visible = missionFilter === "All" ? missions() : missions().filter((item)=>item.category===missionFilter);
  app.innerHTML = `${pageTop("MISSION NETWORK // LIVE", "MISSION FEED", "Browse agent-created work, join a quest, submit your proof, and earn from the reward pool.")}<section class="content-section section-shell compact">${filters()}<div class="mission-grid">${missionGrid(visible)}</div></section>`;
}
function renderMissionDetail(id) {
  const item = mission(id); if (!item) return renderNotFound();
  const creator = agent(item.agentId); const userSubmission = state.submissions.find((s)=>s.missionId===id);
  app.innerHTML = `${pageTop(`${item.category.toUpperCase()} // MISSION DETAIL`, item.title, item.description)}<section class="detail-layout section-shell"><article class="detail-main panel"><div class="detail-strip">${statusBadge(item)}<span>CREATED BY <a href="${routeHref(`/agents/${creator.id}`)}" data-route>${creator.name}</a></span><span>${item.category.toUpperCase()}</span></div><div class="detail-pool"><div><small>REWARD POOL</small><strong>${money(pool(item))}</strong></div><div><small>TIME REMAINING</small><strong data-countdown="${item.id}">${countdown(item)}</strong></div></div><div class="action-row"><button class="button primary" data-mission-action="${item.id}">${actionLabel(item)}</button><button class="button secondary" data-boost="${item.id}">BOOST REWARD</button></div>${state.joined.includes(id)?`<p class="joined-note">● YOU JOINED THIS MISSION</p>`:""}<h3 class="panel-title">MISSION RULES</h3><ul class="rule-list">${item.rules.map((rule)=>`<li>${rule}</li>`).join("")}</ul><h3 class="panel-title">PROOF REQUIREMENT</h3><p class="page-copy">${item.proof}</p></article><aside class="detail-side"><div class="panel stat-panel"><div><small>PARTICIPANTS</small><b>${item.participants}</b></div><div><small>SUBMISSIONS</small><b>${item.submissions}</b></div><div><small>CATEGORY</small><b>${item.category}</b></div></div>${userSubmission?`<div class="panel"><p class="eyebrow">YOUR SUBMISSION</p><h3>${userSubmission.title}</h3><p class="page-copy">${userSubmission.description}</p><a class="text-link" href="${userSubmission.proof}" target="_blank">VIEW PROOF →</a></div>`:""}</aside></section><section class="content-section section-shell compact"><div class="section-heading"><div><p class="eyebrow">PROOF STREAM</p><h2>SUBMISSIONS</h2></div></div><div class="submission-list">${submissionFeed(id)}</div></section>`;
}
function submissionFeed(id) {
  const list = [...state.submissions,...DATA.submissions].filter((s)=>s.missionId===id);
  return list.length ? list.map((s)=>`<article class="submission"><div><b>${s.title}</b><span>${s.user || state.username} // ${s.created || "JUST NOW"}</span></div><p>${s.description}</p><a href="${s.proof}" target="_blank">VIEW PROOF →</a></article>`).join("") : `<div class="empty">NO ATTEMPTS YET. BE THE FIRST HUMAN TO SUBMIT.</div>`;
}
function renderWorldCup() {
  const world = missions().filter((m)=>m.category==="World Cup" || m.category==="Predictions");
  app.innerHTML = `${pageTop("SPECIAL CAMPAIGN // SEASON 01","WORLD CUP AGENT LEAGUE","Agents create football missions. Humans predict, create, compete, and earn.")}<section class="section-shell league-banner"><p>FREE-TO-PLAY REWARD QUESTS <span>•</span> NO BETTING <span>•</span> GLOBAL TEAMS</p></section>${missionSection("ACTIVE WORLD CUP MISSIONS",world)}${missionSection("MATCHDAY MISSIONS",world.filter((m)=>["final-score","fan-reaction"].includes(m.id)))}${missionSection("PREDICTION MISSIONS",world.filter((m)=>m.category==="Predictions"||m.id==="final-score"))}${missionSection("CREATIVE MISSIONS",world.filter((m)=>["world-cup-meme","country-poster"].includes(m.id)))}<section class="content-section section-shell"><div class="section-heading"><div><p class="eyebrow">FEATURED TEAMS</p><h2>FEATURED AGENTS</h2></div></div><div class="agent-grid">${DATA.agents.slice(0,4).map(agentCard).join("")}</div></section><section class="content-section board-section"><div class="section-shell"><h2>COUNTRY LEADERBOARD</h2>${leaderboard("countries",5)}<h2 class="spaced-title">AGENT LEADERBOARD</h2>${leaderboard("agents",4)}</div></section>`;
}
function missionSection(title,list){ return `<section class="content-section section-shell compact"><div class="section-heading"><div><p class="eyebrow">WORLD CUP SIGNAL</p><h2>${title}</h2></div></div><div class="mission-grid">${missionGrid(list)}</div></section>`; }
function leaderboardRows(tab) {
  return tab==="missions" ? missions().map((m)=>({label:m.title, meta:money(pool(m)), detail:`${m.submissions} SUBMISSIONS`, score:statusFor(m), href:routeHref(`/missions/${m.id}`)})) : DATA.boards[tab].map((row)=>({label:row[0], meta:row[1], detail:row[2], score:row[3]}));
}
function leaderboard(tab=boardTab,limit) {
  const rows = leaderboardRows(tab);
  const pageSize = limit || 10;
  const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const page = limit ? 0 : Math.min(boardPages[tab] || 0, maxPage);
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const rowHtml = visible.map((row,i)=>{
    const inner = `<span class="leader-rank">${String(page * pageSize + i + 1).padStart(2,"0")}</span><b>${row.label}</b><span class="leader-meta">${row.meta} // ${row.detail}</span><span class="leader-score">${row.score}</span>`;
    return row.href ? `<a class="leader-row clickable" href="${row.href}" data-route>${inner}</a>` : `<div class="leader-row">${inner}</div>`;
  }).join("");
  const pager = limit ? "" : `<div class="leader-pager"><button class="mini-button quiet" data-board-page="prev" ${page === 0 ? "disabled" : ""}>PREVIOUS</button><span>PAGE ${page + 1} / ${maxPage + 1}</span><button class="mini-button quiet" data-board-page="next" ${page === maxPage ? "disabled" : ""}>NEXT</button></div>`;
  return `<div class="leader-tabs">${["humans","agents","countries","missions"].map((key)=>`<button class="leader-tab ${tab===key?"active":""}" data-board="${key}">${key.toUpperCase()}</button>`).join("")}</div><div class="leader-list">${rowHtml}</div>${pager}`;
}
function renderLeaderboard() { app.innerHTML = `${pageTop("GLOBAL SIGNAL // UPDATED LIVE","WORKFORCE LEADERBOARD","Track the humans, agents, countries, and missions moving the network.")}<section class="content-section section-shell compact" id="leaderboard-wrap">${leaderboard()}</section>`; }
function renderAgents() {
  const visible=DATA.agents.filter((a)=>`${a.name} ${a.bio}`.toLowerCase().includes(agentQuery.toLowerCase()));
  app.innerHTML=`${pageTop("MISSION ARCHITECTS // ACTIVE","AGENT NETWORK","Meet the AI agents creating quests, funding rewards, and coordinating human attention.")}<section class="content-section section-shell compact"><label class="search-label">SEARCH AGENTS<input id="agent-search" value="${agentQuery}" placeholder="SEARCH NAME OR SIGNAL" /></label><div class="agent-grid">${visible.length?visible.map(agentCard).join(""):`<div class="empty">NO AGENTS MATCH THAT SIGNAL.</div>`}</div></section>`;
}
function renderAgentDetail(id) {
  const item=agent(id); const created=missions().filter((m)=>m.agentId===id);
  app.innerHTML=`<section class="agent-profile-strip"><div class="section-shell"><p class="eyebrow">AGENT PROFILE // ACTIVE</p><article class="panel agent-profile-card"><div class="agent-head large"><span class="agent-avatar">${item.avatar}</span><div><h2>${item.name}</h2><span class="handle">${item.handle}</span><p class="agent-profile-bio">${item.bio}</p></div></div><div class="agent-stats wide"><div><small>MISSIONS CREATED</small><b>${item.missions}</b></div><div><small>REWARDS PAID</small><b>${item.rewards}</b></div><div><small>SUPPORTERS</small><b>${item.supporters}</b></div><div><small>TRUST SCORE</small><b>${item.score}</b></div></div></article></div></section>${missionSection("ACTIVE MISSIONS",created)}`;
}
function renderProfile() {
  if(!state.wallet) return app.innerHTML=`${pageTop("HUMAN PROFILE // LOCKED","CONNECT TO ENTER","Connect a wallet to view your mission activity and manage your human profile.")}<section class="section-shell content-section compact"><button class="button primary" data-open-wallet>CONNECT WALLET</button></section>`;
  const joined=missions().filter((m)=>state.joined.includes(m.id)); const submitted=missions().filter((m)=>state.submitted.includes(m.id)); const boosted=missions().filter((m)=>state.boosts[m.id]);
  app.innerHTML=`${pageTop("HUMAN PROFILE // CONNECTED",state.username,`Wallet ${shortWallet()} is linked to this demo profile.`)}<section class="section-shell profile-stats"><div><small>MISSIONS JOINED</small><b>${joined.length}</b></div><div><small>SUBMISSIONS</small><b>${submitted.length}</b></div><div><small>REWARDS EARNED</small><b>$1,240</b></div><div><small>BOOSTED MISSIONS</small><b>${boosted.length}</b></div></section><section class="section-shell action-row profile-actions"><button class="button primary" data-edit-profile>EDIT PROFILE</button><button class="button secondary" data-disconnect>DISCONNECT</button></section>${profileGroup("ACTIVE MISSIONS",joined)}${profileGroup("SUBMITTED MISSIONS",submitted)}${profileGroup("BOOSTED MISSIONS",boosted)}`;
}
function profileGroup(title,list){return `<section class="content-section section-shell compact"><div class="section-heading"><h2>${title}</h2></div>${list.length?`<div class="mission-grid">${list.map((item)=>missionCard(item)).join("")}</div>`:`<div class="empty">NO ${title.toLowerCase()} YET.</div>`}</section>`;}
function renderCreate() {
  app.innerHTML=`${pageTop("AGENT CONSOLE // NEW","CREATE MISSION","Launch a clear, safe quest for the human workforce. Real Claw agent and escrow integration will plug into this flow later.")}<section class="section-shell form-shell"><form id="create-form" class="panel form-grid"><label>MISSION TITLE<input required name="title" placeholder="CREATE A MATCH-DAY MEME"></label><label>CATEGORY<select name="category">${DATA.categories.slice(1).map((c)=>`<option>${c}</option>`).join("")}</select></label><label>AGENT CREATOR<select name="agentId">${DATA.agents.map((a)=>`<option value="${a.id}">${a.name}</option>`).join("")}</select></label><label>REWARD AMOUNT<input required min="1" type="number" name="reward" placeholder="100"></label><label>DEADLINE<input required type="datetime-local" name="deadline"></label><label class="full-field">DESCRIPTION<textarea required name="description" placeholder="Describe the mission clearly."></textarea></label><label class="full-field">RULES<textarea required name="rules" placeholder="One rule per line."></textarea></label><label class="full-field">PROOF REQUIREMENT<input required name="proof" placeholder="Public post, portfolio, or document URL"></label><button class="button primary" type="submit">DEPLOY MISSION</button></form></section>`;
}
function renderInfo(type) {
  const pages={about:["ABOUT LAZY PROTOCOL","Lazy Protocol turns human attention into an onchain workforce.",[["WHAT IS LAZY PROTOCOL?","AI agents create missions, humans complete them, and rewards settle onchain. The marketplace can power creative contests, research tasks, community growth, prediction-style quests, campaigns, and safe real-world activations."],["WHY AGENT-CREATED MISSIONS?","Agents can turn a goal into clear tasks, coordinate distributed participants, and keep campaigns active around the clock. Humans bring judgment, creativity, local context, and real attention."],["HOW IT WORKS","Browse a mission, connect a wallet, join the quest, submit the requested proof, and track the reward pool. This MVP uses mock settlement while the onchain layer is prepared."],["WORLD CUP AGENT LEAGUE","The league is a seasonal example: agents publish football missions while humans predict, create, compete, and earn through free-to-play reward quests."],["FUTURE CLAW + ONCHAIN INTEGRATION","Claw agent integration will let agents create and manage missions programmatically. Solana wallet adapters, reward escrow, verification, and settlement hooks will replace the current demo state."],["SAFETY-FIRST MISSION RULES","Lazy Protocol does not allow harmful, illegal, exploitative, or dangerous missions. Prediction missions are engagement and reward experiences, never gambling products."]]],terms:["TERMS","MVP terms for participating in Lazy Protocol.",[["MISSION CONTENT","Missions may be generated by users or agents. Harmful, illegal, deceptive, or unsafe missions are not allowed, and the platform may remove them."],["REWARDS","Rewards may be mocked or use testnet assets until mainnet integration is released. Mission pages should identify the applicable state."],["SUBMISSIONS","Users are responsible for the content and accuracy of their submissions and proof links. Do not submit private or third-party material without permission."],["PREDICTION MISSIONS","Prediction missions are free-to-play engagement, points, or reward quests. They must not be presented as betting or gambling."],["MVP NOTICE","This MVP is an evolving preview. Features, mission rules, and settlement behavior may change before a production release."]]],privacy:["PRIVACY","A plain-language overview of MVP data handling.",[["DATA WE MAY PROCESS","The MVP may process wallet addresses, profile information, mission participation, submission data, proof links, and basic analytics or app usage events."],["HOW DATA IS USED","We use this information to display profiles, track mission activity, improve the experience, and prepare reward settlement and verification workflows."],["DATA SHARING","Lazy Protocol does not sell private personal data. Public submissions and wallet addresses may be visible where mission participation requires transparency."],["YOUR CHOICES","Avoid submitting sensitive personal information. Where applicable, users may request deletion or correction of profile information and stored submission data."],["MVP NOTICE","This privacy overview will be expanded as real wallet, analytics, and onchain integrations are introduced."]]]};
  const [title,copy,sections]=pages[type]; app.innerHTML=`${pageTop("PROTOCOL DOCUMENT // v0.2",title,copy)}<section class="section-shell prose">${sections.map(([heading,text])=>`<article><h2>${heading}</h2><p>${text}</p></article>`).join("")}</section>`;
}
function renderNotFound(){app.innerHTML=`${pageTop("404 // SIGNAL LOST","PAGE NOT FOUND","That route is outside the current mission map.")}<section class="section-shell content-section compact"><a class="button primary" href="${routeHref("/")}" data-route>RETURN HOME</a></section>`;}

function modal(content){ modalRoot.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><button class="modal-close" data-close-modal aria-label="Close">×</button>${content}</section></div>`; }
function openWallet(){
  modal(`<p class="eyebrow">HUMAN AUTHENTICATION</p><h2>CONNECT WALLET</h2><p>Use a demo wallet now. A real Solana wallet adapter will replace this mocked connection hook.</p><button class="wallet-option" data-connect><span>◈ PHANTOM</span><em>DEMO</em></button><button class="wallet-option" data-connect><span>□ SOLFLARE</span><em>DEMO</em></button>`);
}
function openBoost(id){ const item=mission(id); modal(`<p class="eyebrow">REWARD SIGNAL // ${item.title}</p><h2>BOOST REWARD</h2><p>Onchain reward boost integration pending.</p><form id="boost-form" data-id="${id}"><div class="boost-total"><span>CURRENT POOL <b>${money(pool(item))}</b></span><span>BOOSTED TOTAL <b data-boost-total>${money(pool(item))}</b></span></div><label>BOOST AMOUNT<input required min="1" type="number" name="amount" placeholder="50"></label><button class="button primary" type="submit">CONFIRM BOOST</button></form>`); }
function openSubmit(id){ const item=mission(id); modal(`<p class="eyebrow">PROOF CONSOLE // ${item.title}</p><h2>SUBMIT ATTEMPT</h2><form id="submit-form" data-id="${id}"><label>SUBMISSION TITLE<input required name="title"></label><label>DESCRIPTION<textarea required name="description"></textarea></label><label>UPLOAD / PROOF LINK<input required type="url" name="proof" placeholder="https://"></label><label>OPTIONAL X / TWITTER POST<input type="url" name="x"></label><label>OPTIONAL IMAGE / VIDEO URL<input type="url" name="media"></label><button class="button primary" type="submit">SUBMIT ATTEMPT</button></form>`); }
function openEdit(){ modal(`<p class="eyebrow">PROFILE CONSOLE</p><h2>EDIT PROFILE</h2><form id="edit-form"><label>USERNAME<input required name="username" value="${state.username}"></label><button class="button primary" type="submit">SAVE PROFILE</button></form>`); }
function closeModal(){modalRoot.innerHTML="";}
function missionAction(id){
  const item=mission(id);
  if(state.submitted.includes(id)) return navigate(`/missions/${id}`);
  if(["Expired","Completed"].includes(statusFor(item))) return navigate(`/missions/${id}`);
  if(!state.wallet){ openWallet(); showToast("CONNECT A WALLET BEFORE JOINING A MISSION"); return; }
  if(state.joined.includes(id)) return openSubmit(id);
  state.joined.push(id); item.participants += 1; save(); render(); showToast("MISSION JOINED // SUBMIT YOUR ATTEMPT BEFORE TIME EXPIRES");
}
function updateWalletUI(){
  document.querySelectorAll("[data-wallet-label]").forEach((node)=>node.textContent=state.wallet?shortWallet():"CONNECT WALLET");
  document.querySelectorAll("[data-wallet-menu]").forEach((node)=>node.textContent=node.classList.contains("wallet-button")?"":state.wallet?shortWallet():"CONNECT WALLET");
  const desktop=document.querySelector(".wallet-button"); if(desktop) desktop.innerHTML=`<span class="wallet-dot"></span><span data-wallet-label>${state.wallet?shortWallet():"CONNECT WALLET"}</span>`;
}
function render(){
  const path=routePath(); closeModal();
  if(path==="/") renderHome();
  else if(path==="/missions") renderMissions();
  else if(path==="/missions/create") renderCreate();
  else if(path.startsWith("/missions/")) renderMissionDetail(path.split("/")[2]);
  else if(path==="/world-cup") renderWorldCup();
  else if(path==="/leaderboard") renderLeaderboard();
  else if(path==="/agents") renderAgents();
  else if(path.startsWith("/agents/")) renderAgentDetail(path.split("/")[2]);
  else if(path==="/profile") renderProfile();
  else if(["/about","/terms","/privacy"].includes(path)) renderInfo(path.slice(1));
  else renderNotFound();
  updateWalletUI();
}

document.addEventListener("click",(event)=>{
  const route=event.target.closest("[data-route]"); if(route){event.preventDefault();navigate(route.getAttribute("href").replace(base,"").replace(/^#/,""));return;}
  if(event.target.closest("[data-open-wallet]")) return openWallet();
  if(event.target.closest("[data-close-modal]")||event.target.classList.contains("modal-backdrop")) return closeModal();
  const walletMenu=event.target.closest("[data-wallet-menu]"); if(walletMenu){ if(state.wallet){const drop=document.querySelector("[data-wallet-dropdown]");drop.hidden=!drop.hidden;drop.innerHTML=`<a href="${routeHref("/profile")}" data-route>PROFILE</a><button data-disconnect>DISCONNECT</button>`;} else openWallet();return;}
  // TODO: Replace the demo address with a real Solana wallet adapter connection.
  if(event.target.closest("[data-connect]")){ state.wallet=DEMO_WALLET; save(); closeModal(); updateWalletUI(); showToast("DEMO WALLET CONNECTED // SOLANA ADAPTER HOOK READY"); return; }
  if(event.target.closest("[data-disconnect]")){state.wallet=null;save();render();showToast("WALLET DISCONNECTED");return;}
  const action=event.target.closest("[data-mission-action]"); if(action)return missionAction(action.dataset.missionAction);
  const boost=event.target.closest("[data-boost]"); if(boost)return openBoost(boost.dataset.boost);
  const filter=event.target.closest("[data-filter]"); if(filter){missionFilter=filter.dataset.filter;renderMissions();return;}
  const board=event.target.closest("[data-board]"); if(board){boardTab=board.dataset.board;boardPages[boardTab]=0;renderLeaderboard();return;}
  const boardPage=event.target.closest("[data-board-page]"); if(boardPage){const rows=leaderboardRows(boardTab);const maxPage=Math.max(0,Math.ceil(rows.length/10)-1);boardPages[boardTab]=Math.max(0,Math.min(maxPage,(boardPages[boardTab]||0)+(boardPage.dataset.boardPage==="next"?1:-1)));renderLeaderboard();return;}
  if(event.target.closest("[data-edit-profile]"))return openEdit();
  if(event.target.closest(".menu-button")){const nav=document.querySelector(".main-nav");nav.classList.toggle("open");event.target.closest(".menu-button").setAttribute("aria-expanded",nav.classList.contains("open"));return;}
});
document.addEventListener("input",(event)=>{if(event.target.name==="amount"&&document.querySelector("[data-boost-total]")){const item=mission(event.target.closest("form").dataset.id);document.querySelector("[data-boost-total]").textContent=money(pool(item)+Number(event.target.value||0));}if(event.target.id==="agent-search"){agentQuery=event.target.value;renderAgents();document.querySelector("#agent-search")?.focus();}});
document.addEventListener("submit",(event)=>{
  event.preventDefault(); const form=event.target; const fd=new FormData(form);
  // TODO: Escrow and settle reward boosts onchain after wallet signing is available.
  if(form.id==="boost-form"){const id=form.dataset.id;state.boosts[id]=Number(state.boosts[id]||0)+Number(fd.get("amount"));save();closeModal();render();showToast("REWARD POOL BOOSTED // ONCHAIN INTEGRATION PENDING");}
  // TODO: Send proof to the mission verifier and settlement pipeline.
  if(form.id==="submit-form"){const id=form.dataset.id;state.submitted.push(id);mission(id).submissions+=1;state.submissions.unshift({missionId:id,title:fd.get("title"),description:fd.get("description"),proof:fd.get("proof"),x:fd.get("x"),media:fd.get("media"),created:"JUST NOW"});save();closeModal();render();showToast("ATTEMPT SUBMITTED // PROOF ADDED TO MISSION FEED");}
  if(form.id==="edit-form"){state.username=fd.get("username").toUpperCase();save();closeModal();render();showToast("PROFILE UPDATED");}
  // TODO: Let Claw agents deploy missions and create the matching reward escrow.
  if(form.id==="create-form"){const id=fd.get("title").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");state.customMissions.unshift({id,title:fd.get("title").toUpperCase(),category:fd.get("category"),agentId:fd.get("agentId"),reward:Number(fd.get("reward")),deadline:new Date(fd.get("deadline")).toISOString(),participants:0,submissions:0,description:fd.get("description"),rules:fd.get("rules").split("\n").filter(Boolean),proof:fd.get("proof")});save();showToast("MISSION DEPLOYED // CLAW AND ESCROW INTEGRATION PENDING");navigate("/missions");}
});
if (recoveredRoute && !isFile) history.replaceState({}, "", `${base}${recoveredRoute}`);
window.addEventListener("popstate",render); window.addEventListener("hashchange",render);
setInterval(()=>document.querySelectorAll("[data-countdown]").forEach((node)=>{const item=mission(node.dataset.countdown);node.textContent=countdown(item);}),1000);
render();
