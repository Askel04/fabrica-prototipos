// Portada mínima: nombre del juego y botón para entrar a la temporada.
import { state } from '../state.js';
import { el, button } from '../ui/dom.js';
import { HomeScene } from './HomeScene.js';

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
  }

  exit() {
    this.app.ui.classList.remove('menu-bg');
  }

  update() {}
}
