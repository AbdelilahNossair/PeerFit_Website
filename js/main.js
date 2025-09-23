// PeerFit site: smooth scrolling and performance-friendly navigation
// Requires: gsap.min.js, ScrollTo.min.js (optional), ScrollSmoother.min.js (optional)

(function () {
    // Robust, cross-browser scroll helpers
    function getScrollElement() {
        return document.scrollingElement || document.documentElement || document.body;
    }
    function rafSmoothScrollToY(targetY, duration) {
        var scrollEl = getScrollElement();
        var startY = window.pageYOffset || scrollEl.scrollTop || 0;
        var changeY = targetY - startY;
        var startTime = null;
        var ease = function (t) { return 1 - Math.cos((t * Math.PI) / 2); }; // easeOutSine
        duration = Math.max(0.2, Math.min(duration || 0.8, 1.5)); // Longer max duration for Safari
        
        console.log('Safari Debug: rAF scroll', { startY, targetY, changeY, duration });
        
        function step(ts) {
            if (!startTime) startTime = ts;
            var progress = Math.min(1, (ts - startTime) / (duration * 1000));
            var eased = ease(progress);
            var y = startY + changeY * eased;
            
            // Use multiple scroll methods for Safari compatibility
            window.scrollTo(0, y);
            scrollEl.scrollTop = y;
            document.documentElement.scrollTop = y;
            document.body.scrollTop = y;
            
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                console.log('Safari Debug: rAF scroll completed');
            }
        }
        requestAnimationFrame(step);
    }
    function getHeaderOffset() {
        var header = document.querySelector('.mil-top-panel-2');
        if (!header) return 0;
        // Use actual header height + small margin so section headings aren't clipped
        var h = header.offsetHeight || (window.innerWidth < 992 ? 90 : 120);
        return h + 24;
    }

    function setupScrollSmoother() {
        if (window.ScrollSmoother && typeof window.ScrollSmoother.create === 'function') {
            try {
                // Create once
                if (!window.__peerfitSmoother) {
                    window.__peerfitSmoother = ScrollSmoother.create({
                        wrapper: '#smooth-wrapper',
                        content: '#smooth-content',
                        smooth: 0.9,
                        effects: false,
                    });
                }
            } catch (e) {
                // Fail silently; we'll fall back to ScrollTo/instant
                console.warn('ScrollSmoother init failed:', e);
            }
        }
        return window.__peerfitSmoother || null;
    }

    function smoothScrollTo(targetEl) {
        if (!targetEl) return;
        var offsetY = getHeaderOffset();
        var targetY = targetEl.getBoundingClientRect().top + window.pageYOffset - offsetY;

        // Debug logging for Safari/Chrome
        console.log('Scroll Debug: smoothScrollTo called', {
            element: targetEl.id || targetEl.className,
            offsetY: offsetY,
            targetY: targetY,
            hasSmoother: !!(window.__peerfitSmoother || (window.ScrollSmoother && ScrollSmoother.get && ScrollSmoother.get())),
            hasGSAP: !!(window.gsap && gsap.to)
        });

        var startY = window.pageYOffset || 0;
        var smoother = window.__peerfitSmoother || (window.ScrollSmoother && ScrollSmoother.get && ScrollSmoother.get());
        var attempted = false;

        // Prefer ScrollSmoother if available; use numeric Y to avoid offset signature ambiguity
        if (smoother && typeof smoother.scrollTo === 'function') {
            try {
                smoother.scrollTo(targetY, true);
                attempted = true;
                console.log('Scroll Debug: ScrollSmoother used');
            } catch (e) {
                console.log('Scroll Debug: ScrollSmoother failed', e);
            }
        }

        // Fallback to GSAP ScrollTo if available
        if (!attempted && window.gsap && gsap.to && window.ScrollToPlugin) {
            var distance = Math.abs(targetY - (window.pageYOffset || 0));
            var duration = 0.15 + Math.min(0.6, distance / 2500);
            try {
                gsap.to(window, {
                    duration: duration,
                    ease: 'sine',
                    scrollTo: { y: targetY },
                });
                attempted = true;
                console.log('Scroll Debug: GSAP ScrollTo used');
            } catch (e) {
                console.log('Scroll Debug: GSAP ScrollTo failed', e);
            }
        }

        // Final fallback or post-verify correction
        function ensureArrived() {
            var current = window.pageYOffset || 0;
            var delta = Math.abs(current - targetY);
            if (delta > 2) {
                rafSmoothScrollToY(targetY, 0.6);
            }
        }
        // If nothing attempted, go straight to rAF
        if (!attempted) {
            console.log('Scroll Debug: Using rAF fallback');
            rafSmoothScrollToY(targetY, 0.8);
        } else {
            // Verify after animation starts; fix if needed (covers edge cases with smoothers)
            setTimeout(ensureArrived, 150);
            setTimeout(ensureArrived, 500);
        }
    }

    function getInPageHash(a) {
        if (!a || !a.getAttribute) return null;
        var href = a.getAttribute('href') || '';
        if (href.startsWith('#') && href.length > 1 && href !== '#.') return href;
        try {
            var url = new URL(href, window.location.href);
            if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash && url.hash.length > 1 && url.hash !== '#.') {
                return url.hash;
            }
        } catch (e) {}
        return null;
    }

    function bindAnchorLinks() {
        var anchors = Array.prototype.slice.call(
            document.querySelectorAll('.mil-onepage-nav a, a.mil-scroll-to, a[href^="#"], a[href*="#"]')
        );
        anchors.forEach(function (a) {
            a.addEventListener('click', function (e) {
                var targetId = getInPageHash(a);
                if (!targetId) return;
                var el = document.querySelector(targetId);
                if (!el) return;
                console.log('Safari Debug: Anchor click handler', { href: targetId, element: el.id || el.className });
                // fully take over this click to avoid Swup or other handlers
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                // Update URL without causing default jump
                setUrlHashSilently(targetId);
                
                // Safari: Add immediate scroll fallback if smooth scroll doesn't work
                setTimeout(function() {
                    smoothScrollTo(el);
                }, 10);
            });
        });
    }

    function handleInitialHash() {
        if (location.hash && location.hash.length > 1) {
            var el = document.querySelector(location.hash);
            if (el) {
                // Delay until layout ready
                setTimeout(function () {
                    smoothScrollTo(el);
                }, 50);
            }
        }
    }

    // Safari-specific aggressive anchor handling
    function safariScrollFix() {
        // Detect Safari
        var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (isSafari) {
            console.log('Safari Debug: Applying Safari-specific fixes');
            
            // Completely disable ScrollSmoother for Safari and use simple scroll
            window.__peerfitSmoother = null;
            
            // Override smoothScrollTo for Safari with immediate scroll
            window.__peerfitSmoothScrollTo = function(targetEl) {
                if (!targetEl) return;
                console.log('Safari Debug: Direct scroll to', targetEl.id || targetEl.className);
                
                var header = document.querySelector('.mil-top-panel-2');
                var offset = header ? header.offsetHeight + 24 : 120;
                var targetY = targetEl.getBoundingClientRect().top + window.pageYOffset - offset;
                
                // Direct scroll without animation for Safari reliability
                window.scrollTo(0, targetY);
            };
        }
    }

    // Push/replace hash into URL without native jump
    function setUrlHashSilently(hash) {
        if (!hash || hash[0] !== '#') return;
        try {
            var url = new URL(window.location.href);
            if (url.hash === hash) {
                // ensure the exact URL is set (normalize) without adding history entries
                window.history.replaceState(window.history.state || {}, '', url.pathname + url.search + hash);
            } else {
                window.history.pushState(window.history.state || {}, '', url.pathname + url.search + hash);
            }
        } catch (e) {
            // Fallback: assign hash (may trigger hashchange)
            window.location.hash = hash;
        }
    }

    function init() {
        // Ensure GSAP plugins are registered before any scroll attempts (Safari timing)
        if (window.gsap) {
            try { if (window.ScrollToPlugin) gsap.registerPlugin(ScrollToPlugin); } catch (e) {}
            try { if (window.ScrollSmoother) gsap.registerPlugin(ScrollSmoother); } catch (e) {}
            try { if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger); } catch (e) {}
        }
        setupScrollSmoother();
        bindAnchorLinks();
        handleInitialHash();
        safariScrollFix(); // Apply Safari-specific fixes
        // flag to tell downstream code not to re-bind onepage handlers
        window.__peerfitAnchorHandler = true;
    }

    // Expose helpers for external callers (Swup callbacks and global handlers)
    window.__peerfitSetupScrollSmoother = setupScrollSmoother;
    window.__peerfitBindAnchorLinks = bindAnchorLinks;
    window.__peerfitHandleInitialHash = handleInitialHash;
    window.__peerfitSmoothScrollTo = smoothScrollTo;
    window.__peerfitGetHeaderOffset = getHeaderOffset;
    window.__peerfitSetUrlHashSilently = setUrlHashSilently;

    // Bind hashchange once to support back/forward and manual hash edits
    if (!window.__peerfitHashBound) {
        window.addEventListener('hashchange', function () {
            if (location.hash && location.hash.length > 1) {
                var el = document.querySelector(location.hash);
                if (el) {
                    // next tick to allow layout
                    setTimeout(function(){ smoothScrollTo(el); }, 0);
                }
            }
        });
        // Also respond to history navigation when using pushState for hashes
        window.addEventListener('popstate', function(){
            if (location.hash && location.hash.length > 1) {
                var el = document.querySelector(location.hash);
                if (el) setTimeout(function(){ smoothScrollTo(el); }, 0);
            }
        });
        window.__peerfitHashBound = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* -------------------------------------------

Name: 		 Pixy
Version:     1.0
Developer:   Nazar Miller (millerDigitalDesign)
Portfolio:   https://themeforest.net/user/millerdigitaldesign/portfolio?ref=MillerDigitalDesign

p.s. I am available for Freelance hire (UI design, web development). email: miller.themes@gmail.com
   
------------------------------------------- */

document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    /* -------------------------------------------

    swup

    ------------------------------------------- */

    const swup = new Swup({
        containers: ['#swup', '#swupMenu', '#swup-opm'],
        animateHistoryBrowsing: true,
        // Do not handle pure in-page anchors; we manage those
        ignoreVisit: function(url, ctx){
            try {
                const full = new URL(url, window.location.href);
                // same page and has hash only
                const samePath = full.pathname === window.location.pathname && full.search === window.location.search;
                return samePath && !!full.hash && full.hash.length > 1;
            } catch (e) { return false; }
        }
    });

    // Re-bind smooth scrolling after Swup swaps content
    swup.on && swup.on('contentReplaced', () => {
        if (window.__peerfitSetupScrollSmoother) window.__peerfitSetupScrollSmoother();
        if (window.__peerfitBindAnchorLinks) window.__peerfitBindAnchorLinks();
        if (window.__peerfitHandleInitialHash) window.__peerfitHandleInitialHash();
    });

    /* -------------------------------------------

    register gsap plugins

    ------------------------------------------- */
    if (window.gsap) {
        try {
            var __plugins = [];
            if (window.ScrollTrigger) __plugins.push(window.ScrollTrigger);
            if (window.ScrollSmoother) __plugins.push(window.ScrollSmoother);
            if (window.ScrollToPlugin) __plugins.push(window.ScrollToPlugin);
            if (__plugins.length) gsap.registerPlugin.apply(gsap, __plugins);
        } catch (e) { /* noop */ }
    }
    /* -------------------------------------------

    ScrollSmoother

    ------------------------------------------- */
    if (window.__peerfitSetupScrollSmoother) window.__peerfitSetupScrollSmoother();

    /* -------------------------------------------

    preloader

    ------------------------------------------- */

    var timeline = gsap.timeline();

    timeline
        .to(".mil-preloader-animation", {
            opacity: 1,
            ease: 'sine'
        })
        .fromTo(".mil-animation-1 p", {
            y: "30px",
            opacity: 0,
            scale: .8,
            ease: 'sine'
        }, {
            y: "0px",
            opacity: 1,
            scale: 1,
            stagger: 0.3,
            webkitFilter: "blur(0px)"
        })
        .to(".mil-animation-1 p", {
            opacity: 0,
            y: '-30'
        }, "+=0.3")
        .fromTo(".mil-reveal-box", 0.1, {
            x: 0
        }, {
            x: '-30'
        })
        .to(".mil-reveal-box", 0.45, {
            width: "100%",
            x: 0
        }, "+=0.1")
        .to(".mil-reveal-box", {
            right: "0"
        })
        .to(".mil-reveal-box", 0.3, {
            width: "0%"
        })
        .fromTo(".mil-animation-2 p", {
            opacity: 0
        }, {
            opacity: 1
        }, "-=0.5")
        .to(".mil-animation-2 p", 0.6, {
            opacity: 0,
            y: '-30'
        }, "+=0.5")
        .to(".mil-preloader", 0.8, {
            opacity: 0,
            ease: 'sine'
        }, "+=0.2")
        .add(() => {
            ScrollTrigger.refresh();
        }, "-=1")
        .add(() => {
            document.querySelector('.mil-preloader').classList.add('mil-hidden');
        });

    /* -------------------------------------------

    cursor

    ------------------------------------------- */

    var follower = document.querySelector(".mil-cursor-follower");
    var posX = 0,
        posY = 0;
    var mouseX = 0,
        mouseY = 0;

    gsap.ticker.add(function () {
        posX += (mouseX - posX) / 29;
        posY += (mouseY - posY) / 29;
        gsap.set(follower, {
            css: {
                left: posX,
                top: posY
            }
        });
    });

    function addHoverEffect(selector, className) {
        document.querySelectorAll(selector).forEach(function (link) {
            link.addEventListener("mouseenter", function () {
                follower.classList.add(className);
            });
            link.addEventListener("mouseleave", function () {
                follower.classList.remove(className);
            });
        });
    }

    addHoverEffect(".mil-c-light", "mil-light-active");
    addHoverEffect(".mil-c-dark", "mil-dark-active");
    addHoverEffect(".mil-c-gone", "mil-gone-active");
    addHoverEffect(".mil-c-view", "mil-view-active");
    addHoverEffect(".mil-c-next", "mil-next-active");
    addHoverEffect(".mil-c-read", "mil-read-active");
    addHoverEffect(".mil-c-swipe", "mil-swipe-active");

    document.addEventListener("mousemove", function (e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    /* -------------------------------------------

    cursor parallax

    ------------------------------------------- */
    var scene1 = document.getElementById('scene');
    if (scene1) {
        var parallaxInstance1 = new Parallax(scene1, {
            limitY: 10,
        });
    }

    var scene2 = document.getElementById('scene-2');
    if (scene2) {
        var parallaxInstance2 = new Parallax(scene2, {
            limitY: 10,
        });
    }
    /* -------------------------------------------

    menu

    ------------------------------------------- */
    // Safe helpers to avoid null.classList errors
    function safeToggle(el, cls) { if (el && el.classList) el.classList.toggle(cls); }
    function safeRemove(el, cls) { if (el && el.classList) el.classList.remove(cls); }

    document.addEventListener('click', function (event) {
        const menuBtn = event.target.closest('.mil-menu-btn');
        const menuFrame = document.querySelector('.mil-menu-frame');
        const btnFrame = document.querySelector('.mil-buttons-tp-frame');
        const tp2 = document.querySelector('.mil-top-panel-2');

        if (menuBtn) {
            // Toggle only when elements exist
            safeToggle(menuBtn, 'mil-active');
            safeToggle(menuFrame, 'mil-active');
            safeToggle(btnFrame, 'mil-active');
            safeToggle(tp2, 'mil-menu-open');
        } else if (event.target.closest('.mil-menu-frame') && !event.target.closest('.mil-menu-frame > *')) {
            // Clicked on the overlay area of the menu; close if present
            safeRemove(menuFrame, 'mil-active');
            safeRemove(btnFrame, 'mil-active');
            const menuBtnEl = document.querySelector('.mil-menu-btn');
            safeRemove(menuBtnEl, 'mil-active');
            safeRemove(tp2, 'mil-menu-open');
        }
    });

    document.querySelectorAll('.mil-main-menu li a').forEach(link => {
        link.addEventListener('click', function (event) {
            const href = this.getAttribute('href');

            if (isValidHref(href)) {
                const menuBtn = document.querySelector('.mil-menu-btn');
                const menuFrame = document.querySelector('.mil-menu-frame');
                const btnFrame = document.querySelector('.mil-buttons-tp-frame');
                const tp2 = document.querySelector('.mil-top-panel-2');
                
                if (menuBtn && menuBtn.classList) menuBtn.classList.remove('mil-active');
                if (menuFrame && menuFrame.classList) menuFrame.classList.remove('mil-active');
                if (btnFrame && btnFrame.classList) btnFrame.classList.remove('mil-active');
                if (tp2 && tp2.classList) tp2.classList.remove('mil-menu-open');
            } else {
                event.preventDefault();
            }
        });
    });

    function isValidHref(href) {
        return href && href.trim() !== '' && href.length > 1 && !/^#(\.|$)/.test(href);
    }

    document.querySelectorAll('.mil-has-children > a').forEach(link => {
        link.addEventListener('click', function (event) {
            event.stopPropagation();
            event.preventDefault(); // Додаємо, щоб уникнути переходу за посиланням

            const parentElement = link.parentElement;
            const isActive = parentElement.classList.contains('mil-active');

            document.querySelectorAll('.mil-has-children').forEach(el => {
                const ul = el.querySelector('ul');
                el.classList.remove('mil-active');
                if (ul) ul.style.maxHeight = '0';
            });

            if (!isActive) {
                parentElement.classList.add('mil-active');
                const ul = parentElement.querySelector('ul');
                if (ul) ul.style.maxHeight = `${ul.scrollHeight}px`;
            }
        });
    });

    let lastScrollTop = 0;

    window.addEventListener('scroll', () => {
        const topPanel = document.querySelector('.mil-top-panel-2');
        const menuFrame = document.querySelector('.mil-menu-frame-2');
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (menuFrame && menuFrame.classList && menuFrame.classList.contains('mil-active')) {
            return; // Stop execution if .mil-active class is present
        }

        if (topPanel) {
            if (scrollTop > lastScrollTop) {
                topPanel.classList.add('mil-scroll');
            } else if (scrollTop < lastScrollTop && scrollTop === 0) {
                topPanel.classList.remove('mil-scroll');
            }
        }

        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    });


    /* -------------------------------------------

    onepage navigation

    ------------------------------------------- */
    if (!window.__peerfitAnchorHandler) {
        document.querySelectorAll('.mil-onepage-nav a, .mil-scroll-to').forEach(link => {
            link.addEventListener('click', function (event) {
                event.preventDefault();
                const targetId = this.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                if (!targetElement) return;
                const offsetY = (function(){
                    var header = document.querySelector('.mil-top-panel-2');
                    var h = header ? (header.offsetHeight || 0) : 0;
                    return (h || (window.innerWidth < 992 ? 90 : 120)) + 24;
                })();
                const smoother = ScrollSmoother.get && ScrollSmoother.get();
                if (smoother) {
                    smoother.scrollTo(targetElement, true, offsetY);
                } else {
                    const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                    const currentPosition = window.pageYOffset;
                    const distance = Math.abs(targetPosition - currentPosition);
                    const baseDuration = 0.1;
                    const duration = baseDuration + (distance / 4000);
                    gsap.to(window, {
                        duration: duration,
                        ease: 'sine',
                        scrollTo: { y: targetElement, offsetY }
                    });
                }
            });
        });
    }

    /* -------------------------------------------

    scrollbar

    ------------------------------------------- */
    gsap.to('.mil-progress', {
        height: '100%',
        ease: 'sine',
        scrollTrigger: {
            scrub: 0.3
        }
    });

    /* -------------------------------------------

    ruber letters

    ------------------------------------------- */
    const headings = document.querySelectorAll('.mil-rubber');

    headings.forEach(heading => {
        const textNodes = [];

        heading.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent.split(' ').forEach((word, index, array) => {
                    const wordSpan = document.createElement('span');
                    wordSpan.classList.add('mil-word-span');
                    word.split('').forEach(letter => {
                        const letterSpan = document.createElement('span');
                        letterSpan.classList.add('mil-letter-span');
                        letterSpan.textContent = letter;
                        wordSpan.appendChild(letterSpan);
                    });
                    textNodes.push(wordSpan);
                    if (index < array.length - 1) {
                        textNodes.push(document.createTextNode(' '));
                    }
                });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                textNodes.push(node.cloneNode(true));
            }
        });

        heading.innerHTML = '';
        textNodes.forEach(node => heading.appendChild(node));

        const letters = heading.querySelectorAll('.mil-letter-span');
        letters.forEach(letter => {
            letter.addEventListener('mouseenter', () => {
                gsap.to(letter, {
                    scaleY: 1.1,
                    y: '-5%',
                    duration: 0.2,
                    ease: 'sine'
                });
            });

            letter.addEventListener('mouseleave', () => {
                gsap.to(letter, {
                    scaleY: 1,
                    y: '0%',
                    duration: 0.2,
                    ease: 'sine'
                });
            });
        });
    });

    // Capture-phase safety net: intercept any in-page hash link before others
    document.addEventListener('click', function (e) {
        const a = e.target && e.target.closest && e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#') && href.length > 1 && href !== '#.') {
            const el = document.querySelector(href);
            if (!el) return;
            console.log('Safari Debug: Global click handler triggered for', href);
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            if (window.__peerfitSetUrlHashSilently) window.__peerfitSetUrlHashSilently(href);
            if (window.__peerfitSmoothScrollTo) {
                window.__peerfitSmoothScrollTo(el);
            } else {
                // Absolute last resort: instant jump with manual offset
                var header = document.querySelector('.mil-top-panel-2');
                var h = header ? (header.offsetHeight || 0) : 0;
                var oy = (h || (window.innerWidth < 992 ? 90 : 120)) + 24;
                console.log('Safari Debug: Using absolute fallback scroll');
                window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - oy);
            }
        }
    }, true);

    /* -------------------------------------------

    counters

    ------------------------------------------- */
    const numbers = document.querySelectorAll(".mil-counter");

    if (numbers.length > 0) {
        numbers.forEach(element => {
            const zero = {
                val: 0
            };
            const num = parseFloat(element.dataset.number);
            const split = num.toString().split(".");
            const decimals = split.length > 1 ? split[1].length : 0;

            gsap.to(zero, {
                val: num,
                duration: 1.8,
                scrollTrigger: {
                    trigger: element,
                    toggleActions: 'play none none reverse',
                },
                onUpdate: function () {
                    element.textContent = zero.val.toFixed(decimals);
                }
            });
        });
    }

    /* -------------------------------------------

    scroll animation

    ------------------------------------------- */
    const appearance = document.querySelectorAll(".mil-up");
    appearance.forEach((section) => {
        gsap.fromTo(section, {
            opacity: 0,
            y: 40,
            scale: 1.04,
            ease: 'sine',
        }, {
            y: 0,
            opacity: 1,
            scale: 1,
            scrollTrigger: {
                trigger: section,
                toggleActions: 'play none none reverse',
            }
        });
    });

    /* -------------------------------------------

    parallax animation

    ------------------------------------------- */

    const parallaxImages = document.querySelectorAll(".mil-parallax-img");

    parallaxImages.forEach((section) => {
        var value1 = section.getAttribute("data-value-1");
        var value2 = section.getAttribute("data-value-2");

        gsap.fromTo(section, {
            ease: 'sine',
            y: value1
        }, {
            y: value2,
            scrollTrigger: {
                trigger: section,
                scrub: true,
                toggleActions: 'play none none reverse'
            }
        });
    });

    /* -------------------------------------------

    parallax x animation

    ------------------------------------------- */

    const parallaxXImages = document.querySelectorAll(".mil-parallax-x-img");

    parallaxXImages.forEach((section) => {
        var value1 = section.getAttribute("data-value-1");
        var value2 = section.getAttribute("data-value-2");

        gsap.fromTo(section, {
            ease: 'sine',
            x: value1
        }, {
            x: value2,
            scrollTrigger: {
                trigger: section,
                scrub: true,
                toggleActions: 'play none none reverse'
            }
        });
    });


    /* -------------------------------------------

    scale animation

    ------------------------------------------- */
    const scaleImage = document.querySelectorAll(".mil-scale-img");

    scaleImage.forEach((section) => {
        var value1 = section.getAttribute("data-value-1");
        var value2 = section.getAttribute("data-value-2");

        if (window.innerWidth < 1200) {
            value1 = Math.max(.95, value1);
        }

        gsap.fromTo(section, {
            ease: 'sine',
            scale: value1,
        }, {
            scale: value2,
            scrollTrigger: {
                trigger: section,
                scrub: true,
                toggleActions: 'play none none reverse',
            }
        });
    });

    /* -------------------------------------------

    rotate animation

    ------------------------------------------- */
    const rotate = document.querySelectorAll(".mil-rotate");

    rotate.forEach((section) => {
        var value = section.getAttribute("data-value");
        gsap.fromTo(section, {
            ease: 'sine',
            rotate: 0,
        }, {
            rotate: value,
            scrollTrigger: {
                trigger: section,
                scrub: true,
                toggleActions: 'play none none reverse',
            }
        });
    });

    /* -------------------------------------------

    add class

    ------------------------------------------- */
    function addClassToElement(element) {
        if (element) {
            element.classList.add('mil-added');
        }
    }

    function removeClassFromElement(element) {
        if (element) {
            element.classList.remove('mil-added');
        }
    }

    document.querySelectorAll('.mil-add-class').forEach(element => {
        ScrollTrigger.create({
            trigger: element,
            toggleActions: 'play none none reverse',
            onEnter: () => addClassToElement(element),
            onLeaveBack: () => removeClassFromElement(element)
        });
    });

    /* -------------------------------------------

    sliders

    ------------------------------------------- */

    var swiper = new Swiper('.mil-blog-slider', {
        parallax: true,
        autoHeight: true,
        spaceBetween: 30,
        slidesPerView: 1,
        speed: 800,
        navigation: {
            prevEl: '.mil-nl-prev',
            nextEl: '.mil-nl-next',
        },
        breakpoints: {
            992: {
                slidesPerView: 2,
            },
        },
        on: {
            slideChangeTransitionEnd: function () {
                ScrollTrigger.refresh();
            }
        }
    });

    var swiper = new Swiper('.mil-blog-slider-sm', {
        parallax: true,
        autoHeight: true,
        spaceBetween: 30,
        slidesPerView: 1,
        speed: 800,
        navigation: {
            prevEl: '.mil-sb-prev',
            nextEl: '.mil-sb-next',
        },
        breakpoints: {
            992: {
                slidesPerView: 2,
            },
        },
        on: {
            slideChangeTransitionEnd: function () {
                ScrollTrigger.refresh();
            }
        }
    });

    var swiper = new Swiper('.mil-reviews-slider', {
        parallax: true,
        autoHeight: true,
        spaceBetween: 120,
        slidesPerView: 1,
        initialSlide: 1,
        speed: 800,
        pagination: {
            el: ".mil-sr-pagination",
            clickable: true,
        },
        navigation: {
            prevEl: '.mil-sr-prev',
            nextEl: '.mil-sr-next',
        },
        on: {
            slideChangeTransitionEnd: function () {
                ScrollTrigger.refresh();
            }
        }
    });

    var swiper = new Swiper('.mil-project-slider', {
        parallax: true,
        autoHeight: true,
        spaceBetween: 30,
        slidesPerView: 1,
        speed: 800,
        breakpoints: {
            992: {
                slidesPerView: 2,
            },
        },
        on: {
            slideChangeTransitionEnd: function () {
                ScrollTrigger.refresh();
            }
        }
    });

    /* ----------------------------------------------------------------------------
    -------------------------------------------------------------------------------

    reinit

    -------------------------------------------------------------------------------
    ---------------------------------------------------------------------------- */

    swup.hooks.on('page:view', () => {

        /* -------------------------------------------

        register gsap plugins

        ------------------------------------------- */
        if (window.gsap) {
            try {
                var __plugins2 = [];
                if (window.ScrollTrigger) __plugins2.push(window.ScrollTrigger);
                if (window.ScrollSmoother) __plugins2.push(window.ScrollSmoother);
                if (window.ScrollToPlugin) __plugins2.push(window.ScrollToPlugin);
                if (__plugins2.length) gsap.registerPlugin.apply(gsap, __plugins2);
            } catch (e) { /* noop */ }
        }
        /* -------------------------------------------

        ScrollSmoother

        ------------------------------------------- */
        if (window.__peerfitSetupScrollSmoother) {
            window.__peerfitSetupScrollSmoother();
        }

        /* -------------------------------------------

        cursor

        ------------------------------------------- */

        const elements = document.querySelectorAll('.mil-cursor-follower');

        elements.forEach(element => {
            element.className = 'mil-cursor-follower';
        });

        function addHoverEffect(selector, className) {
            document.querySelectorAll(selector).forEach(function (link) {
                link.addEventListener("mouseenter", function () {
                    follower.classList.add(className);
                });
                link.addEventListener("mouseleave", function () {
                    follower.classList.remove(className);
                });
            });
        }

        addHoverEffect(".mil-c-light", "mil-light-active");
        addHoverEffect(".mil-c-dark", "mil-dark-active");
        addHoverEffect(".mil-c-gone", "mil-gone-active");
        addHoverEffect(".mil-c-view", "mil-view-active");
        addHoverEffect(".mil-c-next", "mil-next-active");
        addHoverEffect(".mil-c-read", "mil-read-active");
        addHoverEffect(".mil-c-swipe", "mil-swipe-active");

        document.addEventListener("mousemove", function (e) {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        /* -------------------------------------------

        cursor parallax

        ------------------------------------------- */
        var scene1 = document.getElementById('scene');
        if (scene1) {
            var parallaxInstance1 = new Parallax(scene1, {
                limitY: 10,
            });
        }

        var scene2 = document.getElementById('scene-2');
        if (scene2) {
            var parallaxInstance2 = new Parallax(scene2, {
                limitY: 10,
            });
        }

        /* -------------------------------------------

        menu

        ------------------------------------------- */

        document.querySelectorAll('.mil-main-menu li a').forEach(link => {
            link.addEventListener('click', function (event) {
                const href = this.getAttribute('href');

                if (isValidHref(href)) {
                    const menuBtn = document.querySelector('.mil-menu-btn');
                    const menuFrame = document.querySelector('.mil-menu-frame');
                    const btnFrame = document.querySelector('.mil-buttons-tp-frame');
                    const tp2 = document.querySelector('.mil-top-panel-2');
                    
                    if (menuBtn && menuBtn.classList) menuBtn.classList.remove('mil-active');
                    if (menuFrame && menuFrame.classList) menuFrame.classList.remove('mil-active');
                    if (btnFrame && btnFrame.classList) btnFrame.classList.remove('mil-active');
                    if (tp2 && tp2.classList) tp2.classList.remove('mil-menu-open');
                } else {
                    event.preventDefault(); // Якщо href невалідний, зупиняємо дію за замовчуванням
                }
            });
        });

        function isValidHref(href) {
            return href && href.trim() !== '' && href.length > 1 && !/^#(\.|$)/.test(href);
        }

        document.querySelectorAll('.mil-has-children > a').forEach(link => {
            link.addEventListener('click', function (event) {
                event.stopPropagation();
                event.preventDefault(); // Додаємо, щоб уникнути переходу за посиланням

                const parentElement = link.parentElement;
                const isActive = parentElement.classList.contains('mil-active');

                document.querySelectorAll('.mil-has-children').forEach(el => {
                    const ul = el.querySelector('ul');
                    el.classList.remove('mil-active');
                    if (ul) ul.style.maxHeight = '0';
                });

                if (!isActive) {
                    parentElement.classList.add('mil-active');
                    const ul = parentElement.querySelector('ul');
                    if (ul) ul.style.maxHeight = `${ul.scrollHeight}px`;
                }
            });
        });
        /* -------------------------------------------

        onepage navigation

        ------------------------------------------- */
        document.querySelectorAll('.mil-onepage-nav > li > a, .mil-scroll-to').forEach(link => {
            link.addEventListener('click', function (event) {
                const href = this.getAttribute('href') || '';
                if (!href.startsWith('#') || href.length <= 1 || href === '#.') return; // let normal links work
                event.preventDefault();
                const targetElement = document.querySelector(href);
                if (!targetElement) return;
                if (window.__peerfitSmoothScrollTo) {
                    window.__peerfitSmoothScrollTo(targetElement);
                }
            });
        });

        /* -------------------------------------------

        ruber letters

        ------------------------------------------- */
        const headings = document.querySelectorAll('.mil-rubber');

        headings.forEach(heading => {
            const textNodes = [];

            heading.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    node.textContent.split(' ').forEach((word, index, array) => {
                        const wordSpan = document.createElement('span');
                        wordSpan.classList.add('mil-word-span');
                        word.split('').forEach(letter => {
                            const letterSpan = document.createElement('span');
                            letterSpan.classList.add('mil-letter-span');
                            letterSpan.textContent = letter;
                            wordSpan.appendChild(letterSpan);
                        });
                        textNodes.push(wordSpan);
                        if (index < array.length - 1) {
                            textNodes.push(document.createTextNode(' '));
                        }
                    });
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    textNodes.push(node.cloneNode(true));
                }
            });

            heading.innerHTML = '';
            textNodes.forEach(node => heading.appendChild(node));

            const letters = heading.querySelectorAll('.mil-letter-span');
            letters.forEach(letter => {
                letter.addEventListener('mouseenter', () => {
                    gsap.to(letter, {
                        scaleY: 1.1,
                        y: '-5%',
                        duration: 0.2,
                        ease: 'sine'
                    });
                });

                letter.addEventListener('mouseleave', () => {
                    gsap.to(letter, {
                        scaleY: 1,
                        y: '0%',
                        duration: 0.2,
                        ease: 'sine'
                    });
                });
            });
        });


        /* -------------------------------------------

        counters

        ------------------------------------------- */
        const numbers = document.querySelectorAll(".mil-counter");

        if (numbers.length > 0) {
            numbers.forEach(element => {
                const zero = {
                    val: 0
                };
                const num = parseFloat(element.dataset.number);
                const split = num.toString().split(".");
                const decimals = split.length > 1 ? split[1].length : 0;

                gsap.to(zero, {
                    val: num,
                    duration: 1.8,
                    scrollTrigger: {
                        trigger: element,
                        toggleActions: 'play none none reverse',
                    },
                    onUpdate: function () {
                        element.textContent = zero.val.toFixed(decimals);
                    }
                });
            });
        }

        /* -------------------------------------------

        scroll animation

        ------------------------------------------- */
        const appearance = document.querySelectorAll(".mil-up");
        appearance.forEach((section) => {
            gsap.fromTo(section, {
                opacity: 0,
                y: 40,
                scale: 1.04,
                ease: 'sine',
            }, {
                y: 0,
                opacity: 1,
                scale: 1,
                scrollTrigger: {
                    trigger: section,
                    toggleActions: 'play none none reverse',
                }
            });
        });

        /* -------------------------------------------

        parallax animation

        ------------------------------------------- */

        const parallaxImages = document.querySelectorAll(".mil-parallax-img");

        parallaxImages.forEach((section) => {
            var value1 = section.getAttribute("data-value-1");
            var value2 = section.getAttribute("data-value-2");

            gsap.fromTo(section, {
                ease: 'sine',
                y: value1
            }, {
                y: value2,
                scrollTrigger: {
                    trigger: section,
                    scrub: true,
                    toggleActions: 'play none none reverse'
                }
            });
        });

        /* -------------------------------------------

        parallax x animation

        ------------------------------------------- */

        const parallaxXImages = document.querySelectorAll(".mil-parallax-x-img");

        parallaxXImages.forEach((section) => {
            var value1 = section.getAttribute("data-value-1");
            var value2 = section.getAttribute("data-value-2");

            gsap.fromTo(section, {
                ease: 'sine',
                x: value1
            }, {
                x: value2,
                scrollTrigger: {
                    trigger: section,
                    scrub: true,
                    toggleActions: 'play none none reverse'
                }
            });
        });


        /* -------------------------------------------

        scale animation

        ------------------------------------------- */
        const scaleImage = document.querySelectorAll(".mil-scale-img");

        scaleImage.forEach((section) => {
            var value1 = section.getAttribute("data-value-1");
            var value2 = section.getAttribute("data-value-2");

            if (window.innerWidth < 1200) {
                value1 = Math.max(.95, value1);
            }

            gsap.fromTo(section, {
                ease: 'sine',
                scale: value1,
            }, {
                scale: value2,
                scrollTrigger: {
                    trigger: section,
                    scrub: true,
                    toggleActions: 'play none none reverse',
                }
            });
        });

        /* -------------------------------------------

        rotate animation

        ------------------------------------------- */
        const rotate = document.querySelectorAll(".mil-rotate");

        rotate.forEach((section) => {
            var value = section.getAttribute("data-value");
            gsap.fromTo(section, {
                ease: 'sine',
                rotate: 0,
            }, {
                rotate: value,
                scrollTrigger: {
                    trigger: section,
                    scrub: true,
                    toggleActions: 'play none none reverse',
                }
            });
        });

        /* -------------------------------------------

        add class

        ------------------------------------------- */
        function addClassToElement(element) {
            if (element) {
                element.classList.add('mil-added');
            }
        }

        function removeClassFromElement(element) {
            if (element) {
                element.classList.remove('mil-added');
            }
        }

        document.querySelectorAll('.mil-add-class').forEach(element => {
            ScrollTrigger.create({
                trigger: element,
                toggleActions: 'play none none reverse',
                onEnter: () => addClassToElement(element),
                onLeaveBack: () => removeClassFromElement(element)
            });
        });
        /* -------------------------------------------

        sliders

        ------------------------------------------- */

        var swiper = new Swiper('.mil-blog-slider', {
            parallax: true,
            autoHeight: true,
            spaceBetween: 30,
            slidesPerView: 1,
            speed: 800,
            navigation: {
                prevEl: '.mil-nl-prev',
                nextEl: '.mil-nl-next',
            },
            breakpoints: {
                992: {
                    slidesPerView: 2,
                },
            },
            on: {
                slideChangeTransitionEnd: function () {
                    ScrollTrigger.refresh();
                }
            }
        });

        var swiper = new Swiper('.mil-blog-slider-sm', {
            parallax: true,
            autoHeight: true,
            spaceBetween: 30,
            slidesPerView: 1,
            speed: 800,
            navigation: {
                prevEl: '.mil-sb-prev',
                nextEl: '.mil-sb-next',
            },
            breakpoints: {
                992: {
                    slidesPerView: 2,
                },
            },
            on: {
                slideChangeTransitionEnd: function () {
                    ScrollTrigger.refresh();
                }
            }
        });

        var swiper = new Swiper('.mil-reviews-slider', {
            parallax: true,
            autoHeight: true,
            spaceBetween: 120,
            slidesPerView: 1,
            initialSlide: 1,
            speed: 800,
            pagination: {
                el: ".mil-sr-pagination",
                clickable: true,
            },
            navigation: {
                prevEl: '.mil-sr-prev',
                nextEl: '.mil-sr-next',
            },
            on: {
                slideChangeTransitionEnd: function () {
                    ScrollTrigger.refresh();
                }
            }
        });

        var swiper = new Swiper('.mil-project-slider', {
            parallax: true,
            autoHeight: true,
            spaceBetween: 30,
            slidesPerView: 1,
            speed: 800,
            breakpoints: {
                992: {
                    slidesPerView: 2,
                },
            },
            on: {
                slideChangeTransitionEnd: function () {
                    ScrollTrigger.refresh();
                }
            }
        });
    });

});
