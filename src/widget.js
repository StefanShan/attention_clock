const RING_R = 62;
const CIRC = 2 * Math.PI * RING_R;
const prog = document.querySelector('.ring-prog');
prog.style.strokeDasharray = CIRC;

function fmt(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

window.clock.onState((st) => {
  document.body.className = `phase-${st.phase}`;
  const total = st.durationMin * 60000;
  const frac = total > 0 ? st.remainingMs / total : 0;
  if (st.phase === 'running' || st.phase === 'paused') {
    prog.style.strokeDashoffset = CIRC * (1 - frac);
    document.getElementById('remain').textContent = fmt(st.remainingMs);
    document.getElementById('phase-label').textContent =
      st.phase === 'paused' ? '已暂停' : '专注中';
  } else if (st.phase === 'idle') {
    prog.style.strokeDashoffset = 0;
    document.getElementById('idle-min').textContent = st.durationMin;
  } else if (st.phase === 'done') {
    prog.style.strokeDashoffset = 0;
  }
});

document.addEventListener('mousedown', () => {
  document.body.classList.add('dragging');
  window.clock.mouse('down');
});

document.addEventListener('mouseup', () => {
  document.body.classList.remove('dragging');
  window.clock.mouse('up');
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());
