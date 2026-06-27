import { Stats } from '../utils/stats.js';

export class StressAnalyzer {
  static analyze(session, calib){
    const sm=session.samples.filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y));
    const durSec=Math.max(1,(session.endT-session.startT)/1000);
    const W=window.innerWidth, H=window.innerHeight, diag=Math.hypot(W,H);

    const fixations=[], saccades=[];
    let fixRun=null, saccRun=null;
    const VEL_THRESH=0.65*diag;
    for(let i=1;i<sm.length;i++){
      const prev=sm[i-1], cur=sm[i];
      const dt=(cur.t-prev.t)/1000;
      if(dt<=0 || dt>0.14){
        if(fixRun){ StressAnalyzer.closeFix(fixRun,fixations); fixRun=null; }
        if(saccRun){ StressAnalyzer.closeSaccade(saccRun,saccades,diag); saccRun=null; }
        continue;
      }
      const d=Math.hypot(cur.x-prev.x,cur.y-prev.y);
      const v=d/dt;
      if(v<VEL_THRESH){
        if(saccRun){ StressAnalyzer.closeSaccade(saccRun,saccades,diag); saccRun=null; }
        if(!fixRun) fixRun={points:[prev,cur],t0:prev.t,t1:cur.t};
        else{ fixRun.points.push(cur); fixRun.t1=cur.t; }
      }else{
        if(fixRun){ StressAnalyzer.closeFix(fixRun,fixations); fixRun=null; }
        if(!saccRun) saccRun={start:prev,end:cur,t0:prev.t,t1:cur.t,peak:v};
        else{ saccRun.end=cur; saccRun.t1=cur.t; saccRun.peak=Math.max(saccRun.peak,v); }
      }
    }
    if(fixRun) StressAnalyzer.closeFix(fixRun,fixations);
    if(saccRun) StressAnalyzer.closeSaccade(saccRun,saccades,diag);
    const saccAmps=saccades.map(s=>s.amp);

    const sd=Math.hypot(Stats.robustStdev(sm.map(s=>s.x)),Stats.robustStdev(sm.map(s=>s.y)));
    const meanSacc=saccAmps.length?Stats.mean(saccAmps):0;
    const observedSec=Math.max(1,Stats.observedDuration(session.faceTimes,0.25));
    const blinkRate=session.blinks.length/(observedSec/60);

    const downFrac=Stats.timeWeightedFraction(sm,s=>s.y>H*0.66);
    const tr=session.tracking||{};
    const validFrac=tr.frames?tr.validFrames/tr.frames:0;
    const faceFrac=tr.frames?tr.faceFrames/tr.frames:0;
    const sampleRate=sm.length/durSec;
    const calibScore=Stats.clamp(1-(calib.quality||diag)/(diag*0.15),0,1);
    const reliability=0.35*Stats.clamp(validFrac/0.75,0,1)+
      0.20*Stats.clamp(faceFrac/0.85,0,1)+0.25*calibScore+
      0.20*Stats.clamp(sampleRate/24,0,1);

    return {durSec,observedSec,fixations,saccades,saccAmps,sd,meanSacc,blinkRate,downFrac,
            validFrac,faceFrac,sampleRate,reliability,
            reliable:reliability>=0.55&&sm.length>=30&&observedSec>=Math.min(5,durSec*0.5),
            diag,W,H};
  }
  static closeFix(c,arr){
    const dur=c.t1-c.t0;
    if(dur<100) return;
    const pts=c.points;
    const contentPts=pts.filter(p=>p.inReading);
    arr.push({
      x:Stats.median(pts.map(p=>p.x)),y:Stats.median(pts.map(p=>p.y)),dur,t0:c.t0,t1:c.t1,
      contentX:contentPts.length?Stats.median(contentPts.map(p=>p.contentX)):null,
      contentY:contentPts.length?Stats.median(contentPts.map(p=>p.contentY)):null
    });
  }
  static closeSaccade(c,arr,diag){
    const dur=c.t1-c.t0;
    const amp=Math.hypot(c.end.x-c.start.x,c.end.y-c.start.y);
    if(dur>=8 && dur<=180 && amp>=diag*0.008)
      arr.push({t0:c.t0,t1:c.t1,dur,amp,peak:c.peak,start:c.start,end:c.end});
  }
  static updateBlinkState(state,score,now,blinks){
    if(!state.closed && score>=0.52 && now-state.lastEvent>180){
      state.closed=true; state.start=now;
    }else if(state.closed && score<=0.28){
      const dur=now-state.start;
      if(dur>=45 && dur<=650){
        blinks.push(state.start+dur/2);
        state.lastEvent=now;
      }
      state.closed=false;
    }else if(state.closed && now-state.start>700){
      state.closed=false;
    }
  }
  static stressIndex(m){
    const pBlink = Stats.clamp(Math.abs(m.blinkRate-17.5)/17.5,0,1)*100;
    const pDisp = Stats.clamp(m.sd/(m.diag*0.18),0,1)*100;
    const pScan = Stats.clamp(m.meanSacc/(m.diag*0.22),0,1)*100;
    const pDown = Stats.clamp(m.downFrac/0.5,0,1)*100;
    const composite = 0.30*pBlink + 0.25*pDisp + 0.25*pScan + 0.20*pDown;
    return { pBlink,pDisp,pScan,pDown, composite };
  }
}