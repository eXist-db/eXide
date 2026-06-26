/*
 * error-status-ui.js
 *
 * Improves the error display in the eXide status bar.
 *
 * eXide writes error text directly to #error-status (a hidden <a> element).
 * This module watches that element via MutationObserver and mirrors the content
 * into a compact pill (#exide-err-pill) and a slide-up detail panel (#exide-err-panel).
 *
 * We never write to #error-status, so there is no observer feedback loop.
 */
(function () {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────────────────────
    /**
     * Produce a short human-readable label from eXide's raw error string.
     * Strips the boilerplate prefix and location suffix, leaving just the
     * meaningful clause (e.g. "Call to undeclared function: local:foo").
     */
    function makeShortLabel(raw) {
        if (!raw) return '';
        var s = raw;
        // Strip "Cannot compile xquery: " prefix (present on server-side errors)
        s = s.replace(/^Cannot compile xquery:\s*/i, '');
        // Strip error code like "err:XPST0017 "
        s = s.replace(/^err:[A-Z0-9]+\s+/i, '');
        // Strip location suffix "[at line N, column N, source: ...]"
        s = s.replace(/\s*\[at line[\s\S]*$/, '');
        return s.length > 55 ? s.substring(0, 53) + '\u2026' : s;
    }
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    /**
     * Format the raw error string as HTML for the detail panel.
     * Highlights the error code and location clause.
     */
    function formatPanelHtml(raw) {
        if (!raw) return '';
        var s = escapeHtml(raw);
        // Highlight error code (e.g. err:XPST0017)
        s = s.replace(/(err:[A-Z0-9]+)/g, '<span class="ep-code">$1</span>');
        // Highlight location clause
        s = s.replace(
            /(\[at line \d+, column \d+[^\]]*\])/g,
            '<span class="ep-loc">$1</span>'
        );
        return s;
    }
    /**
     * Format a structured error object as a multi-field panel body. The query
     * error envelope is existdb-openapi#71's { code, message, line, column, raw }
     * (the `QueryError` schema in its api.json). Current existdb-openapi releases
     * (\u2264 v0.9.7) instead return a generic { error: "..." }; for that \u2014 or any
     * payload without recognizable structured fields \u2014 fall back to the
     * plain-text formatter so the panel is never blank.
     */
    function formatStructuredPanelHtml(errObj, raw) {
        if (!errObj) return formatPanelHtml(raw);
        var rows = [];
        function row(label, value, cssClass) {
            if (value === null || value === undefined || value === '') return;
            rows.push(
                '<div class="ep-field ep-field-' + cssClass + '">' +
                  '<span class="ep-field-label">' + label + '</span>' +
                  '<span class="ep-field-value">' + escapeHtml(value) + '</span>' +
                '</div>'
            );
        }
        row('Code', errObj.code, 'code');
        var loc = '';
        if (errObj.line) {
            loc = 'line ' + errObj.line;
            if (errObj.column) loc += ', column ' + errObj.column;
        }
        if (loc) row('Location', loc, 'loc');
        row('Description', errObj.message, 'desc');
        // Generic { error } (or anything without structured fields): show the
        // plain text rather than an empty panel.
        if (!rows.length) return formatPanelHtml(errObj.error || raw);
        return rows.join('');
    }
    /**
     * Format the structured error as a plain-text dump for the pill's
     * `title` attribute, so hovering the pill exposes the full info
     * (request from @line-o on PR #794: "put the dump in a title
     * attribute where we can still access it").
     */
    function formatTitleDump(errObj, raw) {
        if (!errObj) return raw;
        var lines = [];
        if (errObj.code) lines.push('Code:        ' + errObj.code);
        if (errObj.line) {
            var l = 'Location:    line ' + errObj.line;
            if (errObj.column) l += ', column ' + errObj.column;
            lines.push(l);
        }
        if (errObj.message) lines.push('Description: ' + errObj.message);
        // #71's `raw` is the full boilerplate behind the concise message; expose
        // it in the hover dump when it adds detail beyond the message shown.
        if (errObj.raw && errObj.raw !== errObj.message) {
            lines.push('Raw:         ' + errObj.raw);
        }
        return lines.length ? lines.join('\n') : (errObj.error || raw);
    }

    function init() {
    // ── Element references ───────────────────────────────────────────────────
    var errSource  = document.getElementById('error-status');       // eXide writes here
    var pill       = document.getElementById('exide-err-pill');
    var pillLabel  = document.getElementById('exide-err-pill-label');
    var pillArrow  = document.getElementById('exide-err-pill-arrow');
    var panel      = document.getElementById('exide-err-panel');
    var panelBody  = document.getElementById('exide-err-panel-body');
    var closeBtn   = document.getElementById('exide-err-panel-close');
    var copyBtn    = document.getElementById('exide-err-panel-copy');
    if (!errSource || !pill || !panel) {
        console.warn('[error-status-ui] Required elements not found — aborting.');
        return;
    }
    // ── State ────────────────────────────────────────────────────────────────
    var currentRaw  = '';
    var currentErr  = null;   // structured payload from editor.evalError, or null
    var panelOpen   = false;
    // ── Rendering ────────────────────────────────────────────────────────────
    function readStructured() {
        var json = errSource.dataset.error;
        if (!json) return null;
        try { return JSON.parse(json); } catch (e) { return null; }
    }
    function updatePill(raw, open) {
        if (!raw) {
            pill.classList.remove('has-error');
            pill.removeAttribute('title');
            return;
        }
        pillLabel.textContent = makeShortLabel(raw);
        // Expose full structured dump (when available) on hover, so the
        // user can read every field — code, location, description,
        // module, value — without expanding the panel.
        var dump = formatTitleDump(currentErr, raw);
        if (dump) {
            pill.setAttribute('title', dump);
        } else {
            pill.removeAttribute('title');
        }
        pillArrow.textContent = open ?'\u25BC' : '\u25B2'; // ▼ or ▲
        pill.classList.add('has-error');
    }
    function renderPanelBody() {
        if (currentErr) {
            panelBody.innerHTML = formatStructuredPanelHtml(currentErr, currentRaw);
            panelBody.classList.add('ep-structured');
        } else {
            panelBody.innerHTML = formatPanelHtml(currentRaw);
            panelBody.classList.remove('ep-structured');
        }
    }
    function showPanel() {
        renderPanelBody();
        panel.classList.add('ep-open');
        panelOpen = true;
        updatePill(currentRaw, true);
    }
    function hidePanel() {
        panel.classList.remove('ep-open');
        panelOpen = false;
        updatePill(currentRaw, false);
    }
    // ── React to error changes ───────────────────────────────────────────────
    function onErrorChange(raw) {
        currentRaw = raw || '';
        currentErr = currentRaw ? readStructured() : null;
        if (!currentRaw) {
            hidePanel();
            pill.classList.remove('has-error');
            pill.removeAttribute('title');
            return;
        }
        // Keep panel body in sync if it's open
        if (panelOpen) {
            renderPanelBody();
        }
        // Update the pill
        updatePill(currentRaw, panelOpen);
        // Auto-open the panel when a new error appears
        if (!panelOpen) {
            showPanel();
        }
    }
    // ── MutationObserver ─────────────────────────────────────────────────────
    // Watches #error-status (which eXide owns). We never write to it,
    // so there is no risk of a feedback loop.
    var observer = new MutationObserver(function () {
        var raw = errSource.textContent.trim();
        var struct = readStructured();
        var structJson = struct ? JSON.stringify(struct) : null;
        var currentStructJson = currentErr ? JSON.stringify(currentErr) : null;
        if (raw !== currentRaw || structJson !== currentStructJson) {
            onErrorChange(raw);
        }
    });
    observer.observe(errSource, {
        childList:       true,
        characterData:   true,
        subtree:         true,
        attributes:      true,
        attributeFilter: ['data-error']
    });
    // ── Event wiring ─────────────────────────────────────────────────────────
    pill.addEventListener('click', function () {
        if (!currentRaw) return;
        panelOpen ? hidePanel() : showPanel();
    });
    pill.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!currentRaw) return;
            panelOpen ? hidePanel() : showPanel();
        }
    });
    closeBtn.addEventListener('click', hidePanel);
    // Dismiss = clear the error entirely. The MutationObserver on #error-status
    // sees the empty value and cascades to onErrorChange(''), which removes the
    // pill and closes the panel. Added because @line-o reported (PR #794
    // review) getting an error stuck on-screen with 'the only way to get rid
    // of it was by reloading the website' — the existing × button only hid
    // the panel; the pill stayed visible.
    var dismissBtn = document.getElementById('exide-err-panel-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', function () {
            errSource.textContent = '';
        });
    }
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            if (!currentRaw) return;
            // When the structured payload is available, copy the full dump
            // (every field, one per line). Otherwise fall back to the raw
            // formatted message that the pill displays.
            var text = currentErr
                ? formatTitleDump(currentErr, currentRaw)
                : currentRaw;
            navigator.clipboard.writeText(text).then(function () {
                copyBtn.classList.add('ep-copied');
                setTimeout(function () { copyBtn.classList.remove('ep-copied'); }, 1500);
            });
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panelOpen) hidePanel();
    });
    // ── Initialize with current state ────────────────────────────────────────
    // (The page may already have an error set when this script runs.)
    var initial = errSource.textContent.trim();
    if (initial) {
        onErrorChange(initial);
    }
    } // end init()

    // Script loads in <head>, so defer until DOM is ready. Guarded so the
    // module can be required in Node (no document) to unit-test the pure
    // formatters exported below.
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            formatStructuredPanelHtml: formatStructuredPanelHtml,
            formatTitleDump: formatTitleDump,
            makeShortLabel: makeShortLabel
        };
    }
})();
