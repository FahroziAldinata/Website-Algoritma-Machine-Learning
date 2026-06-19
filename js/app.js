/* ============================================
   SPK WEB APP — app.js
   Entry point: index.html interactivity
   Covers:
   - Page loader
   - Dark / light mode toggle (persisted)
   - Mobile nav menu
   - Scroll-triggered fade-up animations
   - Active nav link on scroll
   - Toast notification
   - Modal (with focus trap & a11y)
   - Method / weight card click feedback
   ============================================ */

   'use strict';

   /* ──────────────────────────────────────────
      1. PAGE LOADER
      Hide loader once DOM + fonts are ready.
   ────────────────────────────────────────── */
   (function initLoader() {
     const loader = document.getElementById('pageLoader');
     if (!loader) return;
   
     const hide = () => {
       loader.classList.add('hidden');
       // Remove from DOM after transition so it doesn't block pointer events
       loader.addEventListener('transitionend', () => loader.remove(), { once: true });
     };
   
     if (document.fonts && document.fonts.ready) {
       document.fonts.ready.then(hide);
     } else {
       window.addEventListener('load', hide);
     }
   
     // Fallback: force-hide after 2.5 s no matter what
     setTimeout(hide, 2500);
   })();
   
   
   /* ──────────────────────────────────────────
      2. DARK / LIGHT MODE TOGGLE
      Reads saved preference → system preference → default light.
      Persists choice to localStorage.
   ────────────────────────────────────────── */
   (function initTheme() {
     const html        = document.documentElement;
     const themeToggle = document.getElementById('themeToggle');
     if (!themeToggle) return;
   
     /** Return the theme that should be applied on load */
     function getInitialTheme() {
       const saved = localStorage.getItem('spk-theme');
       if (saved === 'dark' || saved === 'light') return saved;
       // Respect OS preference if nothing saved
       if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
       return 'light';
     }
   
     function applyTheme(theme) {
       html.setAttribute('data-theme', theme);
       themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap');
       themeToggle.setAttribute('title',      theme === 'dark' ? 'Mode terang'          : 'Mode gelap');
     }
   
     // Apply immediately (html already has data-theme="light" from markup,
     // but we overwrite if user/OS wants dark — before first paint via inline
     // script would be ideal, but this runs early enough from the bottom of body)
     applyTheme(getInitialTheme());
   
     themeToggle.addEventListener('click', () => {
       const current = html.getAttribute('data-theme') || 'light';
       const next    = current === 'dark' ? 'light' : 'dark';
       applyTheme(next);
       localStorage.setItem('spk-theme', next);
     });
   
     // Keep in sync with OS changes when user hasn't overridden manually
     window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
       if (!localStorage.getItem('spk-theme')) {
         applyTheme(e.matches ? 'dark' : 'light');
       }
     });
   })();
   
   
   /* ──────────────────────────────────────────
      3. MOBILE NAVIGATION MENU
      Toggle .mobile-open on nav-links.
      Close on outside click / Escape / link click.
   ────────────────────────────────────────── */
   (function initMobileNav() {
     const menuToggle = document.getElementById('menuToggle');
     const navLinks   = document.getElementById('navLinks');
     if (!menuToggle || !navLinks) return;
   
     function openMenu() {
       navLinks.classList.add('mobile-open');
       menuToggle.setAttribute('aria-expanded', 'true');
       menuToggle.setAttribute('aria-label', 'Tutup menu');
       // Focus first link for keyboard users
       const firstLink = navLinks.querySelector('a');
       if (firstLink) firstLink.focus();
     }
   
     function closeMenu() {
       navLinks.classList.remove('mobile-open');
       menuToggle.setAttribute('aria-expanded', 'false');
       menuToggle.setAttribute('aria-label', 'Buka menu');
     }
   
     function isOpen() {
       return navLinks.classList.contains('mobile-open');
     }
   
     menuToggle.setAttribute('aria-expanded', 'false');
     menuToggle.setAttribute('aria-controls', 'navLinks');
   
     menuToggle.addEventListener('click', (e) => {
       e.stopPropagation();
       isOpen() ? closeMenu() : openMenu();
     });
   
     // Close when any nav link is clicked
     navLinks.querySelectorAll('a').forEach(link => {
       link.addEventListener('click', closeMenu);
     });
   
     // Close on outside click
     document.addEventListener('click', (e) => {
       if (isOpen() && !navLinks.contains(e.target) && e.target !== menuToggle) {
         closeMenu();
       }
     });
   
     // Close on Escape
     document.addEventListener('keydown', (e) => {
       if (e.key === 'Escape' && isOpen()) {
         closeMenu();
         menuToggle.focus();
       }
     });
   })();
   
   
   /* ──────────────────────────────────────────
      4. SCROLL-TRIGGERED FADE-UP ANIMATIONS
      Uses IntersectionObserver for performance.
      Falls back gracefully if IO not supported.
   ────────────────────────────────────────── */
   (function initScrollAnimations() {
     const targets = document.querySelectorAll('.fade-up');
     if (!targets.length) return;
   
     if (!('IntersectionObserver' in window)) {
       // Fallback: show everything immediately
       targets.forEach(el => el.classList.add('visible'));
       return;
     }
   
     const observer = new IntersectionObserver((entries) => {
       entries.forEach(entry => {
         if (entry.isIntersecting) {
           entry.target.classList.add('visible');
           observer.unobserve(entry.target); // Animate once only
         }
       });
     }, {
       threshold:  0.12,
       rootMargin: '0px 0px -40px 0px'
     });
   
     targets.forEach(el => observer.observe(el));
   })();
   
   
   /* ──────────────────────────────────────────
      5. ACTIVE NAV LINK ON SCROLL
      Highlights nav link matching current section.
   ────────────────────────────────────────── */
   (function initActiveNav() {
     const sections  = document.querySelectorAll('section[id]');
     const navLinks  = document.querySelectorAll('.nav-links a[href^="#"]');
     if (!sections.length || !navLinks.length) return;
   
     const NAVBAR_HEIGHT = 72; // px — matches CSS .navbar height
   
     function updateActive() {
       let current = '';
   
       sections.forEach(section => {
         const top = section.getBoundingClientRect().top;
         if (top <= NAVBAR_HEIGHT + 20) {
           current = section.id;
         }
       });
   
       navLinks.forEach(link => {
         const href = link.getAttribute('href').replace('#', '');
         link.classList.toggle('active', href === current);
       });
     }
   
     // Throttle scroll handler for performance
     let ticking = false;
     window.addEventListener('scroll', () => {
       if (!ticking) {
         window.requestAnimationFrame(() => {
           updateActive();
           ticking = false;
         });
         ticking = true;
       }
     }, { passive: true });
   
     updateActive(); // Run once on load
   })();
   
   
   /* ──────────────────────────────────────────
      6. TOAST NOTIFICATION
      Global helper: showToast(message, duration?)
   ────────────────────────────────────────── */
   const Toast = (function initToast() {
     const toast   = document.getElementById('toast');
     const toastMsg = document.getElementById('toastMsg');
     let hideTimer = null;
   
     function show(message, duration = 2800) {
       if (!toast || !toastMsg) return;
       toastMsg.textContent = message;
       toast.classList.add('show');
       toast.setAttribute('role', 'status');
       toast.setAttribute('aria-live', 'polite');
   
       clearTimeout(hideTimer);
       hideTimer = setTimeout(() => {
         toast.classList.remove('show');
       }, duration);
     }
   
     return { show };
   })();
   
   // Expose globally so other modules can call Toast.show(...)
   window.Toast = Toast;
   
   
   /* ──────────────────────────────────────────
      7. MODAL
      Open / close with focus trap and a11y attrs.
      Usage: Modal.open({ title, desc, ctaHref, ctaText })
   ────────────────────────────────────────── */
   const Modal = (function initModal() {
     const backdrop  = document.getElementById('modalBackdrop');
     const modal     = backdrop ? backdrop.querySelector('.modal') : null;
     const titleEl   = document.getElementById('modalTitle');
     const descEl    = document.getElementById('modalDesc');
     const closeBtn  = document.getElementById('modalClose');
     const ctaBtn    = document.getElementById('modalCta');
   
     if (!backdrop || !modal) return { open: () => {}, close: () => {} };
   
     // A11y attributes
     modal.setAttribute('role', 'dialog');
     modal.setAttribute('aria-modal', 'true');
     modal.setAttribute('aria-labelledby', 'modalTitle');
     modal.setAttribute('aria-describedby', 'modalDesc');
   
     let previousFocus = null; // Element to return focus to on close
   
     /** Trap focus inside modal while open */
     function trapFocus(e) {
       const focusable = modal.querySelectorAll(
         'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
       );
       const first = focusable[0];
       const last  = focusable[focusable.length - 1];
   
       if (e.key === 'Tab') {
         if (e.shiftKey) {
           if (document.activeElement === first) {
             e.preventDefault();
             last.focus();
           }
         } else {
           if (document.activeElement === last) {
             e.preventDefault();
             first.focus();
           }
         }
       }
   
       if (e.key === 'Escape') {
         close();
       }
     }
   
     function open({ title = '', desc = '', ctaHref = '#', ctaText = 'Gunakan Metode Ini' } = {}) {
       if (titleEl) titleEl.textContent = title;
       if (descEl)  descEl.textContent  = desc;
       if (ctaBtn)  {
         ctaBtn.href        = ctaHref;
         ctaBtn.textContent = ctaText;
       }
   
       previousFocus = document.activeElement;
       backdrop.classList.add('open');
       backdrop.removeAttribute('aria-hidden');
       document.body.style.overflow = 'hidden'; // Prevent scroll behind modal
   
       // Focus close button after open transition
       setTimeout(() => {
         if (closeBtn) closeBtn.focus();
       }, 100);
   
       document.addEventListener('keydown', trapFocus);
     }
   
     function close() {
       backdrop.classList.remove('open');
       backdrop.setAttribute('aria-hidden', 'true');
       document.body.style.overflow = '';
       document.removeEventListener('keydown', trapFocus);
       if (previousFocus) previousFocus.focus();
     }
   
     // Initial state
     backdrop.setAttribute('aria-hidden', 'true');
   
     // Event bindings
     if (closeBtn) closeBtn.addEventListener('click', close);
   
     // Click outside modal content closes it
     backdrop.addEventListener('click', (e) => {
       if (e.target === backdrop) close();
     });
   
     return { open, close };
   })();
   
   window.Modal = Modal;
   
   
   /* ──────────────────────────────────────────
      8. METHOD CARD INTERACTIONS
      Show toast on card click to confirm selection.
      Cards are <a> tags so navigation still works.
   ────────────────────────────────────────── */
   (function initMethodCards() {
     const METHOD_NAMES = {
       saw:    'SAW — Simple Additive Weighting',
       topsis: 'TOPSIS',
       waspas: 'WASPAS',
       moora:  'MOORA',
       edas:   'EDAS',
     };
   
     document.querySelectorAll('.method-card[href]').forEach(card => {
       card.addEventListener('click', () => {
         const url    = new URL(card.href, location.href);
         const method = url.searchParams.get('method');
         const name   = METHOD_NAMES[method] || 'Metode SPK';
         Toast.show(`✓ Metode dipilih: ${name}`);
       });
     });
   })();
   
   
   /* ──────────────────────────────────────────
      9. WEIGHT CARD INTERACTIONS
      Show toast when a weighting method is chosen.
   ────────────────────────────────────────── */
   (function initWeightCards() {
     const WEIGHT_NAMES = {
       manual:  'Bobot Manual',
       entropy: 'Pembobotan Entropy',
       critic:  'Pembobotan CRITIC',
     };
   
     document.querySelectorAll('.weight-card[href]').forEach(card => {
       card.addEventListener('click', () => {
         const url    = new URL(card.href, location.href);
         const weight = url.searchParams.get('weight');
         const name   = WEIGHT_NAMES[weight] || 'Pembobotan';
         Toast.show(`✓ Dipilih: ${name}`);
       });
     });
   })();
   
   
   /* ──────────────────────────────────────────
      10. SMOOTH SCROLL FOR ANCHOR LINKS
      Offset scroll target by navbar height so
      sections aren't hidden behind sticky nav.
   ────────────────────────────────────────── */
   (function initSmoothScroll() {
     const OFFSET = 72; // navbar height in px
   
     document.querySelectorAll('a[href^="#"]').forEach(link => {
       link.addEventListener('click', (e) => {
         const id     = link.getAttribute('href').slice(1);
         const target = document.getElementById(id);
         if (!target) return;
   
         e.preventDefault();
         const top = target.getBoundingClientRect().top + window.scrollY - OFFSET;
         window.scrollTo({ top, behavior: 'smooth' });
   
         // Update URL hash without jumping
         history.pushState(null, '', `#${id}`);
       });
     });
   })();
   
   
   /* ──────────────────────────────────────────
      11. URL PARAM FEEDBACK
      If user arrives from another page with
      ?method= or ?weight= in URL (edge case),
      read it and show a toast.
   ────────────────────────────────────────── */
   (function initUrlFeedback() {
     const params = new URLSearchParams(location.search);
     const method = params.get('method');
     const weight = params.get('weight');
   
     if (method) {
       const names = { saw: 'SAW', topsis: 'TOPSIS', waspas: 'WASPAS', moora: 'MOORA', edas: 'EDAS' };
       Toast.show(`Metode aktif: ${names[method] || method.toUpperCase()}`);
     } else if (weight) {
       const names = { manual: 'Manual', entropy: 'Entropy', critic: 'CRITIC' };
       Toast.show(`Pembobotan aktif: ${names[weight] || weight}`);
     }
   })();