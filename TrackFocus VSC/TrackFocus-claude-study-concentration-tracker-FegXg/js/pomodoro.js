// Máquina de estados del timer Pomodoro.
const Pomodoro = (() => {

  const DEFAULTS = { focus: 25, shortBreak: 5, longBreak: 15 };

  let state = {
    mode: 'idle',       // 'idle' | 'focus' | 'break' | 'paused'
    pausedMode: null,
    focusDuration: DEFAULTS.focus,
    breakDuration: DEFAULTS.shortBreak,
    longBreakDuration: DEFAULTS.longBreak,
    cycleCount: 0,
    remaining: 0,
    intervalId: null,
    subject: null,
    userId: null,
    onTick: null,
    onComplete: null
  };

  function setCallbacks(onTick, onComplete) {
    state.onTick = onTick;
    state.onComplete = onComplete;
  }

  function _tick() {
    state.remaining--;
    if (state.onTick) state.onTick(state.remaining, state.mode);
    if (state.remaining <= 0) {
      _complete();
    }
  }

  function _complete() {
    clearInterval(state.intervalId);
    state.intervalId = null;
    const completedMode = state.mode;
    if (completedMode === 'focus') {
      state.cycleCount++;
    }
    state.mode = 'idle';
    if (state.onComplete) state.onComplete(completedMode);
  }

  function start(subject, userId) {
    if (state.mode !== 'idle') return;
    state.subject = subject;
    state.userId = userId;
    state.mode = 'focus';
    state.remaining = state.focusDuration * 60;
    state.intervalId = setInterval(_tick, 1000);
    if (state.onTick) state.onTick(state.remaining, state.mode);
  }

  function startBreak(long) {
    if (state.mode !== 'idle') return;
    state.mode = 'break';
    state.remaining = (long ? state.longBreakDuration : state.breakDuration) * 60;
    state.intervalId = setInterval(_tick, 1000);
    if (state.onTick) state.onTick(state.remaining, state.mode);
  }

  function pause() {
    if (state.mode === 'focus' || state.mode === 'break') {
      clearInterval(state.intervalId);
      state.intervalId = null;
      state.pausedMode = state.mode;
      state.mode = 'paused';
      if (state.onTick) state.onTick(state.remaining, state.mode);
    }
  }

  function resume() {
    if (state.mode !== 'paused') return;
    state.mode = state.pausedMode;
    state.pausedMode = null;
    state.intervalId = setInterval(_tick, 1000);
    if (state.onTick) state.onTick(state.remaining, state.mode);
  }

  function skip() {
    if (state.mode === 'idle') return;
    clearInterval(state.intervalId);
    state.intervalId = null;
    _complete();
  }

  function reset() {
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.mode = 'idle';
    state.pausedMode = null;
    state.remaining = state.focusDuration * 60;
    state.subject = null;
    if (state.onTick) state.onTick(state.remaining, 'idle');
  }

  function getState() {
    return {
      mode: state.mode,
      remaining: state.remaining,
      cycleCount: state.cycleCount,
      subject: state.subject,
      userId: state.userId
    };
  }

  function formatTime(seconds) {
    const m = Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0');
    const s = (Math.abs(seconds) % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  return { DEFAULTS, setCallbacks, start, startBreak, pause, resume, skip, reset, getState, formatTime };
})();
