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

    function init() {
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
    /**
     * Format the raw error string as HTML for the detail panel.
     * Highlights the error code and location clause.
     */
    function formatPanelHtml(raw) {
        if (!raw) return '';
        // Escape HTML
        var s = raw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // Highlight error code (e.g. err:XPST0017)
        s = s.replace(/(err:[A-Z0-9]+)/g, '<span class="ep-code">$1</span>');
        // Highlight location clause
        s = s.replace(
            /(\[at line \d+, column \d+[^\]]*\])/g,
            '<span class="ep-loc">$1</span>'
        );
        return s;
    }
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
    var panelOpen   = false;
    // ── Rendering ────────────────────────────────────────────────────────────
    function updatePill(raw, open) {
        if (!raw) {
            pill.classList.remove('has-error');
            return;
        }
        pillLabel.textContent = makeShortLabel(raw);
        pillArrow.textContent = open ? '\u25BC' : '\u25B2'; // ▼ or ▲
        pill.classList.add('has-error');
    }
    function showPanel() {
        panelBody.innerHTML = formatPanelHtml(currentRaw);
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
        if (!currentRaw) {
            hidePanel();
            pill.classList.remove('has-error');
            return;
        }
        // Keep panel body in sync if it's open
        if (panelOpen) {
            panelBody.innerHTML = formatPanelHtml(currentRaw);
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
        if (raw !== currentRaw) {
            onErrorChange(raw);
        }
    });
    observer.observe(errSource, {
        childList:     true,
        characterData: true,
        subtree:       true
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
            navigator.clipboard.writeText(currentRaw).then(function () {
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

    // Script loads in <head>, so defer until DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
