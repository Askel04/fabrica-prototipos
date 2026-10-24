// Transporte de las salas online. Misma interfaz para dos implementaciones:
//  - room: la capacidad `room` de los artefactos de Claude (salas en tiempo real entre quienes
//    tienen abierta la página; sin servidor ni base de datos propios).
//  - local: BroadcastChannel entre pestañas del mismo navegador (para probar y para los tests).
// Solo se usa `presence` (cada participante publica su estado; ~30/s, 4 KiB): el anfitrión
// publica el lobby y las instantáneas del partido; los clientes, su equipo y su mando.
//
// Interfaz de una sala: { code, me, presence(patch), peers(), onPeers(fn) → unsub, leave() }
// peers(): [{ peer, isMe, presence }]

export async function openTransport() {
  const forceLocal = new URLSearchParams(location.search).has('localnet');
  if (!forceLocal && window.claude?.use) {
    try {
      const room = await window.claude.use('room');
      if (room) return { kind: 'room', join: (code) => joinClaudeRoom(room, code) };
    } catch { /* sin capacidad: cae a local */ }
  }
  if (forceLocal || !window.claude) return { kind: 'local', join: (code) => joinLocalRoom(code) };
  return null; // dentro de Claude pero sin salas disponibles
}

const roomName = (code) => `fc-${code.toLowerCase()}`;

async function joinClaudeRoom(room, code) {
  const r = await room.join(roomName(code));
  const listeners = new Set();
  r.onPeers(() => listeners.forEach((fn) => fn()));
  const map = () => r.peers().map((p) => ({ peer: p.peer, isMe: p.isMe && p.sameTab, presence: p.presence || {} }));
  return {
    code,
    get me() { return map().find((p) => p.isMe)?.peer || null; },
    presence: (patch) => r.presence(patch).catch(() => {}),
    peers: map,
    onPeers: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    leave: () => r.leave().catch(() => {}),
  };
}

// Sala local: cada pestaña difunde su presencia entera (como hace `room`) y recuerda la de las demás.
function joinLocalRoom(code) {
  const ch = new BroadcastChannel(roomName(code));
  const me = Math.random().toString(36).slice(2, 10);
  let mine = {};
  const others = new Map(); // peer → { presence, seen }
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  let pending = false;
  const send = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; ch.postMessage({ peer: me, presence: mine }); }, 33); // ~30/s
  };
  ch.onmessage = (e) => {
    const { peer, presence, bye } = e.data || {};
    if (!peer || peer === me) return;
    if (bye) { others.delete(peer); notify(); return; }
    const isNew = !others.has(peer);
    others.set(peer, { presence: presence || {}, seen: Date.now() });
    if (isNew) send(); // que el nuevo me conozca
    notify();
  };
  const keepAlive = setInterval(() => {
    ch.postMessage({ peer: me, presence: mine });
    const now = Date.now();
    for (const [peer, o] of others) if (now - o.seen > 4000) { others.delete(peer); notify(); }
  }, 1000);
  ch.postMessage({ peer: me, presence: mine });
  return Promise.resolve({
    code,
    me,
    presence: (patch) => {
      mine = { ...mine };
      for (const [k, v] of Object.entries(patch)) if (v === null) delete mine[k]; else mine[k] = v;
      send();
      notify();
      return Promise.resolve();
    },
    peers: () => [{ peer: me, isMe: true, presence: mine },
      ...[...others].map(([peer, o]) => ({ peer, isMe: false, presence: o.presence }))],
    onPeers: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    leave: () => { clearInterval(keepAlive); ch.postMessage({ peer: me, bye: true }); ch.close(); return Promise.resolve(); },
  });
}

// código de sala: 5 letras sin ambigüedades (sin I, O, 0, 1)
export function newRoomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}
