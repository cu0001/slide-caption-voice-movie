import {FPS,type SceneElement} from './model';
import type {Assets} from './render';
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
const ease=(n:number)=>1-Math.pow(1-clamp(n),3);
/** Damped spring 0→1 with overshoot, solved analytically so every frame is deterministic. */
export function spring(time:number,duration:number,damping=.82){
 if(time<=0)return 0;
 const w=7/Math.max(.05,duration),wd=w*Math.sqrt(1-damping*damping);
 return 1-Math.exp(-damping*w*time)*(Math.cos(wd*time)+damping*w/wd*Math.sin(wd*time));
}
export function elementPose(e:SceneElement,time:number){
 const elapsed=time-e.start,visible=elapsed>=0&&elapsed<e.duration,enter=e.enter??.7,p=clamp(elapsed/enter),t=ease(p);
 const s=spring(elapsed,enter,e.animation==='drop'?.66:.82),quick=ease(p*2.5);
 let x=e.x,y=e.y,scale=1,rotation=e.rotation??0,alpha=e.opacity??1,clip=1,blur=0;
 const distance=e.distance??140;
 switch(e.animation){
  case 'fade':alpha*=t;break;
  case 'slide-up':alpha*=quick;y+=(1-s)*distance;break;
  case 'slide-down':alpha*=quick;y-=(1-s)*distance;break;
  case 'slide-left':alpha*=quick;x+=(1-s)*distance;break;
  case 'slide-right':alpha*=quick;x-=(1-s)*distance;break;
  case 'pop':alpha*=quick;scale=.5+.5*s;rotation-=(1-s)*6;break;
  case 'zoom':alpha*=quick;scale=Math.max(0,s);break;
  case 'spin':alpha*=quick;scale=Math.max(0,s);rotation-=(1-s)*180;break;
  case 'drop':alpha*=quick;y-=(1-s)*distance;break;
  case 'blur':alpha*=t;blur=(1-t)*28;scale=1.35-.35*t;break;
  case 'float':alpha*=t;y+=(1-s)*distance-Math.sin(Math.max(0,elapsed)*2.3)*10*t;rotation+=Math.sin(Math.max(0,elapsed)*1.8)*2*t;break;
  case 'reveal':clip=t;break;
 }
 // Continuous motion while shown, faded in after the entrance so it never jerks.
 const live=Math.max(0,elapsed),settle=ease(elapsed/(enter*1.2));
 switch(e.loop){
  case 'float':y+=Math.sin(live*1.2)*8*settle;break;
  case 'pulse':scale*=1+.025*Math.sin(live*1.7)*settle;break;
  case 'sway':rotation+=Math.sin(live*1.0)*2*settle;break;
  case 'drift':scale*=1+.12*clamp(live/e.duration);x-=24*clamp(live/e.duration);break;
  case 'spin':rotation+=live*15;break;
 }
 const exitDuration=Math.min(e.exitDuration??.5,e.duration),exit=e.exit??'none';
 if(exit!=='none'){
  // Critically damped spring: leaves quickly and settles without bouncing back on screen.
  const since=elapsed-(e.duration-exitDuration),q=clamp(since/exitDuration),b=since<=0?0:Math.min(1,spring(since,exitDuration,.999)/.999),fade=1-clamp((q-.55)/.45);
  const travel=Math.max(220,distance*1.6);
  switch(exit){
   case 'fade':alpha*=1-ease(q);break;
   case 'slide-up':y-=b*travel;alpha*=fade;break;
   case 'slide-down':y+=b*travel;alpha*=fade;break;
   case 'slide-left':x-=b*travel;alpha*=fade;break;
   case 'slide-right':x+=b*travel;alpha*=fade;break;
   case 'zoom':scale*=Math.max(0,1-b);break;
   case 'spin':scale*=Math.max(0,1-b);rotation+=b*180;break;
   case 'blur':alpha*=1-ease(q);blur+=q*28;scale*=1+.3*q;break;
  }
 }
 return{visible,x,y,scale,rotation,alpha:visible?Math.max(0,alpha):0,clip,blur,elapsed};
}
function fit(c:CanvasRenderingContext2D,e:SceneElement){
 let size=e.fontSize??40,lines:string[]=[];
 do{
  c.font=`${e.fontWeight??500} ${size}px -apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`;
  lines=[];
  for(const paragraph of (e.text??'').split('\n')){
   let line='';for(const ch of Array.from(paragraph)){if(line&&c.measureText(line+ch).width>e.width){lines.push(line);line=ch;}else line+=ch;}lines.push(line);
  }
  if(lines.length*size*1.35<=e.height||size<=12)break;size-=2;
 }while(size>=12);
 return{size,lines};
}
export function drawElements(c:CanvasRenderingContext2D,elements:SceneElement[],frame:number,assets:Assets){
 for(const e of elements){
  const pose=elementPose(e,frame/FPS);if(!pose.visible||pose.alpha<=0)continue;
  c.save();c.globalAlpha*=pose.alpha;if(pose.blur>.3)c.filter=`blur(${pose.blur.toFixed(1)}px)`;
  if(e.clip){c.beginPath();c.roundRect(e.clip.x,e.clip.y,e.clip.width,e.clip.height,e.clip.radius??0);c.clip();}
  c.translate(pose.x+e.width/2,pose.y+e.height/2);c.rotate(pose.rotation*Math.PI/180);c.scale(pose.scale,pose.scale);c.translate(-e.width/2,-e.height/2);
  if(pose.clip<1){c.beginPath();c.rect(0,0,e.width*pose.clip,e.height);c.clip();}
  c.fillStyle=e.color??'#f4f3e9';
  if(e.type==='text'){
   const {size,lines}=fit(c,e);c.textBaseline='top';
   const enter=e.enter??.6,distance=e.distance??140;let index=0;
   lines.forEach((line,i)=>{
    if(e.animation==='chars'){
     // Each character springs up in turn; the stagger is part of the frame function.
     let offset=0;
     for(const ch of Array.from(line)){
      const local=pose.elapsed-index++*.065,s=spring(local,enter),w=c.measureText(ch).width;
      if(local>0){c.save();c.globalAlpha*=ease(local/(enter*.4));c.translate(offset+w/2,i*size*1.35+size/2+(1-s)*distance*.6);c.scale(Math.max(0,.6+.4*s),Math.max(0,.6+.4*s));c.rotate((1-s)*.15);c.fillText(ch,-w/2,-size/2);c.restore();}
      offset+=w;
     }
     return;
    }
    c.save();
    if(e.animation==='lines'){const local=pose.elapsed-i*.2,s=spring(local,enter);c.globalAlpha*=ease(local/(enter*.5));c.translate(0,(1-s)*distance*.5);}
    c.fillText(line,0,i*size*1.35);c.restore();
   });
  }else if(e.type==='image'&&e.src){
   const image=assets.get(e.src);
   if(image){const scale=Math.min(e.width/image.naturalWidth,e.height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;c.drawImage(image,(e.width-w)/2,(e.height-h)/2,w,h);}
  }else if(e.type==='shape'){
   c.beginPath();
   if(e.shape==='ellipse')c.ellipse(e.width/2,e.height/2,e.width/2,e.height/2,0,0,Math.PI*2);
   else c.roundRect(0,0,e.width,e.height,Math.min(e.radius??0,e.width/2,e.height/2));
   c.fill();
  }
  c.restore();
 }
}
