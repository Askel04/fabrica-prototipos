import Phaser from 'phaser';
import { settings, setSetting } from '../settings.js';
import { panel, label, segmented, button } from '../ui/widgets.js';

// Menú de pausa. En un partido online no se para la simulación (el resto sigue jugando).
const PANEL_W = 560;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  init(data) {
    this.online = !!data?.online;
    this.host = !!data?.host;
  }

  create() {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    const panelH = this.online ? 264 : 340;
    const top = height / 2 - panelH / 2;

    // fondo oscuro que bloquea los toques al juego
    this.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0).setInteractive();
    panel(this, cx, top, PANEL_W, panelH);
    label(this, cx, top + 12, this.online ? 'MENÚ' : 'PAUSA', 26, 0.5, 0);

    label(this, cx, top + 48, 'CONTROLES', 20, 0.5, 0);
    const labelX = cx - PANEL_W / 2 + 40;
    const seg = (y, key, options) => segmented(this, cx - 70, y, 300, () => settings[key], (v) => setSetting(key, v), options);
    label(this, labelX, top + 100, 'JOYSTICK', 18, 0, 0.5);
    seg(top + 100, 'joystick', [['mobile', 'Móvil'], ['fixed', 'Fijo']]);
    label(this, labelX, top + 152, 'TIRO', 18, 0, 0.5);
    seg(top + 152, 'kick', [['tap', 'Tocar'], ['button', 'Botón']]);

    if (!this.online) {
      label(this, cx, top + 184, 'DIFICULTAD', 20, 0.5, 0);
      segmented(this, cx - 220, top + 234, 440, () => settings.difficulty, (v) => setSetting('difficulty', v),
        [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']]);
    }

    const by = top + panelH - 40;
    const fsLabel = () => (this.scale.isFullscreen ? 'Salir de pant. completa' : 'Pantalla completa');
    const fs = button(this, cx - 160, by, 210, fsLabel(), () => {
      try {
        this.scale.toggleFullscreen();
      } catch { /* no permitido aquí */ }
    }, { size: 16 });
    const onFs = () => fs.setText(fsLabel());
    this.scale.on('enterfullscreen', onFs);
    this.scale.on('leavefullscreen', onFs);
    this.events.once('shutdown', () => {
      this.scale.off('enterfullscreen', onFs);
      this.scale.off('leavefullscreen', onFs);
    });
    button(this, cx + 40, by, 170, this.host ? 'Volver a la sala' : this.online ? 'Salir de la sala' : 'Salir al menú', () => this.quit(), { size: 16 });
    button(this, cx + 197, by, 125, this.online ? 'Volver' : 'Reanudar', () => this.resume(), { size: 16 });
  }

  resume() {
    if (this.online) this.scene.get('Game').closeMenu();
    else this.scene.resume('Game');
    this.scene.stop();
  }

  quit() {
    this.scene.stop();
    this.scene.get('Game').quit();
  }
}
