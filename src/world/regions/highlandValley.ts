import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLeafTexture } from '../../entities/foliage';
import { woodGrain } from '../../entities/festivalLandmarks';
import { getTerrainHeight, isPath, seededRandom, WATER_LEVEL } from '../landscape';
import { VALLEY, VALLEY_TRAIL, VALLEY_WATER, valleyTrailMiter, valleyTrailSample, valleyWaterHeight, valleyWaterSample } from '../highlandValleyLayout';
import type { Box2D, QualityTier, UpdateFn } from '../../core/types';

const noiseGLSL=/* glsl */`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.03)*.28+noise(p*4.11)*.12+noise(p*8.17)*.05;}
`;

function waterMaterial(time:{value:number},broken=false) {
  return new THREE.ShaderMaterial({
    side:THREE.DoubleSide,transparent:broken,depthWrite:!broken,fog:true,
    uniforms:{...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),uTime:time,uBroken:{value:broken?1:0}},
    vertexShader:/* glsl */`
      uniform float uTime;attribute float aSlope; attribute float aDepth;attribute vec4 aMotion;
      varying vec3 vWorld;varying vec2 vFlow;varying float vSlope;varying float vDepth;
      #include <fog_pars_vertex>
      void main(){vFlow=uv;vSlope=aSlope;vDepth=aDepth;
        float fold=sin(uv.y*2.7-uTime*11.+uv.x*32.)*.085+sin(uv.y*.43-uTime*4.+uv.x*19.)*.12;
        vec3 p=position+aMotion.xyz*fold*aMotion.w;
        vec4 world=modelMatrix*vec4(p,1.);
        vWorld=world.xyz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:/* glsl */`
      uniform float uTime;uniform float uBroken;
      varying vec3 vWorld;varying vec2 vFlow;varying float vSlope;varying float vDepth;
      #include <fog_pars_fragment>
      ${noiseGLSL}
      void main(){
        float speed=mix(.5,9.,vSlope);
        // All flow frequencies are measured in metres along the shared channel.
        // Sub-metre aerated ripples sit over 1-2m turbulent groups; no 10m blobs.
        vec2 flow=vec2(vWorld.x*2.8,vFlow.y*1.65-uTime*speed);
        float fine=noise(flow*2.35+vec2(sin(vFlow.y*1.7),0.));
        float turbulence=fbm(flow+vec2(noise(flow*.32)*1.7,0.));
        float medium=fbm(vec2(vWorld.x*1.15,vFlow.y*.78-uTime*speed*.47));
        float filaments=noise(vec2(vWorld.x*7.1+sin(vFlow.y*1.8)*.45,vFlow.y*1.2-uTime*speed*.78));
        vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));if(!gl_FrontFacing)n=-n;
        vec3 viewDir=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.-abs(dot(viewDir,n)),2.8);
        n=normalize(n+vec3((fine-.5)*.16,0.,(filaments-.5)*.11));
        vec2 impactDelta=(vWorld.xz-vec2(42.,-170.))*vec2(.12,.18);
        float impact=exp(-dot(impactDelta,impactDelta))*exp(-abs(vWorld.y-15.)*.7)
          +exp(-length((vWorld.xz-vec2(42.,-133.))*vec2(.23,.29)))*exp(-abs(vWorld.y-6.)*.9)*.55
          +exp(-length((vWorld.xz-vec2(35.,-118.))*vec2(.25,.35)))*exp(-abs(vWorld.y+.48))* .4;
        float swirling=fbm(vWorld.xz*1.8+vec2(sin(uTime*.34),uTime*.85));
        // Persistent longitudinal bundles carry the large shape; fine moving
        // aeration must not turn the entire sixty-five metre fall into white cloth.
        float bundles=fbm(vec2(vFlow.x*9.2+sin(vFlow.y*.038)*.25,vFlow.y*.032-uTime*.13));
        float foam=vSlope*(.025+smoothstep(.38,.73,bundles)*.55+smoothstep(.51,.8,turbulence)*.1);
        foam+=smoothstep(.67,.88,filaments)*vSlope*.08;
        foam+=smoothstep(.84,1.,abs(vFlow.x*2.-1.))*vSlope*.09;
        float ripple=sin(length(vWorld.xz-vec2(42.,-171.))*3.6-uTime*2.6+swirling*4.);
        foam+=impact*(.14+smoothstep(.35,.75,swirling)*.44+smoothstep(.68,.98,ripple)*.12);
        float shore=(1.-smoothstep(.1,.7,vDepth))*smoothstep(.4,.72,turbulence)*.35;
        vec3 deep=vec3(.035,.14,.155),shallow=vec3(.20,.36,.29);
        vec3 color=mix(shallow,deep,smoothstep(.1,2.1,vDepth));
        color=mix(color,vec3(.028,.115,.14),vSlope*.8);
        color=mix(color,vec3(.57,.73,.74),fresnel*mix(.28,.12,vSlope));
        color=mix(color,vec3(.69,.84,.8),clamp(foam+shore,0.,.86));
        vec3 lightDir=normalize(vec3(-.4,.8,.45));
        float glint=pow(max(0.,dot(reflect(-lightDir,n),viewDir)),48.);
        color+=vec3(.9,.83,.66)*glint*.14*(1.-foam*.6);
        float alpha=1.;
        if(uBroken>.5){alpha=smoothstep(.53,.78,turbulence*.62+fine*.38)*smoothstep(.38,.7,bundles)*.34;
          color=mix(vec3(.68,.79,.735),vec3(.93,.96,.885),fine);if(alpha<.04)discard;}
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Closed water volumes share their top boundary at every authored profile knot. */
function channelSegment(index:number,offset=0):THREE.BufferGeometry {
  const a=VALLEY_WATER[index],b=VALLEY_WATER[index+1];
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],horizontal=Math.hypot(dx,dz);
  const slope=Math.min(1,Math.abs(dy)/Math.max(1,horizontal)),steps=Math.max(8,Math.ceil(Math.hypot(horizontal,dy)*(slope>.5?2:1.5))),across=slope>.5?36:24;
  const forward=new THREE.Vector3(dx,dy,dz).normalize();
  const side=new THREE.Vector3(dz,0,-dx).normalize(),normal=new THREE.Vector3().crossVectors(forward,side).normalize();
  if(normal.y<0)normal.negate();
  const thickness=.32+slope*.8;
  let startFlow=0;for(let i=0;i<index;i++)startFlow+=Math.hypot(VALLEY_WATER[i+1][0]-VALLEY_WATER[i][0],VALLEY_WATER[i+1][1]-VALLEY_WATER[i][1],VALLEY_WATER[i+1][2]-VALLEY_WATER[i][2]);
  const vertices:number[]=[],uv:number[]=[],depths:number[]=[],slopes:number[]=[],motion:number[]=[],indices:number[]=[];
  for(let face=0;face<2;face++)for(let row=0;row<=steps;row++) {
    const t=row/steps,center=new THREE.Vector3(a[0]+dx*t,a[1]+dy*t,a[2]+dz*t);
    // Use one transverse direction at the shared knots, so changing channel
    // direction cannot open a triangular crack between adjacent meshes.
    const knotDirection=(k:number)=>{
      const before=VALLEY_WATER[Math.max(0,k-1)],after=VALLEY_WATER[Math.min(VALLEY_WATER.length-1,k+1)];
      return new THREE.Vector3(after[2]-before[2],0,before[0]-after[0]).normalize();
    };
    const acrossDirection=row===0?knotDirection(index):row===steps?knotDirection(index+1):side;
    for(let column=0;column<=across;column++) {
      const u=column/across*2-1;
      const envelope=Math.sin(t*Math.PI);
      const edge=envelope*(Math.sin(t*57+index)*.13+Math.sin(t*133+index*3)*.045)*slope;
      const w=(a[3]+(b[3]-a[3])*t)*(1+envelope*Math.sin(t*13+index)*.015)+edge;
      const p=center.clone().addScaledVector(acrossDirection,u*w);
      const curve=envelope*(Math.sin(u*11+t*4)*.38+Math.sin(column*.9+t*63)*.09)*slope*Math.abs(u);
      p.addScaledVector(normal,curve+offset-(face?thickness:0));
      vertices.push(p.x,p.y,p.z);uv.push((u+1)/2,startFlow+Math.hypot(horizontal,dy)*t);
      depths.push(Math.max(.04,a[1]+dy*t-getTerrainHeight(p.x,p.z)));slopes.push(slope);
      motion.push(normal.x,normal.y,normal.z,envelope*slope*Math.abs(u));
    }
  }
  const stride=across+1,faceSize=(steps+1)*stride;
  for(let face=0;face<2;face++)for(let row=0;row<steps;row++)for(let col=0;col<across;col++) {
    const p=face*faceSize+row*stride+col,q=p+stride;
    if(face)indices.push(p,p+1,q,p+1,q+1,q);else indices.push(p,q,p+1,p+1,q,q+1);
  }
  for(let row=0;row<steps;row++)for(const col of [0,across]) {
    const p=row*stride+col,q=p+stride;indices.push(p,p+faceSize,q,p+faceSize,q+faceSize,q);
  }
  for(const row of [0,steps])for(let col=0;col<across;col++) {
    const p=row*stride+col;indices.push(p,p+1,p+faceSize,p+1,p+1+faceSize,p+faceSize);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('aSlope',new THREE.Float32BufferAttribute(slopes,1));
  geometry.setAttribute('aDepth',new THREE.Float32BufferAttribute(depths,1));geometry.setAttribute('aMotion',new THREE.Float32BufferAttribute(motion,4));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function particles(count:number,mist:boolean,time:{value:number}) {
  const rng=seededRandom(mist?451:452),positions=new Float32Array(count*3),sizes=new Float32Array(count),fades=new Float32Array(count),seeds:number[][]=[];
  for(let i=0;i<count;i++) {
    seeds.push([rng(),rng(),rng(),rng()]);sizes[i]=mist?5+rng()*5:.11+rng()*.36;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));geometry.setAttribute('aFade',new THREE.BufferAttribute(fades,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,
    uniforms:{...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),uTime:time,uMist:{value:mist?1:0}},
    vertexShader:/* glsl */`attribute float aSize;attribute float aFade;varying float vSeed;varying float vFade;
      #include <fog_pars_vertex>
      void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.);vSeed=position.x;vFade=aFade;
        gl_Position=projectionMatrix*mvPosition;gl_PointSize=min(180.,aSize*600./max(1.,-mvPosition.z));
        #include <fog_vertex>
      }`,
    fragmentShader:/* glsl */`uniform float uTime;uniform float uMist;varying float vSeed;varying float vFade;
      #include <fog_pars_fragment>
      ${noiseGLSL}
      void main(){vec2 p=gl_PointCoord*2.-1.;float edge=max(0.,1.-dot(p,p));
        float alpha=pow(edge,1.8)*mix(.74,.2,uMist)*vFade;alpha*=mix(1.,fbm(p*4.+vec2(vSeed,uTime*.15))+.35,uMist);
        if(alpha<.005)discard;gl_FragColor=vec4(.85,.9,.835,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const points=new THREE.Points(geometry,material);points.name=mist?'valley-drifting-mist':'valley-impact-spray';points.frustumCulled=false;
  const impacts=VALLEY_WATER.filter((p,i)=>i>0&&VALLEY_WATER[i-1][1]-p[1]>3);
  const update=(elapsed:number)=>{
    for(let i=0;i<count;i++) {
      const seed=seeds[i],impact=impacts[i%5<3?0:1+(i%5-3)%(impacts.length-1)],phase=(elapsed*(mist?.07:.38)+seed[0])%1,angle=seed[1]*Math.PI*2;
      const radius=mist?.8+phase*8:(1+seed[2]*5)*phase;
      const x=impact[0]+Math.cos(angle)*radius*1.2,z=impact[2]+2+Math.sin(angle)*radius*.65;
      const y=impact[1]+(mist?.6+seed[3]*2+Math.sin(phase*Math.PI)*3.5:Math.sin(phase*Math.PI)*(2+seed[3]*7));
      positions[i*3]=x;positions[i*3+1]=y;positions[i*3+2]=z;
      fades[i]=Math.pow(Math.sin(phase*Math.PI),mist?.6:.45);
    }
    geometry.attributes.position.needsUpdate=true;
    geometry.attributes.aFade.needsUpdate=true;
  };
  update(0);return {points,update,count};
}

/** Broken expanding surface foam, clipped to each impact's actual wet reach. */
function impactFoam(time:{value:number}):THREE.Group {
  const group=new THREE.Group();group.name='valley-impact-foam';
  const impacts=VALLEY_WATER.filter((p,i)=>i>0&&VALLEY_WATER[i-1][1]-p[1]>3);
  for(const [index,impact] of impacts.entries()) {
    const radius=index===0?10:5.8,vertices:number[]=[],uv:number[]=[];
    const point=(x:number,z:number)=>{
      const level=valleyWaterHeight(x,z);
      if(level===null||Math.abs(level-impact[1])>1e-4||getTerrainHeight(x,z)>level-.08)return null;
      const u=(x-impact[0])/radius,v=(z-impact[2]-radius*.25)/(radius*.8);
      if(u*u+v*v>1)return null;
      return [x,level+.035,z,u,v];
    };
    // Bank rejection happens before triangulation: no transparent sheet across
    // dry banks, and no fixed disk floating over a sloping downstream cascade.
    const step=.55;
    for(let x=impact[0]-radius;x<impact[0]+radius;x+=step)for(let z=impact[2]-radius;z<impact[2]+radius;z+=step) {
      const corners=[point(x,z),point(x+step,z),point(x+step,z+step),point(x,z+step)];
      if(corners.some(p=>p===null))continue;
      if([point(x+step/2,z),point(x,z+step/2),point(x+step,z+step/2),point(x+step/2,z+step),point(x+step/2,z+step/2)].some(p=>p===null))continue;
      for(const i of [0,2,1,0,3,2]){const p=corners[i]!;vertices.push(p[0],p[1],p[2]);uv.push(p[3],p[4]);}
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,
      uniforms:{...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),uTime:time},
      vertexShader:/* glsl */`varying vec2 vFoam;
        #include <fog_pars_vertex>
        void main(){vFoam=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader:/* glsl */`uniform float uTime;varying vec2 vFoam;
        #include <fog_pars_fragment>
        ${noiseGLSL}
        void main(){float r=length(vFoam),angle=atan(vFoam.y,vFoam.x);
          float turbulence=fbm(vFoam*11.+vec2(uTime*.2,-uTime*.25));
          float rings=sin(r*48.-uTime*3.3+sin(angle*5.)*1.1+turbulence*4.);
          float threads=smoothstep(.35,.85,rings)*smoothstep(.36,.7,turbulence);
          float core=(1.-smoothstep(.02,.35,r))*smoothstep(.3,.65,turbulence);
          float alpha=(threads*.55+core*.4)*(1.-smoothstep(.58,1.,r));
          if(alpha<.025)discard;gl_FragColor=vec4(.83,.92,.85,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`impact-foam:${index}`;group.add(mesh);
  }
  return group;
}

export function createHighlandValley():{group:THREE.Group;colliders:Box2D[];animations:UpdateFn[];setQuality:(tier:QualityTier)=>void} {
  const group=new THREE.Group();group.name='region:headwater-falls';
  const water=new THREE.Group();water.name='headwater-channel';group.add(water);
  const time={value:0},surface=waterMaterial(time),broken=waterMaterial(time,true),colliders:Box2D[]=[];
  for(let i=0;i<VALLEY_WATER.length-1;i++) {
    const drop=VALLEY_WATER[i][1]-VALLEY_WATER[i+1][1],m=new THREE.Mesh(channelSegment(i),surface);
    m.name=drop>50?'main-fall-volume':drop>3?'secondary-cascade-volume':`valley-water-reach:${i}`;water.add(m);
    if(drop>3){const foam=new THREE.Mesh(channelSegment(i,.13),broken);foam.name='fragmented-whitewater';group.add(foam);}
  }
  const source=VALLEY_WATER[0];
  const sourceCap=new THREE.CylinderGeometry(source[3],source[3],.32,32,1,false,Math.PI/2,Math.PI)
    .translate(source[0],source[1]-.16,source[2]);
  const capPositions=sourceCap.attributes.position,capDepth=new Float32Array(capPositions.count);
  for(let i=0;i<capDepth.length;i++)capDepth[i]=Math.max(.04,source[1]-getTerrainHeight(capPositions.getX(i),capPositions.getZ(i)));
  sourceCap.setAttribute('aSlope',new THREE.Float32BufferAttribute(new Float32Array(capPositions.count),1));
  sourceCap.setAttribute('aDepth',new THREE.Float32BufferAttribute(capDepth,1));
  sourceCap.setAttribute('aMotion',new THREE.Float32BufferAttribute(new Float32Array(capPositions.count*4),4));
  const sourceMesh=new THREE.Mesh(sourceCap,surface);sourceMesh.name='rounded-headwater-source';water.add(sourceMesh);
  const spray=particles(570,false,time),mist=particles(160,true,time);group.add(spray.points,mist.points,impactFoam(time));
  const animations:UpdateFn[]=[elapsed=>{time.value=elapsed;spray.update(elapsed);mist.update(elapsed);}];

  // Build watertight row unions from the physical bed and each reach's OWN level.
  // The extra quarter-cell probes cover diagonal banks without sealing dry roads.
  const cell=.65;
  for(let z=-233;z<-100;z+=cell) {
    let start:number|null=null;
    for(let x=23;x<=64;x+=cell) {
      const wet=x<63&&[0,.5,1].some(u=>[0,.5,1].some(v=>{
        const px=x+u*cell,pz=z+v*cell;
        // The original river overlaps the last bends beyond the tributary's
        // centre-line width. Preserve coverage of that connected wet footprint.
        const y=valleyWaterHeight(px,pz)??(pz>-132?WATER_LEVEL:null);
        return y!==null&&getTerrainHeight(px,pz)<y-.04&&valleyTrailSample(px,pz).distance>2.35;
      }));
      if(wet&&start===null)start=x;
      if(!wet&&start!==null){colliders.push({minX:start,maxX:x,minZ:z,maxZ:z+cell});start=null;}
    }
  }

  const rng=seededRandom(539),dummy=new THREE.Object3D(),color=new THREE.Color();
  const wood=new THREE.MeshStandardMaterial({color:0x786447,map:woodGrain(),roughness:.93});
  const wetStone=new THREE.MeshStandardMaterial({color:0x536556,roughness:.48});
  const bankRocks:THREE.Matrix4[]=[],fernMatrices:THREE.Matrix4[]=[];
  for(let i=0;i<420;i++) {
    const z=-228+rng()*117,sample=valleyWaterSample(40,z),x=40+(i%2?1:-1)*(sample.width+1.2+rng()*3.5),y=getTerrainHeight(x,z);
    if(valleyTrailSample(x,z).distance<4||isPath(x,z,1))continue;
    const waterY=valleyWaterHeight(x,z);if(waterY!==null&&y<waterY)continue;
    const slope=Math.hypot(getTerrainHeight(x+.7,z)-getTerrainHeight(x-.7,z),getTerrainHeight(x,z+.7)-getTerrainHeight(x,z-.7))/1.4;
    // These are shore stones and fern beds, not cladding scattered over the
    // vertical mountain. Broad height and slope tests also exclude cliff lips.
    const shore=valleyWaterSample(x,z);
    if(slope>.48||Math.abs(y-shore.height)>3.8)continue;
    const rockHeight=.2+rng()*.42;
    dummy.position.set(x,y-rockHeight*.45,z);dummy.rotation.set(rng()*.15,rng()*6.28,rng()*.1);dummy.scale.set(.45+rng()*1.3,rockHeight,.45+rng());dummy.updateMatrix();
    if(i%3===0)bankRocks.push(dummy.matrix.clone());
    else {dummy.position.y=y;dummy.scale.setScalar(.7+rng()*1.2);dummy.updateMatrix();fernMatrices.push(dummy.matrix.clone());}
  }
  const bankRockGeometry=new THREE.IcosahedronGeometry(1,1),rockPositions=bankRockGeometry.attributes.position;
  for(let i=0;i<rockPositions.count;i++) {
    const x=rockPositions.getX(i),y=rockPositions.getY(i),z=rockPositions.getZ(i);
    const variation=1+.16*Math.sin(x*7+z*4)*Math.cos(y*5);
    rockPositions.setXYZ(i,x*variation,y*(.92+.12*Math.sin(z*5)),z*variation);
  }
  bankRockGeometry.computeVertexNormals();
  const rocks=new THREE.InstancedMesh(bankRockGeometry,wetStone,bankRocks.length);rocks.name='wet-bank-rock-details';
  bankRocks.forEach((matrix,i)=>rocks.setMatrixAt(i,matrix));rocks.castShadow=true;rocks.receiveShadow=true;group.add(rocks);
  const frondVertices:number[]=[];
  for(let arm=0;arm<7;arm++)for(let k=0;k<5;k++)for(const side of [-1,1]){
    const a=arm*2.4,r=.09+k*.085,h=.13+Math.sin(k/5*Math.PI)*.18;
    const p=(along:number,width:number,height:number)=>frondVertices.push(Math.sin(a)*along+Math.cos(a)*width,height,Math.cos(a)*along-Math.sin(a)*width);
    p(r,0,h);p(r+.045,side*.085,h+.04);p(r+.09,0,h-.015);
  }
  const fernGeo=new THREE.BufferGeometry();fernGeo.setAttribute('position',new THREE.Float32BufferAttribute(frondVertices,3));fernGeo.computeVertexNormals();
  const ferns=new THREE.InstancedMesh(fernGeo,new THREE.MeshStandardMaterial({color:0x78864c,side:THREE.DoubleSide,roughness:.92}),fernMatrices.length);
  ferns.name='valley-moisture-ferns';fernMatrices.forEach((matrix,i)=>ferns.setMatrixAt(i,matrix));group.add(ferns);

  // Woodland occupies the shoulders and ridges; steep rock, water and every
  // mountain switchback are excluded before generating any tree geometry.
  const treePositions:Array<[number,number,number,number]>=[];
  for(let i=0;i<1200&&treePositions.length<140;i++) {
    const x=VALLEY.minX+8+rng()*(VALLEY.maxX-VALLEY.minX-16),z=-260+rng()*124,y=getTerrainHeight(x,z);
    const slope=Math.hypot(getTerrainHeight(x+.7,z)-getTerrainHeight(x-.7,z),getTerrainHeight(x,z+.7)-getTerrainHeight(x,z-.7))/1.4;
    const wet=valleyWaterSample(x,z);
    if(slope>.58||valleyTrailSample(x,z).distance<7||isPath(x,z,4)||wet.distance<wet.width+8||y<1)continue;
    if(treePositions.some(t=>Math.hypot(t[0]-x,t[2]-z)<6))continue;
    treePositions.push([x,y,z,1.2+rng()*1.4]);
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.17,.47,8,10,7).translate(0,4,0),wood,treePositions.length);trunks.name='valley-tree-trunks';
  const branchGeo=new THREE.CylinderGeometry(.045,.15,3.4,6).translate(0,1.7,0),branches=new THREE.InstancedMesh(branchGeo,wood,treePositions.length*3);
  const leafMaterial=new THREE.MeshStandardMaterial({color:0xffffff,map:createLeafTexture(),alphaTest:.42,alphaToCoverage:true,side:THREE.DoubleSide,roughness:1});
  leafMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uValleyWind=time;shader.vertexShader='uniform float uValleyWind;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 leafOrigin=instanceMatrix*vec4(0.,0.,0.,1.);transformed.x+=sin(uValleyWind*.7+leafOrigin.x*.13+leafOrigin.z*.09)*.16;`);
  };
  leafMaterial.customProgramCacheKey=()=> 'valley-canopy-wind';
  const spraysPerTree=160;
  const leaves=new THREE.InstancedMesh(new THREE.PlaneGeometry(2.5,2.5),leafMaterial,treePositions.length*spraysPerTree);leaves.name='valley-canopy-leaves';
  const trunkVertex=new THREE.Vector3(),trunkPosition=trunks.geometry.attributes.position;
  treePositions.forEach(([x,y,z,s],i)=>{
    dummy.position.set(x,y,z);dummy.scale.setScalar(s);dummy.rotation.set(0,rng()*6.28,0);dummy.updateMatrix();
    // A centre-only height leaves the downhill half of wide trunks floating.
    // Embed the actual rotated lower rim, preserving the existing tree seed.
    let rootY=y-.12;
    for(let vertex=0;vertex<trunkPosition.count;vertex++) {
      if(trunkPosition.getY(vertex)>.001)continue;
      trunkVertex.fromBufferAttribute(trunkPosition,vertex).applyMatrix4(dummy.matrix);
      rootY=Math.min(rootY,getTerrainHeight(trunkVertex.x,trunkVertex.z)-.12);
    }
    dummy.position.y=rootY;dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    colliders.push({minX:x-.47*s,maxX:x+.47*s,minZ:z-.47*s,maxZ:z+.47*s});
    for(let b=0;b<3;b++){dummy.position.set(x,rootY+4*s,z);dummy.rotation.set(0,b*2.4,.7);dummy.scale.setScalar(s);dummy.updateMatrix();branches.setMatrixAt(i*3+b,dummy.matrix);}
    for(let k=0;k<spraysPerTree;k++){
      const a=k*2.4,h=rng()*2-1,r=Math.sqrt(1-h*h)*(1+rng()*.35),lobe=k%3;
      dummy.position.set(x+Math.cos(a)*r*2.6*s+Math.sin(lobe*2.4)*s,rootY+(6.6+h*1.7+lobe*.45)*s,z+Math.sin(a)*r*2.5*s);
      dummy.rotation.set(rng()*Math.PI,rng()*6.28,rng()*Math.PI);dummy.scale.setScalar(s*(.55+rng()*.32));dummy.updateMatrix();
      // Interleaving ensures reduced quality still leaves foliage on every tree.
      const n=k*treePositions.length+i;leaves.setMatrixAt(n,dummy.matrix);leaves.setColorAt(n,color.setHex([0x73884b,0x617943,0x899556][lobe]).multiplyScalar(.82+rng()*.25));
    }
  });
  trunks.castShadow=branches.castShadow=leaves.castShadow=true;trunks.receiveShadow=true;group.add(trunks,branches,leaves);

  const railPieces:THREE.BufferGeometry[]=[],up=new THREE.Vector3(0,1,0);
  const beam=(a:THREE.Vector3,b:THREE.Vector3,r:number)=>{
    const delta=b.clone().sub(a),g=new THREE.CylinderGeometry(r*.8,r,delta.length(),7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,delta.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);railPieces.push(g);
  };
  // Only exposed outer edges get a low handrail. Posts touch the actual terrain;
  // there are no disconnected raised viewing decks or floating stairs.
  for(let i=1;i<VALLEY_TRAIL.length;i++) {
    if(i%3===0)continue;
    const a=VALLEY_TRAIL[i-1],b=VALLEY_TRAIL[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),n=Math.ceil(length/3.8);
    const startMiter=valleyTrailMiter(i-1),endMiter=valleyTrailMiter(i);
    let previous:THREE.Vector3|null=null;
    for(let k=0;k<=n;k++) {
      const t=k/n,x=a[0]+dx*t+(startMiter[0]+(endMiter[0]-startMiter[0])*t)*3.1,
        z=a[2]+dz*t+(startMiter[1]+(endMiter[1]-startMiter[1])*t)*3.1;
      if(valleyTrailSample(x,z).distance<2.8){previous=null;continue;}
      const y=getTerrainHeight(x,z),top=new THREE.Vector3(x,y+1.05,z);
      beam(new THREE.Vector3(x,y-.25,z),top,.065);if(previous&&previous.distanceTo(top)<5)beam(previous,top,.045);previous=top;
      colliders.push({minX:x-.08,maxX:x+.08,minZ:z-.08,maxZ:z+.08});
    }
  }
  const railGeo=mergeGeometries(railPieces,false);railPieces.forEach(g=>g.dispose());
  if(railGeo){const rail=new THREE.Mesh(railGeo,wood);rail.name='terrain-rooted-valley-handrails';rail.castShadow=true;group.add(rail);}
  const setQuality=(tier:QualityTier)=>{
    const fraction=tier==='low'?.38:tier==='medium'?.68:1;
    spray.points.geometry.setDrawRange(0,Math.floor(spray.count*fraction));mist.points.geometry.setDrawRange(0,Math.max(25,Math.floor(mist.count*fraction)));
    leaves.count=treePositions.length*(tier==='low'?80:tier==='medium'?120:spraysPerTree);
    ferns.count=Math.max(1,Math.floor(fernMatrices.length*(tier==='low'?.6:1)));
  };
  setQuality('high');return {group,colliders,animations,setQuality};
}
