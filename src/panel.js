const $ = (s) => document.querySelector(s);
let curPhase = null;

function fmt(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function replayAnim(cls) {
  const card = $('#card');
  card.classList.remove('pop', 'swap');
  void card.offsetWidth;
  card.classList.add(cls);
}

function render(st) {
  document.body.className = `phase-${st.phase}`;
  $('#view-idle').hidden = st.phase !== 'idle';
  $('#view-timer').hidden = !(st.phase === 'running' || st.phase === 'paused');
  $('#view-done').hidden = st.phase !== 'done';

  if (st.phase === 'idle') {
    $('#minutes').textContent = st.durationMin;
    $('#dec').disabled = st.durationMin <= 20;
    $('#inc').disabled = st.durationMin >= 60;
  } else if (st.phase === 'running' || st.phase === 'paused') {
    $('#time').textContent = fmt(st.remainingMs);
    $('#timer-title').textContent = st.phase === 'paused' ? '已 暂 停' : '专 注 进 行 中';
    $('#status').textContent = st.phase === 'paused' ? '准备好就继续吧' : '保持专注，加油！';
    $('#toggle').textContent = st.phase === 'paused' ? '继 续' : '暂 停';
  }
}

window.clock.onState((st) => {
  if (curPhase && curPhase !== st.phase) replayAnim('swap');
  curPhase = st.phase;
  render(st);
});

window.clock.onPanelShown(() => replayAnim('pop'));

$('#dec').addEventListener('click', () => window.clock.action('dec'));
$('#inc').addEventListener('click', () => window.clock.action('inc'));
$('#start').addEventListener('click', () => window.clock.action('start'));
$('#toggle').addEventListener('click', () => window.clock.action(curPhase === 'paused' ? 'resume' : 'pause'));
$('#reset').addEventListener('click', () => window.clock.action('reset'));
$('#ok').addEventListener('click', () => window.clock.action('close-reminder'));
$('#quit').addEventListener('click', () => window.clock.action('quit'));

document.addEventListener('contextmenu', (e) => e.preventDefault());
