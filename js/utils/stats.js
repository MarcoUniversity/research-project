export class Stats {
  static mean(a){ return a.reduce((x,y)=>x+y,0)/(a.length||1); }
  static median(a){
    if(!a.length) return 0;
    const s=a.slice().sort((x,y)=>x-y), m=Math.floor(s.length/2);
    return s.length%2? s[m] : (s[m-1]+s[m])/2;
  }
  static quantile(a,q){
    if(!a.length) return 0;
    const s=a.slice().sort((x,y)=>x-y), p=(s.length-1)*q;
    const i=Math.floor(p), f=p-i;
    return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*f;
  }
  static stdev(a){ const m=Stats.mean(a); return Math.sqrt(Stats.mean(a.map(v=>(v-m)*(v-m)))); }
  static robustStdev(a){
    if(!a.length) return 0;
    const lo=Stats.quantile(a,0.05), hi=Stats.quantile(a,0.95);
    return Stats.stdev(a.map(v=>Stats.clamp(v,lo,hi)));
  }
  static clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  static observedDuration(times,maxGapSec){
    let total=0;
    for(let i=1;i<times.length;i++) total+=Math.min(maxGapSec,(times[i]-times[i-1])/1000);
    return total;
  }
  static timeWeightedFraction(samples,predicate){
    if(samples.length<2) return samples.length&&predicate(samples[0])?1:0;
    let yes=0,total=0;
    for(let i=0;i<samples.length-1;i++){
      const dt=Math.min(0.14,Math.max(0,(samples[i+1].t-samples[i].t)/1000));
      total+=dt; if(predicate(samples[i])) yes+=dt;
    }
    return total?yes/total:0;
  }
}