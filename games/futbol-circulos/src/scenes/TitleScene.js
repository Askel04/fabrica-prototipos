import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { settings, setSetting } from '../settings.js';
import { panel, label, segmented, button, textInput } from '../ui/widgets.js';
import { NetSession, getTransport, net } from '../net/session.js';

// Menú principal: un jugador (modo y dificultad) u online (crear sala o unirse con un código).
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  init(data) {
    this.notice = data?.notice || '';
  }

  create() {
    if (net.session) net.session.leave(); // por si se vuelve aquí desde una sala
    // ?play: directo al partido (pruebas)
    if (!this.skipped && new URLSearchParams(location.search).has('play')) {
      this.skipped = true;
      this.scene.start('Game');
      return;
    }
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    this.add.rectangle(0, 0, width, height, C.COLOR_FIELD).setOrigin(0);
    this.add.text(cx, 16, 'FÚTBOL CÍRCULOS', {
      fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '34px', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5, 0);

    const top = 76, ph = 340, pw = 400;
    // ---- un jugador ----
    const lx = cx - pw / 2 - 12;
    panel(this, lx, top, pw, ph);
    label(this, lx, top + 14, 'UN JUGADOR', 22, 0.5, 0);
    label(this, lx, top + 62, 'MODO', 16, 0.5, 0);
    segmented(this, lx - 150, top + 106, 300, () => settings.mode, (v) => setSetting('mode', v), [['3v3', '3 vs 3'], ['5v5', '5 vs 5']]);
    label(this, lx, top + 140, 'DIFICULTAD', 16, 0.5, 0);
    segmented(this, lx - 170, top + 184, 340, () => settings.difficulty, (v) => setSetting('difficulty', v),
      [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']]);
    button(this, lx, top + 270, 200, 'JUGAR', () => this.scene.start('Game'), { h: 56, size: 24 });

    // ---- online ----
    const rx = cx + pw / 2 + 12;
    panel(this, rx, top, pw, ph);
    label(this, rx, top + 14, 'ONLINE', 22, 0.5, 0);
    label(this, rx - 170, top + 76, 'NOMBRE', 16, 0, 0.5);
    if (!settings.nick) setSetting('nick', `Jugador${Math.floor(Math.random() * 90 + 10)}`);
    textInput(this, rx + 50, top + 76, 230, { value: settings.nick, maxLength: 12, onChange: (v) => setSetting('nick', v.trim()) });
    button(this, rx, top + 140, 300, 'Crear sala', () => this.createRoom(), { size: 20 });
    label(this, rx, top + 182, 'o únete con un código', 15, 0.5, 0.5);
    this.codeEl = textInput(this, rx - 70, top + 226, 150, { placeholder: 'CÓDIGO', maxLength: 5, upper: true });
    button(this, rx + 90, top + 226, 130, 'Unirse', () => this.joinRoom(), { size: 18 });
    this.msg = this.add.text(rx, top + 290, this.notice, {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#000000', align: 'center', wordWrap: { width: pw - 30 },
    }).setOrigin(0.5);

    this.busy = false;
    getTransport().then((t) => {
      this.transport = t;
      if (!t && !this.notice) this.msg.setText('El online funciona al abrir el juego como artefacto en claude.ai (y con la sala compartida con tus amigos).');
    });
    window.__title = this; // pruebas
  }

  nick() {
    return settings.nick || 'Jugador';
  }

  async createRoom() {
    if (this.busy || !(await this.ready())) return;
    this.busy = true;
    this.msg.setText('Creando sala…');
    try {
      await NetSession.create(this.nick());
      this.scene.start('Lobby');
    } catch (e) {
      this.msg.setText(`No se pudo crear la sala (${e?.code || e?.message || e}).`);
      this.busy = false;
    }
  }

  async joinRoom() {
    const code = (this.codeEl.value || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      this.msg.setText('El código tiene 5 letras o números.');
      return;
    }
    if (this.busy || !(await this.ready())) return;
    this.busy = true;
    this.msg.setText('Entrando…');
    try {
      await NetSession.join(code, this.nick());
      this.scene.start('Lobby');
    } catch (e) {
      this.msg.setText(`No se pudo entrar (${e?.code || e?.message || e}).`);
      this.busy = false;
    }
  }

  async ready() {
    const t = await getTransport();
    if (!t) this.msg.setText('El online solo funciona dentro de claude.ai: abre el artefacto allí (tus amigos también).');
    return !!t;
  }
}
