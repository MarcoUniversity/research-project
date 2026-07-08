import { $, $$ } from './utils/dom.js';
import { TextUtil } from './utils/text-util.js';
import { FaceTracker } from './core/face-tracker.js';
import { Library } from './services/library.js';
import { PdfReader } from './services/pdf-reader.js';
import { Exporter } from './services/exporter.js';
import { Visualizer } from './ui/visualizer.js';
import { StressAnalyzer } from './core/stress-analyzer.js';

import { CalibrationManager } from './core/calibration-manager.js';
import { TestSessionManager } from './core/test-session-manager.js';

const LS_KEY = 'ocuread_library_v1';

export class OcuReadApp {
  constructor() {
    this.tracker = new FaceTracker((on, msg) => this.loader(on, msg));
    this.lib = new Library(LS_KEY);
    this.currentQuestions = [];
    this.S = {
      config: { title: "OcuRead Session", text: "", timed: true, durationSec: 120, fontSize: 21 },
      calib: { samples: [], wX: null, wY: null, quality: null, qualityP90: null },
      session: { samples: [], blinks: [], faceTimes: [], startT: 0, endT: 0, tracking: null },
      run: {},
      running: false,
      lastMetrics: null,
      _calibHistory: [], _calibLastCapture: 0, _calibTotal: 0
    };
    this.editingId = null;
    this.libPdfText = '';
    this.vizMode = 'heat';
    this._miniCorner = 'br';

    this.calibVideo = $('#calib-video');
    this.testVideo = $('#test-video');
    this.calibMini = document.querySelector('.calib-mini');
    this.runTimer = $('#run-timer-switch');

    this.calibManager = new CalibrationManager(this);
    this.testManager = new TestSessionManager(this);
  }

  show(id) { $$('.screen').forEach(s => s.classList.remove('active')); $('#' + id).classList.add('active'); }
  loader(on, msg) { const l = $('#loader'); if (msg) $('#loader-msg').textContent = msg; l.classList.toggle('hidden', !on); }

  setSourceWrite() {
    $$('#lib-toggle .seg').forEach(s => s.classList.toggle('on', s.dataset.src === 'write'));
    $('#lib-pane-write').classList.add('on'); $('#lib-pane-pdf').classList.remove('on');
  }

  normalizeQuestion(q) {
    if (!q || typeof q.text !== 'string') return null;

    let correctTrue = false;
    if (typeof q.correctTrue === 'boolean') {
      correctTrue = q.correctTrue;
    } else if (Array.isArray(q.options) && Number.isInteger(q.correctIndex)) {
      const raw = String(q.options[q.correctIndex] || '').trim().toLowerCase();
      correctTrue = raw === 'true' || raw === 'vero';
    }

    const text = q.text.trim();
    if (!text) return null;
    return { text, correctTrue };
  }

  normalizeQuestions(list) {
    return (list || []).map(q => this.normalizeQuestion(q)).filter(Boolean);
  }

  syncQuestionsFromDOM() {
    $$('.q-edit-box').forEach((node, i) => {
      if (!this.currentQuestions[i]) return;
      this.currentQuestions[i].text = node.querySelector('.q-text').value;
      const correctRadio = node.querySelector(`input[name="q_correct_${i}"]:checked`);
      this.currentQuestions[i].correctTrue = correctRadio ? correctRadio.value === 'true' : false;
    });
  }

  clearEditor() {
    this.editingId = null; this.libPdfText = '';
    this.currentQuestions = []; 
    $('#lib-editor-title').textContent = 'New text';
    $('#lib-name').value = ''; $('#lib-text').value = ''; $('#lib-pdf-status').innerHTML = '';
    $('#lib-fontsize').value = '21';
    $('#lib-delete').classList.add('hidden');
    this.setSourceWrite();
    this.renderQuestionsEditor();
  }

