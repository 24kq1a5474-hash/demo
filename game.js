(() => {
  const canvas = document.querySelector('#game-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#game-overlay');
  const startButton = document.querySelector('#start-button');
  const pauseBadge = document.querySelector('#pause-badge');
  const keys = new Set();
  const worldWidth = 5200;
  const groundY = 446;
  const gravity = 1450;
  const platforms = [
    { x: 470, y: 370, w: 190 }, { x: 930, y: 337, w: 210 },
    { x: 1430, y: 373, w: 200 }, { x: 1870, y: 335, w: 210 },
    { x: 2390, y: 369, w: 190 }, { x: 2830, y: 331, w: 220 },
    { x: 3330, y: 370, w: 205 }, { x: 3790, y: 334, w: 220 },
    { x: 4280, y: 369, w: 200 }, { x: 4690, y: 334, w: 190 }
  ];
  const enemySpawns = [
    400, 610, 830, 1080, 1290, 1530, 1780, 2050, 2240, 2490,
    2710, 2950, 3180, 3430, 3650, 3890, 4130, 4360, 4600, 4820
  ];
  const state = {
    mode: 'title', score: 0, camera: 0, elapsed: 0, lastTime: 0,
    player: null, bullets: [], enemyBullets: [], grenades: [], enemies: [], particles: [],
    boss: null, shake: 0, muted: false, soundContext: null
  };

  const playerStart = () => ({ x: 86, y: groundY - 43, w: 27, h: 43, vx: 0, vy: 0, facing: 1, grounded: true, health: 3, invulnerable: 0, fireTimer: 0, grenadeCooldown: 0 });
  const random = (min, max) => min + Math.random() * (max - min);

  function resetGame() {
    state.score = 0;
    state.camera = 0;
    state.elapsed = 0;
    state.bullets = [];
    state.enemyBullets = [];
    state.grenades = [];
    state.particles = [];
    state.enemies = enemySpawns.map((x, index) => ({ x, y: groundY - 32, w: 25, h: 32, hp: 2, speed: 28 + (index % 3) * 7, fireTimer: random(.5, 2), alive: true, phase: random(0, 8) }));
    state.player = playerStart();
    state.boss = { x: 4890, y: groundY - 83, w: 80, h: 83, hp: 18, maxHp: 18, fireTimer: 1.1, alive: true };
    updateHud();
    document.querySelector('#boss-warning').hidden = true;
    document.querySelector('#stage-label').textContent = 'INSERTION POINT';
    document.querySelector('#progress-fill').style.width = '0%';
  }

  function startGame() {
    resetGame();
    state.mode = 'playing';
    overlay.classList.add('is-hidden');
    pauseBadge.hidden = true;
    startButton.blur();
    playTone(440, .06);
  }

  function endGame(won) {
    state.mode = won ? 'won' : 'lost';
    overlay.classList.remove('is-hidden');
    document.querySelector('#overlay-title').innerHTML = won ? 'OUTPOST<br><span>SECURED.</span>' : 'SIGNAL<br><span>LOST.</span>';
    document.querySelector('#overlay-copy').textContent = won ? 'The line is broken. The outpost is yours. Nice work, soldier.' : 'The field went quiet. Take a breath, lock and load, and make another push.';
    document.querySelector('#start-label').textContent = won ? 'RUN IT BACK' : 'REDEPLOY';
    document.querySelector('.overlay-foot').textContent = 'PRESS ENTER TO DEPLOY AGAIN';
  }

  function updateHud() {
    document.querySelector('#score').textContent = String(state.score).padStart(6, '0');
    const health = state.player?.health ?? 3;
    document.querySelector('#health').textContent = `${'◆ '.repeat(health).trim()}${health < 3 ? ` ${'◇ '.repeat(3 - health).trim()}` : ''}`;
    document.querySelector('#health').setAttribute('aria-label', `${health} lives remaining`);
  }

  function playTone(frequency, duration = .08, wave = 'square') {
    if (state.muted) return;
    try {
      state.soundContext ||= new AudioContext();
      if (state.soundContext.state === 'suspended') state.soundContext.resume();
      const oscillator = state.soundContext.createOscillator();
      const gain = state.soundContext.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.035, state.soundContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, state.soundContext.currentTime + duration);
      oscillator.connect(gain).connect(state.soundContext.destination);
      oscillator.start();
      oscillator.stop(state.soundContext.currentTime + duration);
    } catch { /* Audio is optional; the game remains playable without it. */ }
  }

  function fire() {
    const player = state.player;
    if (player.fireTimer > 0) return;
    player.fireTimer = .19;
    state.bullets.push({ x: player.x + (player.facing > 0 ? player.w : -9), y: player.y + 17, vx: player.facing * 630, life: 1.5 });
    if (Math.random() < .18) playTone(150 + Math.random() * 45, .035);
  }

  function throwGrenade() {
    if (state.player.grenadeCooldown > 0) return;
    state.player.grenadeCooldown = .8;
    state.grenades.push({ x: state.player.x + state.player.w / 2, y: state.player.y + 13, vx: state.player.facing * 230, vy: -440, fuse: .82 });
    playTone(240, .08, 'triangle');
  }

  function movePlayer(delta) {
    const player = state.player;
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const jump = keys.has('ArrowUp') || keys.has('KeyW');
    if (left !== right) {
      player.vx = (right ? 1 : -1) * 230;
      player.facing = right ? 1 : -1;
    } else player.vx = 0;
    if (jump && player.grounded) {
      player.vy = -570;
      player.grounded = false;
      playTone(280, .06, 'triangle');
    }
    if (keys.has('Space') || keys.has('KeyJ') || keys.has('fire')) fire();
    if (keys.has('KeyX') || keys.has('grenade')) throwGrenade();

    const previousBottom = player.y + player.h;
    player.x = Math.max(0, Math.min(worldWidth - player.w, player.x + player.vx * delta));
    player.y += player.vy * delta;
    player.vy += gravity * delta;
    player.grounded = false;
    if (player.y + player.h >= groundY) {
      player.y = groundY - player.h;
      player.vy = 0;
      player.grounded = true;
    }
    for (const platform of platforms) {
      if (player.vy >= 0 && previousBottom <= platform.y && player.y + player.h >= platform.y && player.x + player.w > platform.x && player.x < platform.x + platform.w) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.grounded = true;
      }
    }
    player.fireTimer = Math.max(0, player.fireTimer - delta);
    player.grenadeCooldown = Math.max(0, player.grenadeCooldown - delta);
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    state.camera = Math.max(0, Math.min(worldWidth - canvas.width, player.x - 260));
  }

  function updateEnemies(delta) {
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const distance = state.player.x - enemy.x;
      if (Math.abs(distance) < 510) {
        enemy.x += Math.sign(distance) * enemy.speed * delta;
        enemy.fireTimer -= delta;
        if (enemy.fireTimer <= 0 && Math.abs(distance) < 430) {
          enemy.fireTimer = random(1.4, 2.5);
          state.enemyBullets.push({ x: enemy.x + (distance > 0 ? enemy.w : 0), y: enemy.y + 13, vx: Math.sign(distance) * 255, life: 2.1 });
        }
      }
      enemy.phase += delta * 7;
      if (enemy.x < state.player.x + state.player.w && enemy.x + enemy.w > state.player.x && enemy.y < state.player.y + state.player.h && enemy.y + enemy.h > state.player.y) damagePlayer();
    }

    const boss = state.boss;
    if (boss.alive && state.player.x > 4540) {
      document.querySelector('#boss-warning').hidden = false;
      document.querySelector('#stage-label').textContent = 'HEAVY UNIT // ENGAGED';
      boss.fireTimer -= delta;
      boss.y = groundY - boss.h + Math.sin(state.elapsed * 2.2) * 7;
      if (boss.fireTimer <= 0) {
        boss.fireTimer = .85;
        const direction = state.player.x < boss.x ? -1 : 1;
        state.enemyBullets.push({ x: boss.x + (direction < 0 ? 0 : boss.w), y: boss.y + 37, vx: direction * 310, life: 2.4, heavy: true });
        playTone(82, .12, 'sawtooth');
      }
      if (state.player.x < boss.x + boss.w && state.player.x + state.player.w > boss.x && state.player.y < boss.y + boss.h && state.player.y + state.player.h > boss.y) damagePlayer();
    }
  }

  function damagePlayer() {
    const player = state.player;
    if (player.invulnerable > 0 || state.mode !== 'playing') return;
    player.health -= 1;
    player.invulnerable = 1.35;
    state.shake = .17;
    burst(player.x + player.w / 2, player.y + player.h / 2, '#ff6d43', 10);
    playTone(90, .22, 'sawtooth');
    updateHud();
    if (player.health <= 0) endGame(false);
  }

  function burst(x, y, color, count = 8) {
    for (let index = 0; index < count; index++) state.particles.push({ x, y, vx: random(-170, 170), vy: random(-210, 80), life: random(.22, .58), color, size: random(2, 5) });
  }

  function updateProjectiles(delta) {
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * delta;
      bullet.life -= delta;
      for (const enemy of state.enemies) {
        if (!enemy.alive || bullet.life <= 0) continue;
        if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.w && bullet.y > enemy.y && bullet.y < enemy.y + enemy.h) {
          bullet.life = 0;
          enemy.hp--;
          burst(bullet.x, bullet.y, '#c2f55d', 3);
          if (enemy.hp <= 0) {
            enemy.alive = false;
            state.score += 100;
            burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#ff6d43', 12);
          }
        }
      }
      const boss = state.boss;
      if (boss.alive && bullet.life > 0 && bullet.x > boss.x && bullet.x < boss.x + boss.w && bullet.y > boss.y && bullet.y < boss.y + boss.h) {
        bullet.life = 0;
        boss.hp--;
        burst(bullet.x, bullet.y, '#ffba56', 3);
        if (boss.hp <= 0) {
          boss.alive = false;
          state.score += 1500;
          burst(boss.x + boss.w / 2, boss.y + boss.h / 2, '#ff6d43', 38);
          endGame(true);
        }
      }
    }
    state.bullets = state.bullets.filter(bullet => bullet.life > 0 && bullet.x > state.camera - 100 && bullet.x < state.camera + canvas.width + 100);

    for (const bullet of state.enemyBullets) {
      bullet.x += bullet.vx * delta;
      bullet.life -= delta;
      const player = state.player;
      if (bullet.x > player.x && bullet.x < player.x + player.w && bullet.y > player.y && bullet.y < player.y + player.h) {
        bullet.life = 0;
        damagePlayer();
      }
    }
    state.enemyBullets = state.enemyBullets.filter(bullet => bullet.life > 0);

    for (const grenade of state.grenades) {
      grenade.x += grenade.vx * delta;
      grenade.y += grenade.vy * delta;
      grenade.vy += gravity * delta;
      grenade.fuse -= delta;
      if (grenade.y > groundY - 8) { grenade.y = groundY - 8; grenade.vy *= -.45; grenade.vx *= .7; }
      if (grenade.fuse <= 0) {
        grenade.fuse = 100;
        grenade.blastLife = .24;
        grenade.exploded = true;
        burst(grenade.x, grenade.y, '#ffba56', 23);
        for (const enemy of state.enemies) {
          if (enemy.alive && Math.abs(enemy.x - grenade.x) < 115) { enemy.alive = false; state.score += 100; }
        }
        if (state.boss.alive && Math.abs(state.boss.x - grenade.x) < 130) {
          state.boss.hp -= 4;
          if (state.boss.hp <= 0) { state.boss.alive = false; state.score += 1500; endGame(true); }
        }
      }
    }
    state.grenades = state.grenades.filter(grenade => {
      if (!grenade.exploded) return true;
      grenade.blastLife -= delta;
      return grenade.blastLife > 0;
    });
    for (const particle of state.particles) {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += gravity * .45 * delta;
      particle.life -= delta;
    }
    state.particles = state.particles.filter(particle => particle.life > 0);
    state.shake = Math.max(0, state.shake - delta);
  }

  function update(delta) {
    if (state.mode !== 'playing') return;
    state.elapsed += delta;
    movePlayer(delta);
    updateEnemies(delta);
    updateProjectiles(delta);
    if (state.player.x > 4500 && state.boss.alive) document.querySelector('#stage-label').textContent = 'LAST STAND // 01';
    else if (state.player.x > 2800) document.querySelector('#stage-label').textContent = 'ENEMY TERRITORY';
    else if (state.player.x > 1100) document.querySelector('#stage-label').textContent = 'NO TURNING BACK';
    document.querySelector('#progress-fill').style.width = `${Math.min(100, state.player.x / (worldWidth - 350) * 100)}%`;
    updateHud();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#142526');
    gradient.addColorStop(.58, '#314139');
    gradient.addColorStop(1, '#786147');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d9bf76';
    ctx.globalAlpha = .75;
    ctx.beginPath();
    ctx.arc(760 - state.camera * .06, 110, 39, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let index = 0; index < 38; index++) {
      const x = ((index * 197 + 41 - state.camera * .13) % (canvas.width + 100) + canvas.width + 100) % (canvas.width + 100) - 30;
      const y = 44 + (index * 83 % 215);
      ctx.fillStyle = index % 4 === 0 ? '#d4cd9d' : '#9eb6a0';
      ctx.fillRect(x, y, index % 5 === 0 ? 3 : 2, 2);
    }
    drawSkyline('#283a35', .2, 325, 16, 55);
    drawSkyline('#1d2b28', .4, 378, 27, 85);
  }

  function drawSkyline(color, parallax, base, width, maxHeight) {
    const offset = state.camera * parallax;
    ctx.fillStyle = color;
    for (let index = 0; index < 34; index++) {
      const worldX = index * (width + 13);
      const screenX = worldX - offset % (canvas.width + 80);
      const height = 22 + (index * 31 % maxHeight);
      ctx.fillRect(screenX, base - height, width, height);
      if (index % 3 === 0) {
        ctx.fillStyle = '#71866b';
        ctx.fillRect(screenX + 5, base - height + 12, 3, 5);
        ctx.fillRect(screenX + width - 8, base - height + 25, 3, 5);
        ctx.fillStyle = color;
      }
    }
  }

  function drawTerrain() {
    ctx.fillStyle = '#263d2d';
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    ctx.fillStyle = '#75844a';
    ctx.fillRect(0, groundY, canvas.width, 5);
    const offset = state.camera % 44;
    for (let x = -offset; x < canvas.width; x += 44) {
      ctx.fillStyle = '#364b34';
      ctx.fillRect(x, groundY + 10, 24, 4);
      ctx.fillStyle = '#202f2b';
      ctx.fillRect(x + 13, groundY + 27, 18, 3);
    }
    for (const platform of platforms) {
      const x = Math.round(platform.x - state.camera);
      if (x + platform.w < 0 || x > canvas.width) continue;
      ctx.fillStyle = '#43533a';
      ctx.fillRect(x, platform.y, platform.w, 12);
      ctx.fillStyle = '#a4a75d';
      ctx.fillRect(x, platform.y, platform.w, 3);
      ctx.fillStyle = '#2c3c31';
      for (let block = x + 7; block < x + platform.w; block += 29) ctx.fillRect(block, platform.y + 12, 18, 31);
      ctx.fillStyle = '#687248';
      ctx.fillRect(x + 6, platform.y + 11, 6, 4);
      ctx.fillRect(x + platform.w - 17, platform.y + 11, 7, 4);
    }
    for (let index = 0; index < 18; index++) {
      const x = (index * 173 - state.camera * .92 + 25000) % 5300 - state.camera;
      if (x > -30 && x < canvas.width + 30) {
        ctx.fillStyle = '#526348';
        ctx.fillRect(x, groundY - 9, 4, 9);
        ctx.fillRect(x - 3, groundY - 8, 3, 5);
        ctx.fillRect(x + 4, groundY - 12, 3, 6);
      }
    }
  }

  function drawSoldier(x, y, facing, enemy = false, flicker = false) {
    if (flicker && Math.floor(state.elapsed * 18) % 2 === 0) return;
    ctx.save();
    ctx.translate(Math.round(x - state.camera), Math.round(y));
    if (facing < 0) { ctx.translate(27, 0); ctx.scale(-1, 1); }
    const vest = enemy ? '#b65337' : '#a9bd53';
    const helmet = enemy ? '#e28343' : '#87944a';
    ctx.fillStyle = '#26342b'; ctx.fillRect(5, 31, 8, 11); ctx.fillRect(16, 31, 8, 11);
    ctx.fillStyle = '#1a2420'; ctx.fillRect(3, 39, 11, 4); ctx.fillRect(15, 39, 11, 4);
    ctx.fillStyle = vest; ctx.fillRect(4, 17, 20, 16); ctx.fillRect(2, 20, 5, 12);
    ctx.fillStyle = helmet; ctx.fillRect(7, 6, 15, 12); ctx.fillRect(5, 5, 18, 5);
    ctx.fillStyle = '#d6b17b'; ctx.fillRect(16, 12, 7, 4);
    ctx.fillStyle = enemy ? '#3d3128' : '#344039'; ctx.fillRect(21, 21, 14, 4); ctx.fillStyle = '#b7c199'; ctx.fillRect(31, 20, 5, 2);
    if (!enemy) { ctx.fillStyle = '#d9e3bb'; ctx.fillRect(10, 21, 3, 3); }
    ctx.restore();
  }

  function drawBoss() {
    const boss = state.boss;
    if (!boss?.alive) return;
    const x = Math.round(boss.x - state.camera);
    if (x < -100 || x > canvas.width + 100) return;
    ctx.fillStyle = '#20251f'; ctx.fillRect(x + 8, boss.y + 54, 25, 26); ctx.fillRect(x + 49, boss.y + 54, 25, 26);
    ctx.fillStyle = '#8d4334'; ctx.fillRect(x + 3, boss.y + 22, 74, 42);
    ctx.fillStyle = '#ba6841'; ctx.fillRect(x + 14, boss.y + 7, 53, 26);
    ctx.fillStyle = '#f2bb64'; ctx.fillRect(x + 52, boss.y + 15, 14, 6);
    ctx.fillStyle = '#373b31'; ctx.fillRect(x - 4, boss.y + 38, 24, 9); ctx.fillRect(x + 61, boss.y + 35, 29, 8);
    ctx.fillStyle = '#d9e0ca'; ctx.fillRect(x + 68, boss.y + 36, 7, 3);
    ctx.fillStyle = '#181e1a'; ctx.fillRect(x + 18, boss.y + 38, 14, 13); ctx.fillRect(x + 44, boss.y + 38, 14, 13);
    ctx.fillStyle = '#ff6d43'; ctx.fillRect(x + 22, boss.y + 42, 5, 4); ctx.fillRect(x + 48, boss.y + 42, 5, 4);
    ctx.fillStyle = '#231f1a'; ctx.fillRect(x - 4, boss.y - 12, boss.w + 8, 5);
    ctx.fillStyle = '#ff6d43'; ctx.fillRect(x - 4, boss.y - 12, (boss.w + 8) * (boss.hp / boss.maxHp), 5);
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) ctx.translate(random(-4, 4), random(-3, 3));
    drawBackground();
    drawTerrain();
    for (const enemy of state.enemies) if (enemy.alive && enemy.x - state.camera > -60 && enemy.x - state.camera < canvas.width + 60) drawSoldier(enemy.x, enemy.y, state.player && enemy.x < state.player.x ? 1 : -1, true);
    drawBoss();
    for (const bullet of state.bullets) {
      ctx.fillStyle = '#e6f67d'; ctx.fillRect(Math.round(bullet.x - state.camera), Math.round(bullet.y), 12, 3);
      ctx.fillStyle = '#fff6b0'; ctx.fillRect(Math.round(bullet.x - state.camera) + 8, Math.round(bullet.y) - 1, 5, 5);
    }
    for (const bullet of state.enemyBullets) {
      ctx.fillStyle = bullet.heavy ? '#ff7546' : '#f7a350';
      ctx.fillRect(Math.round(bullet.x - state.camera), Math.round(bullet.y), bullet.heavy ? 12 : 8, 5);
    }
    for (const grenade of state.grenades) {
      if (!grenade.exploded) { ctx.fillStyle = '#b4d05a'; ctx.fillRect(Math.round(grenade.x - state.camera), Math.round(grenade.y), 8, 7); }
      else if (grenade.blastLife > 0) {
        ctx.strokeStyle = '#ffba56'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(grenade.x - state.camera, grenade.y, (1 - grenade.blastLife / .24) * 42 + 8, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2.8);
      ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x - state.camera), Math.round(particle.y), particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
    if (state.player) drawSoldier(state.player.x, state.player.y, state.player.facing, false, state.player.invulnerable > 0);
    ctx.restore();
    const vignette = ctx.createLinearGradient(0, 0, 0, canvas.height);
    vignette.addColorStop(0, 'rgba(5, 10, 9, .16)');
    vignette.addColorStop(.72, 'rgba(5, 10, 9, 0)');
    vignette.addColorStop(1, 'rgba(5, 10, 9, .12)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function frame(timestamp) {
    const delta = Math.min(.035, (timestamp - state.lastTime) / 1000 || 0);
    state.lastTime = timestamp;
    update(delta);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Enter' && state.mode !== 'playing') startGame();
    if (event.code === 'Escape' && state.mode === 'playing') {
      state.mode = 'paused';
      pauseBadge.hidden = false;
      keys.clear();
    } else if (event.code === 'Escape' && state.mode === 'paused') {
      state.mode = 'playing';
      pauseBadge.hidden = true;
    }
    keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  startButton.addEventListener('click', startGame);
  document.querySelector('#restart-button').addEventListener('click', startGame);
  document.querySelector('#sound-button').addEventListener('click', event => {
    state.muted = !state.muted;
    event.currentTarget.classList.toggle('is-muted', state.muted);
    event.currentTarget.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Mute sound');
    event.currentTarget.title = state.muted ? 'Turn sound on' : 'Mute sound';
    if (!state.muted) playTone(440, .06);
  });

  for (const button of document.querySelectorAll('[data-control]')) {
    const control = button.dataset.control;
    const code = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', fire: 'fire', grenade: 'grenade' }[control];
    const press = event => { event.preventDefault(); keys.add(code); button.classList.add('is-pressed'); };
    const release = event => { event.preventDefault(); keys.delete(code); button.classList.remove('is-pressed'); };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);
  }

  resetGame();
  state.mode = 'title';
  requestAnimationFrame(frame);
})();