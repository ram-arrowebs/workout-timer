(function () {
  'use strict';

  var STORAGE_KEY = 'wotimer.settings';
  var DEFAULTS = { sets: 3, reps: 10, repSec: 3, restSec: 90 };
  var TICK_MS = 100;

  function $(id) { return document.getElementById(id); }

  var el = {
    screenSetup: $('screen-setup'),
    screenSession: $('screen-session'),
    screenSummary: $('screen-summary'),
    form: $('setup-form'),
    inSets: $('in-sets'),
    inReps: $('in-reps'),
    inRepSec: $('in-rep-sec'),
    inRestSec: $('in-rest-sec'),
    setupError: $('setup-error'),
    speechWarning: $('speech-warning'),
    sSet: $('s-set'),
    sSetTotal: $('s-set-total'),
    sRep: $('s-rep'),
    sRepTotal: $('s-rep-total'),
    sElapsed: $('s-elapsed'),
    sPhase: $('s-phase'),
    sNumber: $('s-number'),
    sPaused: $('s-paused'),
    btnPause: $('btn-pause'),
    btnComplete: $('btn-complete'),
    summaryTitle: $('summary-title'),
    sumElapsed: $('sum-elapsed'),
    sumSets: $('sum-sets'),
    sumReps: $('sum-reps'),
    btnNew: $('btn-new')
  };

  // ---------------------------------------------------------------- speech

  var speech = (function () {
    var supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    var synth = supported ? window.speechSynthesis : null;

    function say(text, opts) {
      if (!supported) return;
      var interrupt = !opts || opts.interrupt !== false;
      try {
        if (interrupt && (synth.speaking || synth.pending)) synth.cancel();
        var u = new SpeechSynthesisUtterance(String(text));
        u.rate = 1.1;
        u.lang = navigator.language || 'en';
        synth.speak(u);
      } catch (e) { /* ignore speech failures */ }
    }

    function stop() {
      if (!supported) return;
      try { synth.cancel(); } catch (e) { /* ignore */ }
    }

    return { supported: supported, say: say, stop: stop };
  })();

  // ------------------------------------------------------------- wake lock

  var wakeLock = null;

  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* not granted; OS screen timeout applies */ });
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    var lock = wakeLock;
    wakeLock = null;
    lock.release().catch(function () { /* ignore */ });
  }

  // -------------------------------------------------------------- settings

  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (s && typeof s === 'object') return Object.assign({}, DEFAULTS, s);
    } catch (e) { /* ignore */ }
    return Object.assign({}, DEFAULTS);
  }

  function saveSettings(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  function fillForm(s) {
    el.inSets.value = s.sets;
    el.inReps.value = s.reps;
    el.inRepSec.value = s.repSec;
    el.inRestSec.value = s.restSec;
  }

  function readForm() {
    var sets = parseInt(el.inSets.value, 10);
    var reps = parseInt(el.inReps.value, 10);
    var repSec = parseFloat(el.inRepSec.value);
    var restSec = parseInt(el.inRestSec.value, 10);

    if (!(sets >= 1 && sets <= 99)) return { error: 'Sets must be between 1 and 99.' };
    if (!(reps >= 1 && reps <= 999)) return { error: 'Reps must be between 1 and 999.' };
    if (!(repSec >= 0.5 && repSec <= 600)) return { error: 'Seconds per rep must be between 0.5 and 600.' };
    if (!(restSec >= 0 && restSec <= 3600)) return { error: 'Rest must be between 0 and 3600 seconds.' };

    return { cfg: { sets: sets, reps: reps, repSec: repSec, restSec: restSec } };
  }

  // ----------------------------------------------------------- timer state

  var settings = loadSettings();
  var timerId = null;

  var state = {
    phase: 'idle',      // 'idle' | 'rep' | 'rest' | 'done'
    paused: false,
    set: 1,
    rep: 1,
    phaseStart: 0,
    phaseEnd: 0,
    sessionStart: 0,
    pausedAt: 0,
    pausedTotal: 0,
    repsDone: 0,
    setsDone: 0
  };

  function now() { return performance.now(); }

  function isActive() { return state.phase === 'rep' || state.phase === 'rest'; }

  function effectiveNow(t) { return state.paused ? state.pausedAt : t; }

  function elapsedMs(t) { return Math.max(0, effectiveNow(t) - state.sessionStart - state.pausedTotal); }

  function start(cfg) {
    settings = cfg;
    var t = now();
    state.phase = 'rep';
    state.paused = false;
    state.set = 1;
    state.rep = 1;
    state.phaseStart = t;
    state.phaseEnd = t + cfg.repSec * 1000;
    state.sessionStart = t;
    state.pausedAt = 0;
    state.pausedTotal = 0;
    state.repsDone = 0;
    state.setsDone = 0;

    announceSet();

    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, TICK_MS);
    requestWakeLock();
    showScreen('session');
    render(t);
  }

  function announceSet() {
    if (settings.sets > 1) {
      speech.say('Set ' + state.set);
      speech.say('1', { interrupt: false });
    } else {
      speech.say('1');
    }
  }

  function tick() {
    if (state.paused || !isActive()) return;
    var t = now();
    // Catch up if timers were throttled; deadlines are absolute so no drift accumulates.
    var guard = 0;
    while (isActive() && t >= state.phaseEnd && guard++ < 100000) advance();
    if (isActive()) render(t);
  }

  function advance() {
    if (state.phase === 'rep') {
      state.repsDone++;
      if (state.rep < settings.reps) {
        state.rep++;
        state.phaseStart = state.phaseEnd;
        state.phaseEnd = state.phaseStart + settings.repSec * 1000;
        speech.say(state.rep);
        return;
      }
      state.setsDone++;
      if (state.set >= settings.sets) {
        finish(true);
        return;
      }
      if (settings.restSec > 0) {
        state.phase = 'rest';
        state.phaseStart = state.phaseEnd;
        state.phaseEnd = state.phaseStart + settings.restSec * 1000;
        return;
      }
      beginNextSet(state.phaseEnd);
      return;
    }
    if (state.phase === 'rest') {
      beginNextSet(state.phaseEnd);
    }
  }

  function beginNextSet(at) {
    state.set++;
    state.rep = 1;
    state.phase = 'rep';
    state.phaseStart = at;
    state.phaseEnd = at + settings.repSec * 1000;
    announceSet();
  }

  function pause() {
    if (!isActive() || state.paused) return;
    state.paused = true;
    state.pausedAt = now();
    speech.stop();
    render(state.pausedAt);
  }

  function resume() {
    if (!isActive() || !state.paused) return;
    var t = now();
    var delta = t - state.pausedAt;
    state.pausedTotal += delta;
    state.phaseStart += delta;
    state.phaseEnd += delta;
    state.paused = false;
    render(t);
  }

  function finish(natural) {
    if (!isActive()) return;
    var elapsed = elapsedMs(now());
    state.phase = 'done';
    state.paused = false;
    if (timerId) { clearInterval(timerId); timerId = null; }
    releaseWakeLock();
    document.body.classList.remove('phase-rest', 'is-paused');

    if (natural) speech.say('Done'); else speech.stop();

    el.summaryTitle.textContent = natural ? 'Workout complete' : 'Workout ended';
    el.sumElapsed.textContent = formatTime(elapsed);
    el.sumSets.textContent = state.setsDone + ' / ' + settings.sets;
    el.sumReps.textContent = state.repsDone + ' / ' + (settings.sets * settings.reps);
    showScreen('summary');
  }

  // ---------------------------------------------------------------- render

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatTime(ms) {
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return (h > 0 ? h + ':' + pad2(m) : m < 10 ? '0' + m : String(m)) + ':' + pad2(s);
  }

  function render(t) {
    var tEff = effectiveNow(t);
    var resting = state.phase === 'rest';

    el.sSet.textContent = state.set;
    el.sSetTotal.textContent = settings.sets;
    el.sRep.textContent = state.rep;
    el.sRepTotal.textContent = settings.reps;
    el.sElapsed.textContent = formatTime(elapsedMs(t));

    if (resting) {
      el.sPhase.textContent = 'Rest';
      el.sNumber.textContent = Math.max(0, Math.ceil((state.phaseEnd - tEff) / 1000));
    } else {
      el.sPhase.textContent = 'Rep';
      el.sNumber.textContent = state.rep;
    }

    document.body.classList.toggle('phase-rest', resting);
    document.body.classList.toggle('is-paused', state.paused);
    el.btnPause.textContent = state.paused ? 'Resume' : 'Pause';
    el.sPaused.hidden = !state.paused;
  }

  function showScreen(name) {
    el.screenSetup.hidden = name !== 'setup';
    el.screenSession.hidden = name !== 'session';
    el.screenSummary.hidden = name !== 'summary';
  }

  // ---------------------------------------------------------------- events

  el.form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var result = readForm();
    if (result.error) {
      el.setupError.textContent = result.error;
      el.setupError.hidden = false;
      return;
    }
    el.setupError.hidden = true;
    saveSettings(result.cfg);
    start(result.cfg);
  });

  el.btnPause.addEventListener('click', function () {
    if (state.paused) resume(); else pause();
  });

  el.btnComplete.addEventListener('click', function () { finish(false); });

  el.btnNew.addEventListener('click', function () {
    fillForm(settings);
    showScreen('setup');
  });

  document.addEventListener('keydown', function (ev) {
    if (!isActive() || ev.target.tagName === 'INPUT') return;
    if (ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      if (state.paused) resume(); else pause();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !isActive()) return;
    requestWakeLock();
    tick();
  });

  // ------------------------------------------------------------------ init

  fillForm(settings);
  el.speechWarning.hidden = speech.supported;
  showScreen('setup');
})();
