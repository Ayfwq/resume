(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Welcome stays clean for a moment, then dissolves into the resume. */
  const welcome = $("#welcome");
  const enterSite = () => {
    if (!welcome) return;
    welcome.classList.add("is-exiting");
    document.body.classList.remove("is-intro");
  };
  if (reduceMotion) enterSite();
  else window.setTimeout(enterSite, 1200);

  /* Staggered reveals and stat counters. */
  const revealEls = $$(".reveal");
  revealEls.forEach((el) => {
    if (el.dataset.delay) el.style.setProperty("--d", el.dataset.delay);
  });

  function countUp(scope) {
    $$('[data-count]', scope).forEach((el) => {
      const target = Number.parseInt(el.dataset.count, 10) || 0;
      if (reduceMotion) { el.textContent = target; return; }
      const start = performance.now();
      const duration = 900;
      const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        countUp(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
})();
