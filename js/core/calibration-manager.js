import { $, $$ } from '../utils/dom.js';
import { Stats } from '../utils/stats.js';
import { FaceTracker } from './face-tracker.js';
import { GazeModel } from './gaze-model.js';

const REQUIRED = 5;

export class CalibrationManager {
  constructor(app) {
    this.app = app; 
    this.calibLoop = null;
  }

  placeMini(c) {
    const m = this.app.calibMini; m.style.left = m.style.right = m.style.top = m.style.bottom = 'auto';
    if (c === 'tl') { m.style.left = '18px'; m.style.top = '18px'; }
    else if (c === 'tr') { m.style.right = '18px'; m.style.top = '18px'; }
    else if (c === 'bl') { m.style.left = '18px'; m.style.bottom = '18px'; }
    else { m.style.right = '18px'; m.style.bottom = '18px'; }
  }

  async startCalibration() {
    this.app.show('screen-calib');
    await this.app.tracker.attachVideo(this.app.calibVideo);
    this.app.S.calib.samples = []; this.app.S.calib.wX = null; this.app.S.calib.wY = null;
    this.app.S.calib.quality = null; this.app.S.calib.qualityP90 = null;
    this.app.S._calibHistory = []; this.app.S._calibLastCapture = 0;
    this.buildCalibDots();
    $('#calib-center').style.display = 'flex';
    $('#calib-center-msg').textContent = 'Click points one by one while fixating on them';
    $('#calib-gaze').classList.add('hidden');
    
    let latestFeat = null, latestOK = false;
    let lastVideoTime = -1;
    if (this.calibLoop) cancelAnimationFrame(this.calibLoop);
    
    const tick = () => {
      const v = this.app.calibVideo;
      if (v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        const now = performance.now();
        const res = this.app.tracker.detect(v, now);
        if (res.faceLandmarks && res.faceLandmarks.length) {
          const feat = FaceTracker.extractFeatures(res.faceLandmarks[0]);
          const bs = FaceTracker.blinkScore(res.faceBlendshapes && res.faceBlendshapes[0]);
          latestFeat = feat; latestOK = FaceTracker.featureIsValid(feat) && bs.combined < 0.45;
          if (latestOK) {
            this.app.S._calibHistory.push({ t: now, feat });
            this.app.S._calibHistory = this.app.S._calibHistory.filter(x => now - x.t <= 350);
            $('#calib-track').textContent = 'stable gaze';
            $('#calib-track').style.color = 'var(--green)';
          } else {
            $('#calib-track').textContent = 'invalid eyes';
            $('#calib-track').style.color = 'var(--amber)';
          }
        } else {
          latestOK = false; $('#calib-track').textContent = 'face NOT detected';
          $('#calib-track').style.color = 'var(--coral)';
        }
      }
      if (this.app.S.calib.wX && latestOK && latestFeat) {
        const gx = GazeModel.predictAxis(this.app.S.calib.wX, latestFeat) * innerWidth;
        const gy = GazeModel.predictAxis(this.app.S.calib.wY, latestFeat) * innerHeight;
        const c = $('#calib-gaze'); c.classList.remove('hidden');
        c.style.left = gx + 'px'; c.style.top = gy + 'px';
      }
      this.calibLoop = requestAnimationFrame(tick);
    };
    tick();
  }

  buildCalibDots() {
    const stage = $('#calib-stage'); stage.innerHTML = '';
    const W = window.innerWidth, H = window.innerHeight;
    const mx = 0.08, my = 0.12;
    const xs = [mx, 0.5, 1 - mx].map(f => f * W);
    const ys = [my, 0.5, 1 - my].map(f => f * H);
    let totalNeeded = 0;
    for (const y of ys) for (const x of xs) {
      const dot = document.createElement('div');
      dot.className = 'calib-dot';
      dot.style.left = x + 'px'; dot.style.top = y + 'px';
      dot.dataset.count = '0'; dot.dataset.x = x; dot.dataset.y = y;
      dot.innerHTML = '<div class="ring"></div><div class="core"></div><div class="cnt">5</div>';
      dot.addEventListener('click', () => this.onCalibClick(dot));
      stage.appendChild(dot);
      totalNeeded += REQUIRED;
    }
    this.app.S._calibTotal = totalNeeded;
    this.updateCalibProg();
  }

