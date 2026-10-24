/* Read-only Classic SVG viewer. No board state, parsing or persistence lives here. */
'use strict';
window.JuiceClassicReader = (() => {
  const MIN_SCALE = 0.01, MAX_SCALE = 4, PAD = 24;
  let dialog, viewport, surface, shadow, image, zoomInput, summary, title;
  let fullscreenTarget;
  let current = null, scale = 1, mode = 'fit', returnFocus, drag, frame = 0, pending;

  function dimensions(svg) {
    const box = svg.viewBox?.baseVal;
    const width = box?.width || svg.width?.baseVal?.value;
    const height = box?.height || svg.height?.baseVal?.value;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('此流程圖沒有可用的原始尺寸');
    }
    return { width, height };
  }

  function build() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'classicFlowReader';
    dialog.setAttribute('aria-labelledby', 'classicReaderTitle');
    dialog.innerHTML = '<div class="classic-reader-frame"><header><div><strong id="classicReaderTitle"></strong><span>唯讀流程圖</span></div><button type="button" data-reader-close aria-label="關閉檢視器">關閉</button></header>' +
      '<nav aria-label="流程圖閱讀工具"><button type="button" data-reader-fit>符合視窗</button><button type="button" data-reader-native>原尺寸 1:1</button>' +
      '<label>自訂縮放 <input type="number" min="1" max="400" step="1" aria-label="流程圖縮放百分比">%</label><button type="button" data-reader-overview>返回總覽</button><button type="button" data-reader-fullscreen>全螢幕</button>' +
      '<output aria-live="polite"></output></nav><div class="classic-reader-viewport" tabindex="0" aria-label="流程圖閱讀區"></div>' +
      '<footer>滾輪／觸控板捲動 · 拖曳平移 · Ctrl／⌘＋滾輪縮放 · Esc 關閉</footer></div>';
    document.body.appendChild(dialog); // Deliberately outside #world and its transform.
    fullscreenTarget = dialog.querySelector('.classic-reader-frame');
    title = dialog.querySelector('strong');
    viewport = dialog.querySelector('.classic-reader-viewport');
    zoomInput = dialog.querySelector('input');
    summary = dialog.querySelector('output');
    surface = document.createElement('div');
    surface.className = 'classic-reader-surface';
    viewport.appendChild(surface);
    // Isolate cloned SVG IDs and selector rules from the original board SVG.
    shadow = surface.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>:host{position:relative;display:block;flex:none}svg{position:absolute;display:block;max-width:none!important;max-height:none!important;flex:none;will-change:auto}</style>';
    dialog.querySelector('[data-reader-close]').onclick = close;
    dialog.querySelector('[data-reader-fit]').onclick = fit;
    dialog.querySelector('[data-reader-overview]').onclick = fit;
    dialog.querySelector('[data-reader-native]').onclick = () => setScale(1, 'native');
    dialog.querySelector('[data-reader-fullscreen]').onclick = async () => {
      try {
        if (document.fullscreenElement === fullscreenTarget) await document.exitFullscreen();
        else if (fullscreenTarget.requestFullscreen) await fullscreenTarget.requestFullscreen();
      } catch (_) { summary.textContent = '瀏覽器未允許全螢幕，仍可使用完整視窗閱讀'; }
    };
    dialog.querySelector('[data-reader-fullscreen]').hidden = !fullscreenTarget.requestFullscreen;
    zoomInput.addEventListener('change', () => {
      if (!Number.isFinite(zoomInput.valueAsNumber)) { updateSummary(); return; }
      setScale(zoomInput.valueAsNumber / 100, 'custom');
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    // Capture board shortcuts even when focus is on the SVG or inside its shadow tree.
    dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      const editing = event.target.closest?.('input,textarea,[contenteditable="true"]');
      if (!editing && (['Backspace','Delete'].includes(event.key) || ((event.ctrlKey || event.metaKey) && ['d','z','y'].includes(event.key.toLowerCase())))) event.preventDefault();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button,input,[tabindex="0"]')].filter(el => !el.hidden && !el.disabled);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }, true);
    viewport.addEventListener('wheel', event => {
      event.stopPropagation();
      if (!event.ctrlKey && !event.metaKey) return; // Keep native two-axis scrolling.
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
      pending = { value: (pending?.value || scale) * Math.exp(-pixels * 0.002), x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        const next = pending; pending = null;
        if (current) setScale(next.value, 'custom', next);
      });
    }, { passive: false });
    viewport.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      event.preventDefault(); viewport.focus();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('panning');
    });
    viewport.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      viewport.scrollLeft = drag.left + drag.x - event.clientX;
      viewport.scrollTop = drag.top + drag.y - event.clientY;
    });
    const endDrag = () => { drag = null; viewport.classList.remove('panning'); };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('lostpointercapture', endDrag);
    new ResizeObserver(() => {
      if (!current || !dialog.open) return;
      if (mode === 'fit') fit(); else layout();
    }).observe(viewport);
    document.addEventListener('fullscreenchange', () => {
      dialog.querySelector('[data-reader-fullscreen]').textContent = document.fullscreenElement === fullscreenTarget ? '離開全螢幕' : '全螢幕';
    });
  }

  function layout() {
    const width = current.width * scale, height = current.height * scale;
    const stageWidth = Math.max(viewport.clientWidth, width + PAD * 2);
    const stageHeight = Math.max(viewport.clientHeight, height + PAD * 2);
    surface.style.width = stageWidth + 'px'; surface.style.height = stageHeight + 'px';
    // Change SVG layout size, not transform scale or a bitmap backing surface.
    image.style.setProperty('width', width + 'px', 'important');
    image.style.setProperty('height', height + 'px', 'important');
    image.style.setProperty('max-width', 'none', 'important');
    image.style.left = (stageWidth - width) / 2 + 'px';
    image.style.top = (stageHeight - height) / 2 + 'px';
    updateSummary();
  }

  function updateSummary() {
    if (!current) return;
    zoomInput.value = String(Math.round(scale * 10000) / 100);
    summary.textContent = `${Math.round(current.width)} × ${Math.round(current.height)} · ${zoomInput.value}%`;
    dialog.querySelector('[data-reader-fit]').setAttribute('aria-pressed', String(mode === 'fit'));
    dialog.querySelector('[data-reader-native]').setAttribute('aria-pressed', String(mode === 'native'));
  }

  function setScale(value, nextMode, anchor) {
    if (!current || !Number.isFinite(value)) return;
    if (frame) { cancelAnimationFrame(frame); frame = 0; pending = null; }
    const x = anchor?.x ?? viewport.clientWidth / 2, y = anchor?.y ?? viewport.clientHeight / 2;
    const pointX = (viewport.scrollLeft + x - parseFloat(image.style.left || '0')) / scale;
    const pointY = (viewport.scrollTop + y - parseFloat(image.style.top || '0')) / scale;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, value)); mode = nextMode;
    layout();
    viewport.scrollLeft = parseFloat(image.style.left) + pointX * scale - x;
    viewport.scrollTop = parseFloat(image.style.top) + pointY * scale - y;
  }

  function fit() {
    if (!current) return;
    setScale(Math.min(1, (viewport.clientWidth - PAD * 2) / current.width, (viewport.clientHeight - PAD * 2) / current.height), 'fit');
    viewport.scrollTo(0, 0);
  }

  function open({ svg, title: name = 'Classic 流程圖', cardId = '', blockId = '', opener }) {
    if (!svg || svg.localName !== 'svg') throw new Error('流程圖尚未完成渲染，請稍後再試');
    const size = dimensions(svg);
    const clone = svg.cloneNode(true); // The sanitized rendered SVG, never the graph editor/model.
    const inherited = getComputedStyle(svg);
    build();
    if (image) image.remove();
    image = clone;
    surface.removeAttribute('style');
    for (const property of Array.from(inherited)) if (property.startsWith('--')) surface.style.setProperty(property, inherited.getPropertyValue(property));
    surface.style.color = inherited.color;
    surface.style.fontFamily = inherited.fontFamily;
    shadow.appendChild(image);
    current = { ...size, cardId, blockId }; scale = 1; mode = 'fit';
    dialog.dataset.cardId = cardId; dialog.dataset.blockId = blockId;
    title.textContent = name;
    if (!dialog.open) returnFocus = opener?.isConnected ? opener : document.activeElement;
    if (!dialog.open) dialog.showModal();
    fit();
    dialog.querySelector('[data-reader-fit]').focus();
    return true;
  }

  function close() {
    if (!dialog?.open) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0; pending = null; drag = null;
    viewport.classList.remove('panning');
    if (document.fullscreenElement === fullscreenTarget) document.exitFullscreen().catch(() => {});
    dialog.close();
    image?.remove(); image = null; current = null;
    const destination = returnFocus;
    if (destination?.isConnected) destination.focus({ preventScroll: true });
    // WebKit may finish its own dialog focus restoration after close() returns.
    requestAnimationFrame(() => { if (!dialog.open && destination?.isConnected) destination.focus({ preventScroll: true }); });
  }

  return Object.freeze({ open, close, get isOpen() { return !!dialog?.open; } });
})();
