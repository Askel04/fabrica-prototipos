// Estado de la carrera guardado en localStorage: nivel, monedas, energía, temporada y stats.
import { META as M } from './config.js';
import { load, save } from './utils/save.js';

const KEY = 'padel-save-v1';

function newSeason(leagueIdx, clubName) {
  const league = M.LEAGUES[leagueIdx];
  const clubs = [
    { name: clubName, stars: league.stars, me: true },
    ...league.clubs.filter((c) => c.name !== clubName).slice(0, M.SEASON_MATCHES).map((c) => ({ ...c })),
  ];
  const rivals = clubs.filter((c) => !c.me).map((c) => c.name);
  // Calendario: un partido contra cada rival, en orden aleatorio
  for (let i = rivals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rivals[i], rivals[j]] = [rivals[j], rivals[i]];
  }
  return {
    league: leagueIdx,
    round: 0,
    fixtures: rivals.slice(0, M.SEASON_MATCHES).map((r) => ({ rival: r, result: null })),
    table: clubs.map((c) => ({ name: c.name, stars: c.stars, me: !!c.me, pj: 0, w: 0, l: 0, pts: 0 })),
    offer: null,
  };
}

function fresh() {
  return {
    level: 1,
    xp: 0,
    coins: 0,
    energy: M.ENERGY_MAX,
    energyTs: Date.now(),
    club: M.START_CLUB,
    stats: { power: 0, precision: 0, speed: 0 },
    season: newSeason(0, M.START_CLUB),
    seasonsPlayed: 0,
  };
}

export const state = load(KEY, null) || fresh();
export const persist = () => save(KEY, state);
export const resetSave = () => Object.assign(state, fresh());

/** Recarga de energía según el tiempo pasado. Devuelve segundos hasta el siguiente punto. */
export function tickEnergy() {
  const now = Date.now();
  const per = M.ENERGY_RECHARGE_S * 1000;
  if (state.energy >= M.ENERGY_MAX) {
    state.energyTs = now;
    return 0;
  }
  const gained = Math.floor((now - state.energyTs) / per);
  if (gained > 0) {
    state.energy = Math.min(M.ENERGY_MAX, state.energy + gained);
    state.energyTs += gained * per;
    if (state.energy >= M.ENERGY_MAX) state.energyTs = now;
    persist();
  }
  return state.energy >= M.ENERGY_MAX ? 0 : Math.ceil((state.energyTs + per - now) / 1000);
}

export function spendEnergy() {
  tickEnergy();
  if (state.energy <= 0) return false;
  if (state.energy >= M.ENERGY_MAX) state.energyTs = Date.now();
  state.energy--;
  persist();
  return true;
}

export const xpForNext = (lvl) => M.XP_BASE * lvl;

export function addXp(n) {
  state.xp += n;
  let ups = 0;
  while (state.xp >= xpForNext(state.level)) {
    state.xp -= xpForNext(state.level);
    state.level++;
    ups++;
  }
  return ups;
}

export const league = () => M.LEAGUES[state.season.league];
export const currentFixture = () => state.season.fixtures[state.season.round] || null;
export const clubRow = (name) => state.season.table.find((r) => r.name === name);

export function sortedTable() {
  return [...state.season.table].sort((a, b) => b.pts - a.pts || b.w - a.w || a.name.localeCompare(b.name));
}
export const position = (name) => sortedTable().findIndex((r) => r.name === name) + 1;

export const upgradeCost = (lvl) => M.UPGRADE_BASE_COST * (lvl + 1);

export function buyUpgrade(stat) {
  const lvl = state.stats[stat];
  if (lvl >= M.STAT_MAX) return false;
  const cost = upgradeCost(lvl);
  if (state.coins < cost) return false;
  state.coins -= cost;
  state.stats[stat]++;
  persist();
  return true;
}

/** Registra el resultado del partido, simula el resto de la jornada y da recompensas. */
export function recordMatch(win) {
  const s = state.season;
  const fx = currentFixture();
  const L = league();
  const apply = (name, w) => {
    const r = clubRow(name);
    r.pj++;
    if (w) { r.w++; r.pts += 3; } else r.l++;
  };
  fx.result = win ? 'W' : 'L';
  apply(state.club, win);
  apply(fx.rival, !win);
  // Resto de partidos de la jornada: emparejar a los demás clubes, gana con más estrellas más a menudo
  const others = s.table.filter((r) => !r.me && r.name !== fx.rival).map((r) => r.name);
  for (let i = 0; i + 1 < others.length; i += 2) {
    const a = clubRow(others[i]), b = clubRow(others[i + 1]);
    const pa = 0.5 + (a.stars - b.stars) * 0.12;
    const aw = Math.random() < pa;
    apply(a.name, aw);
    apply(b.name, !aw);
  }
  const coins = Math.round((win ? M.COINS_WIN : M.COINS_LOSE) * L.mult);
  const xp = win ? M.XP_WIN : M.XP_LOSE;
  state.coins += coins;
  const levelUps = addXp(xp);
  s.round++;
  let seasonOver = false;
  if (s.round >= s.fixtures.length) {
    seasonOver = true;
    state.seasonsPlayed++;
    const pos = position(state.club);
    const next = Math.min(M.LEAGUES.length - 1, s.league + (pos <= M.OFFER_MAX_POS ? 1 : 0));
    // Oferta de un club mejor: de la liga superior si quedaste arriba, si no del mismo nivel con más estrellas
    const pool = M.LEAGUES[next].clubs.filter((c) => c.name !== state.club);
    const best = pool.reduce((a, c) => (c.stars > a.stars ? c : a), pool[0]);
    s.offer = { club: best.name, league: next, stars: best.stars, pos };
  }
  persist();
  return { coins, xp, levelUps, seasonOver };
}

export function acceptOffer(accept) {
  const o = state.season.offer;
  const leagueIdx = accept ? o.league : state.season.league;
  if (accept) state.club = o.club;
  state.season = newSeason(leagueIdx, state.club);
  persist();
}
