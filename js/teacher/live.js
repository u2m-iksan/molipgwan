// 현황판 (전광판에 띄워 두는 다크 전체 화면) — 기존 앱 "현황판"에서 보상(코인·룰렛·학습왕) 빼고 정리
//  왼쪽: 학생 실시간 카드 (몰입 중 → 휴식 → 그 외, 같은 그룹은 자리순)
//    상태: 몰입 중(과목·경과) / 휴식 중 / 학원 ~끝 / 학교 ~끝 / (토) 외출·사유 / 하원 / 미등원 / 대기
//  오른쪽: 이번 주 순공 TOP 10
//  빨강·주황·초록 판정은 학생들이 보는 화면이라 표시하지 않음
import { $, esc } from '../ui.js';
import { sb } from '../sb.js';
import { DOW, today, mondayOf, isoDow, toMin, toTime, hm } from '../date.js';
import { settleStale } from '../data/student.js';
import { satAlert, nowBlock, outInfo, isClosedNow } from '../data/att-rules.js';
import { loadVacations, isVacation, termOk } from '../data/schedules.js';

const pad = (n) => String(n).padStart(2, '0');
const kst = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
const check = (r) => { if (r.error) throw r.error; return r.data || []; };
const dur = (sec) => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${pad(m % 60)}분` : `${m}분`; };
const clockSec = (sec) => `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
const elapsed = (s, at = Date.now()) => {
  const end = s.paused_at ? new Date(s.paused_at).getTime() : at;
  return Math.max(0, Math.floor((end - new Date(s.started_at).getTime()) / 1000) - (s.pause_seconds || 0));
};
const bySeat = (a, b) => {
  if (!a.seat_no !== !b.seat_no) return a.seat_no ? -1 : 1;
  return String(a.seat_no || '').localeCompare(String(b.seat_no || ''), 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko');
};

async function loadLive() {
  const t = today(), mon = mondayOf(t);
  const [students, sessions, att, sched, vac] = await Promise.all([
    sb.from('students').select('id,name,grade,school,seat_no,status,sat_arrive,return_on').in('status', ['재원', '휴원']).then(check),
    sb.from('study_sessions').select('id,student_id,subject,started_at,ended_at,paused_at,pause_seconds,net_seconds,checked_net,study_date').gte('study_date', mon).then(check),
    sb.from('attendance').select('*').eq('on_date', t).order('at').then(check).catch(() => []),
    sb.from('schedules').select('student_id,category,title,weekday,start_time,end_time,valid_from,valid_to,term').eq('weekday', isoDow(t)).then(check),
    loadVacations(true),
  ]);
  return { t, students: students.filter((x) => x.status === '재원' || (x.return_on && x.return_on >= t)), sessions: await settleStale(sessions), att, vac,
    sched: sched.filter((r) => r.valid_from <= t && (!r.valid_to || r.valid_to >= t))
      .filter((r) => termOk(r, isVacation(students.find((s) => s.id === r.student_id)?.school, t, vac) ? '방학' : '학기')) };
}

export async function openLive() {
  const el = document.createElement('div');
  el.className = 'bd lv';
  el.innerHTML = `<div class="lv-in">
    <div class="lv-top"><span class="bd-logo">U2M</span><span class="lv-date" id="lv-date"></span>
      <span class="lv-vac" id="lv-vac"></span><span class="lv-count" id="lv-count"></span>
      <button type="button" class="bd-x" id="lv-x" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="lv-main">
      <section class="lv-card lv-stu"><h4>실시간 학생 현황</h4><div class="lv-grid" id="lv-grid"><p class="bd-muted">불러오는 중</p></div></section>
      <section class="lv-card lv-rank"><h4>이번 주 순공 TOP 10</h4><ol id="lv-rank"></ol></section>
    </div></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el.classList.add('open'));
  try { await el.requestFullscreen?.(); } catch {}

  let data = null, alive = true;
  const close = () => {
    alive = false; clearInterval(t1); clearInterval(t2);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    el.classList.remove('open'); document.body.style.overflow = '';
    setTimeout(() => el.remove(), 250);
  };
  $('#lv-x', el).addEventListener('click', close);
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', k); if (alive) close(); } });

  // 방학 D-N: 재원생 학교 중 가장 가까운 방학 (진행 중이면 "방학 중")
  function paintVac() {
    const box = $('#lv-vac', el); if (!box || !data) return;
    const schools = new Set(data.students.map((s) => s.school).filter(Boolean));
    const evs = (data.vac || []).filter((e) => schools.has(e.school) && e.end_date >= data.t);
    const now = evs.filter((e) => e.start_date <= data.t);
    const next = evs.filter((e) => e.start_date > data.t).sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0];
    const dn = next ? Math.round((new Date(next.start_date) - new Date(data.t)) / 86400000) : null;
    box.innerHTML = now.length ? `방학 중 <b>${new Set(now.map((e) => e.school)).size}개교</b>`
      : next ? `${esc(next.title || '방학')} <b>D-${dn}</b>` : '';
  }
  function stateOf(s, nowMin, at) {
    const ses = data.sessions.filter((x) => x.student_id === s.id && x.study_date === data.t);
    const active = ses.find((x) => !x.ended_at);
    const todaySec = ses.filter((x) => x.ended_at).reduce((a, x) => a + (x.net_seconds || 0), 0) + (active ? elapsed(active, at) : 0);
    const rows = data.att.filter((a) => a.student_id === s.id);
    const att = rows[rows.length - 1];
    const sat = isoDow(data.t) === 6;
    const nb = sat ? nowBlock(s, data.sched, nowMin) : null;   // 토: 일정 끝 + 이동 시간까지
    const nb2 = sat ? null : nowBlock(s, data.sched, nowMin);   // 주중도 같은 기준
    const al = sat ? satAlert(s, rows, data.sched, nowMin) : null;
    let k, label, sub = '';
    // 운영 시간 밖(주중 23시 이후 ~ 다음 날 6시): 하원 (스톱워치 기록은 그대로)
    if (s.status !== '휴원' && isClosedNow(isoDow(data.t), nowMin)) return { k: 'off', label: '하원', sub: '', todaySec };
    if (s.status === '휴원') return { k: 'ret', label: `복귀 예정 ${Number(s.return_on.slice(5, 7))}/${Number(s.return_on.slice(8))}`, sub: '', todaySec: 0 };
    // 토요일: 등원(복귀) 상태면 몰입 중
    // 토요일: 출결 기록이 없고 일정 중이면 '외출 · 학원명' (스톱워치를 켜도) — 등원을 눌렀으면 학생 입력 우선(몰입 중)
    if (sat && nb && !att) { const o = outInfo(s, null, data.sched, nowMin); k = 'out'; label = `외출 · ${o.name}`; sub = `${o.moving ? '이동 중 · ' : ''}${o.back} 복귀 예정`; }
    else if (sat && (att?.kind === '등원' || att?.kind === '복귀')) { k = 'on'; label = active && !active.paused_at ? `${active.subject} 몰입 중` : '몰입 중'; sub = active ? clockSec(elapsed(active, at)) : ''; }
    else if (!sat && active && !active.paused_at) { k = 'on'; label = `${active.subject} 몰입 중`; sub = clockSec(elapsed(active, at)); }
    else if (!sat && active) { k = 'rest'; label = '휴식 중'; sub = `${active.subject} ${clockSec(elapsed(active, at))}`; }
    else if (sat && att?.kind === '외출') { const o = outInfo(s, att, data.sched, nowMin); k = al?.kind === 'late' ? 'none' : 'out'; label = `외출 · ${o.name}`; sub = al?.kind === 'late' ? al.text : o.back ? `${o.back} 복귀 예정` : ''; }
    else if (sat && att?.kind === '하원') { k = 'off'; label = '하원'; }
    else if (!sat && nb2 && !active) { const o = outInfo(s, null, data.sched, nowMin); k = 'out'; label = `외출 · ${o.name}`; sub = `${o.moving ? '이동 중 · ' : ''}${o.back} 복귀 예정`; }   // 주중: 스톱워치 켰으면 그게 우선
    else if (sat && !att) { k = al?.kind === 'late' ? 'none' : 'idle'; label = al?.kind === 'late' ? al.text : al?.text || '미등원'; }
    else { k = 'idle'; label = sat && att ? '등원' : '대기'; }
    return { k, label, sub, todaySec };
  }

  const ORDER = { on: 0, rest: 1, out: 2, acad: 3, school: 4, idle: 5, none: 6, off: 7, ret: 8 };
  function paint() {
    if (!data) return;
    const n = kst(), nowMin = n.getHours() * 60 + n.getMinutes(), at = Date.now();
    const list = data.students.map((s) => ({ s, st: stateOf(s, nowMin, at) }))
      .sort((a, b) => (ORDER[a.st.k] - ORDER[b.st.k]) || bySeat(a.s, b.s));
    const on = list.filter((x) => x.st.k === 'on').length;
    paintVac();
    $('#lv-count', el).innerHTML = `<i></i>몰입 중 <b>${on}</b><span>/ ${list.filter((x) => x.st.k !== 'ret').length}</span>`;
    $('#lv-grid', el).innerHTML = list.length ? list.map(({ s, st }) => `
      <div class="lv-s ${st.k}">
        <div class="lv-s-h"><b>${esc(s.name)}</b><span>${esc(s.grade)}</span>${s.seat_no ? `<em>${esc(s.seat_no)}</em>` : ''}</div>
        <span class="lv-pill">${st.k === 'on' ? '<i></i>' : ''}${esc(st.label)}</span>
        <p class="lv-sub">${st.sub ? (st.k === 'on' || st.k === 'rest' ? `<span class="lv-run" data-sid="${esc(s.id)}">${esc(st.sub)}</span>` : `<span>${esc(st.sub)}</span>`) : ''}<span>오늘 ${st.todaySec ? dur(st.todaySec) : '-'}</span></p>
      </div>`).join('') : '<p class="bd-muted">재원 학생이 없습니다.</p>';
    fit(list.length);

    // 이번 주 순공 TOP 10
    const sum = new Map();
    for (const x of data.sessions) {
      const sec = x.ended_at ? (x.net_seconds || 0) : elapsed(x, at);
      sum.set(x.student_id, (sum.get(x.student_id) || 0) + sec);
    }
    const top = data.students.map((s) => ({ s, sec: sum.get(s.id) || 0 })).filter((x) => x.sec > 0)
      .sort((a, b) => b.sec - a.sec).slice(0, 10);
    $('#lv-rank', el).innerHTML = top.length ? top.map(({ s, sec }, i) => `
      <li class="${i < 3 ? 'top' : ''}"><span class="lv-no">${i + 1}</span><b>${esc(s.name)}</b><small>${esc(s.grade)}</small><span class="lv-sec">${dur(sec)}</span></li>`).join('')
      : '<li class="bd-muted">기록이 없습니다.</li>';
  }

  // 학생 수에 맞춰 카드 크기 결정: 스크롤 없이 전부 보이게 (열을 늘려 가며 카드 높이가 충분한 첫 배치)
  function fit(n) {
    const g = $('#lv-grid', el); if (!g || !n) return;
    const W = g.clientWidth, H = g.clientHeight, gap = 10;
    let best = null;
    for (let cols = 3; cols <= 10; cols++) {
      const rows = Math.ceil(n / cols);
      const h = (H - gap * (rows - 1)) / rows, w = (W - gap * (cols - 1)) / cols;
      best = { cols, h: Math.min(h, 150), w };
      if (h >= Math.min(118, w * 0.5)) break;
    }
    g.style.gridTemplateColumns = `repeat(${best.cols}, minmax(0, 1fr))`;
    g.style.gridAutoRows = `${Math.floor(best.h)}px`;
    g.style.setProperty('--u', `${Math.max(0.62, Math.min(1.25, best.h / 118))}`);
  }
  window.addEventListener('resize', () => { if (alive && data) paint(); });

  let lastMin = -1;
  function tick() {
    const n = kst(), m = n.getHours() * 60 + n.getMinutes();
    $('#lv-date', el).textContent = `${n.getMonth() + 1}월 ${n.getDate()}일 (${DOW[isoDow(today())]}) ${pad(n.getHours())}:${pad(n.getMinutes())}`;
    if (m !== lastMin) { lastMin = m; paint(); return; }   // 분이 바뀌면 전체(학원·학교 시간 등) 다시
    // 매초: 몰입 중 경과 시간만
    el.querySelectorAll('.lv-run').forEach((sp) => {
      const a = data?.sessions.find((x) => x.student_id === sp.dataset.sid && !x.ended_at);
      if (a) sp.textContent = (a.paused_at ? a.subject + ' ' : '') + clockSec(elapsed(a));
    });
  }
  async function refresh() {
    try { data = await loadLive(); } catch (e) { $('#lv-grid', el).innerHTML = `<p class="bd-muted">불러오기 실패: ${esc(e.message)}</p>`; return; }
    lastMin = -1; tick();
  }

  await refresh();
  const t1 = setInterval(tick, 1000);          // 시각 · 경과 시간
  const t2 = setInterval(refresh, 30000);      // 데이터 30초마다
}
