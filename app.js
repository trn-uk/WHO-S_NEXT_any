'use strict';

const THEMES = [
  { ac: '#c90000', bg: '#e9e7e2' },
  { ac: '#e6a5bd', bg: '#24432d' }, // ← 2番目と3番目を交代（指定）
  { ac: '#e72805', bg: '#e7dece' },
  { ac: '#d4ea06', bg: '#080a58' },
  { ac: '#1e1e22', bg: '#e9e7e2' },
  { ac: '#e92000', bg: '#a2cfc5' },
  { ac: '#f494c9', bg: '#5e0800' },
  { ac: '#1a0683', bg: '#eadcc6' },
  { ac: '#b3d47a', bg: '#361c00' },
  { ac: '#1a1c1c', bg: '#b5c8c6' },
  { ac: '#3537e4', bg: '#f5cd25' },
  { ac: '#e0b8c3', bg: '#1e1936' },
  { ac: '#247850', bg: '#93b0eb' },
  { ac: '#7b1e0f', bg: '#b5d7f3' },
  { ac: '#f4ffda', bg: '#f35a2f' },
  { ac: '#050205', bg: '#f4c4ad' },
  { ac: '#001c4e', bg: '#d48766' },
  { ac: '#161ba7', bg: '#c9c862' },
  { ac: '#2e0a14', bg: '#a0d0f0' },
];

const STORAGE_KEY = 'whosnext.anyone.appState.v1';

/** @typedef {'START'|'RESULT'} Screen */
/** @type {{schemaVersion:number, roster:{id:string,name:string}[], remainingIds:string[], pickedHistoryIds:string[], currentPickIds:string[], pickCount:number, themeIndex:number, screen:Screen, updatedAt:number}} */
let state;

const $ = (sel) => document.querySelector(sel);
const centerPanel = $('#centerPanel');
const historyEl = $('#history');
const pickInput = $('#pickInput');
const statusEl = $('#status');
const resetBtn = $('#resetBtn');
const toastEl = $('#toast');
const importBtn = $('#importBtn');

const importModal = $('#importModal');
const importTextarea = $('#importTextarea');
const importOkBtn = $('#importOkBtn');
const importCancelBtn = $('#importCancelBtn');
const importCloseBtn = $('#importCloseBtn');

const resetModal = $('#resetModal');
const resetDoInitBtn = $('#resetDoInitBtn');
const resetDoResetBtn = $('#resetDoResetBtn');
const resetCancelBtn = $('#resetCancelBtn');
const resetCloseBtn = $('#resetCloseBtn');

let nameById = new Map();

function now(){ return Date.now(); }

function clampInt(v, min, max){
  if (!Number.isFinite(v)) return min;
  v = Math.floor(v);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function pad2(n){ return String(n).padStart(2,'0'); }

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toastEl.classList.remove('show'), 1600);
}

function saveState(){
  state.updatedAt = now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.schemaVersion !== 1) return null;
    return s;
  }catch{
    return null;
  }
}

function freshState(){
  return {
    schemaVersion: 1,
    roster: [],
    remainingIds: [],
    pickedHistoryIds: [],
    currentPickIds: [],
    pickCount: 1,
    themeIndex: 0,
    screen: 'START',
    updatedAt: now(),
  };
}

function rebuildLookup(){
  nameById = new Map(state.roster.map(m => [m.id, m.name]));
}

function applyTheme(){
  const t = THEMES[state.themeIndex % THEMES.length];
  document.documentElement.style.setProperty('--bg', t.bg);
  document.documentElement.style.setProperty('--ac', t.ac);
  document.documentElement.style.setProperty('--text', t.ac);
}

function cycleTheme(){
  state.themeIndex = (state.themeIndex + 1) % THEMES.length;
  applyTheme();
  saveState();
}

function normalizePickCount(){
  const raw = pickInput.value;
  const n = Number(raw);
  const max = Math.max(1, state.remainingIds.length || 1);
  const normalized = clampInt(n, 1, max);
  if (!Number.isFinite(n) || normalized !== n){
    pickInput.value = String(normalized);
  }
  state.pickCount = normalized;
  saveState();
}

