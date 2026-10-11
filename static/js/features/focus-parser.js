/* focus-parser.js - Turns pasted study-plan text into an ordered session list. No DOM access.

   Tables: a markdown table (| Topic | Pomodoros | Coverage |) or the tab-separated text you get
   when copying a rendered table out of a chat. Columns are picked by header name; a count column
   ("Pomodoros", "Sessions", "Count") turns one topic into that many sessions.

   Lines (case-insensitive, markdown like **, ###, > and - stripped first):
     Pomodoro 1 — Title        Pomodoro 1: Title        Pomo 1 (25 min) - Title
     Session 1: Title          1. Title                 1) Title              #1 Title
     Pomodoro 2–3 — Title      Title (2 Pomodoros)      (both give two sessions)
   If any "Pomodoro N" / "Session N" lines exist, only those count, so numbered sub-points
   under a session become part of its description instead of extra sessions.
   A spaced dash inside the title ("SQL basics — purpose, data types") splits off a description.
   Bulleted, indented or directly-following lines under a session are appended to its description.

   A topic worth N Pomodoros becomes "Title (1/N)" … "Title (N/N)". If its description has exactly
   N parts separated by ";", each session gets its own part; otherwise all share the description. */
(function () {
    const MAX_PER_TOPIC = 12;
    // Number, optional range end (only when followed by a separator, so "Pomodoro 1 — 5 tips" stays one).
    const KEYWORD_RE = /^(?:pomodoros?|pomos?|sessions?)\s*#?\s*(\d+)(?:\s*[–—-]\s*(\d+)(?=\s*(?:[—–:.)-]|\(|$)))?\s*(?:\([^)]*\))?\s*(?:[—–:.)-]\s*)?(.*)$/i;
    const NUMBERED_RE = /^(?:#\s*(\d+)\s+|(\d+)\s*[.)]\s+)(.+)$/;
    const BREAK_RE = /^(?:short\s+|long\s+)?break\b/i;
    const DESC_SPLIT_RE = /\s+[—–-]\s+/;
    const COUNT_SUFFIX_RE = /\s*(?:[([]\s*(\d+)\s*(?:pomodoros?|pomos?|sessions?)\s*[)\]]|[—–-]\s*(\d+)\s*(?:pomodoros?|pomos?)|[×x]\s*(\d+))\s*$/i;

    const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
    const COL = {
        count: /pomodoros|pomos|^(?:count|sessions|blocks|slots|no\.? of .*|how many.*)$/,
        index: /^(?:#|no\.?|s\.?\s?no\.?|sr\.?\s?no\.?|pomodoro|pomo|session|day|order)$/,
        desc: /coverage|description|details|content|notes|subtopics?|covers?|what|goal|includes?|breakdown/,
        title: /topic|title|subject|module|chapter|unit|lesson|concept|area|task|name/,
    };

    function clean(line) {
        return line
            .replace(/\*\*|__|`/g, '')
            .replace(/^\s*(?:>\s*)+/, '')
            .replace(/^\s*#{1,6}\s+/, '')
            .replace(/^\s*[-*•]\s+/, '')
            .trim();
    }

    const isBullet = (raw) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(raw);
    const isIndented = (raw) => /^(?:\t| {2,})\S/.test(raw);
    const isHeading = (raw) => /^\s*#{1,6}\s/.test(raw) || /^\s*\*\*[^*]+\*\*:?\s*$/.test(raw);
    const isCount = (cell) => /^\d{1,2}$/.test(cell);
    const nameFrom = (text) => text.replace(/^plan\s*[:—–-]\s*/i, '').replace(/:$/, '').trim();

    function clampCount(n, warnings, title) {
        if (!n || n < 1) return 1;
        if (n > MAX_PER_TOPIC) {
            warnings.push(`"${title}" asked for ${n} Pomodoros; capped at ${MAX_PER_TOPIC}.`);
            return MAX_PER_TOPIC;
        }
        return n;
    }

    /* One topic -> `count` sessions. */
    function expand(topic) {
        const { title, description, count } = topic;
        if (count <= 1) return [{ title, description }];
        const parts = description.split(/\s*;\s*/).filter(Boolean);
        const perPart = parts.length === count;
        return Array.from({ length: count }, (_, i) => ({
            title: `${title} (${i + 1}/${count})`,
            description: perPart ? parts[i] : description,
        }));
    }

    function finish(name, topics, warnings) {
        const sessions = [];
        topics.forEach((t) => expand(t).forEach((s) => sessions.push({
            title: s.title.slice(0, 200), description: s.description.slice(0, 1000),
        })));
        return { name, sessions, topicCount: topics.length, warnings };
    }

    /* ── Tables ─────────────────────────────────────────────────── */
    function tableCells(raw) {
        if (TABLE_SEPARATOR_RE.test(raw)) return 'sep';
        if (/^\s*\|.*\|\s*$/.test(raw)) return raw.trim().slice(1, -1).split('|').map(clean);
        if (raw.includes('\t')) return raw.split('\t').map(clean);
        return null;
    }

    function findTable(lines) {
        const rows = [];
        let name = '';
        let started = false;
        for (const raw of lines) {
            const cells = tableCells(raw);
            if (cells === 'sep') continue;
            if (cells && cells.filter(Boolean).length >= 2) {
                rows.push(cells);
                started = true;
            } else if (started && raw.trim()) {
                break; // only the first table
            } else if (!started && raw.trim() && !name) {
                name = nameFrom(clean(raw));
            }
        }
        return rows.length >= 2 ? { name, rows } : null;
    }

    function pickColumns(header, body) {
        const h = header.map((c) => c.toLowerCase());
        const find = (re, taken) => h.findIndex((c, i) => c && !taken.includes(i) && re.test(c));
        const cols = {};
        const taken = [];
        for (const key of ['count', 'index', 'desc', 'title']) {
            const i = find(COL[key], taken);
            if (i >= 0) { cols[key] = i; taken.push(i); }
        }
        const recognised = taken.length > 0;
        const width = Math.max(...body.map((r) => r.length), header.length);
        const textual = (i) => body.some((r) => r[i] && !isCount(r[i]));
        if (cols.title === undefined) {
            for (let i = 0; i < width; i++) if (!taken.includes(i) && textual(i)) { cols.title = i; taken.push(i); break; }
        }
        if (cols.count === undefined && !recognised) {
            for (let i = 0; i < width; i++) {
                if (!taken.includes(i) && body.every((r) => !r[i] || isCount(r[i]))) { cols.count = i; taken.push(i); break; }
            }
        }
        if (cols.desc === undefined) {
            let best = -1;
            let bestLen = 0;
            for (let i = 0; i < width; i++) {
                if (taken.includes(i)) continue;
                const len = body.reduce((n, r) => n + (r[i] || '').length, 0);
                if (textual(i) && len > bestLen) { best = i; bestLen = len; }
            }
            if (best >= 0) cols.desc = best;
        }
        return { cols, recognised };
    }

    function parseTable(table) {
        const warnings = [];
        const first = pickColumns(table.rows[0], table.rows.slice(1));
        // A header row is one whose cells name the columns; otherwise every row is data.
        const { cols } = first.recognised ? first : pickColumns([], table.rows);
        const body = first.recognised ? table.rows.slice(1) : table.rows;
        const topics = [];
        body.forEach((r) => {
            const title = (r[cols.title] || '').trim();
            if (!title || /^total\b/i.test(title)) return;
            const raw = cols.count !== undefined ? parseInt(r[cols.count], 10) : 1;
            topics.push({
                title,
                description: cols.desc !== undefined ? (r[cols.desc] || '').trim() : '',
                count: clampCount(raw, warnings, title),
            });
        });
        return finish(table.name, topics, warnings);
    }

    /* ── Lines ──────────────────────────────────────────────────── */
    function matchSession(text, keywordOnly) {
        let m = KEYWORD_RE.exec(text);
        if (m) {
            const lo = parseInt(m[1], 10);
            const hi = m[2] ? parseInt(m[2], 10) : lo;
            return { number: lo, last: hi > lo ? hi : lo, rest: m[3].trim() };
        }
        if (keywordOnly) return null;
        m = NUMBERED_RE.exec(text);
        if (m) {
            const n = parseInt(m[1] || m[2], 10);
            return { number: n, last: n, rest: m[3].trim() };
        }
        return null;
    }

    function splitTitle(rest) {
        const parts = rest.split(DESC_SPLIT_RE);
        if (parts.length < 2 || !parts[0].trim()) return { title: rest, description: '' };
        return { title: parts[0].trim(), description: parts.slice(1).join(' — ').trim() };
    }

    /* "Title (2 Pomodoros)" / "Title — 2 pomodoros" / "Title x2" -> count 2. */
    function takeCountSuffix(title) {
        const m = COUNT_SUFFIX_RE.exec(title);
        if (!m || m.index === 0) return { title, count: null };
        return { title: title.slice(0, m.index).trim(), count: parseInt(m[1] || m[2] || m[3], 10) };
    }

    function parseLines(lines) {
        const keywordOnly = lines.some((l) => KEYWORD_RE.test(clean(l)));
        const items = [];
        const warnings = [];
        let name = '';
        let current = null;      // item currently collecting description lines
        let sawBlank = false;

        lines.forEach((raw) => {
            const text = clean(raw);
            if (!text) { sawBlank = true; return; }

            const hit = matchSession(text, keywordOnly);
            if (hit) {
                // Keyword lines with nothing after the number ("Pomodoro 3") take their title from the next line.
                const { title, description } = splitTitle(hit.rest);
                current = { number: hit.number, last: hit.last, title, description, needsTitle: !title };
                items.push(current);
                sawBlank = false;
                return;
            }

            if (!items.length) {
                if (!name) name = nameFrom(text);
                return;
            }
            if (BREAK_RE.test(text) || isHeading(raw)) { current = null; sawBlank = false; return; }
            if (!current) return;
            if (current.needsTitle) {
                current.title = text;
                current.needsTitle = false;
            } else if (isBullet(raw) || isIndented(raw) || !sawBlank) {
                current.description = current.description ? current.description + '\n' + text : text;
            } else {
                current = null;
            }
            sawBlank = false;
        });

        const titled = items.filter((s) => s.title);
        if (titled.length < items.length) warnings.push('Skipped ' + (items.length - titled.length) + ' session line(s) with no title.');

        const topics = titled.map((s) => {
            const suffix = takeCountSuffix(s.title);
            let description = s.description;
            let count = suffix.count;
            // "Heaps — 2 pomodoros": the dash split already moved the count into the description.
            const descCount = /^(\d+)\s*(?:pomodoros?|pomos?)$/i.exec(description);
            if (!count && descCount) { count = parseInt(descCount[1], 10); description = ''; }
            count = count || (s.last - s.number + 1);
            return { title: suffix.title, description, count: clampCount(count, warnings, suffix.title) };
        });

        // Numbering checks, treating "Pomodoro 2–3" as covering 2 and 3.
        const seen = new Set();
        const dupes = new Set();
        titled.forEach((s) => {
            for (let n = s.number; n <= s.last; n++) { if (seen.has(n)) dupes.add(n); seen.add(n); }
        });
        if (dupes.size) warnings.push('Repeated numbers: ' + [...dupes].join(', ') + '. Kept in the order they appear.');
        if (titled.length && !dupes.size) {
            const lo = Math.min(...seen);
            const hi = Math.max(...seen);
            const missing = [];
            for (let n = lo; n <= hi && missing.length <= 10; n++) if (!seen.has(n)) missing.push(n);
            if (missing.length) warnings.push('Missing numbers: ' + missing.join(', ') + '.');
        }

        return finish(name, topics, warnings);
    }

    function parseFocusPlan(text) {
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        const table = findTable(lines);
        return table ? parseTable(table) : parseLines(lines);
    }

    window.parseFocusPlan = parseFocusPlan;
})();