  onCalibClick(dot) {
    const feat = this.stableCalibrationFeature();
    if (!feat) { this.flash($('#calib-track')); return; }
    const x = parseFloat(dot.dataset.x) / innerWidth, y = parseFloat(dot.dataset.y) / innerHeight;
    this.app.S.calib.samples.push({ feat, x, y });
    let c = parseInt(dot.dataset.count, 10) + 1; dot.dataset.count = c;
    dot.querySelector('.cnt').textContent = Math.max(0, REQUIRED - c);
    if (c >= REQUIRED) dot.classList.add('done');
    this.updateCalibProg();
    $('#calib-center').style.display = 'none';
    if (this.app.S.calib.samples.length >= 18) this.retrain();
    if (this.app.S.calib.samples.length >= this.app.S._calibTotal) this.finishCalibration();
  }

  stableCalibrationFeature() {
    const now = performance.now();
    const h = (this.app.S._calibHistory || []).filter(v => now - v.t <= 260);
    if (h.length < 4 || now - this.app.S._calibLastCapture < 100) return null;
    const feat = h[0].feat.map((_, i) => Stats.median(h.map(v => v.feat[i])));
    const gx = h.map(v => (v.feat[0] + v.feat[2]) / 2);
    const gy = h.map(v => (v.feat[1] + v.feat[3]) / 2);
    const hx = h.map(v => v.feat[4]), hy = h.map(v => v.feat[5]);
    if (Math.hypot(Stats.stdev(gx), Stats.stdev(gy)) > 0.028 || Math.hypot(Stats.stdev(hx), Stats.stdev(hy)) > 0.009) return null;
    this.app.S._calibLastCapture = now;
    return feat;
  }

  flash(el) { el.animate([{ opacity: 1 }, { opacity: .2 }, { opacity: 1 }], { duration: 300 }); }
  updateCalibProg() { $('#calib-prog').textContent = `${this.app.S.calib.samples.length} / ${this.app.S._calibTotal} samples`; }
  
  retrain() {
    const fit = GazeModel.fit(this.app.S.calib.samples);
    this.app.S.calib.wX = fit.wX; this.app.S.calib.wY = fit.wY;
  }

  calibrationValidationErrors() {
    const groups = new Map();
    for (const s of this.app.S.calib.samples) {
      const key = s.x.toFixed(4) + ':' + s.y.toFixed(4);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const errors = [];
    for (let fold = 0; fold < REQUIRED; fold++) {
      const train = [], test = [];
      for (const group of groups.values()) group.forEach((s, i) => (i === fold ? test : train).push(s));
      const fit = GazeModel.fit(train);
      for (const s of test) {
        errors.push(Math.hypot(
          (GazeModel.predictAxis(fit.wX, s.feat) - s.x) * innerWidth,
          (GazeModel.predictAxis(fit.wY, s.feat) - s.y) * innerHeight
        ));
      }
    }
    return errors;
  }

  finishCalibration() {
    this.retrain();
    const validationErrors = this.calibrationValidationErrors();
    const err = Math.sqrt(Stats.mean(validationErrors.map(e => e * e)));
    const p90 = Stats.quantile(validationErrors, 0.9);
    this.app.S.calib.quality = err;
    this.app.S.calib.qualityP90 = p90;
    $('#calib-center').style.display = 'flex';
    const diag = Math.hypot(innerWidth, innerHeight);
    let band = err < diag * 0.04 ? ['EXCELLENT', 'var(--green)'] : err < diag * 0.07 ? ['GOOD', 'var(--teal)'] :
           err < diag * 0.11 ? ['FAIR', 'var(--amber)'] : ['POOR', 'var(--coral)'];
    $('#calib-center-msg').innerHTML =
      `<div style="font-size:22px;color:${band[1]};margin-bottom:8px">Calibration ${band[0]}</div>` +
      `<div>validated error ≈ ${err.toFixed(0)} px · P90 ${p90.toFixed(0)} px</div>` +
      (err >= diag * 0.11 ? `<div style="color:var(--coral);margin-top:8px">Recalibration recommended: improve lighting and keep your head steadier.</div>` : ``) +
      `<div style="margin-top:22px;pointer-events:auto;display:flex;gap:12px;justify-content:center">` +
        `<button class="btn ghost" id="recalib">Recalibrate</button>` +
        `<button class="btn primary" id="startTest">Start test →</button>` +
      `</div>`;
    $('#recalib').addEventListener('click', () => this.startCalibration());
    
    $('#startTest').addEventListener('click', () => this.app.testManager.startTest());
  }
}