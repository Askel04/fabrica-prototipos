// Player.reach: la cara de la pala toca la bola a cualquier altura y lado, sin escalar al muñeco.
import { Player } from '../src/player.js';
let worst = 0;
for (const side of [1, -1]) for (const kind of ['drive', 'reves', 'cortado', 'globo', 'volea', 'bandeja', 'vibora', 'rulo', 'smash', 'saque']) {
  const row = [];
  for (const h of [0.3, 0.6, 0.9, 1.2, 1.6, 2.0, 2.4, 2.8]) {
    const p = new Player({ shirt: 1, shorts: 1, hair: 1, side });
    const ball = { x: 1.2, y: h, z: side * 6 };
    const r = p.reach(ball, kind, 0);
    p.pos.set(r.body.x, 0, r.body.z);
    p.holdContact(kind, r.hit);
    const f = p.racketWorld();
    const d = Math.hypot(f.x - ball.x, f.y - ball.y, f.z - ball.z);
    worst = Math.max(worst, d);
    row.push(`${h}:${d.toFixed(2)}${r.hit.jump > 0.01 ? '↑' : r.hit.jump < -0.01 ? '↓' : ''}`);
  }
  console.log(side, kind.padEnd(8), row.join(' '));
}
console.log('peor distancia cara-bola', worst.toFixed(3));
