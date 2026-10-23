/* Juice x Pele: diagram rendering helper. Load after pele.global.js, before app.js. */
'use strict';
window.JuicePeleFlow = (() => {
  const MAX_SOURCE_LENGTH = 15000;
  const MAX_SVG_LENGTH = 1000000;
  const TEMPLATE = [
    'flowchart LR',
    '  A[取得資料] --> B{資料檢查}',
    '  B -->|通過| C[進入後續處理]',
    '  B -->|異常| D[人工確認]',
    '  D -.補充資料.-> B'
  ].join('\n');

  function decode(html) {
    const el = document.createElement('textarea');
    el.innerHTML = html || '';
    return el.value;
  }

  function appendSafeSvg(element, svg) {
    if (typeof svg !== 'string' || !svg || svg.length > MAX_SVG_LENGTH) {
      throw new Error('流程圖輸出超過安全限制');
    }
    if (typeof DOMParser === 'undefined') {
      throw new Error('瀏覽器不支援安全流程圖預覽');
    }
    const documentSvg = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = documentSvg.documentElement;
    if (!root || root.localName !== 'svg' || documentSvg.querySelector('parsererror')) {
      throw new Error('流程圖輸出格式不正確');
    }
    root.querySelectorAll('script,foreignObject,iframe,object,embed,image,a,use,animate,animateMotion,animateTransform,set').forEach(node => node.remove());
    root.querySelectorAll('*').forEach(node => {
      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || name === 'href' || name === 'xlink:href') node.removeAttribute(attribute.name);
        if (name === 'style' && /(?:url\s*\(|@import|expression\s*\()/i.test(attribute.value)) node.removeAttribute(attribute.name);
      }
    });
    element.replaceChildren(document.importNode(root, true));
  }

  function draw(element, mermaid) {
    if (!element) return false;
    element.replaceChildren();
    if (!mermaid || !mermaid.trim()) {
      element.textContent = '請輸入 Mermaid 流程圖語法';
      return false;
    }
    if (mermaid.length > MAX_SOURCE_LENGTH) {
      element.textContent = '流程圖原始碼超過 15,000 字元限制';
      return false;
    }
    if (!window.pele || typeof window.pele.render !== 'function') {
      element.textContent = 'Pele 尚未載入，請檢查網路或瀏覽器設定';
      return false;
    }
    try {
      // SVG comes from Pele, which escapes diagram text. Disable external links/images.
      const { svg } = window.pele.render(mermaid, {
        links: false, images: false, autoDirection: false,
        limit: MAX_SOURCE_LENGTH, maxEdges: 400, outputLimit: MAX_SVG_LENGTH
      });
      appendSafeSvg(element, svg);
      return true;
    } catch (error) {
      // Never place a parser error (which may contain user input) into innerHTML.
      element.textContent = '流程圖語法有誤：' + (error && error.message || '請檢查內容');
      return false;
    }
  }

  return Object.freeze({ TEMPLATE, decode, draw, MAX_SOURCE_LENGTH });
})();
