// Pantalla previa al partido: liga y jornada, tu club contra el rival, recompensas y botones.
import * as THREE from 'three';
import { CONFIG as C, META as M } from '../config.js';
import { Player } from '../player.js';
import {
  state, league, currentFixture, position, sortedTable, clubRow, spendEnergy, upgradeCost, buyUpgrade, acceptOffer,
} from '../state.js';
import { el, stars, button, topBar, modal, kitFor } from '../ui/dom.js';
import { MatchScene } from './MatchScene.js';
import { ResultScene } from './ResultScene.js';
import { TitleScene } from './TitleScene.js';

export class HomeScene {
  constructor(app) {
    this.app = app;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x3b78d8);
    this.camera = new THREE.PerspectiveCamera(32, C.ASPECT, 0.1, 50);
    this.camera.position.set(0, 1.3, 10.5);
    this.camera.lookAt(0, 0.55, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5070a0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 6, 5);
    sun.castShadow = true;
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.ShadowMaterial({ opacity: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
  }

  enter() {
    const ui = this.app.ui;
    const s = state.season;
    if (s.offer) return this.showOffer();
    const fx = currentFixture();
    const L = league();
    const rival = clubRow(fx.rival);
    const me = clubRow(state.club);

    // Personajes de la previa
    const [rs, rsh] = kitFor(fx.rival);
    this.me = new Player({ shirt: C.COLORS.team.shirt, shorts: C.COLORS.team.shorts, hair: C.COLORS.team.hair[1], side: -1, hairStyle: 1 });
    this.rv = new Player({ shirt: rs, shorts: rsh, hair: 0x111111, side: -1 });
    this.me.pos.set(-0.75, 0, 0);
    this.rv.pos.set(0.75, 0, 0);
    this.me.root.rotation.y = 0.25;
    this.rv.root.rotation.y = -0.25;
    this.scene.add(this.me.root, this.rv.root);
    this.t = 0;

    this.bar = topBar(ui);
    const box = el('div', 'home', ui);
    el('div', 'league', box, `${L.name} · Jornada ${s.round + 1}/${s.fixtures.length}`);
    const vs = el('div', 'vs', box);
    const side = (row, cls) => `<div class="club ${cls}"><div class="nm">${row.name}</div>
      <div>${stars(row.stars)} <span class="pos">${position(row.name)}º</span></div></div>`;
    vs.innerHTML = `${side(me, 'me')}<div class="vsx">VS</div>${side(rival, 'rv')}`;
    const op = C.oppFor(rival.stars);
    el('div', 'oppinfo', box, `${op.n} oportunidades · necesitas ganar ${op.need}`);

    const rw = el('div', 'rewards', box);
    const coinsW = Math.round(M.COINS_WIN * L.mult), coinsL = Math.round(M.COINS_LOSE * L.mult);
    rw.innerHTML = `<div><small>Victoria</small><b><span class="coin"></span>+${coinsW}</b><b>+${M.XP_WIN} XP</b></div>
      <div><small>Derrota</small><b><span class="coin"></span>+${coinsL}</b><b>+${M.XP_LOSE} XP</b></div>`;

    const row = el('div', 'row3', box);
    button(row, 'Clasificación', 'blue small', () => this.showTable());
    button(row, 'Calendario', 'blue small', () => this.showFixtures());
    button(row, 'Mejoras', 'blue small', () => this.showUpgrades());

    const bottom = el('div', 'bottom', box);
    button(bottom, '◀ Volver', 'blue', () => this.app.go(TitleScene));
    this.playBtn = button(bottom, 'JUGAR <small>⚡-1</small>', '', () => this.play(fx, rival));
  }

  play(fx, rival) {
    if (!spendEnergy()) {
      this.toast('Sin energía: espera a que se recargue');
      return;
    }
    const app = this.app;
    app.go(MatchScene, {
      names: { 1: 'TÚ', [-1]: fx.rival.split(' ').reduce((a, w) => (w.length > a.length ? w : a), '').toUpperCase() },
      ai: M.aiFor(rival.stars),
      opp: C.oppFor(rival.stars),
      rivalKit: kitFor(fx.rival),
      stats: { ...state.stats },
      onEnd: (result) => app.go(ResultScene, result),
    });
  }

  toast(text) {
    const t = el('div', 'toast', this.app.ui, `<small>${text}</small>`);
    setTimeout(() => t.remove(), 1200);
  }

  showTable() {
    const rows = sortedTable()
      .map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.pj}</td><td>${r.w}</td><td>${r.l}</td><td><b>${r.pts}</b></td></tr>`)
      .join('');
    modal(this.app.ui, `Clasificación · ${league().name}`,
      `<table class="tbl"><tr><th>#</th><th>Club</th><th>PJ</th><th>G</th><th>P</th><th>Pts</th></tr>${rows}</table>`);
  }

