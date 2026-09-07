/* =========================================================
   Personal Resume · main.js
   核心：滚动进度 p(0→1) 驱动 Welcome 层淡出/模糊/放大，
        正文顶部用透明→背景色的渐变承接，形成「渐变进入」。
   ========================================================= */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------------- 1. 标题逐字拆分 ---------------- */
  const title = $("#welcomeTitle");
  if (title) {
    const text = title.dataset.text || title.textContent;
    title.textContent = "";
    [...text].forEach((ch, i) => {
      const s = document.createElement("span");
      s.textContent = ch;
      s.style.setProperty("--i", i);
      title.appendChild(s);
    });
  }

  /* ---------------- 2. 滚动驱动：欢迎页 → 正文 ---------------- */
  const welcome = $("#welcome");
  const wipe = $("#wipe");
  const nav = $("#nav");
  const bar = $("#progressBar");

  let ticking = false;

  function update() {
    ticking = false;
    const vh = window.innerHeight || 1;
    const y = window.scrollY || window.pageYOffset || 0;
    const p = clamp(y / vh);

    if (welcome) {
      welcome.style.setProperty("--p", p.toFixed(4));
      // 完全滚过后彻底隐藏，省性能
      if (p >= 0.999) welcome.classList.add("is-gone");
      else welcome.classList.remove("is-gone");
    }

    // 过渡光晕：p=0.5 时最强，两端为 0
    if (wipe) wipe.style.setProperty("--w", (1 - Math.abs(2 * p - 1)).toFixed(4));

    if (nav) nav.classList.toggle("is-visible", y > vh * 0.35);

    if (bar) {
      const max = document.documentElement.scrollHeight - vh;
      bar.style.width = (max > 0 ? (y / max) * 100 : 0).toFixed(2) + "%";
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  /* ---------------- 3. ENTER 按钮 / 滚动进入 ---------------- */
  const enter = $("#enterBtn");
  if (enter) {
    enter.addEventListener("click", () => {
      window.scrollTo({
        top: window.innerHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
  }

  /* ---------------- 4. 元素进场动画 ---------------- */
  const revealEls = $$(".reveal");
  revealEls.forEach((el) => {
    if (el.dataset.delay) el.style.setProperty("--d", el.dataset.delay);
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            countUp(e.target);
            scramble(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  /* 数字滚动 */
  function countUp(scope) {
    $$("[data-count]", scope).forEach((el) => {
      const target = parseInt(el.dataset.count, 10) || 0;
      if (reduceMotion) { el.textContent = target; return; }
      const dur = 1200;
      const t0 = performance.now();
      (function step(t) {
        const k = clamp((t - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  /* 文字乱码还原 */
  function scramble(scope) {
    const el = $("[data-text]", scope);
    if (!el || el.dataset.done) return;
    el.dataset.done = "1";
    const finalTxt = el.dataset.text;
    if (reduceMotion) return;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_";
    let frame = 0;
    const total = 26;
    (function tick() {
      let out = "";
      for (let i = 0; i < finalTxt.length; i++) {
        if (frame / total > i / finalTxt.length) out += finalTxt[i];
        else out += chars[(Math.random() * chars.length) | 0];
      }
      el.textContent = out;
      if (++frame <= total) setTimeout(tick, 34);
      else el.textContent = finalTxt;
    })();
  }

  /* ---------------- 5. 星点画布 ---------------- */
  const cvs = $("#stars");
  if (cvs && !reduceMotion) {
    const ctx = cvs.getContext("2d");
    let stars = [];
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      w = cvs.clientWidth; h = cvs.clientHeight;
      cvs.width = w * dpr; cvs.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 14000);
      stars = Array.from({ length: Math.min(n, 130) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random() * 0.6 + 0.2,
        s: Math.random() * 0.18 + 0.03,
        t: Math.random() * Math.PI * 2,
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        st.y += st.s;
        st.t += 0.02;
        if (st.y > h) st.y = -2;
        const alpha = st.a * (0.55 + 0.45 * Math.sin(st.t));
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,215,255,${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    // 离开欢迎页后停掉动画
    window.addEventListener("scroll", () => {
      const gone = window.scrollY > window.innerHeight * 1.05;
      if (gone && raf) { cancelAnimationFrame(raf); raf = 0; }
      else if (!gone && !raf) { raf = requestAnimationFrame(draw); }
    }, { passive: true });
  }

  /* ---------------- 6. 鼠标光晕 + 极光视差 ---------------- */
  if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
    const glow = $("#cursorGlow");
    const aurora = $(".aurora");
    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let cx = tx, cy = ty, ax = 0, ay = 0;

    window.addEventListener("mousemove", (e) => {
      tx = e.clientX; ty = e.clientY;
      document.body.classList.add("has-cursor");
    }, { passive: true });

    (function loop() {
      cx += (tx - cx) * 0.09;
      cy += (ty - cy) * 0.09;
      if (glow) glow.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;

      if (aurora) {
        ax += ((tx / window.innerWidth - 0.5) * 40 - ax) * 0.05;
        ay += ((ty / window.innerHeight - 0.5) * 30 - ay) * 0.05;
        aurora.style.transform = `translate3d(${ax}px, ${ay}px, 0)`;
      }
      requestAnimationFrame(loop);
    })();
  }

  /* ---------------- 7. 杂项 ---------------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  document.body.classList.remove("is-loading");
  window.addEventListener("load", update);
})();