  loadEditor(item) {
    this.editingId = item.id; this.libPdfText = '';
    this.currentQuestions = this.normalizeQuestions(item.questions);
    $('#lib-editor-title').textContent = 'Edit text';
    $('#lib-name').value = item.name; $('#lib-text').value = item.text; $('#lib-pdf-status').innerHTML = '';
    $('#lib-fontsize').value = String(item.fontSize || 21);
    $('#lib-delete').classList.remove('hidden');
    this.setSourceWrite();
    this.renderQuestionsEditor();
  }

  renderLibList() {
    const el = $('#lib-list');
    if (!this.lib.items.length) { el.innerHTML = '<p class="hint">No text yet. Create one with + New.</p>'; return; }
    el.innerHTML = this.lib.items.map(it => {
      const words = it.text.trim().split(/\s+/).length;
      return `<div class="liblitem" data-id="${it.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--bg)">
        <div><div style="font-weight:600;font-size:14px">${TextUtil.escapeHtml(it.name)}</div>
        <div class="hint">${words} words · ${it.fontSize || 21}px</div></div>
        <span class="hint" style="color:var(--teal)">edit →</span></div>`;
    }).join('');
    $$('.liblitem').forEach(d => d.addEventListener('click', () => {
      const it = this.lib.find(d.dataset.id); if (it) this.loadEditor(it);
    }));
  }

  saveCurrent() {
    const src = $('#lib-toggle .seg.on').dataset.src;
    const text = src === 'pdf' ? (this.libPdfText || $('#lib-text').value) : $('#lib-text').value;
    const name = $('#lib-name').value.trim();
    if (!name) { alert('Give the text a name.'); return; }
    if (!text || !text.trim()) { alert('Enter or upload a text.'); return; }
    const questions = [];
    $$('.q-edit-box').forEach((node, i) => {
      const qText = node.querySelector('.q-text').value.trim();
      const correctRadio = node.querySelector(`input[name="q_correct_${i}"]:checked`);
      const correctTrue = correctRadio ? correctRadio.value === 'true' : false;
      if (qText) questions.push({ text: qText, correctTrue });
    });
    const item = {
      id: this.editingId || ('t' + Date.now()),
      name,
      text: text.trim(),
      fontSize: parseInt($('#lib-fontsize').value, 10),
      questions
    };
    this.lib.upsert(item); this.renderLibList();
    this.editingId = item.id; $('#lib-editor-title').textContent = 'Edit text'; $('#lib-delete').classList.remove('hidden');
    const b = $('#lib-save'); const t = b.textContent; b.textContent = '✓ Saved'; b.style.background = 'var(--green)';
    setTimeout(() => { b.textContent = t; b.style.background = ''; }, 1100);
  }

  deleteCurrent() {
    if (!this.editingId) return;
    if (!confirm('Delete this text?')) return;
    this.lib.remove(this.editingId); this.renderLibList(); this.clearEditor();
  }

  populateRun() {
    const sel = $('#run-test'); sel.innerHTML = '';
    this.lib.items.forEach(it => {
      const o = document.createElement('option'); o.value = it.id;
      o.textContent = it.name;
      sel.appendChild(o);
    });
    const empty = !this.lib.items.length;
    $('#run-empty').classList.toggle('hidden', !empty);
    $('#run-start').disabled = empty; sel.disabled = empty;
    if (!$('#run-date').value) $('#run-date').value = new Date().toISOString().split('T')[0];
  }

  async startRun() {
    const sessionName = $('#run-session').value.trim();
    const age = parseInt($('#run-age').value, 10);
    const date = $('#run-date').value;
    const item = this.lib.find($('#run-test').value);
    const timed = this.runTimer.classList.contains('on');
    const durationSec = (parseInt($('#run-min').value || 0, 10)) * 60 + (parseInt($('#run-sec').value || 0, 10));

    if (!sessionName) { alert('Enter session name / ID.'); return; }
    if (!date) { alert('Enter session date.'); return; }
    if (!age || age <= 0) { alert("Enter participant age."); return; }
    if (!item) { alert('Select a text.'); return; }
    if (timed && durationSec <= 0) { alert('Set a valid duration for timed mode.'); return; }

    this.S.config.questions = this.normalizeQuestions(item.questions);
    this.S.run = { sessionName, age, date, testName: item.name };
    this.S.config.title = sessionName; this.S.config.text = item.text;
    this.S.config.timed = timed;
    this.S.config.durationSec = durationSec;
    this.S.config.fontSize = item.fontSize || 21;
    try { await this.tracker.ensureModel(); await this.tracker.ensureCamera(); } catch (e) { return; }

    this.calibManager.startCalibration();
  }

