/* ── Split-pane toggle ── */
(function () {
    const btn = document.getElementById('toggle-split-pane');
    if (!btn) return;
    btn.addEventListener('click', function () {
        const pw = document.querySelector('.panel-west');
        const active = pw.classList.toggle('split-pane');
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.textContent = active ? '\u229E' : '\u229F';
        try {
            const prefs = JSON.parse(localStorage.getItem('eXide.preferences') || '{}');
            prefs.splitPane = active;
            localStorage.setItem('eXide.preferences', JSON.stringify(prefs));
        } catch(e) {}
    });
})();

/* ── Tab bar overflow controls ── */
(function () {
    'use strict';
    const strip   = document.getElementById('tab-strip-wrap');
    const tabList = document.getElementById('tabs');
    const btnLeft = document.getElementById('tab-scroll-left');
    const btnRight = document.getElementById('tab-scroll-right');
    const btnDD   = document.getElementById('tab-list-btn');
    const ddMenu  = document.getElementById('tab-list-menu');
    const SCROLL_AMT = 180;
    if (!strip || !btnLeft || !btnRight || !btnDD || !ddMenu) return;

    function updateArrows() {
        const atStart = strip.scrollLeft <= 1;
        const atEnd = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1;
        btnLeft.disabled = atStart;
        btnRight.disabled = atEnd;
    }
    strip.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);

    btnLeft.addEventListener('click', function () {
        strip.scrollBy({ left: -SCROLL_AMT, behavior: 'smooth' });
    });
    btnRight.addEventListener('click', function () {
        strip.scrollBy({ left: SCROLL_AMT, behavior: 'smooth' });
    });

    document.getElementById('tabs-container').addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            strip.scrollLeft += e.deltaY;
        }
        setTimeout(updateArrows, 50);
    }, { passive: false });

    function buildDropdown() {
        ddMenu.innerHTML = '';
        const tabs = tabList.querySelectorAll('li:not(.drop-placeholder) .tab');
        tabs.forEach(function (tab) {
            const li = document.createElement('li');
            const isActive = tab.classList.contains('active');
            const isModified = tab.classList.contains('modified');
            const label = tab.querySelector('.tab-label');
            const labelText = label ? label.textContent.trim() : tab.title;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', isActive ? 'true' : 'false');
            if (isActive) li.classList.add('active');
            li.innerHTML =
                '<span class="dd-check">' + (isActive ? '\u2713' : '') + '</span>' +
                (isModified
                    ? '<span class="dd-dot" title="Unsaved changes"></span>'
                    : '<span class="dd-spacer"></span>') +
                '<span class="dd-label">' + labelText + '</span>';
            li.addEventListener('click', function () {
                tab.click();
                closeDropdown();
                tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                setTimeout(updateArrows, 150);
            });
            ddMenu.appendChild(li);
        });
    }
    function openDropdown() {
        buildDropdown();
        ddMenu.classList.add('open');
        btnDD.setAttribute('aria-expanded', 'true');
    }
    function closeDropdown() {
        ddMenu.classList.remove('open');
        btnDD.setAttribute('aria-expanded', 'false');
    }
    function toggleDropdown() {
        ddMenu.classList.contains('open') ? closeDropdown() : openDropdown();
    }
    btnDD.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleDropdown();
    });
    document.addEventListener('click', function (e) {
        if (!document.getElementById('tab-controls-wrap').contains(e.target)) {
            closeDropdown();
        }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDropdown();
    });

    const mo = new MutationObserver(function () {
        const active = tabList.querySelector('.tab.active');
        if (active) {
            active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        updateArrows();
    });
    mo.observe(tabList, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });

    setTimeout(function () {
        const active = tabList.querySelector('.tab.active');
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        updateArrows();
    }, 200);
}());
