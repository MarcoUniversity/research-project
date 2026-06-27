import { $, $$ } from './utils/dom.js';
import { TextUtil } from './utils/text-util.js';
import { Stats } from './utils/stats.js';
import { OneEuro } from './utils/filters.js';

import { FaceTracker } from './core/face-tracker.js';
import { GazeModel } from './core/gaze-model.js';
import { StressAnalyzer } from './core/stress-analyzer.js';

import { Library } from './services/library.js';
import { PdfReader } from './services/pdf-reader.js';
import { Exporter } from './services/exporter.js';

import { Visualizer } from './ui/visualizer.js';

const REQUIRED=5;
const LS_KEY='ocuread_library_v1';

export class OcuReadApp {
  constructor(){
    this.tracker = new FaceTracker((on,msg)=>this.loader(on,msg));
    this.lib = new Library(LS_KEY);
    this.S = {
      config:{ title:"Sessione OcuRead", text:"", timed:true, durationSec:120, fontSize:21 },
      calib:{ samples:[], wX:null, wY:null, quality:null, qualityP90:null },
      session:{ samples:[], blinks:[], faceTimes:[], startT:0, endT:0, tracking:null },
      run:{},
      running:false,
      lastMetrics:null,
      _calibHistory:[], _calibLastCapture:0, _calibTotal:0
    };
    this.editingId=null;
    this.libPdfText='';
    this.calibLoop=null;
    this.testLoop=null;
    this.timerInt=null;
    this.vizMode='heat';
    this._miniCorner='br';

    this.calibVideo=$('#calib-video');
    this.testVideo=$('#test-video');
    this.calibMini=document.querySelector('.calib-mini');
    this.libTimer=$('#lib-timer-switch');
  }

  show(id){ $$('.screen').forEach(s=>s.classList.remove('active')); $('#'+id).classList.add('active'); }
  loader(on,msg){ const l=$('#loader'); if(msg)$('#loader-msg').textContent=msg; l.classList.toggle('hidden',!on); }

  setSourceWrite(){
    $$('#lib-toggle .seg').forEach(s=>s.classList.toggle('on',s.dataset.src==='write'));
    $('#lib-pane-write').classList.add('on'); $('#lib-pane-pdf').classList.remove('on');
  }
  clearEditor(){
    this.editingId=null; this.libPdfText='';
    $('#lib-editor-title').textContent='Nuovo testo';
    $('#lib-name').value=''; $('#lib-text').value=''; $('#lib-pdf-status').innerHTML='';
    $('#lib-min').value=2; $('#lib-sec').value=0; $('#lib-fontsize').value='21';
    if(!this.libTimer.classList.contains('on')) this.libTimer.click();
    $('#lib-delete').classList.add('hidden');
    this.setSourceWrite();
  }
  loadEditor(item){
    this.editingId=item.id; this.libPdfText='';
    $('#lib-editor-title').textContent='Modifica testo';
    $('#lib-name').value=item.name; $('#lib-text').value=item.text; $('#lib-pdf-status').innerHTML='';
    $('#lib-min').value=Math.floor(item.durationSec/60); $('#lib-sec').value=item.durationSec%60;
    $('#lib-fontsize').value=String(item.fontSize);
    if(item.timed!==this.libTimer.classList.contains('on')) this.libTimer.click();
    $('#lib-delete').classList.remove('hidden');
    this.setSourceWrite();
  }
  renderLibList(){
    const el=$('#lib-list');
    if(!this.lib.items.length){ el.innerHTML='<p class="hint">Nessun testo. Creane uno con ＋ Nuovo.</p>'; return; }
    el.innerHTML=this.lib.items.map(it=>{
      const words=it.text.trim().split(/\s+/).length;
      const t=it.timed? `${Math.floor(it.durationSec/60)}:${String(it.durationSec%60).padStart(2,'0')}` : 'libero';
      return `<div class="liblitem" data-id="${it.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--bg)">
        <div><div style="font-weight:600;font-size:14px">${TextUtil.escapeHtml(it.name)}</div>
        <div class="hint">${words} parole · timer ${t} · ${it.fontSize}px</div></div>
        <span class="hint" style="color:var(--teal)">modifica →</span></div>`;
    }).join('');
    $$('.liblitem').forEach(d=>d.addEventListener('click',()=>{
      const it=this.lib.find(d.dataset.id); if(it) this.loadEditor(it);
    }));
  }
  saveCurrent(){
    const src=$('#lib-toggle .seg.on').dataset.src;
    const text = src==='pdf' ? (this.libPdfText||$('#lib-text').value) : $('#lib-text').value;
    const name=$('#lib-name').value.trim();
    if(!name){ alert('Dai un nome al testo.'); return; }
    if(!text||!text.trim()){ alert('Inserisci o carica un testo.'); return; }
    const timed=this.libTimer.classList.contains('on');
    const durationSec=(parseInt($('#lib-min').value||0,10))*60+(parseInt($('#lib-sec').value||0,10));
    if(timed && durationSec<=0){ alert('Imposta una durata valida o disattiva il timer.'); return; }
    const item={ id:this.editingId||('t'+Date.now()), name, text:text.trim(), timed, durationSec, fontSize:parseInt($('#lib-fontsize').value,10) };
    this.lib.upsert(item); this.renderLibList();
    this.editingId=item.id; $('#lib-editor-title').textContent='Modifica testo'; $('#lib-delete').classList.remove('hidden');
    const b=$('#lib-save'); const t=b.textContent; b.textContent='✓ Salvato'; b.style.background='var(--green)';
    setTimeout(()=>{ b.textContent=t; b.style.background=''; },1100);
  }
  deleteCurrent(){
    if(!this.editingId) return;
    if(!confirm('Eliminare questo testo?')) return;
    this.lib.remove(this.editingId); this.renderLibList(); this.clearEditor();
  }