  renderViz(mode) { this.vizMode = mode; Visualizer.renderViz(mode, this.S.lastMetrics.m); }

  renderQuestionsEditor() {
    const c = $('#lib-questions-list');
    c.innerHTML = this.currentQuestions.map((q, i) => `
      <div class="q-edit-box panel" style="padding:14px; margin-bottom:12px;">
        <input type="text" placeholder="Write the question here..." value="${TextUtil.escapeHtml(q.text || '')}" class="q-text" style="margin-bottom:12px; font-weight:600;">
        <div style="display:flex; gap:16px; align-items:center; margin-bottom:8px;">
          <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
            <input type="radio" name="q_correct_${i}" value="true" ${q.correctTrue ? 'checked' : ''} title="Correct answer is True" style="cursor:pointer; width:16px; height:16px; accent-color:var(--teal);">
            <span>True</span>
          </label>
          <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
            <input type="radio" name="q_correct_${i}" value="false" ${!q.correctTrue ? 'checked' : ''} title="Correct answer is False" style="cursor:pointer; width:16px; height:16px; accent-color:var(--teal);">
            <span>False</span>
          </label>
        </div>
        <button class="btn danger btn-del-q" data-i="${i}" style="margin-top:8px; padding:6px 12px; font-size:12px;">Delete question</button>
      </div>
    `).join('');

    $$('.btn-del-q').forEach(btn => btn.addEventListener('click', (e) => {
      this.syncQuestionsFromDOM(); 
      this.currentQuestions.splice(parseInt(e.target.dataset.i, 10), 1);
      this.renderQuestionsEditor();
    }));
  }

  startQuiz() {
    const qs = this.S.config.questions || [];
    this.show('screen-quiz');
    const c = $('#quiz-container');
    c.innerHTML = qs.map((q, i) => `
      <div class="panel" data-i="${i}">
        <p style="font-weight:600; font-size:18px; margin:0 0 14px;">${i+1}. ${TextUtil.escapeHtml(q.text)}</p>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <label style="display:flex; gap:12px; align-items:center; cursor:pointer; background:var(--bg); padding:12px 14px; border:1px solid var(--line2); border-radius:8px;">
            <input type="radio" name="quiz_q_${i}" value="true" style="accent-color:var(--teal); width:18px; height:18px;">
            <span style="font-size:16px;">True</span>
          </label>
          <label style="display:flex; gap:12px; align-items:center; cursor:pointer; background:var(--bg); padding:12px 14px; border:1px solid var(--line2); border-radius:8px;">
            <input type="radio" name="quiz_q_${i}" value="false" style="accent-color:var(--teal); width:18px; height:18px;">
            <span style="font-size:16px;">False</span>
          </label>
        </div>
      </div>
    `).join('');
  }

  submitQuiz() {
    const qs = this.S.config.questions || [];
    let correct = 0;
    qs.forEach((q, i) => {
      const sel = $(`input[name="quiz_q_${i}"]:checked`);
      if (sel && (sel.value === 'true') === !!q.correctTrue) correct++;
    });
    this.S.session.quizScore = { correct, total: qs.length };
    this.testManager.computeAndShowResults();
  }

