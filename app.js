/* app.js — rewritten, modern, robust
   Works with the provided index.html, classes.html, daily.html.
   Exposes global functions:
     - renderHomeOverview()
     - initClassesPage()
     - initDailyPage()
*/

/* ======= Storage helpers ======= */
const STORAGE = {
  CLASSES: 'attendanceData',
  DAILY: 'dailyAttendance'
};

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Failed to parse localStorage for', key, err);
    return {};
  }
}

function writeJSON(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
  // notify other parts of the app that data changed
  window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { key, data: obj } }));
}

function readClasses() { return readJSON(STORAGE.CLASSES); }
function writeClasses(obj) { writeJSON(STORAGE.CLASSES, obj); }
function readDaily() { return readJSON(STORAGE.DAILY); }
function writeDaily(obj) { writeJSON(STORAGE.DAILY, obj); }

/* ======= Utility helpers ======= */
function isoDateFromParts(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function todayISO() {
  return new Date().toISOString().slice(0,10);
}
function clampPct(n){ return Math.max(0, Math.min(100, Math.round(n))); }

function formatShortDate(iso) {
  try {
    const dt = new Date(iso);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return iso; }
}

/* tiny debounce */
function debounce(fn, wait=120){
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), wait);
  };
}

/* ======= HOME: Overall metric ======= */
/* Exposed globally so inline script in index.html can call it */
function renderHomeOverview() {
  const el = document.getElementById('overallPercent');
  const quick = document.getElementById('quickStats');
  if(!el || !quick) return;

  const classes = readClasses();
  let present = 0, total = 0;
  Object.values(classes).forEach(s => {
    present += Number(s.present || 0);
    total += Number(s.total || 0);
  });
  const pct = total ? Math.round((present/total) * 100) : 0;

  // nice visual: large number and small summary cards
  el.textContent = pct + '%';
  el.setAttribute('aria-valuenow', pct);

  const dailyCount = Object.keys(readDaily()).length;
  quick.innerHTML = `
    <div class="card quick-card">
      <div class="muted">Total lectures</div>
      <div style="font-weight:800;font-size:20px">${total}</div>
    </div>
    <div class="card quick-card">
      <div class="muted">Total present</div>
      <div style="font-weight:800;font-size:20px">${present}</div>
    </div>
    <div class="card quick-card">
      <div class="muted">Daily marked</div>
      <div style="font-weight:800;font-size:20px">${dailyCount}</div>
    </div>
  `;
}
// debounce so lots of small updates don't thrash UI
const renderHomeOverviewDebounced = debounce(renderHomeOverview, 80);

/* Ensure home updates when storage changes (useful when returning from other pages) */
window.addEventListener('dataUpdated', renderHomeOverviewDebounced);

/* ======= CLASSES PAGE ======= */
/* Exposed globally: initClassesPage() */
function initClassesPage() {
  const subjectsList = document.getElementById('subjectsList');
  const tplRaw = document.getElementById('subjectCardTpl').innerHTML;
  const addBtn = document.getElementById('addSubBtn');
  const addInput = document.getElementById('newSubInput');
  const clearBtn = document.getElementById('clearClassesBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');

  if(!subjectsList || !tplRaw) return console.warn('classes page elements missing');

  function makeCardElement(name, info) {
    // create element from template and fill values
    const wrapper = document.createElement('div');
    let html = tplRaw.replaceAll('__NAME__', name);
    wrapper.innerHTML = html.trim();
    const card = wrapper.firstElementChild;
    if(!card) return null;

    card.querySelector('.sub-title').textContent = name;
    card.querySelector('.present-count').textContent = info.present || 0;
    card.querySelector('.total-count').textContent = info.total || 0;
    const pct = info.total ? Math.round((info.present/info.total)*100) : 0;
    const pctEl = card.querySelector('.sub-percent');
    pctEl.textContent = pct + '%';
    pctEl.style.color = pct >= 80 ? 'var(--success)' : 'var(--danger)';

    // attach semantic attributes for delegation-based handlers to find
    card.dataset.subjectName = name;
    return card;
  }

  function render() {
    subjectsList.innerHTML = '';
    const data = readClasses();
    const keys = Object.keys(data);
    if(keys.length === 0){
      subjectsList.innerHTML = '<div class="muted">No subjects yet. Add one above.</div>';
      return;
    }
    // append cards
    keys.forEach(name => {
      const card = makeCardElement(name, data[name]);
      subjectsList.appendChild(card);
    });
    renderHomeOverviewDebounced();
  }

  /* Add subject */
  addBtn.addEventListener('click', ()=> {
    const name = (addInput.value || '').trim();
    if(!name) return alert('Enter a subject name');
    const data = readClasses();
    if(data[name]) return alert('Subject already exists');
    data[name] = { present: 0, total: 0 };
    writeClasses(data);
    addInput.value = '';
    render();
  });
  addInput.addEventListener('keydown', e => {
    if(e.key === 'Enter') addBtn.click();
  });

  /* Event delegation for subject-card buttons */
  subjectsList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if(!btn) return;
    const card = ev.target.closest('.subject-card');
    if(!card) return;
    const name = card.dataset.subjectName;
    if(!name) return;

    const data = readClasses();
    const subject = data[name] || {present:0,total:0};

    if(btn.classList.contains('inc-present')) {
      subject.total = Number(subject.total || 0) + 1;
      subject.present = Number(subject.present || 0) + 1;
      data[name] = subject; writeClasses(data); render();
    } else if(btn.classList.contains('inc-absent')) {
      subject.total = Number(subject.total || 0) + 1;
      data[name] = subject; writeClasses(data); render();
    } else if(btn.classList.contains('reset-sub')) {
      if(confirm(`Reset data for ${name}?`)) {
        delete data[name]; writeClasses(data); render();
      }
    }
  });

  /* Clear all classes */
  clearBtn.addEventListener('click', ()=> {
    if(confirm('Clear all class attendance?')) {
      localStorage.removeItem(STORAGE.CLASSES);
      window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { key: STORAGE.CLASSES, data: {} } }));
      render();
    }
  });

  /* Export classes JSON */
  exportBtn.addEventListener('click', ()=> {
    const data = readClasses();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'classes-attendance.json'; a.click();
    URL.revokeObjectURL(url);
  });

  /* Import classes JSON (safe validation) */
  importFile.addEventListener('change', (e) => {
    const f = e.target.files[0]; if(!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const obj = JSON.parse(fr.result);
        // validate shape: object of subjects -> {present:number, total:number}
        const ok = typeof obj === 'object' && obj !== null && Object.keys(obj).every(k => {
          const v = obj[k];
          return typeof v === 'object' && v !== null &&
            (Number.isFinite(v.present) || typeof v.present === 'number') &&
            (Number.isFinite(v.total) || typeof v.total === 'number');
        });
        if(!ok) throw new Error('Invalid format');
        writeClasses(obj);
        alert('Imported classes successfully');
        render();
      } catch (err) {
        console.error(err);
        alert('Import failed — invalid JSON format for classes');
      }
    };
    fr.readAsText(f);
    // reset input so re-importing same file is allowed later
    importFile.value = '';
  });

  // re-render if other pages change data
  window.addEventListener('dataUpdated', (e)=> {
    if(e.detail && e.detail.key === STORAGE.CLASSES) render();
  });

  render();
}

