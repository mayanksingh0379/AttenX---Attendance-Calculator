/* app.js — with per-day class records, but only today’s record shown in UI */

/* ========== Init Flags (avoid double init) ========== */
window.__AttenXInitFlags = window.__AttenXInitFlags || { classes:false, daily:false };

/* ========== Storage Helpers ========== */
const STORAGE_KEYS = {
  CLASSES: 'attendanceData',
  DAILY: 'dailyAttendance'
};

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; }
  catch { return {}; }
}
function writeJSON(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
  window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { key, data: obj } }));
}

function readClasses() { return readJSON(STORAGE_KEYS.CLASSES); }
function writeClasses(obj) { writeJSON(STORAGE_KEYS.CLASSES, obj); }
function readDaily() { return readJSON(STORAGE_KEYS.DAILY); }
function writeDaily(obj) { writeJSON(STORAGE_KEYS.DAILY, obj); }

function todayISO() { return new Date().toISOString().slice(0,10); }
function formatDate(iso) {
  if(!iso) return '';
  const d = new Date(iso + (iso.length===10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}

/* ========== HOME PAGE ========== */
function computeOverallPercent() {
  const classes = readClasses();
  let present=0,total=0;
  Object.values(classes).forEach(c=>{
    const recs = Array.isArray(c.records) ? c.records : [];
    recs.forEach(r=>{
      total++;
      if(r.status==='present') present++;
    });
  });
  const pct = total? Math.round((present/total)*100) : 0;
  return {pct,present,total};
}

function renderHomeOverview() {
  const el = document.getElementById('overallPercent');
  if(!el) return;
  const {pct,present,total} = computeOverallPercent();
  el.textContent = pct+"%";

  const quick = document.getElementById('quickStats');
  if(quick){
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
        <div style="font-weight:800;font-size:20px">${Object.keys(readDaily()).length}</div>
      </div>
    `;
  }
}
window.addEventListener('dataUpdated', renderHomeOverview);

/* ========== CLASSES PAGE ========== */
function initClassesPage(){
  if (window.__AttenXInitFlags.classes) { 
    if (document.getElementById('subjectsList')) renderClasses();
    return;
  }
  window.__AttenXInitFlags.classes = true;

  renderHomeOverview();
  const list = document.getElementById('subjectsList');
  const tplRaw = document.getElementById('subjectCardTpl') ? document.getElementById('subjectCardTpl').innerHTML : '';
  const addBtn = document.getElementById('addSubBtn');
  const addInput = document.getElementById('newSubInput');
  const clearBtn = document.getElementById('clearClassesBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');

  function makeStats(records){
    const present = records.filter(r=>r.status==='present').length;
    const total = records.length;
    const pct = total? Math.round((present/total)*100) : 0;
    return { present, total, pct };
  }

  function renderClasses(){
    if(!list) return;
    list.innerHTML='';
    const data = readClasses();
    const keys = Object.keys(data);
    if(keys.length===0){
      list.innerHTML='<div class="muted">No classes yet</div>'; return;
    }
    keys.forEach(name=>{
      const wrapper=document.createElement('div');
      wrapper.innerHTML=tplRaw.replaceAll('__NAME__',name).trim();
      const card=wrapper.firstElementChild;
      card.dataset.subjectName=name;

      data[name].records = Array.isArray(data[name].records) ? data[name].records : [];

      const { present, total, pct } = makeStats(data[name].records);
      card.querySelector('.sub-percent').textContent = pct + "%";
      card.querySelector('.present-count').textContent = present;
      card.querySelector('.total-count').textContent = total;

      // show only today's record
      const todayRec = data[name].records.find(r => r.date === todayISO());
      const hist=document.createElement('div');
      hist.className='today-record';
      if(todayRec){
  hist.classList.add(todayRec.status); // add present/absent class
  hist.innerHTML = `
    <div>Today: <strong>${todayRec.status}</strong>
    <button class="btn small warn" data-del="today">Delete</button></div>
  `;
}
 else {
        hist.innerHTML = `<div class="muted">No attendance marked today</div>`;
      }
      card.appendChild(hist);

      list.appendChild(card);
    });
  }

  window.__renderClassesList = renderClasses;

  if(addBtn) addBtn.addEventListener('click',()=>{
    const name=(addInput.value||'').trim();
    if(!name) return alert('Enter subject');
    const data=readClasses();
    if(data[name]) return alert('Already exists');
    data[name]={records:[]};
    writeClasses(data);
    if(addInput) addInput.value='';
    renderClasses();
  });
  if(addInput) addInput.addEventListener('keydown',e=>{ if(e.key==='Enter') addBtn && addBtn.click(); });

  if(list) list.addEventListener('click',ev=>{
    const btn=ev.target.closest('button'); if(!btn) return;
    const card=ev.target.closest('.subject-card'); if(!card) return;
    const name=card.dataset.subjectName;
    const all=readClasses();
    if(!all[name]) return;
    const records = all[name].records;

    const tISO = todayISO();
    const idxToday = records.findIndex(r => r.date === tISO);

    if(btn.classList.contains('inc-present')){
      if(idxToday === -1) records.push({date:tISO,status:'present'});
      else records[idxToday].status = 'present';
      writeClasses(all); renderClasses(); renderHomeOverview();
    } else if(btn.classList.contains('inc-absent')){
      if(idxToday === -1) records.push({date:tISO,status:'absent'});
      else records[idxToday].status = 'absent';
      writeClasses(all); renderClasses(); renderHomeOverview();
    } else if(btn.dataset.del === "today"){
      const idxToday = records.findIndex(r => r.date === tISO);
      if(idxToday !== -1){
        records.splice(idxToday,1);
        writeClasses(all); renderClasses(); renderHomeOverview();
      }
    } else if(btn.classList.contains('reset-sub')){
      if(confirm('Delete class?')){
        delete all[name];
        writeClasses(all); renderClasses(); renderHomeOverview();
      }
    }
  });

  if(clearBtn) clearBtn.addEventListener('click',()=>{
    if(confirm('Clear all classes?')){
      localStorage.removeItem(STORAGE_KEYS.CLASSES);
      renderClasses(); renderHomeOverview();
    }
  });

  if(exportBtn) exportBtn.addEventListener('click',()=>{
    const dataStr=JSON.stringify(readClasses(),null,2);
    const blob=new Blob([dataStr],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='classes.json';a.click();
    URL.revokeObjectURL(url);
  });

  if(importFile) importFile.addEventListener('change',ev=>{
    const file=ev.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
      try {
        const obj=JSON.parse(e.target.result);
        Object.keys(obj||{}).forEach(k=>{
          if(!Array.isArray(obj[k].records)) obj[k].records = [];
        });
        writeClasses(obj); renderClasses(); renderHomeOverview();
      } catch(err){ alert('Invalid JSON'); }
    };
    reader.readAsText(file);
    importFile.value='';
  });

  renderClasses();
}

/* ========== DAILY PAGE (unchanged) ========== */
let currentMonth=new Date().getMonth();
let currentYear=new Date().getFullYear();

function initDailyPage(){
  if (window.__AttenXInitFlags.daily) {
    renderCalendar(currentMonth,currentYear);
    return;
  }
  window.__AttenXInitFlags.daily = true;

  function renderCalendar(month,year){
    const cal=document.getElementById('calendar');
    const monthYear=document.getElementById('monthYear');
    if(!cal||!monthYear) return;
    cal.innerHTML='';
    const firstDay=(new Date(year,month)).getDay();
    const daysInMonth=32-new Date(year,month,32).getDate();
    monthYear.textContent=new Date(year,month).toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const daily=readDaily();

    for(let i=0;i<firstDay;i++){
      const cell=document.createElement('div');
      cell.className='cell empty-cell';
      cal.appendChild(cell);
    }
    for(let d=1;d<=daysInMonth;d++){
      const date=new Date(year,month,d);
      const iso=date.toISOString().slice(0,10);
      const cell=document.createElement('div');
      cell.className='cell';
      cell.innerHTML=`<div class="daynum">${d}</div>`;
      if(daily[iso]==='present'){
        const dot=document.createElement('div');dot.className='dot present-dot';cell.appendChild(dot);
      } else if(daily[iso]==='absent'){
        const dot=document.createElement('div');dot.className='dot absent-dot';cell.appendChild(dot);
      }
      cell.addEventListener('click',()=>{
        const daily=readDaily();
        if(daily[iso]==='present'){ daily[iso]='absent'; }
        else if(daily[iso]==='absent'){ delete daily[iso]; }
        else { daily[iso]='present'; }
        writeDaily(daily); renderCalendar(currentMonth,currentYear);
      });
      cal.appendChild(cell);
    }
  }

  window.__renderCalendar = renderCalendar;

  const prev = document.getElementById('prevMonth');
  const next = document.getElementById('nextMonth');
  const clearBtn = document.getElementById('clearDailyBtn');
  const markTodayPresent = document.getElementById('markTodayPresent');
  const markTodayAbsent = document.getElementById('markTodayAbsent');

  if(prev) prev.addEventListener('click',()=>{
    currentMonth--; if(currentMonth<0){currentMonth=11;currentYear--;}
    renderCalendar(currentMonth,currentYear);
  });
  if(next) next.addEventListener('click',()=>{
    currentMonth++; if(currentMonth>11){currentMonth=0;currentYear++;}
    renderCalendar(currentMonth,currentYear);
  });
  if(clearBtn) clearBtn.addEventListener('click',()=>{
    if(confirm('Clear daily records?')){
      localStorage.removeItem(STORAGE_KEYS.DAILY);
      renderCalendar(currentMonth,currentYear);
    }
  });
  if(markTodayPresent) markTodayPresent.addEventListener('click',()=>{
    const d=readDaily(); d[todayISO()]='present'; writeDaily(d); renderCalendar(currentMonth,currentYear);
  });
  if(markTodayAbsent) markTodayAbsent.addEventListener('click',()=>{
    const d=readDaily(); d[todayISO()]='absent'; writeDaily(d); renderCalendar(currentMonth,currentYear);
  });
  renderCalendar(currentMonth,currentYear);
}

/* ========== Bootstrapping ========== */
document.addEventListener('DOMContentLoaded',()=>{
  if(document.getElementById('overallPercent')) renderHomeOverview();
});

window.renderHomeOverview = renderHomeOverview;
window.initClassesPage = initClassesPage;
window.initDailyPage = initDailyPage;
