'use strict';
// 순태씨 UI 규칙: 글자색 #333 이하(어둡게), 글자 크기 12px 이상. 흰 글자는 어두운 배경 버튼에만 허용.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'has', 'kis-comparison-lab.css'), 'utf8');
const lum = (h) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
test('글자색은 #333보다 밝지 않다', () => {
  const found = [...css.matchAll(/(?<![-\w])color:\s*(#[0-9a-f]{6})/gi)].map(m => m[1]);
  assert.ok(found.length > 0);
  found.forEach(h => assert.ok(lum(h) <= lum('#333333') + 1e-9, h + ' 이(가) #333보다 밝음'));
});
test('글자 크기는 12px(0.75rem) 이상이다', () => {
  [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].forEach(m => { const px = m[2] === 'rem' ? m[1] * 16 : +m[1]; assert.ok(px >= 12, m[0]); });
});
