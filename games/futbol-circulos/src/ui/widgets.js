// Piezas de interfaz con estilo boceto (panel blanco, contornos negros gruesos, texto negro).
// Las usan el menú principal, el de pausa y la sala online.

export const FONT = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#000000' };

export function panel(scene, cx, top, w, h) {
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(cx - w / 2, top, w, h, 18);
  g.lineStyle(4, 0x000000, 1);
  g.strokeRoundedRect(cx - w / 2, top, w, h, 18);
  return g;
}

export function label(scene, x, y, text, size = 18, originX = 0.5, originY = 0.5) {
  return scene.add.text(x, y, text, { ...FONT, fontSize: `${size}px` }).setOrigin(originX, originY);
}

// Barra segmentada tipo cápsula; la opción activa va rellena de negro.
// get() devuelve el valor actual; set(v) lo cambia. Devuelve { redraw, setEnabled }.
export function segmented(scene, x, y, w, get, set, options, h = 44) {
  const segW = w / options.length;
  const g = scene.add.graphics();
  const size = h >= 40 ? 18 : 15;
  const labels = options.map(([, text], i) =>
    scene.add.text(x + segW * (i + 0.5), y, text, { ...FONT, fontSize: `${size}px` }).setOrigin(0.5)
  );
  let enabled = true;
  const redraw = () => {
    g.clear();
    options.forEach(([value], i) => {
      const on = get() === value;
      if (on) {
        g.fillStyle(0x000000, enabled ? 1 : 0.45);
        const first = i === 0, last = i === options.length - 1;
        g.fillRoundedRect(x + segW * i, y - h / 2, segW, h, {
          tl: first ? h / 2 : 0, bl: first ? h / 2 : 0, tr: last ? h / 2 : 0, br: last ? h / 2 : 0,
        });
      }
      labels[i].setColor(on ? '#ffffff' : enabled ? '#000000' : '#777777');
    });
    g.lineStyle(4, 0x000000, enabled ? 1 : 0.45);
    g.strokeRoundedRect(x, y - h / 2, w, h, h / 2);
    for (let i = 1; i < options.length; i++) g.lineBetween(x + segW * i, y - h / 2, x + segW * i, y + h / 2);
  };
  options.forEach(([value], i) => {
    scene.add.zone(x + segW * i, y - h / 2, segW, h).setOrigin(0).setInteractive()
      .on('pointerup', () => {
        if (!enabled) return;
        set(value);
        redraw();
      });
  });
  redraw();
  return { redraw, setEnabled: (on) => { enabled = on; redraw(); } };
}

// Botón rectangular redondeado centrado en (cx, cy). Devuelve el texto (setText para cambiarlo).
export function button(scene, cx, cy, w, text, onTap, { h = 44, size = 17, fill = 0xffffff } = {}) {
  const g = scene.add.graphics();
  g.fillStyle(fill, 1);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
  g.lineStyle(4, 0x000000, 1);
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
  const t = scene.add.text(cx, cy, text, { ...FONT, fontSize: `${size}px`, align: 'center' }).setOrigin(0.5);
  scene.add.zone(cx - w / 2, cy - h / 2, w, h).setOrigin(0).setInteractive().on('pointerup', onTap);
  return t;
}

// Campo de texto HTML encima del lienzo (Phaser no tiene uno). Se coloca en coordenadas del juego
// y se recoloca al cambiar el tamaño; se borra al cerrar la escena.
export function textInput(scene, cx, cy, w, { placeholder = '', value = '', maxLength = 12, upper = false, onChange } = {}) {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value;
  el.placeholder = placeholder;
  el.maxLength = maxLength;
  el.autocomplete = 'off';
  el.spellcheck = false;
  if (upper) el.style.textTransform = 'uppercase';
  Object.assign(el.style, {
    position: 'fixed', boxSizing: 'border-box', border: '4px solid #000', borderRadius: '12px',
    font: 'bold 18px sans-serif', textAlign: 'center', background: '#fff', color: '#000',
    outline: 'none', padding: '0 8px', zIndex: 10,
  });
  el.addEventListener('input', () => {
    if (upper) el.value = el.value.toUpperCase();
    onChange?.(el.value);
  });
  document.body.appendChild(el);
  const h = 44;
  const place = () => {
    const r = scene.game.canvas.getBoundingClientRect();
    const k = r.width / scene.scale.gameSize.width;
    Object.assign(el.style, {
      left: `${r.left + (cx - w / 2) * k}px`, top: `${r.top + (cy - h / 2) * k}px`,
      width: `${w * k}px`, height: `${h * k}px`, fontSize: `${18 * k}px`,
    });
  };
  place();
  scene.scale.on('resize', place);
  const remove = () => {
    scene.scale.off('resize', place);
    el.remove();
  };
  scene.events.once('shutdown', remove);
  scene.events.once('sleep', remove);
  return el;
}
