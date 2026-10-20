// Pantalla de resultado: marcador, monedas ganadas y XP.
import { state, recordMatch, xpForNext } from '../state.js';
import { el, button, topBar } from '../ui/dom.js';
import { HomeScene } from './HomeScene.js';

export class ResultScene {
  constructor(app, result) {
    this.app = app;
    this.result = result;
  }

  enter() {
    const r = this.result;
    const lvlBefore = state.level;
    const rw = recordMatch(r.win);
    const ui = this.app.ui;
    ui.classList.add('menu-bg');
    this.bar = topBar(ui);
    const box = el('div', 'result', ui);
    el('div', `big ${r.win ? 'w' : 'l'}`, box, r.win ? '¡VICTORIA!' : 'DERROTA');
    el('div', 'final', box, `<span class="g">TÚ</span> <b>${r.games[1]} - ${r.games[-1]}</b> <span class="r">RIVAL</span>
      <small>Puntos ganados ${r.points[1]} · perdidos ${r.points[-1]}</small>`);
    const coins = el('div', 'gain', box, `<span class="coin"></span>+<b>0</b>`);
    const xp = el('div', 'gain', box, `+<b>0</b> XP`);
    const pct = Math.round((state.xp / xpForNext(state.level)) * 100);
    const xpBar = el('div', 'xpbar', box, `<span>Nivel ${state.level}</span><div><i style="width:0%"></i></div>`);
    if (rw.levelUps) el('div', 'lvlup', box, `¡Subes a nivel ${state.level}!`);
    // Recuento animado
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      coins.querySelector('b').textContent = Math.round(rw.coins * k);
      xp.querySelector('b').textContent = Math.round(rw.xp * k);
      xpBar.querySelector('i').style.width = `${pct * k}%`;
      if (k < 1) requestAnimationFrame(tick);
      else navigator.vibrate?.(r.win ? [20, 30, 20] : 20);
    };
    requestAnimationFrame(tick);
    if (rw.seasonOver) el('div', 'note', box, 'Última jornada: ¡fin de temporada!');
    button(box, 'CONTINUAR', '', () => this.app.go(HomeScene));
    this.lvlBefore = lvlBefore;
  }

  exit() {
    this.bar?.stop();
    this.app.ui.classList.remove('menu-bg');
  }

  update() {}
}
