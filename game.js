// ============================================================
//  Bee Pollination Game – Random Sprite Placement
//  All sprites check collision against each other (AABB + gap)
// ============================================================

(function () {

  // ── Canvas dimensions ──────────────────────────────────────
  const W = 960;
  const H = 540;

  // ── Play area bounds ───────────────────────────────────────
  const LEFT_MARGIN  = 160;   // bee takes the left strip
  const RIGHT_MARGIN = 20;
  const TOP_MARGIN   = 15;
  const PLAY_BOTTOM  = H - 140; // grass + controls live below

  // ── Gap kept between any two sprites (px) ─────────────────
  const SPRITE_GAP = 28;

  // ── Extra: minimum centre-to-centre distance for the 2 flowers
  const MIN_FLOWER_DIST = 230;

  // ── Sprite definitions: id, width, height ─────────────────
  const SPRITE_LIST = [
    { id: 'flower1',   w: 100, h: 100 },
    { id: 'flower2',   w: 120, h: 120 },
    { id: 'dragonfly', w: 80,  h: 70  },
    { id: 'garlic',    w: 70,  h: 80  },
    { id: 'berry',     w: 75,  h: 75  },
  ];

  // ── Helpers ────────────────────────────────────────────────
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // AABB overlap test (with extra gap on all sides)
  function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
    const g = SPRITE_GAP;
    return ax < bx + bw + g &&
           ax + aw + g > bx &&
           ay < by + bh + g &&
           ay + ah + g > by;
  }

  // Euclidean distance between sprite centres
  function centreDist(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.hypot(
      (ax + aw / 2) - (bx + bw / 2),
      (ay + ah / 2) - (by + bh / 2)
    );
  }

  // Random candidate position for a sprite
  function randomPos(sp) {
    return {
      x: randInt(LEFT_MARGIN, W - RIGHT_MARGIN - sp.w),
      y: randInt(TOP_MARGIN,  PLAY_BOTTOM - sp.h),
    };
  }

  // Apply position to DOM element
  function applyPos(id, x, y) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.right  = 'auto';
    el.style.bottom = 'auto';
  }

  // ── Main placement ─────────────────────────────────────────
  function placeSprites() {
    const placed = []; // { id, x, y, w, h }

    SPRITE_LIST.forEach(function (sp) {
      let pos = null;
      const MAX_TRIES = 400;

      for (let i = 0; i < MAX_TRIES; i++) {
        const candidate = randomPos(sp);
        let valid = true;

        for (const p of placed) {
          // 1. Basic AABB + gap check (all sprites)
          if (overlaps(candidate.x, candidate.y, sp.w, sp.h,
                       p.x, p.y, p.w, p.h)) {
            valid = false;
            break;
          }

          // 2. Extra distance rule only for the two flowers
          if ((sp.id === 'flower1' || sp.id === 'flower2') &&
              (p.id  === 'flower1' || p.id  === 'flower2')) {
            if (centreDist(candidate.x, candidate.y, sp.w, sp.h,
                           p.x, p.y, p.w, p.h) < MIN_FLOWER_DIST) {
              valid = false;
              break;
            }
          }
        }

        if (valid) {
          pos = candidate;
          break;
        }
      }

      // Fallback: if no valid spot found after MAX_TRIES,
      // find the emptiest quadrant and place there
      if (!pos) {
        pos = fallbackPos(sp, placed);
      }

      applyPos(sp.id, pos.x, pos.y);
      placed.push({ id: sp.id, x: pos.x, y: pos.y, w: sp.w, h: sp.h });
    });
  }

  // ── Fallback: split playfield into a 3×2 grid, pick least-used cell
  function fallbackPos(sp, placed) {
    const cols = 3, rows = 2;
    const cellW = Math.floor((W - LEFT_MARGIN - RIGHT_MARGIN) / cols);
    const cellH = Math.floor((PLAY_BOTTOM - TOP_MARGIN) / rows);

    // Count sprites per cell
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
    placed.forEach(function (p) {
      const col = Math.min(Math.floor((p.x - LEFT_MARGIN) / cellW), cols - 1);
      const row = Math.min(Math.floor((p.y - TOP_MARGIN)  / cellH), rows - 1);
      if (col >= 0 && row >= 0) counts[row][col]++;
    });

    // Find cell with fewest sprites
    let minCount = Infinity, bestRow = 0, bestCol = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (counts[r][c] < minCount) {
          minCount = counts[r][c];
          bestRow = r; bestCol = c;
        }
      }
    }

    return {
      x: randInt(LEFT_MARGIN + bestCol * cellW,
                 LEFT_MARGIN + bestCol * cellW + cellW - sp.w),
      y: randInt(TOP_MARGIN  + bestRow * cellH,
                 TOP_MARGIN  + bestRow * cellH + cellH - sp.h),
    };
  }

  placeSprites();
  console.log('🐝 Bee Pollination Game – sprites placed (no-overlap).');
})();

