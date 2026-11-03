import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { settings, setSetting } from '../settings.js';
import { panel, label, segmented, button } from '../ui/widgets.js';
import { STADIUMS, PLAYABLE, stadiumDims } from '../stadium.js';
import { kitById, clampNumber, hex } from '../kits.js';

// Personalizar: estadio, camiseta y dorsal (se guardan en localStorage con los ajustes).
export class CustomizeScene extends Phaser.Scene {
  constructor() {
    super('Customize');
  }

  create() {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    this.add.rectangle(0, 0, width, height, C.COLOR_FIELD).setOrigin(0);
    this.add.text(cx, 14, 'PERSONALIZAR', {
      fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '30px', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5, 0);
    const pw = 820, top = 62, ph = height - top - 12;
    panel(this, cx, top, pw, ph);
    const left = cx - pw / 2 + 30;

    // ---- estadio ----
    label(this, left, top + 30, 'ESTADIO', 18, 0, 0.5);
    segmented(this, left, top + 74, 390, () => settings.stadium, (v) => { setSetting('stadium', v); this.drawPreview(); },
      PLAYABLE.map((id) => [id, STADIUMS[id].name]));
    this.sizeText = label(this, left, top + 112, '', 14, 0, 0.5).setFontStyle('normal');

    // ---- camiseta ----
    label(this, left, top + 150, 'CAMISETA', 18, 0, 0.5);
    this.swatches = this.add.graphics();
    C.KITS.forEach((k, i) => {
      const x = left + 26 + i * 52, y = top + 196;
      this.add.zone(x - 24, y - 24, 48, 48).setOrigin(0).setInteractive().on('pointerup', () => {
        setSetting('kit', k.id);
        this.drawPreview();
      });
    });
    this.kitName = label(this, left, top + 236, '', 14, 0, 0.5).setFontStyle('normal');

    // ---- dorsal ----
    label(this, left, top + 274, 'DORSAL', 18, 0, 0.5);
    const ny = top + 318;
    const step = (d) => () => {
      setSetting('number', clampNumber(((settings.number - 1 + d) % 99 + 99) % 99 + 1));
      this.drawPreview();
    };
    button(this, left + 32, ny, 60, '−10', step(-10), { size: 16 });
    button(this, left + 100, ny, 60, '−1', step(-1), { size: 16 });
    this.numText = label(this, left + 170, ny, '', 28, 0.5, 0.5);
    button(this, left + 240, ny, 60, '+1', step(1), { size: 16 });
    button(this, left + 308, ny, 60, '+10', step(10), { size: 16 });

    // ---- vista previa: campo en miniatura con tu jugador ----
    this.preview = this.add.graphics();
    this.previewNum = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '30px' }).setOrigin(0.5, 0.55);
    this.pv = { x: cx + 205, y: top + 170, w: 330, h: 190 };

    button(this, cx + 205, top + ph - 40, 200, 'Listo', () => this.scene.start('Title'), { h: 50, size: 20, fill: 0xc7e6bd });
    this.drawPreview();
    window.__custom = this; // pruebas
  }

  drawPreview() {
    const S = STADIUMS[settings.stadium] || STADIUMS.municipal;
    const kit = kitById(settings.kit);
    const d3 = stadiumDims(settings.stadium, 3), d5 = stadiumDims(settings.stadium, 5);
    this.sizeText.setText(`3v3: ${d3.FIELD_W * 2}×${d3.FIELD_H * 2} · 5v5: ${d5.FIELD_W * 2}×${d5.FIELD_H * 2}`);
    this.kitName.setText(kit.name);
    this.numText.setText(String(settings.number));

    // muestras de camiseta, la elegida con un aro
    const g = this.swatches.clear();
    const { width } = this.scale.gameSize;
    const left = width / 2 - 410 + 30, top = 62;
    C.KITS.forEach((k, i) => {
      const x = left + 26 + i * 52, y = top + 196;
      g.fillStyle(k.body, 1).fillCircle(x, y, 19);
      g.lineStyle(2, 0x000000, 1).strokeCircle(x, y, 19);
      if (k.id === kit.id) g.lineStyle(4, 0x000000, 1).strokeCircle(x, y, 25);
    });

    // campo en miniatura con la paleta del estadio y tu jugador en el centro
    const p = this.pv, pg = this.preview.clear();
    pg.fillStyle(S.outside, 1).fillRoundedRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10);
    const fw = p.w - 40, fh = fw * (d3.FIELD_H / d3.FIELD_W), fx = p.x - fw / 2, fy = p.y - fh / 2;
    pg.fillStyle(S.grass, 1).fillRect(fx, fy, fw, fh);
    if (S.stripes) {
      pg.fillStyle(0x000000, S.stripes);
      const rows = S.checks ? 4 : 1;
      for (let i = 0; i < 8; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) pg.fillRect(fx + (i * fw) / 8, fy + (j * fh) / rows, fw / 8, fh / rows);
    }
    pg.lineStyle(2, S.lines, 1).strokeRect(fx, fy, fw, fh).lineBetween(p.x, fy, p.x, fy + fh).strokeCircle(p.x, p.y, fh * 0.22);
    pg.lineStyle(3, 0x000000, 1).strokeRoundedRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10);
    pg.fillStyle(kit.body, 1).fillCircle(p.x, p.y, 30);
    pg.lineStyle(3, 0x000000, 1).strokeCircle(p.x, p.y, 30);
    this.previewNum.setPosition(p.x, p.y).setText(String(settings.number)).setColor(hex(kit.num));
  }
}
