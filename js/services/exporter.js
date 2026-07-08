import { Stats } from '../utils/stats.js';

export class Exporter {
  static safeName(config){ return 'ocuread_'+config.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase().slice(0,40); }
  static download(content,name,type){
    const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  static csv(session, run, config, metrics){
    const sm=session.samples, m=metrics;
    let rows=[
      `# Session: ${run.sessionName||config.title}`,
    `# Age: ${run.age||''}  Text: ${run.testName||''}  Quiz Correct: ${session.quizScore ? session.quizScore.correct + '/' + session.quizScore.total : 'N/A'}  Exported: ${new Date().toISOString()}`,      "Timestamp_ms,Elapsed_s,GazeX,GazeY,RawGazeX,RawGazeY,ContentX_norm,ContentY_norm,InReading,Blink,SaccadeAmplitude_px"];
    for(let i=0;i<sm.length;i++){
      const t=(sm[i].t-session.startT);
      const blink=session.blinks.some(bt=>Math.abs(bt-sm[i].t)<=70)?1:0;
      const event=m.saccades.find(s=>Math.abs(s.t1-sm[i].t)<=35);
      const sacc=event?event.amp.toFixed(1):'';
      rows.push(`${sm[i].t.toFixed(1)},${(t/1000).toFixed(3)},${sm[i].x.toFixed(1)},${sm[i].y.toFixed(1)},`+
        `${sm[i].rawX.toFixed(1)},${sm[i].rawY.toFixed(1)},${sm[i].contentX.toFixed(5)},${sm[i].contentY.toFixed(5)},`+
        `${sm[i].inReading?1:0},${blink},${sacc}`);
    }
    Exporter.download(rows.join('\n'),Exporter.safeName(config)+'_raw.csv','text/csv');
  }
  static json(session, run, config, calib, metrics, stress){
    const m=metrics, st=stress;
    const out={
      session:run.sessionName||config.title,
      participantAge:run.age||null,
      text:run.testName||null,
      quizScore: session.quizScore || null, 
      timestamp:new Date().toISOString(),
      config:{ timed:config.timed, durationSec:config.durationSec, words:config.text.split(/\s+/).length },
      calibrationErrorPx:calib.quality,
      calibrationP90Px:calib.qualityP90,
      metrics:{ durationSec:m.durSec, blinkRate:m.blinkRate, dispersionPx:m.sd,
        meanSaccadePx:m.meanSacc, downwardGazeFrac:m.downFrac,
        fixationMeanMs:m.fixations.length?Stats.mean(m.fixations.map(f=>f.dur)):0,
        fixations:m.fixations.length, saccades:m.saccades.length, blinks:session.blinks.length,
        validTrackingFraction:m.validFrac, faceDetectionFraction:m.faceFrac,
        validSampleRateHz:m.sampleRate, observedFaceSeconds:m.observedSec,
        analysisReliability:m.reliability },
      stressIndex:{ reliable:m.reliable, composite:m.reliable?st.composite:null,
        blink:st.pBlink, dispersion:st.pDisp, scan:st.pScan, downward:st.pDown }
    };
    Exporter.download(JSON.stringify(out,null,2),Exporter.safeName(config)+'_summary.json','application/json');
  }
}