// ============================================================
//  Bee Movement Controller
// ============================================================
(function () {

  // ── Dimensions (match CSS #game-container) ─────────────────
  const W = 960;
  const H = 540;

  // ── Bee sprite size ────────────────────────────────────────
  const BEE_W = 90;
  const BEE_H = 90;

  // ── Movement speed (px per press) ─────────────────────────
  let SPEED = 10;
  let hasEatenBerry = false;
  let hasEatenGarlic = false;
  let flower1Pollinated = false;
  let flower2Pollinated = false;

  const sndClick = new Audio('audio/audio/click.mp3');
  const sndError = new Audio('audio/audio/errorse.mp3');
  const sndRight = new Audio('audio/audio/rightse.mp3');
  const sndWin   = new Audio('audio/audio/winse.mp3');

  function playSound(audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio error:', e));
  }

  function showOkSign(flowerEl) {
    const ok = document.createElement('img');
    ok.src = '上課資源/上課資源/ok.png';
    ok.className = 'sprite';
    ok.style.width = '60px';
    ok.style.zIndex = '50';
    ok.style.pointerEvents = 'none';
    
    const fX = parseInt(flowerEl.style.left, 10) || 0;
    const fY = parseInt(flowerEl.style.top, 10) || 0;
    
    ok.style.left = (fX + 20) + 'px';
    ok.style.top = (fY + 20) + 'px';
    document.getElementById('game-container').appendChild(ok);
  }

  function checkWin() {
    if (flower1Pollinated && flower2Pollinated) {
      document.getElementById('win-message').style.display = 'flex';
      console.log('🎉 You did it! Pollination complete.');
      playSound(sndWin);
    }
  }

  // ── Boundary: controls area
  //    controls: bottom 18px, height = 56+4+56 = 116px
  //    controls top = 540 - 18 - 116 = 406px
  const CONTROLS_TOP = H - 18 - 116; // 406

  const MIN_X = 0;
  const MAX_X = W - BEE_W;            // 870
  const MIN_Y = 0;
  const MAX_Y = CONTROLS_TOP - BEE_H; // 316

  // ── State ──────────────────────────────────────────────────
  let beeX = 8;
  let beeY = Math.round((CONTROLS_TOP - BEE_H) / 2); // ~158
  let facingRight = true;

  const wrapper = document.getElementById('bee-wrapper');

  // ── Render ─────────────────────────────────────────────────
  function render() {
    wrapper.style.left      = beeX + 'px';
    wrapper.style.top       = beeY + 'px';
    wrapper.style.transform = facingRight ? 'scaleX(1)' : 'scaleX(-1)';
  }

  // ── Check Collisions ───────────────────────────────────────
  function checkCollisions() {
    if (!hasEatenBerry) {
      const berryEl = document.getElementById('berry');
      if (berryEl && berryEl.style.left && berryEl.style.top) {
        const berryX = parseInt(berryEl.style.left, 10);
        const berryY = parseInt(berryEl.style.top, 10);
        const berryW = 75;
        const berryH = 75;
        
        if (
          beeX < berryX + berryW &&
          beeX + BEE_W > berryX &&
          beeY < berryY + berryH &&
          beeY + BEE_H > berryY
        ) {
          hasEatenBerry = true;
          SPEED += 10;
          berryEl.style.display = 'none';
          console.log('🍓 Bee ate the berry! Speed increased to ' + SPEED);
        }
      }
    }

    if (!hasEatenGarlic) {
      const garlicEl = document.getElementById('garlic');
      if (garlicEl && garlicEl.style.left && garlicEl.style.top) {
        const garlicX = parseInt(garlicEl.style.left, 10);
        const garlicY = parseInt(garlicEl.style.top, 10);
        const garlicW = 70;
        const garlicH = 80;
        
        if (
          beeX < garlicX + garlicW &&
          beeX + BEE_W > garlicX &&
          beeY < garlicY + garlicH &&
          beeY + BEE_H > garlicY
        ) {
          hasEatenGarlic = true;
          SPEED = Math.max(1, SPEED - 5);
          garlicEl.style.display = 'none';
          console.log('🧄 Bee ate the scallion/garlic! Speed decreased to ' + SPEED);
        }
      }
    }

    const dragonflyEl = document.getElementById('dragonfly');
    if (dragonflyEl && dragonflyEl.style.left && dragonflyEl.style.top) {
      const dfX = parseInt(dragonflyEl.style.left, 10);
      const dfY = parseInt(dragonflyEl.style.top, 10);
      const dfW = 80;
      const dfH = 70;
      
      if (
        beeX < dfX + dfW &&
        beeX + BEE_W > dfX &&
        beeY < dfY + dfH &&
        beeY + BEE_H > dfY
      ) {
        beeX = 8;
        beeY = Math.round((CONTROLS_TOP - BEE_H) / 2);
        console.log('💥 Bee hit the dragonfly! Back to start.');
        playSound(sndError);
      }
    }

    // Flower 1 collision
    if (!flower1Pollinated) {
      const f1El = document.getElementById('flower1');
      if (f1El && f1El.style.left && f1El.style.top) {
        const f1X = parseInt(f1El.style.left, 10);
        const f1Y = parseInt(f1El.style.top, 10);
        const f1W = 100;
        const f1H = 100;
        if (
          beeX < f1X + f1W &&
          beeX + BEE_W > f1X &&
          beeY < f1Y + f1H &&
          beeY + BEE_H > f1Y
        ) {
          flower1Pollinated = true;
          playSound(sndRight);
          showOkSign(f1El);
          checkWin();
        }
      }
    }

    // Flower 2 collision
    if (!flower2Pollinated) {
      const f2El = document.getElementById('flower2');
      if (f2El && f2El.style.left && f2El.style.top) {
        const f2X = parseInt(f2El.style.left, 10);
        const f2Y = parseInt(f2El.style.top, 10);
        const f2W = 120;
        const f2H = 120;
        if (
          beeX < f2X + f2W &&
          beeX + BEE_W > f2X &&
          beeY < f2Y + f2H &&
          beeY + BEE_H > f2Y
        ) {
          flower2Pollinated = true;
          playSound(sndRight);
          showOkSign(f2El);
          checkWin();
        }
      }
    }
  }

  // ── Move ───────────────────────────────────────────────────
  function move(dx, dy) {
    beeX = Math.max(MIN_X, Math.min(MAX_X, beeX + dx));
    beeY = Math.max(MIN_Y, Math.min(MAX_Y, beeY + dy));
    if (dx > 0) facingRight = true;
    if (dx < 0) facingRight = false;
    render();
    playSound(sndClick);
    checkCollisions();
  }

  // Initialise
  render();

  // ── On-screen buttons ──────────────────────────────────────
  document.getElementById('btn-up')   .addEventListener('click', () => move(0,      -SPEED));
  document.getElementById('btn-down') .addEventListener('click', () => move(0,      +SPEED));
  document.getElementById('btn-left') .addEventListener('click', () => move(-SPEED, 0));
  document.getElementById('btn-right').addEventListener('click', () => move(+SPEED, 0));

  // ── Keyboard arrow keys ────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case 'ArrowUp':    e.preventDefault(); move(0,      -SPEED); break;
      case 'ArrowDown':  e.preventDefault(); move(0,      +SPEED); break;
      case 'ArrowLeft':  e.preventDefault(); move(-SPEED, 0);      break;
      case 'ArrowRight': e.preventDefault(); move(+SPEED, 0);      break;
    }
  });

  console.log('🐝 Movement ready. Bounds x[0-' + MAX_X + '] y[0-' + MAX_Y + ']');
})();