/* ======= DAILY PAGE (Calendar) ======= */
/* Exposed globally: initDailyPage() */
function initDailyPage() {
  const calendarEl = document.getElementById('calendar');
  const monthYearEl = document.getElementById('monthYear');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const clearDailyBtn = document.getElementById('clearDailyBtn');
  const markTodayPresent = document.getElementById('markTodayPresent');
  const markTodayAbsent = document.getElementById('markTodayAbsent');

  if(!calendarEl || !monthYearEl) return console.warn('daily page elements missing');

  let daily = readDaily();
  let view = new Date(); // view month/year
  let viewMonth = view.getMonth();
  let viewYear = view.getFullYear();

  // update local copy when storage updates elsewhere
  window.addEventListener('dataUpdated', (e)=>{
    if(e.detail && e.detail.key === STORAGE.DAILY) {
      daily = readDaily();
      renderCalendar();
    }
  });

  function renderCalendar() {
    calendarEl.innerHTML = '';
    monthYearEl.textContent = new Date(viewYear, viewMonth).toLocaleString(undefined, { month: 'long', year: 'numeric' });

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // leading empty cells
    for(let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'cell empty-cell';
      calendarEl.appendChild(empty);
    }

    for(let d=1; d<=daysInMonth; d++) {
      const iso = isoDateFromParts(viewYear, viewMonth+1, d);
      const status = daily[iso] || null; // 'Present' | 'Absent' | null

      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.tabIndex = 0; // keyboard focusable
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-pressed', status ? 'true' : 'false');
      cell.setAttribute('aria-label', `Day ${d} ${status ? status : 'no record'}`);

      const daynum = document.createElement('div');
      daynum.className = 'daynum';
      daynum.textContent = d;
      cell.appendChild(daynum);

      if(status === 'Present') {
        const dot = document.createElement('div'); dot.className = 'dot present-dot'; dot.setAttribute('title','Present'); cell.appendChild(dot);
      } else if(status === 'Absent') {
        const dot = document.createElement('div'); dot.className = 'dot absent-dot'; dot.setAttribute('title','Absent'); cell.appendChild(dot);
      }

      // Toggle handler (cycle: none -> Present -> Absent -> none)
      function toggle() {
        if(!daily[iso]) daily[iso] = 'Present';
        else if(daily[iso] === 'Present') daily[iso] = 'Absent';
        else delete daily[iso];
        writeDaily(daily);
        // re-render this month
        renderCalendar();
        renderHomeOverviewDebounced();
      }

      cell.addEventListener('click', toggle);
      cell.addEventListener('keydown', (ev) => {
        if(ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });

      calendarEl.appendChild(cell);
    }
  }

  prevBtn.addEventListener('click', ()=> {
    viewMonth--; if(viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar();
  });

  nextBtn.addEventListener('click', ()=> {
    viewMonth++; if(viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  });

  clearDailyBtn.addEventListener('click', ()=> {
    if(confirm('Clear all daily records?')) {
      localStorage.removeItem(STORAGE.DAILY);
      daily = {};
      window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { key: STORAGE.DAILY, data: {} } }));
      renderCalendar();
      renderHomeOverviewDebounced();
    }
  });

  markTodayPresent.addEventListener('click', ()=> {
    const iso = todayISO(); daily[iso] = 'Present'; writeDaily(daily); renderCalendar(); renderHomeOverviewDebounced();
  });
  markTodayAbsent.addEventListener('click', ()=> {
    const iso = todayISO(); daily[iso] = 'Absent'; writeDaily(daily); renderCalendar(); renderHomeOverviewDebounced();
  });

  // initial render
  renderCalendar();
}

/* ======= Auto-refresh on DOMContentLoaded for the home metric ======= */
document.addEventListener('DOMContentLoaded', () => {
  // If the page contains the overview, render it initially.
  if(document.getElementById('overallPercent')) {
    renderHomeOverview();
  }
});

// Expose core functions globally so inline scripts in HTML can call them
window.renderHomeOverview = renderHomeOverview;
window.initClassesPage = initClassesPage;
window.initDailyPage = initDailyPage;
