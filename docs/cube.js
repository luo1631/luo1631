(() => {
  "use strict";

  // The eight-part turn score and cubie coordinate convention come from
  // the 栖屿 project (src/exhibits/cube-sequence.ts).
  const segments = [
    ["U", "F'", "B", "R"], ["L'", "U", "R'", "U"],
    ["D'", "F'", "B", "R"], ["L'", "U", "R'", "D'"],
    ["U", "F'", "B", "L'"], ["R", "U", "R'", "U"],
    ["D'", "F'", "B", "L'"], ["R", "U", "R'", "D'"],
  ];

  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const faces = {
    R: { axis: 0, layer: 1, name: "红", color: [234, 57, 52] },
    L: { axis: 0, layer: -1, name: "橙", color: [255, 130, 39] },
    U: { axis: 1, layer: 1, name: "白", color: [245, 246, 242] },
    D: { axis: 1, layer: -1, name: "黄", color: [255, 216, 44] },
    F: { axis: 2, layer: 1, name: "绿", color: [36, 190, 106] },
    B: { axis: 2, layer: -1, name: "蓝", color: [55, 115, 241] },
  };

  const faceKeys = Object.keys(faces);
  const faceByAxisAndSign = [[faces.R, faces.L], [faces.U, faces.D], [faces.F, faces.B]];
  const quarterTurn = Math.PI / 2;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function rotate(vector, axis, cosine, sine) {
    const next = (axis + 1) % 3;
    const last = (axis + 2) % 3;
    const result = [...vector];
    result[next] = cosine * vector[next] - sine * vector[last] || 0;
    result[last] = sine * vector[next] + cosine * vector[last] || 0;
    return result;
  }

  function solvedCube() {
    const pieces = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          pieces.push({ home: [x, y, z], position: [x, y, z], basis: axes });
        }
      }
    }
    return pieces;
  }

  function notationTurn(move) {
    const { axis, layer } = faces[move[0]];
    return { axis, layer, direction: move.endsWith("'") ? layer : -layer };
  }

  function applyTurn(pieces, { axis, layer, direction }) {
    const rotateQuarter = (vector) => rotate(vector, axis, 0, direction);
    return pieces.map((piece) => {
      if (piece.position[axis] !== layer) return piece;
      return {
        home: piece.home,
        position: rotateQuarter(piece.position),
        basis: piece.basis.map(rotateQuarter),
      };
    });
  }

  function openingStates() {
    let pieces = solvedCube();
    let step = 0;
    const states = [];
    for (const [index, segment] of segments.entries()) {
      for (const move of segment) {
        pieces = applyTurn(pieces, notationTurn(move));
        step++;
        // A move belongs to the segment in which its quarter turn lands.
        if (index >= 1 && index <= 5) states.push({ segment: index + 1, step, pieces });
      }
    }
    return states;
  }

  function initialView(topFace) {
    const { axis, layer } = faces[topFace];
    const up = axes[axis].map((component) => component * layer);
    const forward = axis === 2 ? axes[1] : axes[2];
    return { up, forward, right: cross(up, forward), yaw: .65, pitch: .47 };
  }

  function projection({ right, up, forward, yaw, pitch }) {
    const yawCos = Math.cos(yaw);
    const yawSin = Math.sin(yaw);
    const pitchCos = Math.cos(pitch);
    const pitchSin = Math.sin(pitch);
    return (vector) => {
      const x = dot(vector, right);
      const y = dot(vector, up);
      const z = dot(vector, forward);
      const depth = x * yawSin + z * yawCos;
      return [x * yawCos - z * yawSin, depth * pitchSin - y * pitchCos,
        depth * pitchCos + y * pitchSin];
    };
  }

  function shade(color, scale = 1, lift = 0) {
    const channels = color.map((channel) => Math.min(255, Math.round(channel * scale + lift)));
    return "rgb(" + channels.join(" ") + ")";
  }

  function paintFace(context, face, lighting) {
    const body = context.createLinearGradient(0, 0, 1, 1);
    body.addColorStop(0, shade([44, 48, 49], lighting));
    body.addColorStop(1, shade([18, 20, 21], lighting));
    context.beginPath();
    context.roundRect(0, 0, 1, 1, .045);
    context.fillStyle = body;
    context.fill();

    if (!face) return;
    const sticker = context.createLinearGradient(.09, .09, .93, .91);
    sticker.addColorStop(0, shade(face.color, lighting + .06, 9));
    sticker.addColorStop(.52, shade(face.color, lighting + .02));
    sticker.addColorStop(1, shade(face.color, lighting - .07));
    context.beginPath();
    context.roundRect(.075, .075, .85, .85, .115);
    context.fillStyle = sticker;
    context.fill();
    context.lineWidth = .012;
    context.strokeStyle = "rgb(255 255 255 / .23)";
    context.stroke();
  }

  function paintShadow(context, x, y, cell) {
    const radius = cell * 2.4;
    context.save();
    context.translate(x, y);
    context.scale(1, .19);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, "rgb(33 41 34 / .28)");
    gradient.addColorStop(.48, "rgb(33 41 34 / .13)");
    gradient.addColorStop(1, "rgb(33 41 34 / 0)");
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }

  function makePainter(canvas, context) {
    const light = [-.29, -.67, .68];
    const half = .493;
    let density, width, height, centerX, centerY, cell;
    let visibleFaces = [];

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      density = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * density));
      canvas.height = Math.max(1, Math.round(height * density));
      centerX = width / 2;
      cell = Math.min(width / 5.48, height / 5.83, 100);
      centerY = height / 2 - cell * .08;
    }

    function draw(pieces, view, turn) {
      if (!cell) return;
      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, width, height);
      paintShadow(context, centerX, centerY + cell * 2.1, cell);

      const project = projection(view);
      const rotating = turn && Math.abs(turn.angle) > 1e-6;
      const cosine = rotating ? Math.cos(turn.angle) : 1;
      const sine = rotating ? Math.sin(turn.angle) : 0;
      const layerDepth = rotating ? project(axes[turn.axis])[2] : 0;
      const cubies = pieces.map((piece) => {
        const inLayer = rotating && piece.position[turn.axis] === turn.layer;
        const orient = (vector) => inLayer ? rotate(vector, turn.axis, cosine, sine) : vector;
        const basis = piece.basis.map(orient);
        return { piece, basis, center: project(orient(piece.position)), screenBasis: basis.map(project) };
      });

      // Parallel slices do not cross one another. Paint the farther slice
      // first while a layer moves, then order its cubies by their depth.
      cubies.sort((a, b) => {
        if (rotating && Math.abs(layerDepth) > 1e-7) {
          const difference = a.piece.position[turn.axis] - b.piece.position[turn.axis];
          if (difference) return difference * layerDepth;
        }
        return a.center[2] - b.center[2];
      });

      visibleFaces = [];
      for (const { piece, basis, center, screenBasis } of cubies) {
        for (const [axis, normal] of screenBasis.entries()) {
          if (Math.abs(normal[2]) < 1e-5) continue;
          const sign = Math.sign(normal[2]);
          const u = screenBasis[(axis + 1) % 3];
          const v = screenBasis[(axis + 2) % 3];
          const x = centerX + cell * (center[0] + half * (normal[0] * sign - u[0] - v[0]));
          const y = centerY + cell * (center[1] + half * (normal[1] * sign - u[1] - v[1]));
          const diameter = 2 * half * cell;
          const [ux, uy] = [u[0] * diameter, u[1] * diameter];
          const [vx, vy] = [v[0] * diameter, v[1] * diameter];
          const face = piece.home[axis] === sign ? faceByAxisAndSign[axis][Number(sign < 0)] : null;
          const lighting = .77 + .23 * Math.max(0, dot(normal, light) * sign);

          context.setTransform(
            density * ux, density * uy, density * vx, density * vy, density * x, density * y,
          );
          paintFace(context, face, lighting);
          visibleFaces.push({
            x, y, ux, uy, vx, vy, face, piece,
            normal: basis[axis].map((component) => component * sign),
          });
        }
      }
    }

    function stickerAt(x, y) {
      for (let index = visibleFaces.length - 1; index >= 0; index--) {
        const surface = visibleFaces[index];
        const { ux, uy, vx, vy } = surface;
        const det = ux * vy - uy * vx;
        const dx = x - surface.x;
        const dy = y - surface.y;
        const u = (dx * vy - dy * vx) / det;
        const v = (ux * dy - uy * dx) / det;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return surface.face ? surface : null;
      }
      return null;
    }

    return { resize, draw, stickerAt, cellSize: () => cell };
  }

  function dragTurn(sticker, view, dx, dy) {
    const project = projection(view);
    let chosen = null;
    let bestAlignment = 0;
    for (const [axis, direction] of axes.entries()) {
      if (sticker.normal[axis] !== 0) continue;
      const [x, y] = project(cross(direction, sticker.normal));
      const length = Math.hypot(x, y);
      if (length < .001) continue;
      const [screenX, screenY] = [x / length, y / length];
      const alignment = Math.abs(dx * screenX + dy * screenY);
      if (alignment <= bestAlignment) continue;
      bestAlignment = alignment;
      chosen = { axis, layer: sticker.piece.position[axis], screenX, screenY, angle: 0 };
    }
    return chosen;
  }

  function play() {
    const canvas = document.querySelector("#cube");
    const context = canvas.getContext("2d");
    if (!context) return;

    const painter = makePainter(canvas, context);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const pick = (items) => items[Math.floor(Math.random() * items.length)];
    const arrowDeltas = { ArrowUp: [0, -22], ArrowDown: [0, 22], ArrowLeft: [-22, 0], ArrowRight: [22, 0] };
    const opening = pick(openingStates());
    const topFace = pick(faceKeys);
    const view = initialView(topFace);
    let pieces = opening.pieces;
    let gesture = null;
    let animation = null;
    let frame = 0;

    canvas.dataset.openingSegment = opening.segment;
    canvas.dataset.openingStep = opening.step;
    canvas.dataset.openingTop = topFace;
    canvas.setAttribute("aria-label", "可转动的三阶魔方，开局顶面为" + faces[topFace].name + "色");

    function requestDraw() {
      if (!frame) frame = requestAnimationFrame(drawFrame);
    }

    function drawFrame(now) {
      frame = 0;
      if (animation) {
        const progress = Math.min(1, Math.max(0, (now - animation.start) / animation.duration));
        const eased = 1 - (1 - progress) ** 3;
        animation.angle = animation.from + (animation.to - animation.from) * eased;
        if (progress === 1) {
          const { done } = animation;
          animation = null;
          done?.();
        }
      }
      painter.draw(pieces, view, animation ?? gesture?.turn);
      if (animation) requestDraw();
    }

    function stopGesture() {
      if (!gesture) return;
      const { pointer } = gesture;
      gesture = null;
      canvas.classList.remove("is-dragging");
      if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    }

    function animate(turn, from, to, done) {
      if (reducedMotion.matches || Math.abs(to - from) < .005) {
        done?.();
      } else {
        animation = {
          axis: turn.axis, layer: turn.layer, angle: from, from, to, done,
          start: performance.now(),
          duration: Math.max(90, 180 * Math.abs(to - from) / quarterTurn),
        };
      }
      requestDraw();
    }

    function move(turn, angle = 0) {
      animate(turn, angle, turn.direction * quarterTurn, () => {
        pieces = applyTurn(pieces, turn);
      });
    }

    function orbit(dx, dy) {
      view.yaw -= dx * .009;
      const pitch = view.pitch + dy * .009;
      const limit = quarterTurn - .026;
      view.pitch = Math.max(-limit, Math.min(limit, pitch));
      requestDraw();
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (gesture || animation || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      const bounds = canvas.getBoundingClientRect();
      gesture = {
        pointer: event.pointerId,
        x: event.clientX, y: event.clientY,
        lastX: event.clientX, lastY: event.clientY,
        sticker: painter.stickerAt(event.clientX - bounds.left, event.clientY - bounds.top),
        turn: null,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    });

    canvas.addEventListener("pointermove", (event) => {
      if (gesture?.pointer !== event.pointerId) return;
      const x = event.clientX;
      const y = event.clientY;
      if (!gesture.sticker) {
        orbit(x - gesture.lastX, y - gesture.lastY);
        gesture.lastX = x;
        gesture.lastY = y;
        return;
      }

      const dx = x - gesture.x;
      const dy = y - gesture.y;
      if (!gesture.turn && Math.hypot(dx, dy) >= 7) {
        gesture.turn = dragTurn(gesture.sticker, view, dx, dy);
      }

      const turn = gesture.turn;
      if (!turn) return;
      const pixels = dx * turn.screenX + dy * turn.screenY;
      const fullTurnPixels = Math.max(48, painter.cellSize() * .96);
      turn.angle = Math.max(-1, Math.min(1, pixels / fullTurnPixels)) * quarterTurn;
      requestDraw();
    });

    function endDrag(event, cancelled) {
      if (gesture?.pointer !== event.pointerId) return;
      const { turn } = gesture;
      stopGesture();
      if (!turn) return;
      if (!cancelled && Math.abs(turn.angle) >= quarterTurn * .24) {
        move({ axis: turn.axis, layer: turn.layer, direction: Math.sign(turn.angle) }, turn.angle);
      } else {
        animate(turn, turn.angle, 0);
      }
    }

    canvas.addEventListener("pointerup", (event) => endDrag(event, false));
    canvas.addEventListener("pointercancel", (event) => endDrag(event, true));
    canvas.addEventListener("lostpointercapture", (event) => endDrag(event, true));

    canvas.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const arrow = arrowDeltas[event.key];
      const face = event.key.toUpperCase();
      if (!arrow && !faces[face]) return;
      event.preventDefault();
      if (gesture || animation) return;
      if (arrow) orbit(...arrow);
      else if (!event.repeat) move(notationTurn(face + (event.shiftKey ? "'" : "")));
    });

    const observer = new ResizeObserver(() => {
      painter.resize();
      requestDraw();
    });
    painter.resize();
    observer.observe(canvas);
    requestDraw();
  }

  play();
})();
