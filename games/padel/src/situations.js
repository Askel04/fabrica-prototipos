// Las 10 situaciones clave del partido. Cada una coloca a los 4 jugadores y lanza la bola de entrada guionizada.
// team/rivals: [[x, z], [x, z]]; hit: golpe rival de entrada {idx, from, v, spin, family}; pick: fuerza el tipo de contacto.
// Las bolas están calibradas con tests/situations.test.mjs para que lleguen a tu jugador como dice la situación.
export const SITUATIONS = [
  { id: 'saque', name: 'Tu saque', desc: 'Saca al cuadro cruzado y gana el punto.', serve: 1 },
  { id: 'resto', name: 'Resto', desc: 'Saca el rival: devuelve el resto y toma la red.', serve: -1 },
  {
    id: 'defensa', name: 'Defensa con globo', desc: 'Los rivales están en la red. Un globo por encima de ellos te da el ataque.',
    team: [[-2.5, 8.5], [2.5, 8.5]], rivals: [[-1.8, -3.2], [1.8, -3.2]],
    hit: { idx: 1, from: { x: 1, y: 1.1, z: -3.2 }, v: { x: -1.2, y: 1.6, z: 15 }, spin: 0.3, family: 'plano' },
  },
  {
    id: 'remate', name: 'Opción de remate', desc: 'Globo corto del rival. ¡Remata fuerte para sacarla por 3 o por 4!',
    team: [[-1.5, 2.8], [2, 3.2]], rivals: [[-1, -8], [2, -8]],
    hit: { idx: 0, from: { x: -0.5, y: 1, z: -7 }, v: { x: 0.2, y: 8.2, z: 6.3 }, spin: 0, family: 'globo' },
  },
  {
    id: 'bandeja', name: 'Bandeja o víbora', desc: 'Globo a media pista. Córtala para no perder la red.',
    team: [[-1.5, 5.6], [2, 5]], rivals: [[-1.5, -8], [2, -8]],
    hit: { idx: 1, from: { x: 1, y: 0.9, z: -8 }, v: { x: -0.6, y: 7.6, z: 9.6 }, spin: 0, family: 'globo' },
    pick: (cs) => cs.find((c) => !c.bounced && c.pos.y >= 1.6 && c.pos.y <= 2.2 && c.vy < -2),
  },
  { id: 'volea', name: 'Volea en la red', desc: 'Te rematan desde el fondo: bloquea con la pala.', volley: true },
  {
    id: 'pared', name: 'Salida de pared', desc: 'Bola rápida al fondo: déjala pasar y juégala a la salida del cristal.',
    team: [[-2.5, 8.2], [2.5, 8.2]], rivals: [[-1.5, -6], [2, -7]],
    hit: { idx: 1, from: { x: 1.5, y: 1.0, z: -7.5 }, v: { x: -0.6, y: 2.3, z: 19 }, spin: 0.2, family: 'plano' },
  },
  {
    id: 'ataque', name: 'Ataque en la red', desc: 'Estás en la red y te llega rápida: volea a los pies.',
    team: [[-1.5, 3], [2, 3]], rivals: [[-1, -8.3], [2, -8]],
    hit: { idx: 0, from: { x: 0.5, y: 0.9, z: -8 }, v: { x: -0.9, y: 3.8, z: 16 }, spin: 0.2, family: 'liftado' },
    pick: (cs) => cs.find((c) => !c.bounced && c.pos.y > 0.9 && c.pos.y < 1.8),
  },
  {
    id: 'oro', name: 'Punto de oro', desc: 'Peloteo desde el fondo. El que falle, pierde el juego.',
    team: [[-2.5, 8.2], [2.5, 8.2]], rivals: [[-2.5, -8.5], [2.5, -8.2]],
    hit: { idx: 0, from: { x: -2, y: 1, z: -8.5 }, v: { x: 1.3, y: 3.6, z: 15 }, spin: 0.4, family: 'liftado' },
    golden: true,
  },
  {
    id: 'cristal', name: 'Globo al fondo', desc: 'Bola alta junto al cristal: víbora si la cortas, rulo si la liftas.',
    team: [[-2.5, 8.6], [2.5, 8.6]], rivals: [[-1.5, -4], [2, -4]],
    hit: { idx: 1, from: { x: 1, y: 0.9, z: -8 }, v: { x: -0.5, y: 8.4, z: 11.8 }, spin: 0, family: 'globo' },
    pick: (cs) => cs.find((c) => !c.bounced && Math.abs(c.pos.z) > 7.3 && c.pos.y >= 1.6 && c.pos.y <= 2.4 && c.vy < 0),
  },
];
