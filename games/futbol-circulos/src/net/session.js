// Sesión online: una sala `fc-<código>` en la que el anfitrión manda (como en Haxball).
// Presencia de cada participante:
//   todos:        { n: apodo, t: 'red'|'blue'|'spec', h: 1 si es el anfitrión, in: [x, y, chute] }
//   anfitrión:    + lobby: { mode, bots, diff, phase: 'lobby'|'play', game, seats: [[peer, equipo, apodo]] }
//                 + s: instantánea del partido (ver encodeSnap)
// Todo lo que llega de otros es texto/números no fiables: se valida y solo se muestra.
import { openTransport, newRoomCode } from './transport.js';

export const net = { session: null }; // la sesión activa (una a la vez)

let transportP = null;
export function getTransport() {
  transportP ||= openTransport();
  return transportP;
}

export class NetSession {
  static async create(nick) {
    const t = await getTransport();
    const code = newRoomCode();
    return new NetSession(await t.join(code), code, true, nick, t.kind);
  }

  static async join(code, nick) {
    const t = await getTransport();
    return new NetSession(await t.join(code), code, false, nick, t.kind);
  }

  constructor(room, code, isHost, nick, kind) {
    this.room = room;
    this.code = code;
    this.isHost = isHost;
    this.kind = kind;
    this.nick = nick;
    this.team = isHost ? 'red' : 'spec';
    this.lobby = isHost ? { mode: '3v3', bots: true, diff: 'normal', phase: 'lobby', game: 0, seats: [] } : null;
    room.presence({ n: nick, t: this.team, h: isHost ? 1 : 0, in: [0, 0, 0], ...(isHost ? { lobby: { ...this.lobby } } : {}) });
    net.session = this;
  }

  get me() {
    return this.room.me;
  }

  peers() {
    return this.room.peers();
  }

  hostPeer() {
    return this.peers().find((p) => p.presence.h === 1 && p.isMe === this.isHost) || null;
  }

  // el lobby que manda: el propio si eres anfitrión, si no el que publica el anfitrión (validado)
  currentLobby() {
    if (this.isHost) return this.lobby;
    const l = this.hostPeer()?.presence.lobby;
    if (!l || typeof l !== 'object') return null;
    return {
      mode: l.mode === '5v5' ? '5v5' : '3v3',
      bots: !!l.bots,
      diff: ['easy', 'normal', 'hard'].includes(l.diff) ? l.diff : 'normal',
      phase: l.phase === 'play' ? 'play' : 'lobby',
      game: Number(l.game) || 0,
      seats: Array.isArray(l.seats) ? l.seats.filter((s) => Array.isArray(s) && typeof s[0] === 'string' &&
        (s[1] === 'red' || s[1] === 'blue')).map(([peer, team, name]) => [peer, team, cleanName(name)]) : [],
    };
  }

  setTeam(t) {
    this.team = t;
    this.room.presence({ t });
  }

  setLobby(patch) {
    Object.assign(this.lobby, patch);
    this.room.presence({ lobby: { ...this.lobby } });
  }

  // jugadores con su equipo elegido (el anfitrión primero, luego por orden de llegada estable)
  roster() {
    return this.peers().map((p) => ({
      peer: p.peer,
      me: p.isMe,
      host: p.presence.h === 1,
      name: cleanName(p.presence.n),
      team: ['red', 'blue'].includes(p.presence.t) ? p.presence.t : 'spec',
    })).sort((a, b) => (b.host - a.host) || (a.peer < b.peer ? -1 : 1));
  }

  // el anfitrión reparte los puestos y arranca la partida
  start(teamSize) {
    const seats = [];
    for (const team of ['red', 'blue']) {
      this.roster().filter((r) => r.team === team).slice(0, teamSize).forEach((r) => seats.push([r.peer, team, r.name]));
    }
    this.setLobby({ phase: 'play', game: this.lobby.game + 1, seats });
  }

  sendInput(x, y, kick) {
    this.room.presence({ in: [x, y, kick ? 1 : 0] });
  }

  inputOf(peer) {
    const p = this.peers().find((q) => q.peer === peer);
    if (!p) return null;
    const i = p.presence.in;
    if (!Array.isArray(i)) return { x: 0, y: 0, kick: false };
    let x = Number(i[0]) || 0, y = Number(i[1]) || 0;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, kick: !!i[2] };
  }

  publishSnap(s) {
    this.room.presence({ s });
  }

  leave() {
    if (net.session === this) net.session = null;
    return this.room.leave();
  }
}

export function cleanName(n) {
  return typeof n === 'string' && n.trim() ? n.trim().slice(0, 12) : 'Jugador';
}

// ---- instantáneas compactas (array de enteros, posiciones en décimas) ----
const STATES = ['kickoff', 'play', 'goal'];
const q = (v) => Math.round(v * 10);

export function encodeSnap(m, seq) {
  const s = [m.tick, STATES.indexOf(m.state), m.score.red, m.score.blue, seq.kick, seq.kicker, seq.post, q(m.ball.x), q(m.ball.y)];
  for (const p of m.players) s.push(q(p.disc.x), q(p.disc.y), p.input.kick ? 1 : 0);
  return s;
}

export function decodeSnap(s, nPlayers) {
  if (!Array.isArray(s) || s.length < 9 + nPlayers * 3 || !s.every(Number.isFinite)) return null;
  const players = [];
  for (let i = 0; i < nPlayers; i++) players.push({ x: s[9 + i * 3] / 10, y: s[10 + i * 3] / 10, kick: !!s[11 + i * 3] });
  return {
    tick: s[0], state: STATES[s[1]] || 'play', score: { red: s[2], blue: s[3] },
    kick: s[4], kicker: s[5], post: s[6], ball: { x: s[7] / 10, y: s[8] / 10 }, players,
  };
}
