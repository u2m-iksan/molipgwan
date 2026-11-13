// 최근 시험 요약 카드: 성적 변화 · 잘 본 과목 · 보완할 과목 (성적 학생별 화면 · 상담 참고사항 공용)
import { esc } from '../ui.js';

const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const SAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
const DIR = {
  up: { cls: 'up', label: '상승', icon: UP },
  down: { cls: 'down', label: '하락', icon: DOWN },
  same: { cls: 'same', label: '유지', icon: SAME },
};

const examName = (e) => `${e.school_year} ${e.exam_type}`;
const subLine = (x) => `<li><b>${esc(x.name)}</b><span>${esc(x.text)}${x.raw != null && !/점$/.test(x.text) ? ` · ${x.raw}점` : ''}</span></li>`;

export function summaryCard(sum, { compact = false } = {}) {
  if (!sum) return compact ? '' : '';
  const { latest, prev, dir, changes, best, weak } = sum;
  const d = DIR[dir];
  const changeBody = !prev
    ? '<p class="xs-none">비교할 이전 시험이 없습니다.</p>'
    : !changes.length ? '<p class="xs-none">같은 과목 기록이 없습니다.</p>'
      : `<span class="xs-dir ${d.cls}">${d.icon}${d.label}</span>
        <ul class="xs-chg">${changes.map((c) => {
          const k = c.d > 0 || (c.d === 0 && c.raw > 0) ? 'up' : c.d < 0 || (c.d === 0 && c.raw < 0) ? 'down' : 'same';
          return `<li><b>${esc(c.name)}</b><span>${esc(c.from)} → ${esc(c.to)}</span><i class="${k}">${DIR[k].icon}</i></li>`;
        }).join('')}</ul>`;
  return `<section class="${compact ? 'xs xs-compact' : 'card xs'}">
    ${compact ? '' : `<div class="xs-h"><h3>최근 시험</h3><span>${esc(examName(latest))}${prev ? ` · ${esc(examName(prev))} 대비` : ''}</span></div>`}
    <div class="xs-grid">
      <div class="xs-tile"><h4>성적 변화</h4>${changeBody}</div>
      <div class="xs-tile good"><h4>잘 본 과목</h4>${best.length ? `<ul class="xs-subs">${best.map(subLine).join('')}</ul>` : '<p class="xs-none">-</p>'}</div>
      <div class="xs-tile weak"><h4>보완할 과목</h4>${weak.length ? `<ul class="xs-subs">${weak.map(subLine).join('')}</ul>` : '<p class="xs-none">-</p>'}</div>
    </div>
  </section>`;
}
