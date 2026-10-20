// Pista de pádel 20x10 con red, cristal al fondo, cristal lateral parcial y malla. Colores planos.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';

const HALF_W = C.COURT_W / 2;
const HALF_L = C.COURT_L / 2;

function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...opts })
  );
  return m;
}

export function buildCourt(scene) {
  const K = C.COLORS;
  const g = new THREE.Group();

  // Suelo exterior
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshLambertMaterial({ color: K.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  g.add(ground);

  // Banda exterior y pista
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(C.COURT_W + 3, C.COURT_L + 3),
    new THREE.MeshLambertMaterial({ color: K.courtOut })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.01;
  apron.receiveShadow = true;
  g.add(apron);

  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(C.COURT_W, C.COURT_L),
    new THREE.MeshLambertMaterial({ color: K.court })
  );
  court.rotation.x = -Math.PI / 2;
  court.receiveShadow = true;
  g.add(court);

  // Líneas
  const lineMat = new THREE.MeshBasicMaterial({ color: K.lines });
  const line = (w, d, x, z) => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.005, z);
    g.add(l);
  };
  const lw = 0.06;
  for (const s of [-1, 1]) {
    line(C.COURT_W, lw, 0, s * C.SERVICE_LINE);
    line(lw, C.SERVICE_LINE, 0, (s * C.SERVICE_LINE) / 2);
    line(C.COURT_W, lw, 0, s * (HALF_L - lw / 2));
    line(lw, C.COURT_L, s * (HALF_W - lw / 2), 0);
  }

  // Red
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(C.COURT_W, C.NET_H),
    new THREE.MeshLambertMaterial({ color: K.net, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  net.position.set(0, C.NET_H / 2, 0);
  g.add(net);
  const band = box(C.COURT_W, 0.06, 0.03, 0xffffff);
  band.position.set(0, C.NET_H, 0);
  g.add(band);
  for (const s of [-1, 1]) {
    const post = box(0.1, C.NET_H + 0.1, 0.1, K.frame);
    post.position.set(s * (HALF_W + 0.05), (C.NET_H + 0.1) / 2, 0);
    post.castShadow = true;
    g.add(post);
  }

  // Cristales
  const glassMat = new THREE.MeshLambertMaterial({
    color: K.glass, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  });
  const meshMat = new THREE.MeshLambertMaterial({
    color: K.mesh, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
  });
  const frame = (w, h, d, x, y, z, parent = g) => {
    const f = box(w, h, d, K.frame);
    f.position.set(x, y, z);
    f.castShadow = true;
    parent.add(f);
  };
  const near = new THREE.Group(); // fondo propio: se oculta para no tapar la cámara
  const sideX = new THREE.Group(); // lateral +x: se oculta en la cámara de impacto
  for (const s of [-1, 1]) {
    const host = s === 1 ? near : g;
    // Fondo: cristal 3 m + malla 1 m
    const back = new THREE.Mesh(new THREE.PlaneGeometry(C.COURT_W, 3), glassMat);
    back.position.set(0, 1.5, s * HALF_L);
    host.add(back);
    const backMesh = new THREE.Mesh(new THREE.PlaneGeometry(C.COURT_W, C.BACK_WALL_H - 3), meshMat);
    backMesh.position.set(0, 3 + (C.BACK_WALL_H - 3) / 2, s * HALF_L);
    host.add(backMesh);
    frame(C.COURT_W + 0.12, 0.08, 0.08, 0, 3, s * HALF_L, host);
    frame(C.COURT_W + 0.12, 0.08, 0.08, 0, C.BACK_WALL_H, s * HALF_L, host);
    for (let i = 0; i <= 4; i++) frame(0.08, C.BACK_WALL_H, 0.08, -HALF_W + i * 2.5, C.BACK_WALL_H / 2, s * HALF_L, host);

    for (const sx of [-1, 1]) {
      // Lateral de cristal junto al fondo
      const zc = s * (HALF_L - C.SIDE_GLASS_LEN / 2);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(C.SIDE_GLASS_LEN, C.SIDE_GLASS_H), glassMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * HALF_W, C.SIDE_GLASS_H / 2, zc);
      const sh = sx === 1 ? sideX : g;
      sh.add(side);
      frame(0.08, 0.08, C.SIDE_GLASS_LEN, sx * HALF_W, C.SIDE_GLASS_H, zc, sh);
      frame(0.08, C.SIDE_GLASS_H, 0.08, sx * HALF_W, C.SIDE_GLASS_H / 2, s * (HALF_L - C.SIDE_GLASS_LEN), sh);
      frame(0.08, C.BACK_WALL_H, 0.08, sx * HALF_W, C.BACK_WALL_H / 2, s * HALF_L, sh);
    }
  }
  // Malla lateral central
  const meshLen = C.COURT_L - 2 * C.SIDE_GLASS_LEN;
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(meshLen, C.SIDE_MESH_H), meshMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(sx * HALF_W, C.SIDE_MESH_H / 2, 0);
    const sh = sx === 1 ? sideX : g;
    sh.add(m);
    frame(0.06, 0.06, meshLen, sx * HALF_W, C.SIDE_MESH_H, 0, sh);
    for (let i = 1; i < 6; i++) frame(0.06, C.SIDE_MESH_H, 0.06, sx * HALF_W, C.SIDE_MESH_H / 2, -meshLen / 2 + (i * meshLen) / 6, sh);
  }

  // Grada simple de bloques al fondo rival (decorado)
  const standColors = [0x31446e, 0x3b5486, 0x2a3a5e];
  for (let r = 0; r < 4; r++) {
    const st = box(C.COURT_W + 8, 0.6, 1.2, standColors[r % 3]);
    st.position.set(0, 0.3 + r * 0.6, -HALF_L - 3 - r * 1.2);
    st.receiveShadow = true;
    g.add(st);
  }

  near.visible = false;
  g.add(near);
  g.add(sideX);
  scene.add(g);
  return { group: g, near, sideX };
}