  populateRun(){
    const sel=$('#run-test'); sel.innerHTML='';
    this.lib.items.forEach(it=>{ const o=document.createElement('option'); o.value=it.id;
      o.textContent=it.name+(it.timed?` · ${Math.floor(it.durationSec/60)}:${String(it.durationSec%60).padStart(2,'0')}`:' · libero');
      sel.appendChild(o); });
    const empty=!this.lib.items.length;
    $('#run-empty').classList.toggle('hidden',!empty);
    $('#run-start').disabled=empty; sel.disabled=empty;
  }
  async startRun(){
    const sessionName=$('#run-session').value.trim();
    const age=parseInt($('#run-age').value,10);
    const item=this.lib.find($('#run-test').value);
    if(!sessionName){ alert('Inserisci il nome / ID della sessione.'); return; }
    if(!age||age<=0){ alert("Inserisci l'età del partecipante."); return; }
    if(!item){ alert('Seleziona un testo.'); return; }
    this.S.run={ sessionName, age, testName:item.name };
    this.S.config.title=sessionName; this.S.config.text=item.text;
    this.S.config.timed=item.timed; this.S.config.durationSec=item.durationSec; this.S.config.fontSize=item.fontSize;
    try{ await this.tracker.ensureModel(); await this.tracker.ensureCamera(); }catch(e){ return; }
    this.startCalibration();
  }

