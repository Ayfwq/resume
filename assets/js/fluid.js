(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const toggle = document.querySelector(".motion-toggle");
  const inkCanvas = document.getElementById("fluid-background");
  const canvases = [
    { canvas: inkCanvas }
  ];
  const palette = [
    [0.12, 0.72, 0.86], [0.24, 0.42, 1.0],
    [0.65, 0.28, 0.98], [1.0, 0.34, 0.68]
  ];
  function pigmentAt(phase) {
    const position = ((phase % palette.length) + palette.length) % palette.length;
    const index = Math.floor(position);
    const fraction = position - index;
    const blend = fraction * fraction * (3 - 2 * fraction);
    return palette[index].map(function (channel, i) {
      return channel + (palette[(index + 1) % palette.length][i] - channel) * blend;
    });
  }
  let enabled = !reducedMotion.matches;
  let renderers = [];
  let frame = 0;
  let previousFrame = 0;

  // The velocity and pigment fields are advected independently. A pressure
  // solve keeps the cursor wake flowing instead of behaving like a paint stamp.
  const vertex = `#version 300 es
    layout(location = 0) in vec2 aPosition;
    out vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;
  const fragmentHeader = `#version 300 es
    precision highp float;
    precision highp sampler2D;
    in vec2 vUv;
    out vec4 fragColor;
    uniform vec2 uTexel;
    vec4 bilerp(sampler2D field, vec2 uv, vec2 texel) {
      vec2 pos = uv / texel - 0.5;
      vec2 cell = floor(pos);
      vec2 f = fract(pos);
      vec4 a = texture(field, (cell + vec2(0.5, 0.5)) * texel);
      vec4 b = texture(field, (cell + vec2(1.5, 0.5)) * texel);
      vec4 c = texture(field, (cell + vec2(0.5, 1.5)) * texel);
      vec4 d = texture(field, (cell + vec2(1.5, 1.5)) * texel);
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }`;
  const sources = {
    splat: `uniform sampler2D uTarget;
      uniform vec2 uPoint;
      uniform vec3 uColor;
      uniform float uRadius;
      uniform float uAspect;
      void main() {
        vec2 p = vUv - uPoint;
        p.x *= uAspect;
        vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
        fragColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
      }`,
    advect: `uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 uSourceTexel;
      uniform float uDt;
      uniform float uDecay;
      void main() {
        vec2 velocity = bilerp(uVelocity, vUv, uTexel).xy;
        vec2 coord = vUv - uDt * velocity * uTexel;
        fragColor = uDecay * bilerp(uSource, coord, uSourceTexel);
      }`,
    curl: `uniform sampler2D uVelocity;
      void main() {
        float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
        float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
        float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
        float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
        fragColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
      }`,
    vorticity: `uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float uDt;
      void main() {
        float l = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
        float r = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
        float b = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
        float t = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
        float c = texture(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
        force /= length(force) + 0.0001;
        force *= 17.0 * c;
        force.y *= -1.0;
        vec2 velocity = texture(uVelocity, vUv).xy + force * uDt;
        fragColor = vec4(clamp(velocity, -400.0, 400.0), 0.0, 1.0);
      }`,
    divergence: `uniform sampler2D uVelocity;
      void main() {
        float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
        float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
        float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
        float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
        vec2 c = texture(uVelocity, vUv).xy;
        if (vUv.x < uTexel.x) l = -c.x;
        if (vUv.x > 1.0 - uTexel.x) r = -c.x;
        if (vUv.y < uTexel.y) b = -c.y;
        if (vUv.y > 1.0 - uTexel.y) t = -c.y;
        fragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
      }`,
    decay: `uniform sampler2D uSource;
      void main() { fragColor = texture(uSource, vUv) * 0.75; }`,
    pressure: `uniform sampler2D uPressure;
      uniform sampler2D uDivergence;
      void main() {
        float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
        float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
        float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
        float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
        float d = texture(uDivergence, vUv).x;
        fragColor = vec4((l + r + b + t - d) * 0.25, 0.0, 0.0, 1.0);
      }`,
    gradient: `uniform sampler2D uPressure;
      uniform sampler2D uVelocity;
      void main() {
        float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
        float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
        float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
        float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
        vec2 velocity = texture(uVelocity, vUv).xy - vec2(r - l, t - b);
        fragColor = vec4(velocity, 0.0, 1.0);
      }`,
    display: `uniform sampler2D uDye;
      uniform sampler2D uVelocity;
      uniform vec2 uDyeTexel;
      uniform float uTime;
      uniform float uAspect;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float value = 0.0, amplitude = 0.5;
        mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p = rotation * p * 2.05 + 7.1;
          amplitude *= 0.5;
        }
        return value;
      }
      vec3 gradientColor(float phase) {
        float stop = fract(phase) * 4.0;
        vec3 cyan = vec3(0.12, 0.72, 0.86);
        vec3 blue = vec3(0.24, 0.42, 1.0);
        vec3 violet = vec3(0.65, 0.28, 0.98);
        vec3 pink = vec3(1.0, 0.34, 0.68);
        float blend = smoothstep(0.0, 1.0, fract(stop));
        if (stop < 1.0) return mix(cyan, blue, blend);
        if (stop < 2.0) return mix(blue, violet, blend);
        if (stop < 3.0) return mix(violet, pink, blend);
        return mix(pink, cyan, blend);
      }
      void main() {
        vec2 uv = vUv;
        vec3 dye = max(bilerp(uDye, uv, uDyeTexel).rgb, vec3(0.0));
        float density = max(dye.r, max(dye.g, dye.b));
        vec2 flow = texture(uVelocity, uv).xy * 0.002;
        vec2 p = vec2(uv.x * uAspect, uv.y) * 8.0;
        float cloud = fbm(p + flow + uTime * 0.05);
        float alpha = min(1.0 - exp(-density * 0.8), 0.48);
        alpha *= smoothstep(0.012, 0.18, density) * (0.65 + 0.35 * cloud);
        vec3 pigment = dye / max(density, 0.0001);
        vec3 gradient = gradientColor(cloud * 1.6 + (uv.x * uAspect + uv.y) * 1.4 + uTime * 0.04);
        vec3 ink = mix(pigment, gradient, 0.65);
        fragColor = vec4(ink * alpha, alpha);
      }`
  };

  function createFluid(canvas) {
    if (!canvas) return null;
    const gl = canvas.getContext("webgl2", {
      alpha: true, premultipliedAlpha: true, depth: false, stencil: false, antialias: false,
      preserveDrawingBuffer: false, powerPreference: "low-power"
    });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
      canvas.hidden = true;
      canvas.dataset.renderer = "static-fallback";
      return null;
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error);
      }
      return shader;
    }
    const vertexShader = compile(gl.VERTEX_SHADER, vertex);
    const programs = {};
    Object.entries(sources).forEach(function ([name, source]) {
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentHeader + source);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      programs[name] = { program: program, uniforms: uniforms };
    });
    gl.deleteShader(vertexShader);

    let aspect = 1, simWidth = 128, simHeight = 128;
    let velocity, dye, pressure, curl, divergence;
    let allocations = [];
    const queue = [];
    let lastPointer = null;
    let lastActivity = 0;
    let settled = true;
    let visible = true;
    let lost = false;

    function fbo(width, height) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Fluid framebuffer unavailable");
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const target = { texture: texture, fbo: framebuffer, width: width, height: height };
      allocations.push(target);
      return target;
    }
    function pair(width, height) {
      return {
        read: fbo(width, height), write: fbo(width, height),
        swap: function () { const t = this.read; this.read = this.write; this.write = t; }
      };
    }
    function render(name, target, values) {
      const p = programs[name];
      gl.useProgram(p.program);
      let unit = 0;
      values.uTexel = [1 / simWidth, 1 / simHeight];
      Object.entries(values).forEach(function ([key, value]) {
        const uniform = p.uniforms[key];
        if (uniform == null) return;
        if (value && value.texture) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, value.texture);
          gl.uniform1i(uniform, unit++);
        } else if (Array.isArray(value)) {
          if (value.length === 2) gl.uniform2fv(uniform, value);
          else if (value.length === 3) gl.uniform3fv(uniform, value);
        } else gl.uniform1f(uniform, value);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
      gl.bindVertexArray(quad);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function splat(x, y, dx, dy, color, amount, radius) {
      render("splat", velocity.write, {
        uTarget: velocity.read, uPoint: [x, y], uColor: [dx, dy, 0],
        uRadius: radius, uAspect: aspect
      });
      velocity.swap();
      render("splat", dye.write, {
        uTarget: dye.read, uPoint: [x, y], uColor: color.map(function (v) { return v * amount; }),
        uRadius: radius, uAspect: aspect
      });
      dye.swap();
    }
    function resetInk() {
      if (lost) return;
      queue.length = 0;
      lastPointer = null;
      gl.clearColor(0, 0, 0, 0);
      allocations.forEach(function (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      settled = true;
    }
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = Math.min(coarsePointer ? 0.85 : 1, 1400 / rect.width);
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width === width && canvas.height === height && velocity) return;
      canvas.width = width;
      canvas.height = height;
      aspect = width / height;
      allocations.forEach(function (f) { gl.deleteTexture(f.texture); gl.deleteFramebuffer(f.fbo); });
      allocations = [];
      const base = coarsePointer ? 84 : 112;
      simWidth = Math.max(32, Math.round(base * Math.sqrt(aspect)));
      simHeight = Math.max(32, Math.round(base / Math.sqrt(aspect)));
      velocity = pair(simWidth, simHeight);
      pressure = pair(simWidth, simHeight);
      curl = fbo(simWidth, simHeight);
      divergence = fbo(simWidth, simHeight);
      dye = pair(simWidth * 3, simHeight * 3);
      resetInk();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener("webglcontextlost", function (event) {
      event.preventDefault();
      lost = true;
      canvas.hidden = true;
      canvas.dataset.renderer = "static-fallback";
    });
    canvas.dataset.renderer = "webgl-fluid";

    return {
      reset: resetInk,
      clearPointer: function () { lastPointer = null; },
      pointer: function (event, burst) {
        if (lost) return;
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = 1 - (event.clientY - rect.top) / rect.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) { lastPointer = null; return; }
        const now = performance.now();
        const old = lastPointer && now - lastPointer.time < 180 ? lastPointer : { x: x, y: y };
        const dx = x - old.x, dy = y - old.y;
        const color = pigmentAt(now / 1100 + x * 1.6 + y * 0.8);
        const count = Math.min(4, Math.max(1, Math.ceil(Math.hypot(dx * aspect, dy) * 32)));
        for (let i = 1; i <= count; i++) {
          queue.push({
            x: old.x + dx * i / count, y: old.y + dy * i / count,
            dx: Math.max(-180, Math.min(180, dx * 5800)),
            dy: Math.max(-180, Math.min(180, dy * 5800)),
            color: color, amount: burst ? 1.1 : 0.8,
            radius: Math.pow((burst ? 48 : 38) / rect.height, 2)
          });
        }
        if (queue.length > 12) queue.splice(0, queue.length - 12);
        lastPointer = { x: x, y: y, time: now };
        lastActivity = now / 1000;
        settled = false;
      },
      step: function (dt, time) {
        if (!visible || lost || !velocity) return;
        if (time - lastActivity > 3.2) {
          if (!settled) resetInk();
          return;
        }
        while (queue.length) {
          const p = queue.shift();
          splat(p.x, p.y, p.dx, p.dy, p.color, p.amount, p.radius);
        }
        render("advect", velocity.write, {
          uVelocity: velocity.read, uSource: velocity.read,
          uSourceTexel: [1 / simWidth, 1 / simHeight], uDt: dt, uDecay: Math.exp(-dt * 1.2)
        });
        velocity.swap();
        render("curl", curl, { uVelocity: velocity.read });
        render("vorticity", velocity.write, { uVelocity: velocity.read, uCurl: curl, uDt: dt });
        velocity.swap();
        render("divergence", divergence, { uVelocity: velocity.read });
        render("decay", pressure.write, { uSource: pressure.read });
        pressure.swap();
        for (let i = 0; i < (coarsePointer ? 6 : 9); i++) {
          render("pressure", pressure.write, { uPressure: pressure.read, uDivergence: divergence });
          pressure.swap();
        }
        render("gradient", velocity.write, { uVelocity: velocity.read, uPressure: pressure.read });
        velocity.swap();
        render("advect", dye.write, {
          uVelocity: velocity.read, uSource: dye.read,
          uSourceTexel: [1 / dye.read.width, 1 / dye.read.height],
          uDt: dt, uDecay: Math.exp(-dt * 1.3)
        });
        dye.swap();
        render("display", null, {
          uDye: dye.read, uVelocity: velocity.read,
          uDyeTexel: [1 / dye.read.width, 1 / dye.read.height],
          uTime: time, uAspect: aspect
        });
      }
    };
  }

  function clearPointerInteraction() {
    renderers.forEach(function (renderer) { renderer.clearPointer(); });
  }

  function initialize() {
    if (renderers.length) return;
    canvases.forEach(function (item) {
      try {
        const renderer = createFluid(item.canvas);
        if (renderer) renderers.push(renderer);
      } catch (error) {
        if (item.canvas) {
          item.canvas.hidden = true;
          item.canvas.dataset.renderer = "static-fallback";
        }
        console.warn("Fluid ink animation is unavailable.", error.message);
      }
    });
  }
  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (now - previousFrame < 1000 / (coarsePointer ? 30 : 45)) return;
    const dt = Math.min((now - previousFrame) / 1000, 0.035);
    previousFrame = now;
    renderers.forEach(function (renderer) { renderer.step(dt, now / 1000); });
  }
  function syncMotion() {
    document.body.classList.toggle("motion-paused", !enabled);
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(enabled));
      toggle.setAttribute("aria-label", enabled ? "暂停水墨交互" : "开启水墨交互");
      toggle.title = enabled ? "暂停水墨交互" : "开启水墨交互";
      const label = toggle.querySelector("span");
      if (label) label.textContent = enabled ? "水墨交互" : "交互已暂停";
    }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (!enabled || document.hidden) {
      clearPointerInteraction();
      renderers.forEach(function (renderer) { renderer.reset(); });
    }
    if (enabled && !document.hidden) {
      initialize();
      previousFrame = performance.now();
      frame = requestAnimationFrame(animate);
    }
  }
  if (toggle) toggle.addEventListener("click", function () { enabled = !enabled; syncMotion(); });
  reducedMotion.addEventListener("change", function (event) { enabled = !event.matches; syncMotion(); });
  document.addEventListener("visibilitychange", syncMotion);
  window.addEventListener("pointermove", function (event) {
    if (enabled) {
      renderers.forEach(function (renderer) { renderer.pointer(event, false); });
    }
  }, { passive: true });
  window.addEventListener("pointerdown", function (event) {
    if (enabled) {
      renderers.forEach(function (renderer) { renderer.pointer(event, true); });
    }
  }, { passive: true });

  window.addEventListener("pointerout", function (event) {
    if (!event.relatedTarget) clearPointerInteraction();
  }, { passive: true });
  window.addEventListener("pointerup", function (event) {
    if (event.pointerType === "touch") clearPointerInteraction();
  }, { passive: true });
  window.addEventListener("blur", clearPointerInteraction);
  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    const reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          reveal.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06 });
    document.querySelectorAll(".section-heading, .project-card, .timeline-item, .education-item, .skill-stack article, .research-card, .honor-item").forEach(function (element) {
      element.classList.add("reveal-ready");
      reveal.observe(element);
    });
  }
  const progress = document.querySelector(".reading-progress");
  let scrollFrame = 0;
  function updateProgress() {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = "scaleX(" + (height > 0 ? window.scrollY / height : 0) + ")";
    scrollFrame = 0;
  }
  window.addEventListener("scroll", function () {
    clearPointerInteraction();
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateProgress);
  }, { passive: true });
  window.addEventListener("resize", function () {
    clearPointerInteraction();
    updateProgress();
  }, { passive: true });
  updateProgress();
  syncMotion();
})();
