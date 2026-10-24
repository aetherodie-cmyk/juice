const { test, expect } = require('@playwright/test');

// Public synthetic data; no user's architecture or business data is committed here.
const source = 'flowchart LR\nsubgraph CORE [測試核心]\nA[測試訂單] --> B[測試處理]\nend\nstyle CORE fill:#dbeafe,stroke:#2563eb';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="5819" height="1312" viewBox="0 0 5819 1312" style="max-width:100%;height:auto;font:16px sans-serif;--_s:#eef5ff"><defs><linearGradient id="reader-gradient"><stop stop-color="#eef5ff"/></linearGradient></defs><g class="nodes">${Array.from({length:44},(_,i)=>`<g data-id="N${i}" transform="translate(${40+i%11*480},${60+Math.floor(i/11)*260})"><rect width="180" height="80" fill="url(#reader-gradient)" stroke="#2563eb"/><text x="12" y="40" style="font-size:16px;fill:#183862">測試節點 ${i+1}</text></g>`).join('')}</g><path d="M220,100L520,100" fill="none" stroke="#333"/></svg>`;

async function setup(page) {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.route('https://accounts.google.com/**', route => route.fulfill({body:''}));
  await page.route('**/pele.global.js', route => route.fulfill({contentType:'application/javascript',body:`window.pele={render:()=>({svg:${JSON.stringify(svg)}})};`}));
  await page.goto('/');
  await page.locator('#homeRouteLocal').click();
  await page.locator('#homeNewName').fill('閱讀器自動測試');
  await page.locator('#homeCreateForm button[type=submit]').click();
  await page.locator('#btnFlow').click();
  // addCard schedules title focus in rAF; wait before typing into the source field.
  await expect(page.locator('#pTitle')).toBeFocused();
  await page.locator('.pele-source').fill(source);
  await expect(page.locator('.pele-source')).toHaveValue(source);
  await expect(page.locator('.pvdiagram svg')).toBeVisible();
  // Wait for normal board saves to settle before testing a strictly read-only session.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sju-whiteboard-v2') || '{}').cards?.[0]?.blocks?.[0]?.html)).toContain('測試核心');
  await page.locator('#pClose').click();
  await page.waitForTimeout(600);
}

const boardSnapshot = page => page.evaluate(() => ({
  stored:localStorage.getItem('sju-whiteboard-v2'),
  view:document.querySelector('#world').style.transform,
  svg:document.querySelector('.pvdiagram svg').outerHTML,
  selected:[...document.querySelectorAll('.card.sel')].map(el=>el.dataset.id),
  panel:document.querySelector('#panel').className
}));

test.afterEach(async ({page}) => expect(page.errors || []).toEqual([]));

test('reader keeps vector content and all board state unchanged at 100/200/400%', async ({page}) => {
  await setup(page);
  const before = await boardSnapshot(page);
  await page.locator('.card .flow-reader-open').click();
  const reader = page.locator('#classicFlowReader');
  await expect(reader).toBeVisible();
  expect(await reader.evaluate(el => el.parentElement === document.body && !el.closest('#world'))).toBe(true);
  const clone = reader.locator('.classic-reader-surface svg');
  await expect(clone.locator('g[data-id]')).toHaveCount(44);
  expect(await clone.getAttribute('viewBox')).toBe('0 0 5819 1312');
  expect(await clone.innerHTML()).toBe(await page.locator('.pvdiagram svg').innerHTML());
  await expect(reader.locator('canvas,img')).toHaveCount(0);
  for (const percent of [100,200,400]) {
    await reader.getByLabel('流程圖縮放百分比').fill(String(percent));
    await reader.getByLabel('流程圖縮放百分比').press('Tab');
    await expect(clone).toHaveCSS('width', `${5819*percent/100}px`);
    await expect(clone).toHaveCSS('height', `${1312*percent/100}px`);
    const measurement = await clone.locator('text').first().evaluate(el => {
      const m=el.getScreenCTM();return {a:m.a,d:m.d,font:getComputedStyle(el).fontSize,transform:getComputedStyle(el).transform};
    });
    expect(measurement.a).toBeCloseTo(percent/100,4);
    expect(measurement.d).toBeCloseTo(percent/100,4);
    expect(measurement.font).toBe('16px');
    expect(measurement.transform).toBe('none');
    await reader.screenshot({path:test.info().outputPath(`reader-${percent}.png`)});
  }
  await reader.getByRole('button',{name:'原尺寸 1:1',exact:true}).click();
  await expect(clone).toHaveCSS('width','5819px');
  await reader.getByRole('button',{name:'返回總覽',exact:true}).click();
  expect(await clone.evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(1500);
  await reader.getByRole('button',{name:'關閉檢視器',exact:true}).click();
  await expect(reader).not.toBeVisible();
  expect(await boardSnapshot(page)).toEqual(before);
  await expect(page.locator('.card .flow-reader-open')).toBeFocused();
});

test('native scrolling, drag, pinch-wheel and keyboard cannot operate the board', async ({page}) => {
  await setup(page);
  const before = await boardSnapshot(page);
  await page.locator('.card .flow-reader-open').click();
  const reader = page.locator('#classicFlowReader'), viewport=reader.getByLabel('流程圖閱讀區');
  await reader.getByRole('button',{name:'原尺寸 1:1',exact:true}).click();
  await viewport.hover();
  await page.mouse.wheel(230,190);
  await expect.poll(()=>viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  const box = await viewport.boundingBox(), x=box.x+box.width/2, y=box.y+box.height/2;
  const start = await viewport.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-100,y-80,{steps:6});await page.mouse.up();
  expect(await viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(start.x);
  const scaleBefore = Number(await reader.getByLabel('流程圖縮放百分比').inputValue());
  await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');
  await expect.poll(async()=>Number(await reader.getByLabel('流程圖縮放百分比').inputValue())).toBeGreaterThan(scaleBefore);
  await viewport.focus();
  for (const key of ['Delete','Backspace','Control+d','Control+z','g']) await page.keyboard.press(key);
  await page.keyboard.press('Escape');
  await expect(reader).not.toBeVisible();
  expect(await boardSnapshot(page)).toEqual(before);
});

test('targeted reader entry, focus trap, invalid dimensions and resize are read-only', async ({page}) => {
  await setup(page);
  expect(await page.evaluate(()=>JuiceClassicFlows.openReader({cardId:'missing',blockId:'missing'}))).toBe(false);
  const target=await page.locator('.card .flow-reader-open').evaluate(el=>({cardId:el.closest('.card').dataset.id,blockId:el.dataset.flowBlock}));
  expect(await page.evaluate(target=>JuiceClassicFlows.openReader(target),target)).toBe(true);
  // A future map may navigate to a new target while the reader is already open.
  expect(await page.evaluate(target=>JuiceClassicFlows.openReader(target),target)).toBe(true);
  const reader=page.locator('#classicFlowReader'), viewport=reader.getByLabel('流程圖閱讀區');
  await expect(reader.locator('.classic-reader-surface svg')).toHaveCount(1);
  await reader.getByRole('button',{name:'關閉檢視器',exact:true}).focus();
  await page.keyboard.press('Shift+Tab');await expect(viewport).toBeFocused();
  await page.keyboard.press('Tab');await expect(reader.getByRole('button',{name:'關閉檢視器',exact:true})).toBeFocused();
  await page.setViewportSize({width:740,height:600});
  const image=reader.locator('.classic-reader-surface svg');
  await expect.poll(async()=>image.evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(740);
  await reader.getByLabel('流程圖縮放百分比').fill('999');await reader.getByLabel('流程圖縮放百分比').press('Tab');
  await expect(reader.getByLabel('流程圖縮放百分比')).toHaveValue('400');
  await reader.getByLabel('流程圖縮放百分比').fill('');await reader.getByLabel('流程圖縮放百分比').press('Tab');
  await expect(reader.getByLabel('流程圖縮放百分比')).toHaveValue('400');
  await page.keyboard.press('Escape');
  const result=await page.evaluate(()=>{try{JuiceClassicReader.open({svg:document.createElementNS('http://www.w3.org/2000/svg','svg')});return false;}catch(_){return true;}});
  expect(result).toBe(true);
});

test('reader returns to the existing Classic editor without rewriting unsupported syntax', async ({page}) => {
  await setup(page);
  await page.locator('.card .ctitle').dblclick();
  const editor=page.locator('#flowStudio');
  const original=await editor.locator('textarea').inputValue();
  await editor.locator('.flow-reader-open').click();
  await page.locator('#classicFlowReader').getByRole('button',{name:'關閉檢視器',exact:true}).click();
  await expect(editor).toBeVisible();
  await expect(editor.locator('textarea')).toHaveValue(original);
  await expect(editor.locator('.flow-reader-open')).toBeFocused();
});

test('44-node scroll/zoom smoke benchmark keeps the reader vector-based', async ({page}) => {
  await setup(page);await page.locator('.card .flow-reader-open').click();
  const reader=page.locator('#classicFlowReader');await reader.getByRole('button',{name:'原尺寸 1:1',exact:true}).click();
  const timing=await reader.getByLabel('流程圖閱讀區').evaluate(async el=>{
    const deltas=[];let previous=performance.now();
    for(let i=0;i<45;i++){el.scrollLeft+=31;el.scrollTop+=5;await new Promise(requestAnimationFrame);const now=performance.now();deltas.push(now-previous);previous=now;}
    deltas.sort((a,b)=>a-b);return {frames:deltas.length,p50:deltas[Math.floor(deltas.length*.5)],p95:deltas[Math.floor(deltas.length*.95)]};
  });
  await test.info().attach('scroll-timing',{body:JSON.stringify(timing),contentType:'application/json'});
  expect(timing.frames).toBe(45);
  await expect(reader.locator('.classic-reader-surface svg')).toHaveCount(1);
  await page.keyboard.press('Escape');
});

test('fullscreen exits safely and does not close the original Classic editor', async ({page}) => {
  await setup(page);await page.locator('.card .flow-reader-open').click();
  const reader=page.locator('#classicFlowReader'), button=reader.locator('[data-reader-fullscreen]');
  if(await button.isVisible()) {
    await button.click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    await expect(button).toHaveText('離開全螢幕');
    await button.click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  }
  await reader.getByRole('button',{name:'關閉檢視器',exact:true}).click();
  await expect(page.locator('.card')).toHaveCount(1);
});

test('capture will-change and SVG layout comparison without changing application CSS', async ({page}) => {
  await page.goto('/tests/fixtures/reader-raster.html');
  // Force an initial paint at the small base size before the transform changes.
  await page.screenshot({path:test.info().outputPath('raster-before.png')});
  for(const scale of [100,200,400]) {
    await page.getByRole('button',{name:scale+'%',exact:true}).click();
    await page.screenshot({path:test.info().outputPath(`raster-comparison-${scale}.png`)});
    const result=await page.evaluate(()=>[...document.querySelectorAll('.probe text:first-of-type')].map(el=>({a:el.getScreenCTM().a,font:getComputedStyle(el).fontSize})));
    result.forEach(value=>expect(value.a).toBeCloseTo(scale/100,4));
  }
});