  placeMini(c){
    const m=this.calibMini; m.style.left=m.style.right=m.style.top=m.style.bottom='auto';
    if(c==='tl'){m.style.left='18px';m.style.top='18px';}
    else if(c==='tr'){m.style.right='18px';m.style.top='18px';}
    else if(c==='bl'){m.style.left='18px';m.style.bottom='18px';}
    else{m.style.right='18px';m.style.bottom='18px';}
  }
  async startCalibration(){
    this.show('screen-calib');
    await this.tracker.attachVideo(this.calibVideo);
    this.S.calib.samples=[]; this.S.calib.wX=null; this.S.calib.wY=null;
    this.S.calib.quality=null; this.S.calib.qualityP90=null;
    this.S._calibHistory=[]; this.S._calibLastCapture=0;
    this.buildCalibDots();
    $('#calib-center').style.display='flex';
    $('#calib-center-msg').textContent='Clicca i punti uno ad uno, fissandoli mentre clicchi';
    $('#calib-gaze').classList.add('hidden');
    let latestFeat=null, latestOK=false;
    let lastVideoTime=-1;
    if(this.calibLoop) cancelAnimationFrame(this.calibLoop);
    const tick=()=>{
      const v=this.calibVideo;
      if(v.readyState>=2 && v.currentTime!==lastVideoTime){
        lastVideoTime=v.currentTime;
        const now=performance.now();
        const res=this.tracker.detect(v,now);
        if(res.faceLandmarks && res.faceLandmarks.length){
          const feat=FaceTracker.extractFeatures(res.faceLandmarks[0]);
          const bs=FaceTracker.blinkScore(res.faceBlendshapes&&res.faceBlendshapes[0]);
          latestFeat=feat; latestOK=FaceTracker.featureIsValid(feat) && bs.combined<0.45;
          if(latestOK){
            this.S._calibHistory.push({t:now,feat});
            this.S._calibHistory=this.S._calibHistory.filter(x=>now-x.t<=350);
            $('#calib-track').textContent='sguardo stabile';
            $('#calib-track').style.color='var(--green)';
          }else{
            $('#calib-track').textContent='occhi non validi';
            $('#calib-track').style.color='var(--amber)';
          }
        }else{
          latestOK=false; $('#calib-track').textContent='viso NON rilevato';
          $('#calib-track').style.color='var(--coral)';
        }
      }
      if(this.S.calib.wX && latestOK && latestFeat){
        const gx=GazeModel.predictAxis(this.S.calib.wX,latestFeat)*innerWidth;
        const gy=GazeModel.predictAxis(this.S.calib.wY,latestFeat)*innerHeight;
        const c=$('#calib-gaze'); c.classList.remove('hidden');
        c.style.left=gx+'px'; c.style.top=gy+'px';
      }
      this.calibLoop=requestAnimationFrame(tick);
    };
    tick();
  }
  buildCalibDots(){
    const stage=$('#calib-stage'); stage.innerHTML='';
    const W=window.innerWidth, H=window.innerHeight;
    const mx=0.08, my=0.12;
    const xs=[mx,0.5,1-mx].map(f=>f*W);
    const ys=[my,0.5,1-my].map(f=>f*H);
    let totalNeeded=0;
    for(const y of ys) for(const x of xs){
      const dot=document.createElement('div');
      dot.className='calib-dot';
      dot.style.left=x+'px'; dot.style.top=y+'px';
      dot.dataset.count='0'; dot.dataset.x=x; dot.dataset.y=y;
      dot.innerHTML='<div class="ring"></div><div class="core"></div><div class="cnt">5</div>';
      dot.addEventListener('click',()=>this.onCalibClick(dot));
      stage.appendChild(dot);
      totalNeeded+=REQUIRED;
    }
    this.S._calibTotal=totalNeeded;
    this.updateCalibProg();
  }
  onCalibClick(dot){
    const feat=this.stableCalibrationFeature();
    if(!feat){ this.flash($('#calib-track')); return; }
    const x=parseFloat(dot.dataset.x)/innerWidth, y=parseFloat(dot.dataset.y)/innerHeight;
    this.S.calib.samples.push({feat,x,y});
    let c=parseInt(dot.dataset.count,10)+1; dot.dataset.count=c;
    dot.querySelector('.cnt').textContent=Math.max(0,REQUIRED-c);
    if(c>=REQUIRED) dot.classList.add('done');
    this.updateCalibProg();
    $('#calib-center').style.display='none';
    if(this.S.calib.samples.length>=18) this.retrain();
    if(this.S.calib.samples.length>=this.S._calibTotal) this.finishCalibration();
  }
  stableCalibrationFeature(){
    const now=performance.now();
    const h=(this.S._calibHistory||[]).filter(v=>now-v.t<=260);
    if(h.length<4 || now-this.S._calibLastCapture<100) return null;
    const feat=h[0].feat.map((_,i)=>Stats.median(h.map(v=>v.feat[i])));
    const gx=h.map(v=>(v.feat[0]+v.feat[2])/2);
    const gy=h.map(v=>(v.feat[1]+v.feat[3])/2);
    const hx=h.map(v=>v.feat[4]), hy=h.map(v=>v.feat[5]);
    if(Math.hypot(Stats.stdev(gx),Stats.stdev(gy))>0.028 || Math.hypot(Stats.stdev(hx),Stats.stdev(hy))>0.009) return null;
    this.S._calibLastCapture=now;
    return feat;
  }
  flash(el){ el.animate([{opacity:1},{opacity:.2},{opacity:1}],{duration:300}); }
  updateCalibProg(){ $('#calib-prog').textContent=`${this.S.calib.samples.length} / ${this.S._calibTotal} campioni`; }
  retrain(){
    const fit=GazeModel.fit(this.S.calib.samples);
    this.S.calib.wX=fit.wX; this.S.calib.wY=fit.wY;
  }
  calibrationValidationErrors(){
    const groups=new Map();
    for(const s of this.S.calib.samples){
      const key=s.x.toFixed(4)+':'+s.y.toFixed(4);
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(s);
    }
    const errors=[];
    for(let fold=0;fold<REQUIRED;fold++){
      const train=[], test=[];
      for(const group of groups.values())
        group.forEach((s,i)=>(i===fold?test:train).push(s));
      const fit=GazeModel.fit(train);
      for(const s of test){
        errors.push(Math.hypot(
          (GazeModel.predictAxis(fit.wX,s.feat)-s.x)*innerWidth,
          (GazeModel.predictAxis(fit.wY,s.feat)-s.y)*innerHeight
        ));
      }
    }
    return errors;
  }
  finishCalibration(){
    this.retrain();
    const validationErrors=this.calibrationValidationErrors();
    const err=Math.sqrt(Stats.mean(validationErrors.map(e=>e*e)));
    const p90=Stats.quantile(validationErrors,0.9);
    this.S.calib.quality=err;
    this.S.calib.qualityP90=p90;
    $('#calib-center').style.display='flex';
    const diag=Math.hypot(innerWidth,innerHeight);
    let band = err<diag*0.04?['ECCELLENTE','var(--green)'] : err<diag*0.07?['BUONA','var(--teal)'] :
               err<diag*0.11?['SUFFICIENTE','var(--amber)'] : ['SCARSA','var(--coral)'];
    $('#calib-center-msg').innerHTML=
      `<div style="font-size:22px;color:${band[1]};margin-bottom:8px">Calibrazione ${band[0]}</div>`+
      `<div>errore validato ≈ ${err.toFixed(0)} px · P90 ${p90.toFixed(0)} px</div>`+
      (err>=diag*0.11?`<div style="color:var(--coral);margin-top:8px">Consigliato ricalibrare: migliora luce e tieni la testa più ferma.</div>`:``)+
      `<div style="margin-top:22px;pointer-events:auto;display:flex;gap:12px;justify-content:center">`+
        `<button class="btn ghost" id="recalib">Ricalibra</button>`+
        `<button class="btn primary" id="startTest">Inizia il test →</button>`+
      `</div>`;
    $('#recalib').addEventListener('click',()=>this.startCalibration());
    $('#startTest').addEventListener('click',()=>this.startTest());
  }

