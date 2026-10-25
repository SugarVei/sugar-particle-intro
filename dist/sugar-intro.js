/* SUGAR intro — buildless, dependency-free custom element.
 * Usage: <sugar-intro></sugar-intro>
 * Pointer proximity repels and drags particles; damped springs restore the word.
 */
(() => {
  'use strict';
  if (customElements.get('sugar-intro')) return;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const easeOut = value => 1 - Math.pow(1 - clamp(value, 0, 1), 3);
  const smoothstep = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const random = (min, max) => min + Math.random() * (max - min);
  const PALETTE = ['#C6FF00', '#C6FF00', '#B8E600', '#C6FF00', '#FFFFFF'];

  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        position: fixed; inset: 0; z-index: 2147483647;
        display: block; background: #000; color: #fff;
        font-family: Arial, "Microsoft YaHei", sans-serif;
        -webkit-tap-highlight-color: transparent;
        isolation: isolate; contain: layout paint style;
      }
      *, *::before, *::after { box-sizing: border-box; }
      .scene { position: absolute; inset: 0; overflow: hidden; outline: none; touch-action: none; }
      canvas { display: block; width: 100%; height: 100%; pointer-events: none; }
      .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0;
        margin: -1px; overflow: hidden; clip-path: inset(50%);
        white-space: nowrap; border: 0;
      }
      button {
        position: absolute; left: 50%; top: 78%;
        transform: translate(-50%, -50%);
        display: grid; place-items: center; width: 128px; height: 46px;
        padding: 0 22px; margin: 0; border: 1px solid #B8E600;
        border-radius: 999px; background: transparent; color: #C6FF00;
        font: 400 16px/1 Arial, "Microsoft YaHei", sans-serif;
        letter-spacing: .12em; text-indent: .12em; cursor: pointer;
        appearance: none; touch-action: manipulation;
      }
      button:focus-visible { outline: 2px solid #fff; outline-offset: 6px; }
      button:disabled { cursor: default; }
      @media (max-width: 767px) {
        button { width: 116px; height: 44px; font-size: 15px; }
      }
      @media (max-height: 440px) {
        button { height: 38px; }
      }
    </style>
    <div class="scene" role="dialog" aria-modal="true" aria-labelledby="intro-title" tabindex="-1">
      <h1 id="intro-title" class="sr-only">SUGAR</h1>
      <canvas aria-hidden="true"></canvas>
      <button type="button" aria-label="进入首页">进入</button>
    </div>`;

  class SugarIntro extends HTMLElement {
    connectedCallback() {
      if (this._connected) return;
      this._connected = true;
      const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' });
      shadow.replaceChildren(template.content.cloneNode(true));
      this.style.opacity = '1';
      this._canvas = this.shadowRoot.querySelector('canvas');
      this._context = this._canvas.getContext('2d', { alpha: false });
      this._scene = this.shadowRoot.querySelector('.scene');
      this._button = this.shadowRoot.querySelector('button');
      this._time = 0;
      this._state = 'scatter';
      this._particles = [];
      this._width = this._height = this._dpr = 0;
      this._renderCount = 0;
      this._renderCost = 0;
      this._pointer = { active: false, x: 0, y: 0, vx: 0, vy: 0, time: 0 };
      this._activePointerId = null;
      this._pointerInRange = false;
      this._interactionEnergy = 0;
      this._lastPhysicsTime = 0;
      this._lastNow = performance.now();
      this._lastPaint = -100;
      this._needsResize = true;
      this._previousFocus = document.activeElement;
      this._previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Inert the page behind the modal, preserving existing inert attributes.
      let branch = this;
      while (branch.parentElement && branch.parentElement !== document.body) branch = branch.parentElement;
      this._blocked = [...document.body.children]
        .filter(node => node !== branch && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName))
        .map(node => ({ node, inert: node.inert }));
      this._blocked.forEach(({ node }) => { node.inert = true; });
      this._onEnter = () => this.enter();
      this._onResize = () => {
        this._needsResize = true;
        this._clearPointer();
      };
      this._onVisibility = () => {
        cancelAnimationFrame(this._raf);
        this._raf = null;
        this._clearPointer();
        if (!document.hidden && this._connected) {
          this._lastNow = performance.now();
          this._raf = requestAnimationFrame(this._tick);
        }
      };
      this._onKeydown = event => {
        if (event.key === 'Tab') {
          event.preventDefault();
          if (!this._button.disabled) this._button.focus({ preventScroll: true });
        }
      };
      this._onPointerMove = event => {
        if (!event.isPrimary || this._state === 'exiting') return;
        if (event.pointerType === 'touch' && event.pointerId !== this._activePointerId) return;
        this._updatePointer(event);
      };
      this._onPointerDown = event => {
        if (!event.isPrimary || this._state === 'exiting' || event.composedPath().includes(this._button)) return;
        if (event.pointerType !== 'mouse') {
          this._activePointerId = event.pointerId;
          this._scene.setPointerCapture(event.pointerId);
        }
        this._updatePointer(event);
      };
      this._onPointerEnd = event => {
        if (event.pointerId === this._activePointerId) this._clearPointer();
      };
      this._onPointerLeave = event => {
        if (event.pointerType === 'mouse') this._clearPointer();
      };
      this._onBlur = () => this._clearPointer();
      this._button.addEventListener('click', this._onEnter);
      this._scene.addEventListener('keydown', this._onKeydown);
      this._scene.addEventListener('pointermove', this._onPointerMove, { passive: true });
      this._scene.addEventListener('pointerdown', this._onPointerDown, { passive: true });
      this._scene.addEventListener('pointerup', this._onPointerEnd, { passive: true });
      this._scene.addEventListener('pointercancel', this._onPointerEnd, { passive: true });
      this._scene.addEventListener('lostpointercapture', this._onPointerEnd, { passive: true });
      this._scene.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
      window.addEventListener('blur', this._onBlur);
      window.addEventListener('resize', this._onResize, { passive: true });
      window.visualViewport?.addEventListener('resize', this._onResize, { passive: true });
      document.addEventListener('visibilitychange', this._onVisibility);
      this._scene.focus({ preventScroll: true });
      this._tick = this._tick.bind(this);
      if (!document.hidden) this._raf = requestAnimationFrame(this._tick);
    }

    _updatePointer(event) {
      // Input can arrive before the first animation frame has measured the host.
      if (!this._width || !this._height) return;
      const pointer = this._pointer;
      const now = performance.now();
      const x = event.clientX - this._originX;
      const y = event.clientY - this._originY;
      const dt = clamp((now - pointer.time) / 1000, .008, .08);
      if (pointer.active) {
        pointer.vx = pointer.vx * .35 + clamp((x - pointer.x) / dt, -1800, 1800) * .65;
        pointer.vy = pointer.vy * .35 + clamp((y - pointer.y) / dt, -1800, 1800) * .65;
      } else {
        pointer.vx = pointer.vy = 0;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.time = now;
      pointer.active = true;
      const bounds = this._bounds;
      const radius = this._interactionRadius;
      this._pointerInRange = !!bounds && x > bounds.left - radius && x < bounds.right + radius
        && y > bounds.top - radius && y < bounds.bottom + radius;
    }

    _clearPointer() {
      this._pointer.active = false;
      this._pointer.vx = this._pointer.vy = 0;
      this._pointerInRange = false;
      const id = this._activePointerId;
      this._activePointerId = null;
      if (id !== null && this._scene.hasPointerCapture(id)) this._scene.releasePointerCapture(id);
    }

    _sampleTargets(count) {
      const width = this._width;
      const height = this._height;
      const mask = document.createElement('canvas');
      mask.width = Math.ceil(width);
      mask.height = Math.ceil(height);
      const context = mask.getContext('2d', { willReadFrequently: true });
      const font = size => `900 ${size}px Arial, Helvetica, sans-serif`;
      const maxWidth = width * .76;
      let size = Math.min(width * .3, height * .35);
      context.font = font(size);
      size *= maxWidth / context.measureText('SUGAR').width;
      size = Math.min(size, height * .32);
      context.font = font(size);
      context.textBaseline = 'alphabetic';
      context.textAlign = 'left';
      context.fillStyle = '#fff';
      const metrics = context.measureText('SUGAR');
      const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
      const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      const centerY = height * .43;
      const x = (width - inkWidth) / 2 + metrics.actualBoundingBoxLeft;
      const baseline = centerY + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      context.fillText('SUGAR', x, baseline);
      const left = Math.floor(x - metrics.actualBoundingBoxLeft);
      const top = Math.floor(baseline - metrics.actualBoundingBoxAscent);
      const right = Math.ceil(left + inkWidth);
      const bottom = Math.ceil(top + inkHeight);
      this._bounds = { left, top, right, bottom, width: inkWidth, height: inkHeight };
      const pixels = context.getImageData(0, 0, mask.width, mask.height).data;
      let inkArea = 0;
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          if (pixels[(y * mask.width + x) * 4 + 3] > 160) inkArea++;
        }
      }
      // Stagger the rows to avoid an artificial square-grid appearance.
      let spacing = Math.sqrt(inkArea / (count * 1.12));
      let points = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        points = [];
        let row = 0;
        for (let y = top + spacing / 2; y < bottom; y += spacing, row++) {
          for (let x = left + spacing / 2 + (row % 2) * spacing / 2; x < right; x += spacing) {
            const px = Math.round(x + random(-.22, .22) * spacing);
            const py = Math.round(y + random(-.22, .22) * spacing);
            if (pixels[(py * mask.width + px) * 4 + 3] > 160) points.push({ x: px, y: py });
          }
        }
        if (points.length >= count) break;
        spacing *= .88;
      }
      // Spatially distributed selection keeps every letter and thin stroke intact.
      const selected = [];
      const stride = points.length / count;
      for (let i = 0; i < count; i++) selected.push(points[Math.min(points.length - 1, Math.floor(i * stride))]);
      for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
      }
      mask.width = mask.height = 0;
      return selected;
    }

    _newParticle(target) {
      const mobile = this._width < 768;
      const bright = Math.random();
      return {
        x: random(0, this._width), y: random(0, this._height),
        tx: target.x, ty: target.y,
        radius: mobile ? random(1, 2.05) : (bright > .93 ? random(2.7, 4) : random(1, 2.65)),
        color: bright > .94 ? 4 : Math.floor(random(0, 4)),
        brightness: random(.65, 1),
        phase: random(0, Math.PI * 2),
        frequency: random(.55, 1.25),
        drift: random(.5, mobile ? .9 : 1.55),
        vx: random(-13, 13), vy: random(-13, 13),
        offsetX: 0, offsetY: 0, springVx: 0, springVy: 0,
        response: random(.5, 1),
        delay: random(0, 180), duration: random(2460, 2640)
      };
    }

    _layout() {
      this._needsResize = false;
      const rect = this.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (this._width === width && this._height === height && this._dpr === dpr) return;
      const oldWidth = this._width || width;
      const oldHeight = this._height || height;
      const firstLayout = !this._width;
      this._width = width;
      this._height = height;
      this._dpr = dpr;
      this._originX = rect.left;
      this._originY = rect.top;
      this._interactionRadius = width < 768 ? clamp(width * .15, 46, 74) : clamp(width * .09, 100, 156);
      this._canvas.width = Math.round(width * dpr);
      this._canvas.height = Math.round(height * dpr);
      this._context?.setTransform(dpr, 0, 0, dpr, 0, 0);
      // A resize during dismissal must not create particles without exit vectors.
      if (!firstLayout && this._state === 'exiting') {
        const scaleX = width / oldWidth;
        const scaleY = height / oldHeight;
        for (const p of this._particles) {
          p.exitX *= scaleX;
          p.exitY *= scaleY;
          p.exitVx *= scaleX;
          p.exitVy *= scaleY;
        }
        return;
      }
      const mobile = width < 768;
      const count = mobile
        ? Math.round(clamp(width * height / 480, 480, 850))
        : Math.round(clamp(width * height / 760, 1000, 1800));
      const targets = this._sampleTargets(count);
      const previous = this._particles;
      this._particles = targets.map((target, i) => {
        const particle = previous[i] || this._newParticle(target);
        if (!firstLayout) {
          particle.x *= width / oldWidth;
          particle.y *= height / oldHeight;
          particle.fromX = particle.x;
          particle.fromY = particle.y;
          particle.delay = random(0, 75);
          particle.duration = 580;
        }
        particle.tx = target.x;
        particle.ty = target.y;
        particle.offsetX = particle.offsetY = particle.springVx = particle.springVy = 0;
        if (firstLayout) {
          particle.fromX = particle.x + particle.vx * .36;
          particle.fromY = particle.y + particle.vy * .36;
          particle.startX = particle.x;
          particle.startY = particle.y;
        }
        return particle;
      });
      if (!firstLayout && this._state !== 'exiting') {
        this._state = 'resizing';
        this._resizeStart = this._time;
      }
    }

    _tick(now) {
      if (!this._connected || document.hidden) return;
      this._time += Math.min(64, Math.max(0, now - this._lastNow));
      this._lastNow = now;
      if (this._needsResize) this._layout();
      const resting = this._state === 'idle' && !this._pointerInRange && this._interactionEnergy < .12;
      const frameInterval = resting ? 1000 / 30 : 1000 / 60;
      if (now - this._lastPaint >= frameInterval - 1) {
        this._lastPaint = now;
        this._render();
      }
      if (this._connected) this._raf = requestAnimationFrame(this._tick);
    }

    _render() {
      const started = performance.now();
      const ctx = this._context;
      if (!ctx) return;
      const t = this._time;
      const seconds = t / 1000;
      const dt = clamp((t - this._lastPhysicsTime) / 1000, 0, .064);
      this._lastPhysicsTime = t;
      // Exact damped spring integration stays stable at varying frame rates.
      const damping = 10.2;
      const frequency = 9.65;
      const decay = Math.exp(-damping * dt);
      const cos = Math.cos(frequency * dt);
      const sin = Math.sin(frequency * dt);
      const pointer = this._pointer;
      const radius = this._interactionRadius;
      const strength = radius * (this._width < 768 ? .38 : .4);
      const pointerPull = this._width < 768 ? .01 : .015;
      let interactionEnergy = 0;
      pointer.vx *= Math.exp(-9 * dt);
      pointer.vy *= Math.exp(-9 * dt);
      const exiting = this._state === 'exiting';
      const exitProgress = exiting ? clamp((t - this._exitStart) / 900, 0, 1) : 0;
      if (exiting && exitProgress >= 1) {
        this._finish();
        return;
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this._width, this._height);
      let complete = true;
      for (const p of this._particles) {
        if (exiting) {
          const travel = exitProgress * .9 * (1 + exitProgress * .65);
          p.x = p.exitX + p.exitVx * travel;
          p.y = p.exitY + p.exitVy * travel;
        } else if (this._state === 'resizing') {
          const progress = clamp((t - this._resizeStart - p.delay) / p.duration, 0, 1);
          const eased = easeOut(progress);
          p.x = p.fromX + (p.tx - p.fromX) * eased;
          p.y = p.fromY + (p.ty - p.fromY) * eased;
          if (progress < 1) complete = false;
        } else if (t < 360) {
          p.x = p.startX + p.vx * seconds;
          p.y = p.startY + p.vy * seconds;
          complete = false;
        } else if (this._state !== 'idle') {
          this._state = 'assembling';
          const progress = clamp((t - 360 - p.delay) / p.duration, 0, 1);
          const eased = easeOut(progress);
          p.x = p.fromX + (p.tx - p.fromX) * eased;
          p.y = p.fromY + (p.ty - p.fromY) * eased;
          if (progress < 1) complete = false;
        } else {
          // Home targets never move. Only a local, reversible spring offset responds.
          const homeX = p.tx + Math.sin(seconds * .46 + p.phase) * p.drift;
          const homeY = p.ty + Math.cos(seconds * .37 + p.phase * 1.31) * p.drift;
          let goalX = 0;
          let goalY = 0;
          if (pointer.active && this._pointerInRange) {
            const dx = homeX - pointer.x;
            const dy = homeY - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < radius) {
              const influence = smoothstep(1 - distance / radius);
              const nx = distance > .1 ? dx / distance : Math.cos(p.phase);
              const ny = distance > .1 ? dy / distance : Math.sin(p.phase);
              goalX = (nx * strength + pointer.vx * pointerPull) * influence * p.response;
              goalY = (ny * strength + pointer.vy * pointerPull) * influence * p.response;
              const magnitude = Math.hypot(goalX, goalY);
              const limit = radius * .72;
              if (magnitude > limit) {
                goalX *= limit / magnitude;
                goalY *= limit / magnitude;
              }
            }
          }
          const deltaX = p.offsetX - goalX;
          const deltaY = p.offsetY - goalY;
          const springX = (p.springVx + damping * deltaX) / frequency;
          const springY = (p.springVy + damping * deltaY) / frequency;
          p.offsetX = goalX + decay * (deltaX * cos + springX * sin);
          p.offsetY = goalY + decay * (deltaY * cos + springY * sin);
          p.springVx = decay * (p.springVx * cos - (damping * springX + frequency * deltaX) * sin);
          p.springVy = decay * (p.springVy * cos - (damping * springY + frequency * deltaY) * sin);
          interactionEnergy = Math.max(interactionEnergy, Math.abs(p.offsetX), Math.abs(p.offsetY),
            Math.abs(p.springVx) * .06, Math.abs(p.springVy) * .06);
          p.x = homeX + p.offsetX;
          p.y = homeY + p.offsetY;
        }
      }
      this._interactionEnergy = interactionEnergy;
      if (!exiting && complete && this._state !== 'idle') this._state = 'idle';
      // Five color batches keep fillStyle changes cheap. No per-particle shadow blur.
      for (let color = 0; color < PALETTE.length; color++) {
        ctx.fillStyle = PALETTE[color];
        for (const p of this._particles) {
          if (p.color !== color) continue;
          const radius = p.radius * (1 - exitProgress * .55);
          if (p.x < -radius || p.x > this._width + radius || p.y < -radius || p.y > this._height + radius) continue;
          const twinkle = .8 + .2 * Math.sin(seconds * p.frequency + p.phase);
          ctx.globalAlpha = p.brightness * twinkle * Math.pow(1 - exitProgress, 1.25);
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (exiting) {
        const textAlpha = 1 - smoothstep(exitProgress / .38);
        this._button.style.opacity = textAlpha;
        this.style.opacity = 1 - smoothstep((exitProgress - .12) / .88);
      }
      this._renderCount++;
      this._renderCost += performance.now() - started;
    }

    enter() {
      if (!this._connected || this._state === 'exiting' || this._state === 'done') return;
      this._state = 'exiting';
      this._clearPointer();
      this._exitStart = this._time;
      this._button.disabled = true;
      for (const p of this._particles) {
        const dx = p.x - this._width / 2;
        const dy = p.y - this._height * .43;
        const angle = Math.atan2(dy, dx) + random(-.055, .055);
        const speed = random(.6, 1.6) * Math.max(this._width, this._height);
        p.exitX = p.x;
        p.exitY = p.y;
        p.exitVx = Math.cos(angle) * speed;
        p.exitVy = Math.sin(angle) * speed;
      }
    }

    _finish() {
      this._state = 'done';
      this.remove();
      const focusTarget = document.querySelector('[data-intro-focus]') || this._previousFocus;
      focusTarget?.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('sugar:intro-complete', { detail: { duration: 900 } }));
    }

    disconnectedCallback() {
      if (!this._connected) return;
      this._connected = false;
      cancelAnimationFrame(this._raf);
      this._button.removeEventListener('click', this._onEnter);
      this._scene.removeEventListener('keydown', this._onKeydown);
      this._clearPointer();
      this._scene.removeEventListener('pointermove', this._onPointerMove);
      this._scene.removeEventListener('pointerdown', this._onPointerDown);
      this._scene.removeEventListener('pointerup', this._onPointerEnd);
      this._scene.removeEventListener('pointercancel', this._onPointerEnd);
      this._scene.removeEventListener('lostpointercapture', this._onPointerEnd);
      this._scene.removeEventListener('pointerleave', this._onPointerLeave);
      window.removeEventListener('blur', this._onBlur);
      window.removeEventListener('resize', this._onResize);
      window.visualViewport?.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVisibility);
      document.body.style.overflow = this._previousOverflow;
      this._blocked.forEach(({ node, inert }) => { node.inert = inert; });
      this._canvas.width = this._canvas.height = 0;
      this._particles = [];
    }

    // Read-only, small diagnostics object for integration and runtime verification.
    get diagnostics() {
      return {
        phase: this._state, activeTimeMs: Math.round(this._time),
        particleCount: this._particles.length,
        viewport: { width: this._width, height: this._height, dpr: this._dpr },
        wordBounds: { ...this._bounds },
        interaction: {
          pointerActive: this._pointer.active, radius: this._interactionRadius,
          displacement: this._interactionEnergy
        },
        renderedFrames: this._renderCount,
        averageDrawMs: this._renderCount ? this._renderCost / this._renderCount : 0
      };
    }
  }

  customElements.define('sugar-intro', SugarIntro);
})();
