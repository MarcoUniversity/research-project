import { $ } from '../utils/dom.js';
import { Stats } from '../utils/stats.js';
import { TextUtil } from '../utils/text-util.js';
import { OneEuro } from '../utils/filters.js';
import { FaceTracker } from './face-tracker.js';
import { GazeModel } from './gaze-model.js';
import { StressAnalyzer } from './stress-analyzer.js';
import { Visualizer } from '../ui/visualizer.js';
import { CloudDB } from '../services/firebase.js';

export class TestSessionManager {
  constructor(app) {
    this.app = app;
    this.testLoop = null;
    this.timerInt = null;
  }

  updateTimerDisplay(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    $('#timer-val').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  async startTest() {
    if (this.app.calibManager.calibLoop) {
      cancelAnimationFrame(this.app.calibManager.calibLoop);
      this.app.calibManager.calibLoop = null;
    }
    $('#read-title').textContent = this.app.S.config.title;
    const rc = $('#read-content'); rc.style.fontSize = this.app.S.config.fontSize + 'px';
    rc.innerHTML = TextUtil.toParagraphs(this.app.S.config.text);
    this.app.show('screen-test');
    await this.app.tracker.attachVideo(this.app.testVideo);

    this.app.S.session = {
      samples: [], blinks: [], faceTimes: [], startT: performance.now(), endT: 0,
      tracking: { frames: 0, faceFrames: 0, validFrames: 0, rejectedFrames: 0 }
    };
    this.app.S.running = true;
    const fx = new OneEuro(1.35, 0.12), fy = new OneEuro(1.35, 0.12);
    const blink = { closed: false, start: 0, lastEvent: -Infinity, lastFace: 0 };
    let lastVideoTime = -1, lastValidT = 0;

    if (this.app.S.config.timed) {
      $('#read-timer').style.display = 'flex';
      this.updateTimerDisplay(this.app.S.config.durationSec);
      let remaining = this.app.S.config.durationSec;
      this.timerInt = setInterval(() => {
        remaining--; this.updateTimerDisplay(Math.max(0, remaining));
        if (remaining <= 10) $('#read-timer').classList.add('warn');
        if (remaining <= 0) { clearInterval(this.timerInt); this.endTest(); }
      }, 1000);
    } else {
      $('#read-timer').style.display = 'none';
    }

    const tick = () => {
      if (!this.app.S.running) return;
      const v = this.app.testVideo, sess = this.app.S.session;
      if (v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        const now = performance.now();
        sess.tracking.frames++;
        const res = this.app.tracker.detect(v, now);
        if (res.faceLandmarks && res.faceLandmarks.length) {
          sess.tracking.faceFrames++;
          sess.faceTimes.push(now);
          blink.lastFace = now;
          const lm = res.faceLandmarks[0];
          const feat = FaceTracker.extractFeatures(lm);
          const blend = res.faceBlendshapes && res.faceBlendshapes[0];
          const bs = FaceTracker.blinkScore(blend);
          StressAnalyzer.updateBlinkState(blink, bs.combined, now, sess.blinks);
          if (FaceTracker.featureIsValid(feat) && !blink.closed) {
            const rawNX = GazeModel.predictAxis(this.app.S.calib.wX, feat), rawNY = GazeModel.predictAxis(this.app.S.calib.wY, feat);
            if (Number.isFinite(rawNX) && Number.isFinite(rawNY) && rawNX > -0.2 && rawNX < 1.2 && rawNY > -0.2 && rawNY < 1.2) {
              if (lastValidT && now - lastValidT > 180) { fx.reset(); fy.reset(); }
              const nx = Stats.clamp(fx.filter(rawNX, now / 1000), 0, 1);
              const ny = Stats.clamp(fy.filter(rawNY, now / 1000), 0, 1);
              const gx = nx * innerWidth, gy = ny * innerHeight;
              const rect = rc.getBoundingClientRect();
              const contentX = (gx - rect.left) / (rect.width || 1);
              const contentY = (gy - rect.top) / (rect.height || 1);
              sess.samples.push({
                t: now, x: gx, y: gy, nx, ny, rawX: rawNX * innerWidth, rawY: rawNY * innerHeight,
                contentX, contentY, inReading: contentX >= 0 && contentX <= 1 && contentY >= 0 && contentY <= 1
              });
              sess.tracking.validFrames++;
              lastValidT = now;
            } else sess.tracking.rejectedFrames++;
          } else if (!blink.closed) sess.tracking.rejectedFrames++;
        } else {
          if (blink.closed && now - blink.lastFace > 160) blink.closed = false;
        }
      }
      this.testLoop = requestAnimationFrame(tick);
    };
    tick();
  }

  endTest() {
    if (!this.app.S.running) return;
    this.app.S.running = false;
    this.app.S.session.endT = performance.now();
    if (this.testLoop) { cancelAnimationFrame(this.testLoop); this.testLoop = null; }
    if (this.timerInt) { clearInterval(this.timerInt); this.timerInt = null; }
    $('#read-timer').classList.remove('warn');

    if (this.app.S.config.questions && this.app.S.config.questions.length > 0) {
      this.app.startQuiz();
    } else {
      this.computeAndShowResults();
    }
  }

  computeAndShowResults() {
    const m = StressAnalyzer.analyze(this.app.S.session, this.app.S.calib);
    const st = StressAnalyzer.stressIndex(m);
    this.app.S.lastMetrics = { m, st };

    $('#res-title').textContent = this.app.S.config.title;
    $('#res-eyebrow').textContent = (this.app.S.run.testName ? `${this.app.S.run.testName} · ` : '') + (this.app.S.run.age ? `${this.app.S.run.age} years · ` : '') + 'Composite Stress Index';
    const c = Math.round(st.composite);
    $('#gauge-num').textContent = m.reliable ? c : '—';
    const col = !m.reliable ? 'var(--amber)' : c < 33 ? 'var(--green)' : c < 66 ? 'var(--amber)' : 'var(--coral)';
    $('#gauge-num').style.color = col;
    Visualizer.drawGauge(m.reliable ? st.composite : 0, col);
    const band = !m.reliable ? 'Insufficient data for a reliable index' :
      c < 33 ? 'Low stress · relaxed state' : c < 66 ? 'Moderate stress · noticeable load' : 'High stress · heavy load';
    $('#gauge-band').textContent = band; $('#gauge-band').style.color = col;

    const P = [
      { n: 'Blink rate (U-curve)', v: m.blinkRate.toFixed(1), u: 'blinks/min', s: st.pBlink },
      { n: 'Gaze variability', v: m.sd.toFixed(0), u: 'px (dispersion)', s: st.pDisp },
      { n: 'Scan velocity', v: m.meanSacc.toFixed(0), u: 'px (saccade media)', s: st.pScan },
      { n: 'Downward gaze', v: (m.downFrac * 100).toFixed(0) + '%', u: 'time looking down', s: st.pDown },
    ];
    $('#pillars').innerHTML = P.map(p => {
      const col = p.s < 33 ? 'var(--green)' : p.s < 66 ? 'var(--amber)' : 'var(--coral)';
      return `<div class="pillar"><div class="pn">${p.n}</div>
        <div class="pv" style="color:${col}">${p.v}</div>
        <div class="pu">${p.u}</div>
        <div class="bar"><i style="width:${p.s.toFixed(0)}%;background:${col}"></i></div>
        <div class="pu" style="text-align:right">index ${p.s.toFixed(0)}/100</div></div>`;
    }).join('');

    const qs = this.app.S.session.quizScore;
    const quizResultStr = qs ? `${qs.correct} out of ${qs.total} correct` : 'No quiz';

    const rows = [
      ['Session', this.app.S.run.sessionName || this.app.S.config.title],
      ['Participant age', (this.app.S.run.age || '—') + ' years'],
      ['Session date', this.app.S.run.date || '—'],
      ['Administered text', this.app.S.run.testName || '—'],
      ['Comprehension quiz', quizResultStr], 
      ['Session duration', m.durSec.toFixed(1) + ' s'],
      ['Valid gaze samples', this.app.S.session.samples.length],
      ['Valid sampling frequency', m.sampleRate.toFixed(1) + ' Hz'],
      ['Valid tracking coverage', (m.validFrac * 100).toFixed(0) + '%'],
      ['Face detected', (m.faceFrac * 100).toFixed(0) + '%'],
      ['Analysis reliability', (m.reliability * 100).toFixed(0) + '%'],
      ['Detected fixations', m.fixations.length],
      ['Detected saccades', m.saccades.length],
      ['Total blinks', this.app.S.session.blinks.length],
      ['Blink rate', m.blinkRate.toFixed(1) + ' /min'],
      ['Mean fixation duration', (m.fixations.length ? Stats.mean(m.fixations.map(f => f.dur)) : 0).toFixed(0) + ' ms'],
      ['Calibration quality', (this.app.S.calib.quality || 0).toFixed(0) + ' px RMSE · P90 ' + (this.app.S.calib.qualityP90 || 0).toFixed(0) + ' px'],
    ];
    $('#stat-table').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');

    $('#viz-reading').style.fontSize = '13px';
    $('#viz-reading').innerHTML = TextUtil.toParagraphs(this.app.S.config.text);
    this.app.show('screen-results');
    requestAnimationFrame(() => this.app.renderViz('heat'));
    this.sendToCloud(m, st);
  }

  async sendToCloud(metrics, stress) {
    const sessionData = {
      sessionName: this.app.S.run.sessionName || "Unnamed",
      date: this.app.S.run.date || null,
      testName: this.app.S.run.testName || "Free Reading",
      age: this.app.S.run.age || null,
      quizScore: this.app.S.session.quizScore || null,
      durSec: metrics.durSec,
      stressComposite: stress.composite,
      metrics: {
        blinkRate: metrics.blinkRate,
        gazeDispersion: metrics.sd,
        meanSaccade: metrics.meanSacc,
        downwardGazeFrac: metrics.downFrac,
        reliability: metrics.reliability
      },
      calibrationRMSE: this.app.S.calib.quality || null
    };

    await CloudDB.saveSession(sessionData);
  }
}