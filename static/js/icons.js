/**
 * icons.js — internal, self-hosted SVG icon helper.
 *
 * This is NOT the Lucide npm package or a CDN import — there is no bundler in
 * this project (every script here is a plain <script src> tag), so this file
 * hand-vendors just the handful of icon paths this app actually uses (in the
 * same stroke-based style Lucide icons use) as inline SVG strings. No network
 * request, no external dependency.
 *
 * Must load before main.js and every feature script — see templates/index.html.
 */
(function () {
    const ICONS = {
        check: '<polyline points="20 6 9 17 4 12"></polyline>',
        x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
        'refresh-cw': '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path>',
        'chevron-left': '<polyline points="15 18 9 12 15 6"></polyline>',
        'chevron-right': '<polyline points="9 18 15 12 9 6"></polyline>',
        umbrella: '<path d="M22 12a10.06 10.06 1 0 0-20 0Z"></path><path d="M12 12v8a2 2 0 0 0 4 0"></path><path d="M12 2v3"></path>',
        sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.288 1.287L3 12l5.8 1.9a2 2 0 0 1 1.287 1.288L12 21l1.9-5.8a2 2 0 0 1 1.288-1.287L21 12l-5.8-1.9a2 2 0 0 1-1.287-1.288Z"></path>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
    };

    const DEFAULT_SIZE = 20;
    const DEFAULT_STROKE_WIDTH = 2;

    /**
     * window.icon(name, options) -> inline <svg> markup string.
     * options: { size, strokeWidth, class, label }
     *   - size, strokeWidth: numbers, default 20 / 2.
     *   - class: extra CSS class(es) on the <svg>.
     *   - label: if provided, the icon becomes meaningful (role="img"
     *     aria-label="..."); otherwise it's decorative (aria-hidden="true").
     *     focusable="false" is always set either way.
     */
    window.icon = function (name, options) {
        const body = ICONS[name];
        if (!body) {
            console.error(`icon(): unknown icon name "${name}"`);
            return '';
        }
        const opts = options || {};
        const size = opts.size || DEFAULT_SIZE;
        const strokeWidth = opts.strokeWidth || DEFAULT_STROKE_WIDTH;
        const classAttr = opts.class ? ` class="${opts.class}"` : '';
        const a11yAttrs = opts.label
            ? ` role="img" aria-label="${opts.label}"`
            : ' aria-hidden="true"';
        return `<svg${classAttr} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" focusable="false"${a11yAttrs}>${body}</svg>`;
    };

    /**
     * window.renderStatusBadge(status) -> full "<span class="period-status-badge ...">" markup.
     * status: 'present' | 'absent' | 'none'.
     * Preserves the existing period-status-badge / badge-present / badge-absent
     * class + text semantics — state is conveyed by text, not color/icon alone.
     */
    const STATUS_BADGE_CONFIG = {
        present: { icon: 'check', text: 'Present', cls: 'badge-present' },
        absent: { icon: 'x', text: 'Absent', cls: 'badge-absent' },
        none: { icon: null, text: 'No class', cls: 'badge-none' },
    };

    window.renderStatusBadge = function (status) {
        const cfg = STATUS_BADGE_CONFIG[status] || STATUS_BADGE_CONFIG.none;
        const iconHtml = cfg.icon ? window.icon(cfg.icon, { size: 12, class: 'status-badge-icon' }) : '';
        return `<span class="period-status-badge ${cfg.cls}" style="display:inline-flex;align-items:center;gap:4px;">${iconHtml}${cfg.text}</span>`;
    };
})();
