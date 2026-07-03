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
    this.S = {
      config: { title: "Sessione OcuRead", text: "", timed: true, durationSec: 120, fontSize: 21 },
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
    this.libTimer = $('#lib-timer-switch');

    this.calibManager = new CalibrationManager(this);
    this.testManager = new TestSessionManager(this);
  }

  show(id) { $$('.screen').forEach(s => s.classList.remove('active')); $('#' + id).classList.add('active'); }
  loader(on, msg) { const l = $('#loader'); if (msg) $('#loader-msg').textContent = msg; l.classList.toggle('hidden', !on); }

  setSourceWrite() {
    $$('#lib-toggle .seg').forEach(s => s.classList.toggle('on', s.dataset.src === 'write'));
    $('#lib-pane-write').classList.add('on'); $('#lib-pane-pdf').classList.remove('on');
  }
  
  clearEditor() {
    this.editingId = null; this.libPdfText = '';
    $('#lib-editor-title').textContent = 'Nuovo testo';
    $('#lib-name').value = ''; $('#lib-text').value = ''; $('#lib-pdf-status').innerHTML = '';
    $('#lib-min').value = 2; $('#lib-sec').value = 0; $('#lib-fontsize').value = '21';
    if (!this.libTimer.classList.contains('on')) this.libTimer.click();
    $('#lib-delete').classList.add('hidden');
    this.setSourceWrite();
  }
  
  loadEditor(item) {
    this.editingId = item.id; this.libPdfText = '';
    $('#lib-editor-title').textContent = 'Modifica testo';
    $('#lib-name').value = item.name; $('#lib-text').value = item.text; $('#lib-pdf-status').innerHTML = '';
    $('#lib-min').value = Math.floor(item.durationSec / 60); $('#lib-sec').value = item.durationSec % 60;
    $('#lib-fontsize').value = String(item.fontSize);
    if (item.timed !== this.libTimer.classList.contains('on')) this.libTimer.click();
    $('#lib-delete').classList.remove('hidden');
    this.setSourceWrite();
  }
  
  renderLibList() {
    const el = $('#lib-list');
    if (!this.lib.items.length) { el.innerHTML = '<p class="hint">Nessun testo. Creane uno con ＋ Nuovo.</p>'; return; }
    el.innerHTML = this.lib.items.map(it => {
      const words = it.text.trim().split(/\s+/).length;
      const t = it.timed ? `${Math.floor(it.durationSec / 60)}:${String(it.durationSec % 60).padStart(2, '0')}` : 'libero';
      return `<div class="liblitem" data-id="${it.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--bg)">
        <div><div style="font-weight:600;font-size:14px">${TextUtil.escapeHtml(it.name)}</div>
        <div class="hint">${words} parole · timer ${t} · ${it.fontSize}px</div></div>
        <span class="hint" style="color:var(--teal)">modifica →</span></div>`;
    }).join('');
    $$('.liblitem').forEach(d => d.addEventListener('click', () => {
      const it = this.lib.find(d.dataset.id); if (it) this.loadEditor(it);
    }));
  }
  
  saveCurrent() {
    const src = $('#lib-toggle .seg.on').dataset.src;
    const text = src === 'pdf' ? (this.libPdfText || $('#lib-text').value) : $('#lib-text').value;
    const name = $('#lib-name').value.trim();
    if (!name) { alert('Dai un nome al testo.'); return; }
    if (!text || !text.trim()) { alert('Inserisci o carica un testo.'); return; }
    const timed = this.libTimer.classList.contains('on');
    const durationSec = (parseInt($('#lib-min').value || 0, 10)) * 60 + (parseInt($('#lib-sec').value || 0, 10));
    if (timed && durationSec <= 0) { alert('Imposta una durata valida o disattiva il timer.'); return; }
    const item = { id: this.editingId || ('t' + Date.now()), name, text: text.trim(), timed, durationSec, fontSize: parseInt($('#lib-fontsize').value, 10) };
    this.lib.upsert(item); this.renderLibList();
    this.editingId = item.id; $('#lib-editor-title').textContent = 'Modifica testo'; $('#lib-delete').classList.remove('hidden');
    const b = $('#lib-save'); const t = b.textContent; b.textContent = '✓ Salvato'; b.style.background = 'var(--green)';
    setTimeout(() => { b.textContent = t; b.style.background = ''; }, 1100);
  }
  
  deleteCurrent() {
    if (!this.editingId) return;
    if (!confirm('Eliminare questo testo?')) return;
    this.lib.remove(this.editingId); this.renderLibList(); this.clearEditor();
  }

  populateRun() {
    const sel = $('#run-test'); sel.innerHTML = '';
    this.lib.items.forEach(it => {
      const o = document.createElement('option'); o.value = it.id;
      o.textContent = it.name + (it.timed ? ` · ${Math.floor(it.durationSec / 60)}:${String(it.durationSec % 60).padStart(2, '0')}` : ' · libero');
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
    
    if (!sessionName) { alert('Inserisci il nome / ID della sessione.'); return; }
    if (!date) { alert('Inserisci la data della sessione.'); return; } // NUOVO: Valida la data
    if (!age || age <= 0) { alert("Inserisci l'età del partecipante."); return; }
    if (!item) { alert('Seleziona un testo.'); return; }
    
    this.S.run = { sessionName, age, date, testName: item.name }; 
    this.S.config.title = sessionName; this.S.config.text = item.text;
    this.S.config.timed = item.timed; this.S.config.durationSec = item.durationSec; this.S.config.fontSize = item.fontSize;
    try { await this.tracker.ensureModel(); await this.tracker.ensureCamera(); } catch (e) { return; }
    
    this.calibManager.startCalibration();
  }

  renderViz(mode) { this.vizMode = mode; Visualizer.renderViz(mode, this.S.lastMetrics.m); }

  wire() {
    $('#btn-run').addEventListener('click', () => { this.populateRun(); this.show('screen-run'); });
    $('#btn-manage').addEventListener('click', () => { this.renderLibList(); this.clearEditor(); this.show('screen-library'); });

    $$('#lib-toggle .seg').forEach(seg => seg.addEventListener('click', () => {
      $$('#lib-toggle .seg').forEach(s => s.classList.remove('on')); seg.classList.add('on');
      $('#lib-pane-write').classList.toggle('on', seg.dataset.src === 'write');
      $('#lib-pane-pdf').classList.toggle('on', seg.dataset.src === 'pdf');
    }));
    this.libTimer.addEventListener('click', () => {
      this.libTimer.classList.toggle('on');
      const on = this.libTimer.classList.contains('on');
      $('#lib-timer-fields').style.opacity = on ? '1' : '.45';
      $('#lib-min').disabled = !on; $('#lib-sec').disabled = !on;
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

    // Delega il termine test al manager dedicato
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