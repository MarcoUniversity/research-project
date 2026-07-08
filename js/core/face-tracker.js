import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12";

export class FaceTracker {
  constructor(loaderFn){
    this.loader = loaderFn || (()=>{});
    this.faceLandmarker = null;
    this.stream = null;
  }
  async ensureModel(){
    if(this.faceLandmarker) return;
    this.loader(true,"Downloading vision model (first run)...");
    const resolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
    this.faceLandmarker = await FaceLandmarker.createFromOptions(resolver,{
      baseOptions:{
        modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate:"GPU"
      },
      outputFaceBlendshapes:true,
      outputFacialTransformationMatrixes:false,
      runningMode:"VIDEO",
      numFaces:1,
      minFaceDetectionConfidence:0.6,
      minFacePresenceConfidence:0.6,
      minTrackingConfidence:0.6
    });
    this.loader(false);
  }
  async ensureCamera(){
    if(this.stream) return this.stream;
    this.loader(true,"Requesting webcam access...");
    try{
      this.stream = await navigator.mediaDevices.getUserMedia({
        video:{ width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:60}, facingMode:"user" },
        audio:false
      });
    }catch(e){
      this.loader(false);
      alert("Unable to access the webcam.\nCheck browser permissions and make sure no other app is using the camera.\n\nDetails: "+e.message);
      throw e;
    }
    this.loader(false);
    return this.stream;
  }
  async attachVideo(el){
    el.srcObject = this.stream;
    if(el.readyState<1)
      await new Promise(res=>el.addEventListener('loadedmetadata',res,{once:true}));
    await el.play();
  }
  detect(video, now){ return this.faceLandmarker.detectForVideo(video, now); }

  static normPos(iris,a,b,t,bo){
    const xr=Math.abs(b.x-a.x)||1e-4, yr=Math.abs(bo.y-t.y)||1e-4;
    const nx=(iris.x-Math.min(a.x,b.x))/xr;
    const ny=(iris.y-Math.min(t.y,bo.y))/yr;
    return [nx,ny];
  }
  static extractFeatures(lm){
    const L=FaceTracker.LM, g=i=>lm[i];
    const [lx,ly]=FaceTracker.normPos(g(L.lIris),g(L.lOut),g(L.lIn),g(L.lTop),g(L.lBot));
    const [rx,ry]=FaceTracker.normPos(g(L.rIris),g(L.rOut),g(L.rIn),g(L.rTop),g(L.rBot));
    const nose=g(L.nose);
    const eyeDist=Math.hypot(g(L.lOut).x-g(L.rOut).x, g(L.lOut).y-g(L.rOut).y);
    const templeL=g(L.templeL), templeR=g(L.templeR);
    const faceWidth=Math.hypot(templeR.x-templeL.x,templeR.y-templeL.y)||1e-4;
    const faceHeight=Math.hypot(g(L.chin).x-g(L.forehead).x,g(L.chin).y-g(L.forehead).y)||1e-4;
    const eyeMidX=(g(L.lOut).x+g(L.rOut).x)/2;
    const yaw=(nose.x-eyeMidX)/faceWidth;
    const pitch=(nose.y-g(L.forehead).y)/faceHeight;
    const roll=Math.atan2(g(L.rOut).y-g(L.lOut).y,g(L.rOut).x-g(L.lOut).x);
    return [lx,ly,rx,ry,nose.x,nose.y,eyeDist,yaw,pitch,roll];
  }
  static blinkScore(blend){
    if(!blend) return {left:0,right:0,combined:0};
    let l=0,r=0;
    for(const c of blend.categories){
      if(c.categoryName==="eyeBlinkLeft") l=c.score;
      if(c.categoryName==="eyeBlinkRight") r=c.score;
    }
    return {left:l,right:r,combined:0.7*Math.min(l,r)+0.3*(l+r)/2};
  }
  static featureIsValid(feat){
    if(!feat || feat.some(v=>!Number.isFinite(v))) return false;
    const [lx,ly,rx,ry,nx,ny,scale]=feat;
    return lx>-0.35 && lx<1.35 && rx>-0.35 && rx<1.35 &&
      ly>-0.55 && ly<1.55 && ry>-0.55 && ry<1.55 &&
      nx>0.05 && nx<0.95 && ny>0.05 && ny<0.95 && scale>0.035 && scale<0.5;
  }
}
FaceTracker.LM = { lOut:33,lIn:133,lTop:159,lBot:145,lIris:468,
                   rOut:362,rIn:263,rTop:386,rBot:374,rIris:473,
                   nose:1,templeL:234,templeR:454,forehead:10,chin:152 };