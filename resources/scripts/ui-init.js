/* ── Split-pane toggle ── */
(function () {
    var btn = document.getElementById('toggle-split-pane');
    if (!btn) return;
    btn.addEventListener('click', function () {
        var pw = document.querySelector('.panel-west');
        var active = pw.classList.toggle('split-pane');
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.textContent = active ? '\u229E' : '\u229F';
        try {
            var prefs = JSON.parse(localStorage.getItem('eXide.preferences') || '{}');
            prefs.splitPane = active;
            localStorage.setItem('eXide.preferences', JSON.stringify(prefs));
        } catch(e) {}
    });
})();

/* ── Tab bar overflow controls ── */
(function () {
    'use strict';
    var strip   = document.getElementById('tab-strip-wrap');
    var tabList = document.getElementById('tabs');
    var btnLeft = document.getElementById('tab-scroll-left');
    var btnRight = document.getElementById('tab-scroll-right');
    var btnDD   = document.getElementById('tab-list-btn');
    var ddMenu  = document.getElementById('tab-list-menu');
    var SCROLL_AMT = 180;
    if (!strip || !btnLeft || !btnRight || !btnDD || !ddMenu) return;

    function updateArrows() {
        var atStart = strip.scrollLeft <= 1;
        var atEnd = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1;
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
        var tabs = tabList.querySelectorAll('li:not(.drop-placeholder) .tab');
        tabs.forEach(function (tab) {
            var li = document.createElement('li');
            var isActive = tab.classList.contains('active');
            var isModified = tab.classList.contains('modified');
            var label = tab.querySelector('.tab-label');
            var labelText = label ? label.textContent.trim() : tab.title;
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

    var mo = new MutationObserver(function () {
        var active = tabList.querySelector('.tab.active');
        if (active) {
            active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        updateArrows();
    });
    mo.observe(tabList, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });

    setTimeout(function () {
        var active = tabList.querySelector('.tab.active');
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        updateArrows();
    }, 200);
}());
