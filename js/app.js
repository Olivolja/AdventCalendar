/*
 * Advent calendar behaviour. All settings live in js/config.js.
 */
(function () {
  "use strict";

  const config = window.ADVENT_CONFIG || {};
  const TOTAL_DAYS = 24;
  const DECEMBER = 11;
  const YEAR = Number.parseInt(config.year, 10) || new Date().getFullYear();
  const TITLE = config.title || "Julkalender";
  const LOCALE = "sv-SE";

  // Fixed shuffled order so the doors are scattered like on a real advent calendar.
  const DOOR_ORDER = [7, 15, 1, 20, 11, 4, 18, 9, 23, 2, 13, 6, 16, 24, 10, 3, 21, 8, 14, 19, 5, 12, 17, 22];
  const DOOR_STYLES = 5;
  const DOOR_OPEN_MS = 1200;
  const ICONS = ["snowflake", "tree", "bell", "gift", "ornament", "candy", "heart", "candle", "star"];
  const LIGHT_COLORS = ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#f15bb5"];
  const SPARKLE_COLORS = ["#ffd166", "#fff3c4", "#ff6b81", "#7ae7c7", "#ffffff"];
  const CONFETTI_COLORS = ["#e0364f", "#f5c96a", "#2fbf71", "#4cc9f0", "#ffffff"];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (selector) => document.querySelector(selector);
  const calendar = $("#calendar");
  const modal = $("#photo-modal");
  const frame = modal.querySelector(".polaroid-frame");
  const photoBox = modal.querySelector(".polaroid__photo");
  const photo = modal.querySelector(".polaroid__img");
  const photoTitle = $("#photo-title");
  const photoText = modal.querySelector(".polaroid__text");
  const missingPath = modal.querySelector(".polaroid__missing-path");
  const closeButton = modal.querySelector(".polaroid__close");
  const toast = $(".toast");
  const toastText = toast.querySelector(".toast__text");
  const fxLayer = $(".fx");

  /* ---------- Time ---------- */

  const previewStart = parseLocalDate(config.previewDate);
  const clockOffset = previewStart ? previewStart.getTime() - Date.now() : 0;
  const now = () => new Date(Date.now() + clockOffset);
  const unlockTime = (day) => new Date(YEAR, DECEMBER, day);
  const isUnlocked = (day, at = now()) => at >= unlockTime(day);
  const dayLabel = (day) => unlockTime(day).toLocaleDateString(LOCALE, { day: "numeric", month: "long" });

  // Parses "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as local time (new Date("YYYY-MM-DD") would be UTC).
  function parseLocalDate(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(String(value).trim());
    if (!match) {
      console.warn(`Advent calendar: ignoring previewDate "${value}". Use "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM".`);
      return null;
    }
    const [year, month, day, hours, minutes] = match.slice(1).map((part) => Number(part || 0));
    return new Date(year, month - 1, day, hours, minutes);
  }

  function todayInCalendar(at) {
    const inDecember = at.getFullYear() === YEAR && at.getMonth() === DECEMBER;
    return inDecember && at.getDate() <= TOTAL_DAYS ? at.getDate() : 0;
  }

  /* ---------- Remembering opened doors ---------- */

  // Preview mode uses its own storage so testing doesn't open the real doors.
  const storageKey = `advent-calendar-${YEAR}${previewStart ? "-preview" : ""}`;
  const opened = new Set(readOpened());

  function readOpened() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(saved) ? saved.filter((day) => Number.isInteger(day) && day >= 1 && day <= TOTAL_DAYS) : [];
    } catch {
      return [];
    }
  }

  function saveOpened() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...opened]));
    } catch {
      // Storage can be unavailable (e.g. private browsing); opened doors just won't be remembered.
    }
  }

  function dayInfo(day) {
    const entry = Array.isArray(config.days) ? config.days[day - 1] : null;
    const image = typeof entry === "string" ? entry : entry && entry.image;
    return {
      image: image || `img/${String(day).padStart(2, "0")}.jpg`,
      description: (entry && typeof entry === "object" && entry.description) || ""
    };
  }

  /* ---------- Doors ---------- */

  const doors = new Map();
  let stateKey = "";
  let isOpening = false;

  function createDoor(day, position) {
    const door = document.createElement("button");
    const style = day === TOTAL_DAYS ? "special" : position % DOOR_STYLES;
    const icon = day === TOTAL_DAYS ? "star" : ICONS[(day - 1) % ICONS.length];
    door.type = "button";
    door.className = `door door--style-${style}`;
    door.dataset.day = String(day);
    door.style.setProperty("--delay", `${position * 40}ms`);
    door.innerHTML = `
      <span class="door__inside">
        <img class="door__thumb" alt="" draggable="false">
        <svg class="door__placeholder" aria-hidden="true"><use href="#icon-gift"></use></svg>
        <span class="door__day" aria-hidden="true">${day}</span>
      </span>
      <span class="door__light" aria-hidden="true"></span>
      <span class="door__panel" aria-hidden="true">
        <span class="door__face door__face--front">
          <svg class="door__icon"><use href="#icon-${icon}"></use></svg>
          <span class="door__number">${day}</span>
          <span class="door__knob"></span>
          <svg class="door__lock"><use href="#icon-lock"></use></svg>
        </span>
        <span class="door__face door__face--back"></span>
      </span>
      <span class="door__tag" aria-hidden="true">Idag</span>`;

    const thumb = door.querySelector(".door__thumb");
    thumb.addEventListener("load", () => door.classList.remove("is-missing"));
    thumb.addEventListener("error", () => door.classList.add("is-missing"));
    return door;
  }

  // Images are only requested once a door is unlocked and opened, so locked photos are never loaded.
  function showThumbnail(door, day) {
    const thumb = door.querySelector(".door__thumb");
    if (!thumb.getAttribute("src")) thumb.src = dayInfo(day).image;
  }

  function refreshDoors(force = false) {
    const at = now();
    const today = todayInCalendar(at);
    let unlockedCount = 0;
    for (let day = 1; day <= TOTAL_DAYS; day++) {
      if (isUnlocked(day, at)) unlockedCount++;
    }

    // Only touch the DOM when something changed (e.g. a new door unlocked at midnight).
    const key = `${unlockedCount}:${today}`;
    if (!force && key === stateKey) return;
    stateKey = key;

    doors.forEach((door, day) => {
      const unlocked = isUnlocked(day, at);
      const isOpen = unlocked && opened.has(day);
      door.classList.toggle("is-locked", !unlocked);
      door.classList.toggle("is-available", unlocked && !isOpen);
      door.classList.toggle("is-open", isOpen);
      door.classList.toggle("is-today", day === today);
      door.setAttribute("aria-disabled", String(!unlocked));
      door.setAttribute(
        "aria-label",
        !unlocked ? `Lucka ${day}, låst till ${dayLabel(day)}` : isOpen ? `Lucka ${day}, visa bilden` : `Lucka ${day}, redo att öppnas`
      );
      if (isOpen) showThumbnail(door, day);
    });

    updateProgress(at);
  }

  function updateProgress(at) {
    let count = 0;
    opened.forEach((day) => {
      if (isUnlocked(day, at)) count++;
    });
    $("#progress-text").textContent = `${count} av ${TOTAL_DAYS} luckor öppnade`;
    $("#progress-fill").style.setProperty("--progress", String(count / TOTAL_DAYS));
  }

  function handleDoor(door) {
    if (isOpening) return;
    const day = Number(door.dataset.day);
    const at = now();

    if (!isUnlocked(day, at)) {
      rattle(door);
      showToast(lockedMessage(day, at));
      return;
    }

    if (opened.has(day)) {
      showPhoto(day, door);
      return;
    }

    opened.add(day);
    saveOpened();
    door.classList.add("is-opening");
    refreshDoors(true);

    if (reduceMotion) {
      door.classList.remove("is-opening");
      showPhoto(day, door);
      return;
    }

    isOpening = true;
    setTimeout(() => sparkleBurst(door), 380);
    setTimeout(() => {
      isOpening = false;
      showPhoto(day, door);
    }, DOOR_OPEN_MS - 150);
    setTimeout(() => door.classList.remove("is-opening"), DOOR_OPEN_MS + 250);
  }

  const rattleTimers = new WeakMap();

  function rattle(door) {
    door.classList.remove("is-rattling");
    void door.offsetWidth; // Restart the animation when clicked repeatedly.
    door.classList.add("is-rattling");
    clearTimeout(rattleTimers.get(door));
    rattleTimers.set(door, setTimeout(() => door.classList.remove("is-rattling"), 600));
  }

  function lockedMessage(day, at) {
    const startOfToday = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const daysLeft = Math.round((unlockTime(day) - startOfToday) / 86400000);
    return daysLeft <= 1
      ? `Tjuvkika inte! Lucka ${day} öppnas i morgon.`
      : `Tjuvkika inte! Lucka ${day} öppnas den ${dayLabel(day)} (om ${daysLeft} dagar).`;
  }

  let toastTimer = 0;

  function showToast(message) {
    toastText.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  /* ---------- Photo pop-up ---------- */

  let activeDay = 0;
  let openToken = 0;
  let returnFocusTo = null;
  let closeAnimation = null;

  function showPhoto(day, door) {
    const info = dayInfo(day);
    const token = ++openToken;

    if (closeAnimation) {
      closeAnimation.onfinish = null;
      closeAnimation.cancel();
      closeAnimation = null;
    }

    activeDay = day;
    returnFocusTo = door;
    photoTitle.textContent = dayLabel(day);
    photoText.textContent = info.description;
    photoText.hidden = !info.description;
    photo.alt = info.description || `Bild för ${dayLabel(day)}`;
    missingPath.textContent = info.image;
    photoBox.classList.remove("is-missing");

    lockScroll(true);
    modal.hidden = false;
    modal.classList.add("is-loading");
    void modal.offsetWidth; // Force a style flush so the backdrop's fade-in transition runs.
    modal.classList.add("is-visible");
    closeButton.focus({ preventScroll: true });

    loadImage(photo, info.image).then((loaded) => {
      if (token !== openToken) return;
      photoBox.classList.toggle("is-missing", !loaded);
      modal.classList.remove("is-loading");
      flyIn(door, token);
    });
  }

  function loadImage(img, src) {
    return new Promise((resolve) => {
      img.onload = () => {
        const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
        decoded.then(() => resolve(true));
      };
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  // The photo flies out of its door and lands in the middle of the screen.
  function flyIn(door, token) {
    if (reduceMotion) return;
    const to = frame.getBoundingClientRect();
    const from = door.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = Math.max(0.05, Math.min(from.width / to.width, from.height / to.height));

    frame.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-12deg)`, opacity: 0, easing: "cubic-bezier(.3, .6, .35, 1)" },
        { opacity: 1, offset: 0.15 },
        { transform: "translate(0px, 0px) scale(1.04) rotate(2deg)", offset: 0.72, easing: "ease-in-out" },
        { transform: "translate(0px, 0px) scale(1) rotate(0deg)", opacity: 1 }
      ],
      { duration: 950 }
    );

    setTimeout(() => {
      if (token === openToken && activeDay) confettiAround(frame);
    }, 600);
  }

  function closePhoto() {
    if (!activeDay) return;
    activeDay = 0;
    openToken++;
    modal.classList.remove("is-visible");
    if (returnFocusTo) returnFocusTo.focus({ preventScroll: true });

    const finish = () => {
      closeAnimation = null;
      modal.hidden = true;
      modal.classList.remove("is-loading");
      photo.removeAttribute("src");
      lockScroll(false);
    };

    if (reduceMotion || modal.classList.contains("is-loading")) {
      finish();
      return;
    }

    const animation = frame.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: "translateY(30px) scale(.9) rotate(-3deg)", opacity: 0 }
      ],
      { duration: 280, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" }
    );
    closeAnimation = animation;
    animation.onfinish = () => {
      finish();
      animation.cancel();
    };
  }

  // Stops the page behind the pop-up from scrolling, without the layout jumping when the scrollbar hides.
  function lockScroll(locked) {
    if (locked === document.body.classList.contains("has-modal")) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = locked && scrollbarWidth > 0 ? `${scrollbarWidth}px` : "";
    document.body.classList.toggle("has-modal", locked);
  }

  /* ---------- Sparkles & confetti ---------- */

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function spawnParticle(x, y, dx, dy, kind, color) {
    const size = kind === "confetti" ? 9 + Math.random() * 8 : kind === "star" ? 12 + Math.random() * 12 : 5 + Math.random() * 5;
    const height = kind === "confetti" ? size * 0.45 : size;
    const particle = document.createElement("span");
    particle.className = `particle particle--${kind}`;
    particle.style.width = `${size}px`;
    particle.style.height = `${height}px`;
    particle.style.background = color;
    fxLayer.appendChild(particle);

    const origin = `translate(${x - size / 2}px, ${y - height / 2}px)`;
    const spin = (Math.random() - 0.5) * 720;
    const animation = particle.animate(
      [
        { transform: `${origin} translate(0px, 0px) scale(.3) rotate(0deg)`, opacity: 1 },
        { transform: `${origin} translate(${dx}px, ${dy}px) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.55 },
        { transform: `${origin} translate(${dx * 1.15}px, ${dy * 1.15 + 60}px) scale(.5) rotate(${spin}deg)`, opacity: 0 }
      ],
      { duration: 900 + Math.random() * 700, easing: "cubic-bezier(.12, .7, .3, 1)" }
    );
    animation.onfinish = () => particle.remove();
  }

  function sparkleBurst(element) {
    if (reduceMotion) return;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const reach = Math.max(rect.width, 90);
    for (let i = 0; i < 36; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = reach * (0.35 + Math.random() * 0.6);
      spawnParticle(x, y, Math.cos(angle) * distance, Math.sin(angle) * distance, i % 3 === 0 ? "dot" : "star", pick(SPARKLE_COLORS));
    }
  }

  function confettiAround(element) {
    if (reduceMotion) return;
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 80; i++) {
      const t = Math.random();
      const side = i % 4;
      const x = side === 1 ? rect.right : side === 3 ? rect.left : rect.left + t * rect.width;
      const y = side === 0 ? rect.top : side === 2 ? rect.bottom : rect.top + t * rect.height;
      const angle = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.9;
      const distance = 60 + Math.random() * 160;
      const kind = i % 5 === 0 ? "star" : "confetti";
      spawnParticle(x, y, Math.cos(angle) * distance, Math.sin(angle) * distance, kind, pick(kind === "star" ? SPARKLE_COLORS : CONFETTI_COLORS));
    }
  }

  /* ---------- Countdown ---------- */

  const countdownLabel = $("#countdown-label");
  const countdownTime = $("#countdown-time");

  function updateCountdown() {
    const at = now();
    let nextDay = 0;
    for (let day = 1; day <= TOTAL_DAYS; day++) {
      if (!isUnlocked(day, at)) {
        nextDay = day;
        break;
      }
    }

    if (!nextDay) {
      countdownLabel.textContent = "God jul! Alla luckor är öppna";
      countdownTime.textContent = "";
      return;
    }
    countdownLabel.textContent = nextDay === 1 ? "Första luckan öppnas om" : `Lucka ${nextDay} öppnas om`;
    countdownTime.textContent = formatDuration(unlockTime(nextDay) - at);
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const clock = [Math.floor(totalSeconds / 3600) % 24, Math.floor(totalSeconds / 60) % 60, totalSeconds % 60]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    return days > 0 ? `${days} ${days === 1 ? "dag" : "dagar"}, ${clock}` : clock;
  }

  /* ---------- Decorations ---------- */

  function createStars() {
    const sky = $(".stars");
    const count = window.innerWidth < 600 ? 70 : 130;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const star = document.createElement("span");
      const size = Math.random() < 0.85 ? 1 + Math.random() * 1.4 : 2.4 + Math.random() * 1.4;
      star.className = "star";
      star.style.cssText = [
        `left:${(Math.random() * 100).toFixed(2)}%`,
        `top:${(Math.random() ** 1.5 * 100).toFixed(2)}%`,
        `width:${size.toFixed(1)}px`,
        `height:${size.toFixed(1)}px`,
        `animation-duration:${(2.5 + Math.random() * 4).toFixed(2)}s`,
        `animation-delay:${(-Math.random() * 6).toFixed(2)}s`
      ].join(";");
      fragment.appendChild(star);
    }
    sky.appendChild(fragment);
  }

  function createLights() {
    const strand = $(".lights");
    const count = Math.ceil((window.innerWidth + 40) / 58) + 1;
    if (strand.childElementCount === count) return;
    strand.textContent = "";
    for (let i = 0; i < count; i++) {
      const bulb = document.createElement("li");
      bulb.style.setProperty("--color", LIGHT_COLORS[i % LIGHT_COLORS.length]);
      strand.appendChild(bulb);
    }
  }

  function startSnow() {
    const canvas = $(".snow");
    const context = canvas.getContext("2d");
    if (!context) return;
    const flakes = [];
    let width = 0;
    let height = 0;

    const makeFlake = (anywhere) => {
      const radius = 0.8 + Math.random() ** 2 * 2.8;
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : -radius * 2,
        radius,
        speed: 0.3 + radius * 0.35 + Math.random() * 0.3,
        sway: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.55
      };
    };

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const target = Math.round(Math.min(170, (width * height) / 10000));
      while (flakes.length < target) flakes.push(makeFlake(true));
      flakes.length = target;
    }

    let last = performance.now();
    function draw(time) {
      const step = Math.min(3, Math.max(0, (time - last) / 16.7));
      last = time;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#fff";
      for (const flake of flakes) {
        flake.phase += 0.015 * step;
        flake.y += flake.speed * step;
        flake.x += Math.sin(flake.phase) * flake.sway * step;
        if (flake.y > height + 6) Object.assign(flake, makeFlake(false));
        if (flake.x > width + 6) flake.x = -6;
        else if (flake.x < -6) flake.x = width + 6;
        context.globalAlpha = flake.alpha;
        context.beginPath();
        context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", debounce(resize, 150));
    requestAnimationFrame(draw);
  }

  function debounce(fn, wait) {
    let timer = 0;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function setupPreviewBanner() {
    if (!previewStart) return;
    const formatted = previewStart.toLocaleString(LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    $("#preview-text").textContent = `Förhandsvisning: kalendern visas som om det vore ${formatted}. Sätt previewDate till null i js/config.js innan du delar den.`;
    $("#preview-banner").hidden = false;
    $("#preview-reset").addEventListener("click", () => {
      opened.clear();
      saveOpened();
      window.location.reload();
    });
  }

  /* ---------- Start ---------- */

  document.title = `${TITLE} ${YEAR}`;
  $("#hero-title").textContent = TITLE;
  $("#hero-year").textContent = `december ${YEAR}`;

  DOOR_ORDER.forEach((day, position) => {
    const door = createDoor(day, position);
    doors.set(day, door);
    calendar.appendChild(door);
  });

  calendar.addEventListener("click", (event) => {
    const door = event.target.closest(".door");
    if (door) handleDoor(door);
  });

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) closePhoto();
  });

  document.addEventListener("keydown", (event) => {
    if (!activeDay) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closePhoto();
    } else if (event.key === "Tab") {
      // The close button is the only control in the pop-up, so keep focus there.
      event.preventDefault();
      closeButton.focus();
    }
  });

  refreshDoors(true);
  updateCountdown();
  setInterval(() => {
    refreshDoors();
    updateCountdown();
  }, 1000);

  setupPreviewBanner();
  createStars();
  createLights();
  window.addEventListener("resize", debounce(createLights, 200));
  if (!reduceMotion) startSnow();
})();
