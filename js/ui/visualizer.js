import { $ } from '../utils/dom.js';
import { Stats } from '../utils/stats.js';

export class Visualizer {
  static drawGauge(val,col){
    const svg=$('#gauge-svg'); const cx=110,cy=120,r=92;
    const pt=p=>{ const ang=Math.PI+p*Math.PI; return [cx+r*Math.cos(ang), cy+r*Math.sin(ang)]; };
    const arcPath=p=>{ const [sx,sy]=pt(0),[ex,ey]=pt(p);
  return `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`; }; 
    const p=Stats.clamp(val/100,0.003,1);
    svg.innerHTML =
      `<path d="${arcPath(1)}" fill="none" stroke="#1c2c36" stroke-width="10" stroke-linecap="round"/>`+
      `<path d="${arcPath(p)}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round"/>`;
  }
  static heatColor(t){ // blue->cyan->yellow->red
    const stops=[[20,40,120],[31,182,166],[232,177,91],[232,116,91]];
    const seg=t*(stops.length-1); const i=Math.floor(seg); const f=seg-i;
    const a=stops[Math.min(i,stops.length-1)], b=stops[Math.min(i+1,stops.length-1)];
    return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f].map(Math.round);
  }
  static renderViz(mode, metrics){
    const stage=$('#viz-stage'), canvas=$('#viz-canvas');
    const reading=$('#viz-reading');
    const w=stage.clientWidth, h=reading.scrollHeight;
    stage.style.height=h+'px';
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,w,h);
    if(mode==='heat'){
      const off=document.createElement('canvas'); off.width=w; off.height=h;
      const octx=off.getContext('2d');
      for(const f of metrics.fixations){
        if(f.contentX==null || f.contentY==null) continue;
        const x=f.contentX*w, y=f.contentY*h;
        const radius=Stats.clamp(28+f.dur/35,32,62);
        const alpha=Stats.clamp(0.08+f.dur/2400,0.1,0.32);
        const g=octx.createRadialGradient(x,y,0,x,y,radius);
        g.addColorStop(0,`rgba(0,0,0,${alpha})`); g.addColorStop(1,'rgba(0,0,0,0)');
        octx.fillStyle=g; octx.beginPath(); octx.arc(x,y,radius,0,7); octx.fill();
      }
      const img=octx.getImageData(0,0,w,h); const d=img.data;
      for(let i=0;i<d.length;i+=4){
        const a=d[i+3]/255; if(a<=0.01){d[i+3]=0;continue;}
        const t=Math.min(1,a*2.4);
        const [r,gg,b]=Visualizer.heatColor(t);
        d[i]=r; d[i+1]=gg; d[i+2]=b; d[i+3]=Math.min(200,t*220);
      }
      octx.putImageData(img,0,0);
      ctx.drawImage(off,0,0);
    }else{
      const fx=metrics.fixations;
      const visible=fx.filter(f=>f.contentX!=null&&f.contentY!=null);
      ctx.strokeStyle='rgba(31,182,166,.55)'; ctx.lineWidth=1.5;
      ctx.beginPath();
      visible.forEach((f,i)=>{ const x=f.contentX*w,y=f.contentY*h; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); });
      ctx.stroke();
      visible.forEach((f,i)=>{
        const x=f.contentX*w,y=f.contentY*h; const r=Stats.clamp(6+f.dur/90,6,26);
        ctx.fillStyle='rgba(31,182,166,.22)'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
        ctx.strokeStyle='rgba(31,182,166,.8)'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.stroke();
        ctx.fillStyle='#0a1014'; ctx.font='10px IBM Plex Mono'; ctx.textAlign='center'; ctx.textBaseline='middle';
        if(r>9) ctx.fillText(i+1,x,y);
      });
    }
  }
}