  showFixtures() {
    const s = state.season;
    const rows = s.fixtures
      .map((f, i) => `<tr class="${i === s.round ? 'me' : ''}"><td>J${i + 1}</td><td>${f.rival}</td>
        <td>${f.result === 'W' ? '<b class="w">Victoria</b>' : f.result === 'L' ? '<b class="l">Derrota</b>' : i === s.round ? 'Próximo' : '—'}</td></tr>`)
      .join('');
    modal(this.app.ui, 'Calendario', `<table class="tbl">${rows}</table>`);
  }

  showUpgrades() {
    const names = { power: 'Potencia', precision: 'Precisión', speed: 'Velocidad' };
    const m = modal(this.app.ui, 'Mejoras', (c) => {
      const render = () => {
        c.innerHTML = `<p class="coins"><span class="coin"></span>${state.coins}</p>`;
        for (const k of Object.keys(names)) {
          const lvl = state.stats[k];
          const r = el('div', 'stat', c);
          el('div', 'nm', r, `${names[k]}<div class="pips">${'<i class="on"></i>'.repeat(lvl)}${'<i></i>'.repeat(M.STAT_MAX - lvl)}</div>`);
          const max = lvl >= M.STAT_MAX;
          const cost = upgradeCost(lvl);
          const b = button(r, max ? 'MÁX' : `<span class="coin"></span>${cost}`, 'small', () => {
            if (buyUpgrade(k)) {
              navigator.vibrate?.(20);
              render();
              this.bar.update();
            }
          });
          if (max || state.coins < cost) b.disabled = true;
        }
      };
      render();
    });
    m.dataset.ui = 'upgrades';
  }

  showOffer() {
    const o = state.season.offer;
    const L = M.LEAGUES[o.league];
    this.bar = topBar(this.app.ui);
    const back = el('div', 'modal', this.app.ui);
    const card = el('div', 'card', back);
    el('div', 'title', card, '¡Fin de temporada!');
    el('div', 'content', card, `<p>Has quedado <b>${o.pos}º</b>.</p>
      <p>Oferta de <b>${o.club}</b> ${stars(o.stars)}<br>${L.name} · recompensas x${L.mult}</p>`);
    const row = el('div', 'row2', card);
    button(row, 'Quedarme', 'blue small', () => { acceptOffer(false); this.app.go(HomeScene); });
    button(row, 'FICHAR', 'small', () => { acceptOffer(true); this.app.go(HomeScene); });
  }

  exit() {
    this.bar?.stop();
  }

  update(dt) {
    this.t += dt;
    if (this.me) {
      // Respiración idle
      this.me.body.position.y = Math.sin(this.t * 2) * 0.015;
      this.rv.body.position.y = Math.sin(this.t * 2 + 1) * 0.015;
      this.me.armR.rotation.x = -0.5 + Math.sin(this.t * 1.5) * 0.08;
      this.rv.armR.rotation.x = -0.5 + Math.sin(this.t * 1.5 + 2) * 0.08;
    }
    this.app.renderer.render(this.scene, this.camera);
  }
}