  updateTimerDisplay(sec){
    const m=Math.floor(sec/60), s=sec%60;
    $('#timer-val').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }
  async startTest(){
    if(this.calibLoop){ cancelAnimationFrame(this.calibLoop); this.calibLoop=null; }
    $('#read-title').textContent=this.S.config.title;
    const rc=$('#read-content'); rc.style.fontSize=this.S.config.fontSize+'px';
    rc.innerHTML=TextUtil.toParagraphs(this.S.config.text);
    this.show('screen-test');
    await this.tracker.attachVideo(this.testVideo);

    this.S.session={
      samples:[], blinks:[], faceTimes:[], startT:performance.now(), endT:0,
      tracking:{frames:0,faceFrames:0,validFrames:0,rejectedFrames:0}
    };
    this.S.running=true;
    const fx=new OneEuro(1.35,0.12), fy=new OneEuro(1.35,0.12);
    const blink={closed:false,start:0,lastEvent:-Infinity,lastFace:0};
    let lastVideoTime=-1, lastValidT=0;

    if(this.S.config.timed){
      $('#read-timer').style.display='flex';
      this.updateTimerDisplay(this.S.config.durationSec);
      let remaining=this.S.config.durationSec;
      this.timerInt=setInterval(()=>{
        remaining--; this.updateTimerDisplay(Math.max(0,remaining));
        if(remaining<=10) $('#read-timer').classList.add('warn');
        if(remaining<=0){ clearInterval(this.timerInt); this.endTest(); }
      },1000);
    }else{
      $('#read-timer').style.display='none';
    }

    const tick=()=>{
      if(!this.S.running) return;
      const v=this.testVideo, sess=this.S.session;
      if(v.readyState>=2 && v.currentTime!==lastVideoTime){
        lastVideoTime=v.currentTime;
        const now=performance.now();
        sess.tracking.frames++;
        const res=this.tracker.detect(v,now);
        if(res.faceLandmarks && res.faceLandmarks.length){
          sess.tracking.faceFrames++;
          sess.faceTimes.push(now);
          blink.lastFace=now;
          const lm=res.faceLandmarks[0];
          const feat=FaceTracker.extractFeatures(lm);
          const blend=res.faceBlendshapes && res.faceBlendshapes[0];
          const bs=FaceTracker.blinkScore(blend);
          StressAnalyzer.updateBlinkState(blink,bs.combined,now,sess.blinks);
          if(FaceTracker.featureIsValid(feat) && !blink.closed){
            const rawNX=GazeModel.predictAxis(this.S.calib.wX,feat), rawNY=GazeModel.predictAxis(this.S.calib.wY,feat);
            if(Number.isFinite(rawNX) && Number.isFinite(rawNY) &&
               rawNX>-0.2 && rawNX<1.2 && rawNY>-0.2 && rawNY<1.2){
              if(lastValidT && now-lastValidT>180){ fx.reset(); fy.reset(); }
              const nx=Stats.clamp(fx.filter(rawNX,now/1000),0,1);
              const ny=Stats.clamp(fy.filter(rawNY,now/1000),0,1);
              const gx=nx*innerWidth, gy=ny*innerHeight;
              const rect=rc.getBoundingClientRect();
              const contentX=(gx-rect.left)/(rect.width||1);
              const contentY=(gy-rect.top)/(rect.height||1);
              sess.samples.push({
                t:now,x:gx,y:gy,nx,ny,rawX:rawNX*innerWidth,rawY:rawNY*innerHeight,
                contentX,contentY,inReading:contentX>=0&&contentX<=1&&contentY>=0&&contentY<=1
              });
              sess.tracking.validFrames++;
              lastValidT=now;
            }else sess.tracking.rejectedFrames++;
          }else if(!blink.closed) sess.tracking.rejectedFrames++;
        }else{
          if(blink.closed && now-blink.lastFace>160) blink.closed=false;
        }
      }
      this.testLoop=requestAnimationFrame(tick);
    };
    tick();
  }
  endTest(){
    if(!this.S.running) return;
    this.S.running=false;
    this.S.session.endT=performance.now();
    if(this.testLoop){ cancelAnimationFrame(this.testLoop); this.testLoop=null; }
    if(this.timerInt){ clearInterval(this.timerInt); this.timerInt=null; }
    $('#read-timer').classList.remove('warn');
    this.computeAndShowResults();
  }

