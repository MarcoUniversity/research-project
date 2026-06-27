import { Stats } from '../utils/stats.js';

export class GazeModel {
  static solve(A,b){
    const n=b.length;
    const M=A.map((row,i)=>row.slice().concat(b[i]));
    for(let c=0;c<n;c++){
      let p=c; for(let r=c+1;r<n;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r;
      [M[c],M[p]]=[M[p],M[c]];
      const pv=M[c][c]||1e-9;
      for(let j=c;j<=n;j++) M[c][j]/=pv;
      for(let r=0;r<n;r++){ if(r===c) continue; const f=M[r][c];
        for(let j=c;j<=n;j++) M[r][j]-=f*M[c][j]; }
    }
    return M.map(row=>row[n]);
  }
  static basis(f){
    const [lx,ly,rx,ry,nx,ny,scale,yaw,pitch,roll]=f;
    const gx=(lx+rx)/2, gy=(ly+ry)/2;
    return [gx,gy,lx-rx,ly-ry,nx,ny,scale,yaw,pitch,roll,
            gx*gx,gy*gy,gx*gy,gx*nx,gy*ny];
  }
  static train(X,y,lambda=0.35,weights=null){
    const B=X.map(GazeModel.basis), N=B.length, P=B[0].length;
    const mu=new Array(P).fill(0), sd=new Array(P).fill(0);
    for(let j=0;j<P;j++){
      mu[j]=Stats.mean(B.map(r=>r[j]));
      sd[j]=Math.sqrt(Stats.mean(B.map(r=>(r[j]-mu[j])**2)));
      if(sd[j]<1e-6) sd[j]=1;
    }
    const Z=B.map(r=>[1,...r.map((v,j)=>(v-mu[j])/sd[j])]);
    const F=P+1;
    const A=Array.from({length:F},()=>new Array(F).fill(0));
    const b=new Array(F).fill(0);
    for(let i=0;i<N;i++){
      const xi=Z[i], wi=weights?weights[i]:1;
      for(let a=0;a<F;a++){
        b[a]+=wi*xi[a]*y[i];
        for(let c=0;c<F;c++) A[a][c]+=wi*xi[a]*xi[c];
      }
    }
    for(let a=1;a<F;a++) A[a][a]+=lambda;
    return { w:GazeModel.solve(A,b), mu, sd };
  }
  static predictAxis(model,x){
    const b=GazeModel.basis(x);
    let s=model.w[0];
    for(let i=0;i<b.length;i++) s+=model.w[i+1]*(b[i]-model.mu[i])/model.sd[i];
    return s;
  }
  static fit(samples){ 
    const X=samples.map(s=>s.feat), yX=samples.map(s=>s.x), yY=samples.map(s=>s.y);
    let weights=new Array(samples.length).fill(1), wX,wY;
    for(let iter=0;iter<3;iter++){
      wX=GazeModel.train(X,yX,0.35,weights);
      wY=GazeModel.train(X,yY,0.35,weights);
      const residuals=samples.map((s,i)=>Math.hypot(
        (GazeModel.predictAxis(wX,X[i])-s.x)*innerWidth,
        (GazeModel.predictAxis(wY,X[i])-s.y)*innerHeight
      ));
      const med=Stats.median(residuals);
      const sigma=1.4826*Stats.median(residuals.map(e=>Math.abs(e-med)))||1;
      const huber=Math.max(18,med+2.5*sigma);
      weights=residuals.map(e=>Math.max(0.15,Math.min(1,huber/(e||1))));
    }
    return {wX,wY};
  }
}