import Phaser from 'phaser';
import { settings, setSetting } from '../settings.js';

// Menú de pausa. Estilo boceto: panel blanco, contornos negros gruesos, texto negro.
const FONT = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#000000' };
const PANEL_W = 520;
const PANEL_H = 392;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    const top = height / 2 - PANEL_H / 2;

    // fondo oscuro que bloquea los toques al juego
    this.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0).setInteractive();

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(cx - PANEL_W / 2, top, PANEL_W, PANEL_H, 18);
    g.lineStyle(4, 0x000000, 1);
    g.strokeRoundedRect(cx - PANEL_W / 2, top, PANEL_W, PANEL_H, 18);

    this.add.text(cx, top + 14, 'PAUSA', { ...FONT, fontSize: '26px' }).setOrigin(0.5, 0);

    this.add.text(cx, top + 56, 'CONTROLES', { ...FONT, fontSize: '20px' }).setOrigin(0.5, 0);
    const labelX = cx - PANEL_W / 2 + 28;
    const barX = cx - 70;
    const barW = 290;
    this.add.text(labelX, top + 104, 'JOYSTICK', { ...FONT, fontSize: '18px' }).setOrigin(0, 0.5);
    this.segmented(barX, top + 104, barW, 'joystick', [['mobile', 'Móvil'], ['fixed', 'Fijo']]);
    this.add.text(labelX, top + 156, 'TIRO', { ...FONT, fontSize: '18px' }).setOrigin(0, 0.5);
    this.segmented(barX, top + 156, barW, 'kick', [['tap', 'Tocar'], ['button', 'Botón']]);

    this.add.text(cx, top + 196, 'DIFICULTAD', { ...FONT, fontSize: '20px' }).setOrigin(0.5, 0);
    this.segmented(cx - 220, top + 252, 440, 'difficulty', [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']]);

    const fsLabel = () => (this.scale.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa');
    const fs = this.button(cx - 115, top + 332, 240, fsLabel(), () => {
      try {
        this.scale.toggleFullscreen();
      } catch { /* no permitido aquí */ }
    });
    this.scale.on('enterfullscreen', () => fs.setText(fsLabel()));
    this.scale.on('leavefullscreen', () => fs.setText(fsLabel()));
    this.button(cx + 135, top + 332, 180, 'Reanudar', () => this.resume());
  }

  resume() {
    this.scene.resume('Game');
    this.scene.stop();
  }

  // Barra segmentada tipo cápsula; la opción activa va rellena de negro.
  segmented(x, y, w, key, options) {
    const h = 44;
    const segW = w / options.length;
    const g = this.add.graphics();
    const labels = options.map(([, label], i) =>
      this.add.text(x + segW * (i + 0.5), y, label, { ...FONT, fontSize: '18px' }).setOrigin(0.5)
    );
    const draw = () => {
      g.clear();
      options.forEach(([value], i) => {
        const on = settings[key] === value;
        if (on) {
          g.fillStyle(0x000000, 1);
          const first = i === 0, last = i === options.length - 1;
          g.fillRoundedRect(x + segW * i, y - h / 2, segW, h, {
            tl: first ? h / 2 : 0, bl: first ? h / 2 : 0, tr: last ? h / 2 : 0, br: last ? h / 2 : 0,
          });
        }
        labels[i].setColor(on ? '#ffffff' : '#000000');
      });
      g.lineStyle(4, 0x000000, 1);
      g.strokeRoundedRect(x, y - h / 2, w, h, h / 2);
      for (let i = 1; i < options.length; i++) g.lineBetween(x + segW * i, y - h / 2, x + segW * i, y + h / 2);
    };
    options.forEach(([value], i) => {
      this.add.zone(x + segW * i, y - h / 2, segW, h).setOrigin(0).setInteractive()
        .on('pointerup', () => {
          setSetting(key, value);
          draw();
        });
    });
    draw();
  }

  button(cx, cy, w, label, onTap) {
    const h = 44;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
    g.lineStyle(4, 0x000000, 1);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
    const t = this.add.text(cx, cy, label, { ...FONT, fontSize: '17px' }).setOrigin(0.5);
    this.add.zone(cx - w / 2, cy - h / 2, w, h).setOrigin(0).setInteractive().on('pointerup', onTap);
    return t;
  }
}
