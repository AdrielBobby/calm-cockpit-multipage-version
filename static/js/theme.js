/**
 * theme.js — light/dark toggle. Paper (light) is the default; the choice is
 * remembered in localStorage. The saved theme is applied before first paint by
 * the inline script in base.html's <head>; this file only wires the button.
 */
(function () {
    const KEY = 'theme';

    function current() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function apply(theme) {
        if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#f6f2ec');
    }

    function render(btn) {
        const dark = current() === 'dark';
        btn.innerHTML = window.icon(dark ? 'sun' : 'moon', { size: 18 });
        btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
        btn.title = btn.getAttribute('aria-label');
    }

    function init() {
        const nav = document.querySelector('.view-nav');
        if (!nav) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle';
        render(btn);
        btn.addEventListener('click', () => {
            const next = current() === 'dark' ? 'light' : 'dark';
            apply(next);
            try { localStorage.setItem(KEY, next); } catch (e) { /* storage unavailable */ }
            render(btn);
            document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
        });
        nav.appendChild(btn);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