  wire() {
    $('#lib-add-question').addEventListener('click', () => {
      this.syncQuestionsFromDOM(); 
      this.currentQuestions.push({ text: '', correctTrue: true });
      this.renderQuestionsEditor();
    });

    $('#btn-submit-quiz').addEventListener('click', () => this.submitQuiz());
    $('#btn-run').addEventListener('click', () => { this.populateRun(); this.show('screen-run'); });
    $('#btn-manage').addEventListener('click', () => { this.renderLibList(); this.clearEditor(); this.show('screen-library'); });

    $$('#lib-toggle .seg').forEach(seg => seg.addEventListener('click', () => {
      $$('#lib-toggle .seg').forEach(s => s.classList.remove('on')); seg.classList.add('on');
      $('#lib-pane-write').classList.toggle('on', seg.dataset.src === 'write');
      $('#lib-pane-pdf').classList.toggle('on', seg.dataset.src === 'pdf');
    }));
    this.runTimer.addEventListener('click', () => {
      this.runTimer.classList.toggle('on');
      const on = this.runTimer.classList.contains('on');
      $('#run-timer-fields').style.opacity = on ? '1' : '.45';
      $('#run-min').disabled = !on;
      $('#run-sec').disabled = !on;
    });
    $('#lib-pdf-drop').addEventListener('click', () => $('#lib-pdf-file').click());
    $('#lib-pdf-drop').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--teal)'; });
    $('#lib-pdf-drop').addEventListener('dragleave', e => { e.currentTarget.style.borderColor = ''; });
    $('#lib-pdf-drop').addEventListener('drop', async e => {
      e.preventDefault(); e.currentTarget.style.borderColor = '';
      if (e.dataTransfer.files[0]) { this.libPdfText = await PdfReader.read(e.dataTransfer.files[0], $('#lib-pdf-status')) || ''; }
    });
    $('#lib-pdf-file').addEventListener('change', async e => { if (e.target.files[0]) { this.libPdfText = await PdfReader.read(e.target.files[0], $('#lib-pdf-status')) || ''; } });
    $('#lib-new').addEventListener('click', () => this.clearEditor());
    $('#lib-save').addEventListener('click', () => this.saveCurrent());
    $('#lib-delete').addEventListener('click', () => this.deleteCurrent());

    $('#run-start').addEventListener('click', () => this.startRun());

    $('#lib-home').addEventListener('click', () => this.show('screen-intro'));
    $('#lib-to-run').addEventListener('click', () => { this.populateRun(); this.show('screen-run'); });
    $('#run-home').addEventListener('click', () => this.show('screen-intro'));
    $('#run-lib').addEventListener('click', () => { this.renderLibList(); this.clearEditor(); this.show('screen-library'); });

    $('#btn-end').addEventListener('click', () => this.testManager.endTest());

    $$('.viz-tabs .seg').forEach(seg => seg.addEventListener('click', () => {
      $$('.viz-tabs .seg').forEach(s => s.classList.remove('on')); seg.classList.add('on');
      this.renderViz(seg.dataset.viz);
    }));

    $('#btn-export').addEventListener('click', () => {
      const m = this.S.lastMetrics ? this.S.lastMetrics.m : StressAnalyzer.analyze(this.S.session, this.S.calib);
      Exporter.csv(this.S.session, this.S.run, this.S.config, m);
    });

    $('#btn-export-json').addEventListener('click', () => {
      if (!this.S.lastMetrics) return;
      Exporter.json(this.S.session, this.S.run, this.S.config, this.S.calib, this.S.lastMetrics.m, this.S.lastMetrics.st);
    });

    $('#btn-new').addEventListener('click', () => {
      this.S.session = { samples: [], blinks: [], faceTimes: [], startT: 0, endT: 0, tracking: null };
      $('#run-session').value = ''; $('#run-age').value = '';
      this.populateRun(); this.show('screen-run');
    });

    document.addEventListener('mousemove', e => {
      if (!$('#screen-calib').classList.contains('active')) return;
      const W = innerWidth, H = innerHeight, c = { tl: [0, 0], tr: [W, 0], bl: [0, H], br: [W, H] };
      let best = 'br', bd = -1;
      for (const k in c) { const d = Math.hypot(e.clientX - c[k][0], e.clientY - c[k][1]); if (d > bd) { bd = d; best = k; } }
      if (best !== this._miniCorner) { this._miniCorner = best; this.calibManager.placeMini(best); }
    });

    window.addEventListener('resize', () => { if ($('#screen-results').classList.contains('active')) this.renderViz(this.vizMode); });
  }

  async init() {
    await this.lib.load();
    this.renderLibList();
    this.populateRun();
    this.wire();
  }
}