  renderViz(mode){ this.vizMode=mode; Visualizer.renderViz(mode, this.S.lastMetrics.m); }
  computeAndShowResults(){
    const m=StressAnalyzer.analyze(this.S.session, this.S.calib);
    const st=StressAnalyzer.stressIndex(m);
    this.S.lastMetrics={m,st};

    $('#res-title').textContent=this.S.config.title;
    $('#res-eyebrow').textContent = (this.S.run.testName?`${this.S.run.testName} · `:'') + (this.S.run.age?`${this.S.run.age} anni · `:'') + 'Composite Stress Index';
    const c=Math.round(st.composite);
    $('#gauge-num').textContent=m.reliable?c:'—';
    const col = !m.reliable?'var(--amber)':c<33?'var(--green)': c<66?'var(--amber)':'var(--coral)';
    $('#gauge-num').style.color=col;
    Visualizer.drawGauge(m.reliable?st.composite:0,col);
    const band = !m.reliable?'Dati insufficienti per un indice affidabile':
      c<33?'Stress basso · stato rilassato' : c<66?'Stress moderato · carico presente' : 'Stress elevato · forte carico';
    $('#gauge-band').textContent=band; $('#gauge-band').style.color=col;

    const P=[
      {n:'Blink rate (U-curve)', v:m.blinkRate.toFixed(1), u:'battiti/min', s:st.pBlink},
      {n:'Gaze variability', v:m.sd.toFixed(0), u:'px (dispersione)', s:st.pDisp},
      {n:'Scan velocity', v:m.meanSacc.toFixed(0), u:'px (saccade media)', s:st.pScan},
      {n:'Downward gaze', v:(m.downFrac*100).toFixed(0)+'%', u:'tempo in basso', s:st.pDown},
    ];
    $('#pillars').innerHTML=P.map(p=>{
      const col=p.s<33?'var(--green)':p.s<66?'var(--amber)':'var(--coral)';
      return `<div class="pillar"><div class="pn">${p.n}</div>
        <div class="pv" style="color:${col}">${p.v}</div>
        <div class="pu">${p.u}</div>
        <div class="bar"><i style="width:${p.s.toFixed(0)}%;background:${col}"></i></div>
        <div class="pu" style="text-align:right">indice ${p.s.toFixed(0)}/100</div></div>`;
    }).join('');

    const rows=[
      ['Sessione', this.S.run.sessionName||this.S.config.title],
      ['Età partecipante', (this.S.run.age||'—')+' anni'],
      ['Testo somministrato', this.S.run.testName||'—'],
      ['Durata sessione', m.durSec.toFixed(1)+' s'],
      ['Campioni gaze validi', this.S.session.samples.length],
      ['Frequenza campionamento valida', m.sampleRate.toFixed(1)+' Hz'],
      ['Copertura tracking valida', (m.validFrac*100).toFixed(0)+'%'],
      ['Viso rilevato', (m.faceFrac*100).toFixed(0)+'%'],
      ['Affidabilità analisi', (m.reliability*100).toFixed(0)+'%'],
      ['Fissazioni rilevate', m.fixations.length],
      ['Saccadi rilevate', m.saccades.length],
      ['Blink totali', this.S.session.blinks.length],
      ['Frequenza blink', m.blinkRate.toFixed(1)+' /min'],
      ['Durata fissazione media', (m.fixations.length? Stats.mean(m.fixations.map(f=>f.dur)):0).toFixed(0)+' ms'],
      ['Qualità calibrazione', (this.S.calib.quality||0).toFixed(0)+' px RMSE · P90 '+(this.S.calib.qualityP90||0).toFixed(0)+' px'],
    ];
    $('#stat-table').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');

    $('#viz-reading').style.fontSize='13px';
    $('#viz-reading').innerHTML=TextUtil.toParagraphs(this.S.config.text);
    this.show('screen-results');
    requestAnimationFrame(()=>this.renderViz('heat'));
  }