function shuffleCopy(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hasRoster(){
  return Array.isArray(state.roster) && state.roster.length > 0;
}

/* import button state */
function renderImportButton(){
  importBtn.classList.remove('stateEmpty','stateReady');
  if (!hasRoster()){
    importBtn.classList.add('stateEmpty');
  } else {
    importBtn.classList.add('stateReady');
  }
}

/* ========= Import Modal ========= */

function openImport(){
  importTextarea.value = state.roster.map(m => m.name).join('\n');
  importModal.classList.add('show');
  importModal.setAttribute('aria-hidden','false');
  setTimeout(() => importTextarea.focus(), 0);
}

function closeImport(){
  importModal.classList.remove('show');
  importModal.setAttribute('aria-hidden','true');
}

function parseRoster(text){
  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // そのまま使う（同名があっても別人として扱う：内部IDで区別）
  const roster = lines.map((name, i) => ({ id: pad2(i + 1), name }));
  return roster;
}

function applyNewRoster(roster){
  state.roster = roster;
  state.remainingIds = roster.map(m => m.id);
  state.pickedHistoryIds = [];
  state.currentPickIds = [];
  state.screen = 'START';

  // pickCount は残数に合わせて正規化
  const max = Math.max(1, state.remainingIds.length || 1);
  state.pickCount = clampInt(state.pickCount, 1, max);
  pickInput.value = String(state.pickCount);

  rebuildLookup();
  saveState();
  render();
}

function importOk(){
  const roster = parseRoster(importTextarea.value);

  if (roster.length === 0){
    // 空でOKされたら「名簿未入力状態」へ（＝Initialize相当）
    applyNewRoster([]);
    closeImport();
    showToast('Names list cleared.');
    return;
  }

  applyNewRoster(roster);
  closeImport();
  showToast(`Imported: ${roster.length} names`);
}

/* ========= Reset Modal ========= */

function openResetChoice(){
  resetModal.classList.add('show');
  resetModal.setAttribute('aria-hidden','false');
}

function closeResetChoice(){
  resetModal.classList.remove('show');
  resetModal.setAttribute('aria-hidden','true');
}

/* Initialize: 名簿未入力へ戻す */
function doInitialize(){
  state = freshState();
  // theme は保持したいならここで残す手もあるが、仕様通り初期化扱い
  saveState();
  applyTheme();
  rebuildLookup();
  render();
  closeResetChoice();
  showToast('Initialized.');
}

/* Reset: 最新名簿を保持して抽選のみ0から */
function doResetOnly(){
  const roster = state.roster ?? [];
  state.remainingIds = roster.map(m => m.id);
  state.pickedHistoryIds = [];
  state.currentPickIds = [];
  state.screen = 'START';

  const max = Math.max(1, state.remainingIds.length || 1);
  state.pickCount = clampInt(state.pickCount, 1, max);
  pickInput.value = String(state.pickCount);

  saveState();
  render();
  closeResetChoice();
  showToast('Reset.');
}

/* ========= Draw ========= */

function draw(){
  if (!hasRoster()){
    showToast('Import the names list.');
    return;
  }
  if (state.remainingIds.length === 0){
    showToast('finished!');
    return;
  }

  const n = clampInt(state.pickCount, 1, state.remainingIds.length);
  state.pickCount = n;
  pickInput.value = String(n);

  const shuffled = shuffleCopy(state.remainingIds);
  const pick = shuffled.slice(0, n);

  const pickSet = new Set(pick);
  state.remainingIds = state.remainingIds.filter(id => !pickSet.has(id));

  state.currentPickIds = pick;
  state.pickedHistoryIds.push(...pick);

  state.screen = 'RESULT';
  saveState();
  render();
}

function backToStart(){
  state.screen = 'START';
  state.currentPickIds = [];
  saveState();
  cycleTheme();
  render();
}

function renderHistory(){
  const total = state.roster.length;
  const hist = state.pickedHistoryIds;

  const frag = document.createDocumentFragment();

  for (let i = 0; i < total; i++){
    const row = document.createElement('div');
    row.className = 'row';

    const no = document.createElement('div');
    no.className = 'no';
    no.textContent = pad2(i + 1);

    const name = document.createElement('div');
    name.className = 'name';

    if (i < hist.length){
      name.textContent = nameById.get(hist[i]) ?? '(unknown)';
    } else {
      name.textContent = '-';
      name.classList.add('emptyDash');
    }

    row.appendChild(no);
    row.appendChild(name);
    frag.appendChild(row);
  }

  historyEl.innerHTML = '';
  historyEl.appendChild(frag);
}

function getColsForPick(n){
  if (n <= 3) return 1;
  if (n <= 8) return 2;
  if (n <= 15) return 3;
  if (n <= 24) return 4;
  return 5;
}

function alignStageToViewportCenter(){
  const stage = document.getElementById('stage');
  if (!stage) return;

  const isMobileLayout = window.matchMedia('(max-width: 920px)').matches;

  // ★スマホでは一切センタリングしない
  if (isMobileLayout){
    stage.style.transform = 'translateY(0px)';
    return;
  }

  // ---- 以下はPC専用 ----
  stage.style.transform = 'translateY(0px)';

  const r = stage.getBoundingClientRect();
  const stageCenterY = r.top + r.height / 2;
  const viewportCenterY = window.innerHeight / 2;

  const delta = viewportCenterY - stageCenterY;
  stage.style.transform = `translateY(${delta}px)`;
}

function renderHintText(){
  if (!hasRoster()){
    return { mode: 'text', text: 'Import the names list.' };
  }
  if (state.remainingIds.length === 0){
    return { mode: 'text', text: 'finished!' };
  }
  return { mode: 'mark', text: 'For initialization or reset, click', tail: '.' };
}

function renderCenter(){
  centerPanel.innerHTML = '';

  const total = state.roster.length;
  const done = state.pickedHistoryIds.length;
  statusEl.textContent = total ? `done: ${done}/${total}` : `done: 0/0`;

  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.id = 'stage';

  const stageTitle = document.createElement('div');
  stageTitle.className = 'stageTitle';
  stageTitle.textContent = "WHO'S NEXT?";
  stage.appendChild(stageTitle);

  if (state.screen === 'START'){
    const btn = document.createElement('button');
    btn.className = 'startBtn mainCard';
    btn.id = 'startBtn';
    btn.textContent = 'START';
    btn.disabled = !hasRoster() || state.remainingIds.length === 0;
    btn.addEventListener('click', draw);
    stage.appendChild(btn);

  } else {
    const area = document.createElement('div');
    area.className = 'resultArea';
    area.id = 'resultArea';
    area.addEventListener('click', backToStart);

    const n = state.currentPickIds.length;
    const cols = getColsForPick(n);
    const rows = Math.ceil(n / cols);

    const scroller = document.createElement('div');
    scroller.className = 'resultScroller';

    const inner = document.createElement('div');
    inner.className = 'scrollerInner';

    const grid = document.createElement('div');
    grid.className = 'cardsGrid';
    grid.style.gridTemplateColumns = `repeat(${cols}, var(--main-w))`;
    grid.style.gridTemplateRows = `repeat(${rows}, var(--main-h))`;

    // PICK>=4 なら常に 80% スケール + 横スクロールで全体を見せる
    if (n >= 4){
      grid.classList.add('scale80');
    } else {
      scroller.style.overflowX = 'hidden';
    }

    // 今回の抽選が「全体で何番目か」（0-based before this pick）
    const baseIndex = state.pickedHistoryIds.length - state.currentPickIds.length;

    state.currentPickIds.forEach((id, idx) => {
      const c = document.createElement('div');
      c.className = 'mainCard nameCard';

      // ほんの少しのラグ（列が多いほどわずかに短く）
      const baseLag = 55;
      const factor = Math.max(28, baseLag - cols * 6);
      c.style.animationDelay = `${idx * factor}ms`;

      const no = document.createElement('div');
      no.className = 'pickNo';
      no.textContent = pad2(baseIndex + idx + 1);

      const nm = document.createElement('div');
      nm.className = 'pickName';
      nm.textContent = nameById.get(id) ?? '(unknown)';

      c.appendChild(no);
      c.appendChild(nm);
      grid.appendChild(c);
    });

    inner.appendChild(grid);
    scroller.appendChild(inner);
    area.appendChild(scroller);
    stage.appendChild(area);

    // 横スクロールの初期位置を左端へ
    requestAnimationFrame(() => { scroller.scrollLeft = 0; });
  }

  // ===== Hint (復活) =====
  const hint = document.createElement('div');
  hint.className = 'stageHint';

  const h = renderHintText();
  if (h.mode === 'text'){
    hint.textContent = h.text;
  } else {
    const left = document.createElement('span');
    left.textContent = h.text;

    const mark = document.createElement('span');
    mark.className = 'miniMark';
    mark.setAttribute('aria-hidden', 'true');

    const right = document.createElement('span');
    right.textContent = h.tail;

    hint.appendChild(left);
    hint.appendChild(mark);
    hint.appendChild(right);
  }

  stage.appendChild(hint);

  centerPanel.appendChild(stage);

  // PC はセンタリング、スマホは transform=0（align側で分岐）
  requestAnimationFrame(alignStageToViewportCenter);
}


function render(){
  applyTheme();
  renderImportButton();
  renderHistory();
  renderCenter();

  document.body.classList.toggle('is-start', state.screen === 'START');
  document.body.classList.toggle('is-result', state.screen === 'RESULT');
}

/* ========= Events ========= */

pickInput.addEventListener('change', () => {
  normalizePickCount();
  showToast(`PICK = ${state.pickCount}`);
  requestAnimationFrame(alignStageToViewportCenter);
});

pickInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pickInput.blur();
});

