export class LowPass {
  constructor(){ this.y=null; }
  f(x,a){ this.y = this.y==null? x : a*x+(1-a)*this.y; return this.y; }
  reset(){ this.y=null; }
}

export class OneEuro {
  constructor(minCut=1.2,beta=0.02,dCut=1.0){
    this.minCut=minCut; this.beta=beta; this.dCut=dCut;
    this.xf=new LowPass(); this.dxf=new LowPass(); this.lastT=null; this.lastX=null;
  }
  alpha(cut,dt){ const tau=1/(2*Math.PI*cut); return 1/(1+tau/dt); }
  filter(x,t){
    if(this.lastT==null){ this.lastT=t; this.lastX=x; return this.xf.f(x,1); }
    let dt=t-this.lastT; if(dt<=0)dt=1e-3; this.lastT=t;
    const dx=(x-this.lastX)/dt; this.lastX=x;
    const edx=this.dxf.f(dx,this.alpha(this.dCut,dt));
    const cut=this.minCut+this.beta*Math.abs(edx);
    return this.xf.f(x,this.alpha(cut,dt));
  }
  reset(){ this.xf.reset(); this.dxf.reset(); this.lastT=null; this.lastX=null; }
}