  wire(){
    $('#btn-run').addEventListener('click',()=>{ this.populateRun(); this.show('screen-run'); });
    $('#btn-manage').addEventListener('click',()=>{ this.renderLibList(); this.clearEditor(); this.show('screen-library'); });

    $$('#lib-toggle .seg').forEach(seg=>seg.addEventListener('click',()=>{
      $$('#lib-toggle .seg').forEach(s=>s.classList.remove('on')); seg.classList.add('on');
      $('#lib-pane-write').classList.toggle('on',seg.dataset.src==='write');
      $('#lib-pane-pdf').classList.toggle('on',seg.dataset.src==='pdf');
    }));
    this.libTimer.addEventListener('click',()=>{
      this.libTimer.classList.toggle('on');
      const on=this.libTimer.classList.contains('on');
      $('#lib-timer-fields').style.opacity=on?'1':'.45';
      $('#lib-min').disabled=!on; $('#lib-sec').disabled=!on;
    });
    $('#lib-pdf-drop').addEventListener('click',()=>$('#lib-pdf-file').click());
    $('#lib-pdf-drop').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.style.borderColor='var(--teal)';});
    $('#lib-pdf-drop').addEventListener('dragleave',e=>{e.currentTarget.style.borderColor='';});
    $('#lib-pdf-drop').addEventListener('drop',async e=>{e.preventDefault();e.currentTarget.style.borderColor='';
      if(e.dataTransfer.files[0]){ this.libPdfText=await PdfReader.read(e.dataTransfer.files[0],$('#lib-pdf-status'))||''; }});
    $('#lib-pdf-file').addEventListener('change',async e=>{ if(e.target.files[0]){ this.libPdfText=await PdfReader.read(e.target.files[0],$('#lib-pdf-status'))||''; }});
    $('#lib-new').addEventListener('click',()=>this.clearEditor());
    $('#lib-save').addEventListener('click',()=>this.saveCurrent());
    $('#lib-delete').addEventListener('click',()=>this.deleteCurrent());

    $('#run-start').addEventListener('click',()=>this.startRun());

    $('#lib-home').addEventListener('click',()=>this.show('screen-intro'));
    $('#lib-to-run').addEventListener('click',()=>{ this.populateRun(); this.show('screen-run'); });
    $('#run-home').addEventListener('click',()=>this.show('screen-intro'));
    $('#run-lib').addEventListener('click',()=>{ this.renderLibList(); this.clearEditor(); this.show('screen-library'); });

    $('#btn-end').addEventListener('click',()=>this.endTest());

    $$('.viz-tabs .seg').forEach(seg=>seg.addEventListener('click',()=>{
      $$('.viz-tabs .seg').forEach(s=>s.classList.remove('on')); seg.classList.add('on');
      this.renderViz(seg.dataset.viz);
    }));
    $('#btn-export').addEventListener('click',()=>{
      const m=this.S.lastMetrics?this.S.lastMetrics.m:StressAnalyzer.analyze(this.S.session,this.S.calib);
      Exporter.csv(this.S.session, this.S.run, this.S.config, m);
    });
    $('#btn-export-json').addEventListener('click',()=>{
      if(!this.S.lastMetrics) return;
      Exporter.json(this.S.session, this.S.run, this.S.config, this.S.calib, this.S.lastMetrics.m, this.S.lastMetrics.st);
    });
    $('#btn-new').addEventListener('click',()=>{
      this.S.session={samples:[],blinks:[],faceTimes:[],startT:0,endT:0,tracking:null};
      $('#run-session').value=''; $('#run-age').value='';
      this.populateRun(); this.show('screen-run');
    });

    document.addEventListener('mousemove',e=>{
      if(!$('#screen-calib').classList.contains('active')) return;
      const W=innerWidth,H=innerHeight, c={tl:[0,0],tr:[W,0],bl:[0,H],br:[W,H]};
      let best='br',bd=-1;
      for(const k in c){ const d=Math.hypot(e.clientX-c[k][0],e.clientY-c[k][1]); if(d>bd){bd=d;best=k;} }
      if(best!==this._miniCorner){ this._miniCorner=best; this.placeMini(best); }
    });

    window.addEventListener('resize',()=>{ if($('#screen-results').classList.contains('active')) this.renderViz(this.vizMode); });
  }

  init(){
    this.lib.load();
    this.renderLibList();
    this.wire();
  }
}