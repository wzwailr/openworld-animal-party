import * as THREE from 'three';
import { getWalkHeight } from './landscape';
import { blossomGeometry, woodGrain } from '../entities/festivalLandmarks';

export interface WorldInteraction {
  id:string;
  kind:'lantern'|'butterflies'|'chime';
  label:string;
  position:THREE.Vector3;
  trigger(time:number):string;
  update(time:number):void;
}

const SITES:ReadonlyArray<readonly[string,WorldInteraction['kind'],number,number]> = [
  ['welcome','chime',-2.7,55], ['festival','lantern',1.3,7.2],
  ['stream','chime',36.3,7.1], ['market','lantern',-111.6,1.1],
  ['village','chime',104,-50.9], ['valley','chime',18.9,-108],
  ['garden','butterflies',-29.5,98.2], ['mushrooms','butterflies',-45.5,-15.6],
  ['station','lantern',-1.4,-44.5], ['orchard','butterflies',192.6,60.6],
  ['windmill','chime',210,-44.8],
];

export function createWorldInteractions() {
  const group=new THREE.Group();group.name='forest-interactive-details';
  const targets:WorldInteraction[]=[];
  const wood=new THREE.MeshStandardMaterial({color:0x947652,map:woodGrain(),roughness:.9});
  const brass=new THREE.MeshStandardMaterial({color:0xd1b97a,roughness:.52,metalness:.4});
  const stem=new THREE.MeshStandardMaterial({color:0x597644,roughness:1});
  for(const [id,kind,x,z] of SITES) {
    const root=new THREE.Group();root.name=`interaction:${id}`;root.position.set(x,getWalkHeight(x,z),z);group.add(root);
    const add=(geo:THREE.BufferGeometry,mat:THREE.Material,px:number,py:number,pz:number)=>{
      const mesh=new THREE.Mesh(geo,mat);mesh.position.set(px,py,pz);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;
    };
    const position=root.position.clone().add(new THREE.Vector3(0,kind==='butterflies'?.9:1.7,0));
    let started=-Infinity,lit=false;
    if(kind==='lantern') {
      add(new THREE.CylinderGeometry(.07,.11,2.1,8),wood,0,1.05,0);
      add(new THREE.BoxGeometry(.7,.08,.09),wood,.24,2.12,0);
      const paper=new THREE.MeshStandardMaterial({color:0xdac49b,emissive:0xffaa42,emissiveIntensity:.05,roughness:.75});
      const lamp=add(new THREE.SphereGeometry(.32,18,14),paper,.43,1.66,0);lamp.scale.set(1,1.25,1);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,points=Array.from({length:17},(_,j)=>{const t=j*Math.PI/16;return new THREE.Vector3(.43+Math.cos(a)*Math.sin(t)*.324,1.66+Math.cos(t)*.402,Math.sin(a)*Math.sin(t)*.324);});
        const rib=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.009,4,false),brass);root.add(rib);
      }
      for(const y of [1.27,2.03])add(new THREE.CylinderGeometry(.17,.19,.08,12),brass,.43,y,0);
      const light=new THREE.PointLight(0xffc775,0,4,2);light.position.set(.43,1.65,.2);root.add(light);
      position.x+=.43;
      const target:WorldInteraction={id,kind,position,label:'点亮小灯笼',trigger(time){
        started=time;lit=!lit;target.label=lit?'熄灭小灯笼':'点亮小灯笼';
        paper.emissiveIntensity=lit?1.7:.05;paper.color.setHex(lit?0xffd78d:0xdac49b);light.intensity=lit?2.5:0;
        return lit?'一盏暖灯，为路过的朋友亮起。':'小灯笼暂时休息了。';
      },update(time){lamp.rotation.z=Math.sin((time-started)*4)*Math.exp(-Math.max(0,time-started)*1.4)*.08||0;}};
      targets.push(target);
    } else if(kind==='chime') {
      add(new THREE.CylinderGeometry(.07,.12,2.5,8),wood,-.42,1.25,0);
      add(new THREE.BoxGeometry(1.15,.08,.1),wood,.05,2.48,0);
      const pendulum=new THREE.Group();pendulum.position.set(.2,2.38,0);root.add(pendulum);
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5,h=.4+i*.05;
        const line=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.35,4),wood);line.position.set(Math.cos(a)*.24,-.17,Math.sin(a)*.24);pendulum.add(line);
        const tube=new THREE.Mesh(new THREE.CylinderGeometry(.038,.045,h,10,1,true),brass);tube.position.set(Math.cos(a)*.24,-.4-h/2,Math.sin(a)*.24);pendulum.add(tube);
      }
      const ribbon=new THREE.Mesh(new THREE.PlaneGeometry(.16,.48,1,5),new THREE.MeshStandardMaterial({color:0x94b1a1,side:THREE.DoubleSide,roughness:1}));ribbon.position.y=-1.14;pendulum.add(ribbon);
      targets.push({id,kind,position,label:'轻拨风铃',trigger(time){started=time;return '风铃轻响，林间有了回应。';},update(time){
        const age=time-started,amplitude=Number.isFinite(age)?Math.exp(-Math.max(0,age)*.75):0;
        pendulum.rotation.z=Math.sin(age*7.5)*.3*amplitude||0;pendulum.rotation.x=Math.cos(age*6)*.1*amplitude||0;
        ribbon.rotation.y=Math.sin(time*1.8+x)*.16;
      }});
    } else {
      const petal=new THREE.MeshStandardMaterial({color:0xc4a2c2,roughness:1,side:THREE.DoubleSide});
      for(let i=0;i<13;i++){
        const a=i*2.4,r=.25+(i%3)*.22,h=.45+(i%4)*.09;
        add(new THREE.CylinderGeometry(.014,.024,h,4),stem,Math.cos(a)*r,h/2,Math.sin(a)*r);
        const flower=add(blossomGeometry(),petal,Math.cos(a)*r,h,Math.sin(a)*r);flower.scale.setScalar(.65);
      }
      const butterflies=new THREE.Group();butterflies.name='awakened-butterflies';butterflies.visible=false;root.add(butterflies);
      const wingShape=new THREE.Shape();wingShape.moveTo(0,0);wingShape.bezierCurveTo(.27,.35,.48,.28,.33,-.08);wingShape.bezierCurveTo(.35,-.31,.14,-.25,0,0);
      const wingGeometry=new THREE.ShapeGeometry(wingShape,8);
      const wings:THREE.Mesh[][]=[];
      for(let i=0;i<9;i++){
        const insect=new THREE.Group();butterflies.add(insect);const pair:THREE.Mesh[]=[];
        const wingMaterial=new THREE.MeshStandardMaterial({color:[0xe8c47a,0xb6b1d5,0xe0a1a7][i%3],side:THREE.DoubleSide,roughness:.85});
        for(const side of [-1,1]){const wing=new THREE.Mesh(wingGeometry,wingMaterial);wing.scale.x=side;insect.add(wing);pair.push(wing);}wings.push(pair);
      }
      targets.push({id,kind,position,label:'轻触花丛 · 看彩蝶',trigger(time){started=time;butterflies.visible=true;return '彩蝶从花间飞起，又会慢慢落回。';},update(time){
        const age=time-started;butterflies.visible=age>=0&&age<8;
        if(!butterflies.visible)return;
        const flight=Math.sin(Math.PI*age/8);
        butterflies.children.forEach((insect,i)=>{
          const a=i*2.4+age*.5,r=.4+flight*(.5+i*.11);
          insect.position.set(Math.cos(a)*r,.75+flight*(.6+i*.09),Math.sin(a)*r);
          insect.rotation.y=-a;insect.scale.setScalar(.55+flight*.45);
          wings[i][0].rotation.y=Math.sin(age*16+i)*.8;wings[i][1].rotation.y=-wings[i][0].rotation.y;
        });
      }});
    }
  }
  return {group,targets};
}
