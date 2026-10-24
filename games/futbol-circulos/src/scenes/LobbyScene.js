import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { panel, label, segmented, button, FONT } from '../ui/widgets.js';
import { net } from '../net/session.js';
import { MODES } from '../stadium.js';

// Sala online (tipo Haxball): cada uno elige Rojo, Azul o Espectador; el anfitrión elige modo,
// si se rellena con bots y su dificultad, y empieza. Los demás esperan y entran al partido solos.
const TEAMS = [['red', 'ROJO', '#e56e56'], ['spec', 'ESPECTADORES', '#000000'], ['blue', 'AZUL', '#5689e5']];

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    const s = (this.session = net.session);
    if (!s) return this.scene.start('Title');
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    this.add.rectangle(0, 0, width, height, C.COLOR_FIELD).setOrigin(0);
    panel(this, cx, 8, Math.min(width - 16, 900), height - 16);

    label(this, cx, 22, `SALA ${s.code}`, 30, 0.5, 0);
    this.sub = label(this, cx, 60, '', 15, 0.5, 0).setFontStyle('normal');
    button(this, cx - 380, 40, 110, 'Salir', () => this.quit(), { h: 40, size: 16 });

    // columnas de equipos con su botón para cambiarse
    this.cols = TEAMS.map(([team, name, color], i) => {
      const x = cx + (i - 1) * 290;
      this.add.text(x, 92, name, { ...FONT, fontSize: '18px', color }).setOrigin(0.5, 0);
      const list = this.add.text(x, 120, '', { ...FONT, fontSize: '16px', fontStyle: 'normal', align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0);
      button(this, x, 252, 160, team === 'spec' ? 'Mirar' : 'Unirme', () => s.setTeam(team), { h: 38, size: 16 });
      return { team, list };
    });

    // ajustes de la partida: el anfitrión los cambia, los demás los ven
    const y = 322;
    if (s.isHost) {
      const L = s.lobby;
      label(this, cx - 290, y - 30, 'MODO', 14);
      segmented(this, cx - 370, y, 160, () => L.mode, (v) => s.setLobby({ mode: v }), [['3v3', '3v3'], ['5v5', '5v5']], 36);
      label(this, cx - 95, y - 30, 'RELLENAR CON BOTS', 14);
      segmented(this, cx - 170, y, 150, () => (L.bots ? 'yes' : 'no'), (v) => s.setLobby({ bots: v === 'yes' }), [['yes', 'Sí'], ['no', 'No']], 36);
      label(this, cx + 220, y - 30, 'DIFICULTAD DE LOS BOTS', 14);
      this.diffSeg = segmented(this, cx + 70, y, 300, () => L.diff, (v) => s.setLobby({ diff: v }),
        [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']], 36);
      button(this, cx, y + 58, 200, 'EMPEZAR', () => this.start(), { h: 46, size: 20, fill: 0xc7e6bd });
    } else {
      this.info = label(this, cx, y, '', 17, 0.5, 0.5);
    }
    this.msg = label(this, cx, height - 24, '', 14, 0.5, 0.5).setFontStyle('normal');

    this.unsub = s.room.onPeers(() => this.refresh());
    this.events.once('shutdown', () => this.unsub?.());
    this.hostMissingSince = null;
    this.refresh();
    window.__lobby = this; // pruebas
  }

  refresh() {
    const s = this.session;
    const roster = s.roster();
    for (const { team, list } of this.cols) {
      const names = roster.filter((r) => r.team === team).map((r) => `${r.host ? '★ ' : ''}${r.name}${r.me ? ' (tú)' : ''}`);
      list.setText(names.join('\n') || '—');
    }
    const L = s.currentLobby();
    if (s.isHost) {
      this.sub.setText(`Pasa el código ${s.code} a tus amigos: abren este mismo juego, Online → Unirse.`);
      this.diffSeg.setEnabled(L.bots);
    } else if (L) {
      this.sub.setText('Esperando a que el anfitrión (★) empiece la partida.');
      this.info.setText(`${L.mode} · ${L.bots ? `con bots (${{ easy: 'fácil', normal: 'normal', hard: 'difícil' }[L.diff]})` : 'sin bots'}`);
    } else {
      this.sub.setText('Buscando la sala…');
      this.info.setText('');
    }
  }

  start() {
    const s = this.session;
    const size = MODES[s.lobby.mode].teamSize;
    const roster = s.roster();
    const red = roster.filter((r) => r.team === 'red').length, blue = roster.filter((r) => r.team === 'blue').length;
    if (!s.lobby.bots && (!red || !blue)) {
      this.msg.setText('Sin bots hace falta al menos una persona en cada equipo.');
      return;
    }
    if (red > size || blue > size) this.msg.setText(`Máximo ${size} por equipo: el resto mira.`);
    s.start(size);
    this.scene.start('Game', { net: s });
  }

  update(time) {
    const s = this.session;
    if (!s || s.isHost) return;
    const L = s.currentLobby();
    if (!s.hostPeer()) {
      // sin anfitrión: la sala no existe o se ha ido
      this.hostMissingSince ??= time;
      const t = time - this.hostMissingSince;
      if (t > 6000) this.quit(L ? 'El anfitrión ha cerrado la sala.' : `No hay ninguna sala con el código ${s.code}.`);
      return;
    }
    this.hostMissingSince = null;
    if (L?.phase === 'play') this.scene.start('Game', { net: s });
  }

  quit(notice = '') {
    this.session?.leave();
    this.scene.start('Title', { notice });
  }
}
