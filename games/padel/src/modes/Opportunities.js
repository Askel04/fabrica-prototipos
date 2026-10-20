// Partido por oportunidades: 3-5 situaciones clave dentro de un set simulado a 6 juegos.
// Entre oportunidades el marcador avanza solo (juegos simulados); cada oportunidad decide un juego.
import { CONFIG as C } from '../config.js';
import { SITUATIONS } from '../situations.js';
import { el } from '../ui/dom.js';
import { beep } from '../utils/sound.js';

const O = C.OPP;

export class Opportunities {
  constructor(match, { n, need, only = null }) {
    this.m = match;
    this.n = n;
    this.need = need;
    this.k = 0;
    this.won = 0;
    // Situaciones sin repetir; la del punto de oro, si sale, siempre al final
    const pool = only ? SITUATIONS.filter((s) => only.includes(s.id)) : [...SITUATIONS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.list = pool.slice(0, n).sort((a, b) => (a.golden ? 1 : 0) - (b.golden ? 1 : 0));
  }

  start() {
    const mm = this.m.match;
    mm.games = { 1: 0, [-1]: 0 };
    mm.pts = { 1: 0, [-1]: 0 };
    this.m.oppLabel = `0/${this.n}`;
    this.simulateGames(O.GAMES_BEFORE_FIRST, () => this.showCard());
  }

  /** Juegos simulados entre oportunidades: el que saca gana (normalmente), con los puntos pasando rápido. */
  simulateGames(count, done) {
    const m = this.m;
    const mm = m.match;
    m.phase = 'intro';
    m.layer.innerHTML = '';
    // Todos a su sitio mientras se juegan los puntos simulados; la bola, fuera de la vista
    m.resetPoint();
    m.shot = null;
    m.team.forEach((p, i) => p.pos.set(i ? C.HOME_X : -C.HOME_X, 0, C.HOME_BACK_Z));
    m.rivals.forEach((p, i) => p.pos.set(i ? C.HOME_X : -C.HOME_X, 0, -C.HOME_BACK_Z));
    m.ball.position.set(0, -1, 0);
    if (count <= 0) return done();
    const box = el('div', 'simgames', m.layer, 'Se juegan los puntos…');
    const server = mm.serveTeam;
    const winner = Math.random() < O.HOLD_CHANCE ? server : -server;
    const seq = [];
    const p = { 1: 0, [-1]: 0 };
    while (p[winner] < 4) {
      const w = Math.random() < 0.7 ? winner : -winner;
      if (w === -winner && p[-winner] >= 2) continue; // no pasar por 40-40: el punto clave es la oportunidad
      p[w]++;
      seq.push({ ...p });
    }
    seq.forEach((st, i) => m.after(O.SIM_STEP * (i + 1), () => {
      mm.pts = { 1: Math.min(3, st[1]), [-1]: Math.min(3, st[-1]) };
      m.renderScore();
      beep(500 + i * 40, 0.04, 'triangle', 0.06);
    }));
    m.after(O.SIM_STEP * (seq.length + 1), () => {
      mm.games[winner]++;
      mm.pts = { 1: 0, [-1]: 0 };
      mm.serveTeam = -mm.serveTeam;
      m.renderScore();
      box.remove();
      m.after(O.SIM_STEP, () => this.simulateGames(count - 1, done));
    });
  }

  showCard() {
    const m = this.m;
    const sit = this.list[this.k];
    const mm = m.match;
    mm.pts = { 1: 3, [-1]: 3 };
    if (sit.serve) mm.serveTeam = sit.serve;
    m.renderScore();
    m.phase = 'intro';
    const L = m.layer;
    L.innerHTML = '';
    const card = el('div', 'oppcard', L);
    const setBall = Math.max(mm.games[1], mm.games[-1]) >= 5;
    el('div', 'tag', card, `OPORTUNIDAD ${this.k + 1}/${this.n}`);
    el('div', 'nm', card, sit.name);
    el('div', 'ctx', card, `40-40 · Punto de oro${setBall ? ' · ¡bola de set!' : ''}`);
    el('div', 'desc', card, sit.desc);
    el('div', 'need', card, `Ganadas ${this.won} · necesitas ${this.need} de ${this.n}`);
    const b = el('button', 'btn', card, 'JUGAR ▶');
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => {
      L.innerHTML = '';
      m.playSituation(sit);
    });
  }

  /** Fin del punto de la oportunidad: el ganador se lleva el juego. */
  resolve(winner) {
    const m = this.m;
    const mm = m.match;
    if (winner === 1) this.won++;
    mm.games[winner]++;
    mm.pts = { 1: 0, [-1]: 0 };
    mm.serveTeam = -mm.serveTeam;
    this.k++;
    m.oppLabel = `${this.won}/${this.n}`;
    m.renderScore();
    m.toast(winner === 1 ? '¡JUEGO!' : 'Juego rival', `${mm.games[1]} - ${mm.games[-1]}`, winner === 1 ? '#ffe066' : '#ff8a80');
    const left = this.n - this.k;
    const decided = this.won >= this.need || this.won + left < this.need;
    if (left === 0 || decided) {
      m.after(O.END_DELAY, () => this.finish());
      return;
    }
    m.after(O.END_DELAY, () => this.simulateGames(O.GAMES_BETWEEN, () => this.showCard()));
  }

  /** Completa el set de forma coherente con el ganador y cierra el partido. */
  finish() {
    const m = this.m;
    const mm = m.match;
    const win = this.won >= this.need;
    const w = win ? 1 : -1;
    const lose = mm.games[-w];
    const target = lose >= 6 ? 7 : lose === 5 ? 7 : 6;
    const steps = [];
    // El perdedor puede arañar algún juego más si va muy por detrás, sin llegar a 5
    let g = { ...mm.games };
    while (g[w] < target) {
      if (g[-w] < 4 && g[w] - g[-w] > 2 && Math.random() < 0.3) g = { ...g, [-w]: g[-w] + 1 };
      else g = { ...g, [w]: g[w] + 1 };
      steps.push(g);
    }
    m.phase = 'intro';
    m.layer.innerHTML = '';
    el('div', 'simgames', m.layer, 'Se cierra el set…');
    steps.forEach((st, i) => m.after(O.SIM_STEP * 2 * (i + 1), () => {
      mm.games = st;
      m.renderScore();
      beep(600 + i * 50, 0.05, 'triangle', 0.08);
    }));
    m.after(O.SIM_STEP * 2 * (steps.length + 1) + 0.6, () => {
      mm.over = true;
      m.endMatch(w, { opportunities: { won: this.won, n: this.n, need: this.need } });
    });
  }
}
