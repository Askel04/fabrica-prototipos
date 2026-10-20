// Portada mínima: nombre del juego y botón para entrar a la temporada.
import { state } from '../state.js';
import { el, button } from '../ui/dom.js';
import { HomeScene } from './HomeScene.js';
import { MatchScene } from './MatchScene.js';

export class TitleScene {
  constructor(app) {
    this.app = app;
  }

  enter() {
    const ui = this.app.ui;
    ui.classList.add('menu-bg');
    const box = el('div', 'title-screen', ui);
    el('div', 'logo', box, 'PÁDEL<br><span>BLOCKS</span>');
    el('div', 'club', box, `${state.club}`);
    button(box, 'EMPEZAR', '', () => this.app.go(HomeScene));
    // Acceso de prueba a la volea defensiva hasta que entre en las situaciones del partido
    button(box, 'Probar volea en la red', 'blue small', () => this.app.go(MatchScene, { volley: true }));
  }

  exit() {
    this.app.ui.classList.remove('menu-bg');
  }

  update() {}
}