/* Reset: 2択モーダルを出す */
resetBtn.addEventListener('click', openResetChoice);

resetDoInitBtn.addEventListener('click', doInitialize);
resetDoResetBtn.addEventListener('click', doResetOnly);
resetCancelBtn.addEventListener('click', closeResetChoice);
resetCloseBtn.addEventListener('click', closeResetChoice);

/* Import modal */
importBtn.addEventListener('click', openImport);
importOkBtn.addEventListener('click', importOk);
importCancelBtn.addEventListener('click', closeImport);
importCloseBtn.addEventListener('click', closeImport);

/* overlay click close (optional) */
importModal.addEventListener('click', (e) => {
  if (e.target === importModal) closeImport();
});
resetModal.addEventListener('click', (e) => {
  if (e.target === resetModal) closeResetChoice();
});

/* resize */
window.addEventListener('resize', () => {
  requestAnimationFrame(alignStageToViewportCenter);
});

/* Boot */
(function boot(){
  state = loadState() ?? freshState();

  // schema safety
  if (!state || state.schemaVersion !== 1) state = freshState();

  // theme cycle on load
  state.themeIndex = (Number.isFinite(state.themeIndex) ? state.themeIndex : 0);
  state.themeIndex = (state.themeIndex + 1) % THEMES.length;
  saveState();

  // normalize pick input
  pickInput.value = String(state.pickCount ?? 1);

  rebuildLookup();
  render();
})();
