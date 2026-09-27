import { PerspectiveCamera,Vector3 } from 'three';
import type { Box2D } from '../core/types';
import type { WorldInteraction } from '../world/interactions';

interface Options {
  camera:PerspectiveCamera;targets:readonly WorldInteraction[];colliders:readonly Box2D[];
  events:EventTarget;canvas:EventTarget;isActive:()=>boolean;
  onFocus:(target:WorldInteraction|null)=>void;onResult:(message:string)=>void;playChime:()=>void;
}
function blocked(a:Vector3,b:Vector3,boxes:readonly Box2D[]):boolean {
  return boxes.some(box=>{
    // A target's own support is not a wall between the player and the target.
    if(b.x>=box.minX&&b.x<=box.maxX&&b.z>=box.minZ&&b.z<=box.maxZ)return false;
    let lo=0,hi=1;
    for(const [origin,delta,min,max] of [[a.x,b.x-a.x,box.minX,box.maxX],[a.z,b.z-a.z,box.minZ,box.maxZ]]){
      if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return false;}
      else {const p=(min-origin)/delta,q=(max-origin)/delta;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}
    }
    return lo<=hi&&hi>0&&lo<.97;
  });
}
export function createInteractionController(options:Options) {
  const {camera,targets,colliders,events,canvas,isActive,onFocus,onResult,playChime}=options;
  const forward=new Vector3(),offset=new Vector3();let time=0,last=-Infinity,current:WorldInteraction|null=null,disposed=false;
  const select=()=>{
    if(!isActive()||disposed)return null;
    camera.getWorldDirection(forward);let nearest:WorldInteraction|null=null,best=Infinity;
    for(const target of targets){
      offset.copy(target.position).sub(camera.position);const distance=offset.length();
      if(distance>4||distance<.01||offset.divideScalar(distance).dot(forward)<.78||distance>=best)continue;
      if(blocked(camera.position,target.position,colliders))continue;
      nearest=target;best=distance;
    }
    return nearest;
  };
  const trigger=()=>{
    const target=select();if(!target||time-last<.65)return;
    last=time;onResult(target.trigger(time));if(target.kind==='chime')playChime();onFocus(target);
  };
  const key=(event:Event)=>{
    const e=event as KeyboardEvent;
    if(e.code!=='KeyE'||e.repeat||!isActive())return;
    e.preventDefault();trigger();
  };
  const click=(event:Event)=>{if((event as MouseEvent).button===0)trigger();};
  events.addEventListener('keydown',key);canvas.addEventListener('click',click);
  return {update(elapsed:number){time=elapsed;const target=select();if(target!==current){current=target;onFocus(target);}},
    dispose(){disposed=true;events.removeEventListener('keydown',key);canvas.removeEventListener('click',click);current=null;onFocus(null);}};
}
