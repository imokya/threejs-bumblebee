import * as THREE from 'three/webgpu';
import {uniform,positionWorld,vec3,vec4,mix,step,smoothstep,abs,fract,fwidth,max,min,normalize,cross,dFdx,dFdy,exp,texture,pass,materialColor,materialEmissive,reflector,textureBicubic,rangeFogFactor,uv} from 'three/tsl';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const $=id=>document.getElementById(id), reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={ready:false,progress:0,target:0,separation:0,explode:0,eyes:false};
const scan={from:uniform(0),to:uniform(0),height:uniform(4),active:uniform(0),elapsed:2,duration:2};
const scanBounds=new THREE.Box3(),partBounds=new THREE.Box3();
$('wireframe').onclick=()=>{
 if(scan.active.value)return;
 scan.from.value=scan.to.value;scan.to.value=1-scan.to.value;scan.elapsed=0;scan.active.value=1;
 $('wireframe').disabled=true;$('wireframe').setAttribute('aria-pressed',!!scan.to.value);
 $('wireframe').querySelector('i').textContent='SCANNING';
};
function updateScan(dt){
 if(!state.ready)return;
 if(scan.active.value){
  scan.elapsed=Math.min(scan.duration,scan.elapsed+(reduced?scan.duration:dt));
  scanBounds.makeEmpty();
  for(const p of parts)if(p.mesh.visible){partBounds.copy(p.mesh.geometry.boundingBox).applyMatrix4(p.mesh.matrixWorld);scanBounds.union(partBounds);}
  const t=scan.elapsed/scan.duration;
  scan.height.value=THREE.MathUtils.lerp(scanBounds.max.y+.12,scanBounds.min.y-.12,t);
  if(t===1){scan.active.value=0;scan.from.value=scan.to.value;$('wireframe').disabled=false;$('wireframe').querySelector('i').textContent=scan.to.value?'MESH':'SOLID';$('wireframe').setAttribute('aria-label',scan.to.value?'Scan back to solid materials':'Scan into wireframe view');}
 }
 for(const p of parts)p.wire.visible=scan.active.value===1||scan.to.value===1;
}
let renderer;
function fail(error){console.error(error);$('loading').classList.remove('finished');$('load-title').textContent='The guardian could not load.';$('load-status').textContent='Please reload the page. WebGL and a local web server are required.';$('retry').hidden=false;}
$('retry').onclick=()=>location.reload();
try{renderer=new THREE.WebGPURenderer({canvas:$('canvas'),antialias:true,powerPreference:'high-performance'});}catch(e){fail(e);throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
try{await renderer.init();}catch(e){fail(e);throw e;}
const scene=new THREE.Scene();scene.background=new THREE.Color('#090b0d');scene.fog=new THREE.Fog('#090b0d',12,25);
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();scene.environmentIntensity=.25;
const camera=new THREE.PerspectiveCamera(33,1,.03,50);camera.position.set(4,2.9,7.6);
const controls=new OrbitControls(camera,$('canvas'));controls.target.set(0,1.72,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=.6;controls.maxDistance=13;controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.65;
const key=new THREE.DirectionalLight('#fff0cf',2.2);key.position.set(-3,6,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=5;key.shadow.camera.bottom=-4;key.shadow.normalBias=.025;scene.add(key);
const rim=new THREE.DirectionalLight('#779fff',2);rim.position.set(3,4,-3);scene.add(rim);const fill=new THREE.DirectionalLight('#ffffff',.8);fill.position.set(1,3,5);scene.add(fill);scene.add(new THREE.HemisphereLight('#b8d4ff','#4c3418',.7));
// Roughness reflection: mipmapped planar reflection sampled with bicubic filtering.
const floorY=-.007;
const reflection=reflector({resolutionScale:.75,bounces:false,generateMipmaps:true});
reflection.target.rotation.x=-Math.PI/2;reflection.target.position.y=floorY;scene.add(reflection.target);
const perlin=await new THREE.TextureLoader().loadAsync('/textures/noises/perlin/rgb-256x256.png');
perlin.wrapS=perlin.wrapT=THREE.RepeatWrapping;perlin.colorSpace=THREE.SRGBColorSpace;
const floorRoughness=texture(perlin,uv().mul(30)).r.mul(2).saturate();
const floorMaterial=new THREE.MeshStandardNodeMaterial({transparent:true,metalness:1});
floorMaterial.roughnessNode=floorRoughness.mul(.2);
floorMaterial.colorNode=vec4(textureBicubic(reflection,floorRoughness.mul(.42)).rgb.mul(1.9),rangeFogFactor(12,30).oneMinus());
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),floorMaterial);
floor.rotation.x=-Math.PI/2;floor.position.y=floorY;scene.add(floor);

for(const radius of [2.1,2.15]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.003,6,160),new THREE.MeshBasicMaterial({color:'#8a692c'}));ring.rotation.x=Math.PI/2;ring.position.y=.002;scene.add(ring);}
const composer=new THREE.PostProcessing(renderer);composer.outputNode=pass(scene,camera).getTextureNode();
let focus=null,formCameraTimer=0;function home(){document.body.classList.remove('inspecting');$('inspection').hidden=true;focus={position:new THREE.Vector3(state.target?4:4,state.target?2.5:2.9,state.explode?10:state.target?6.5:7.6),target:new THREE.Vector3(0,state.target?.7:1.72,0)};}
controls.addEventListener('start',()=>{focus=null;controls.autoRotate=false;$('orbit').setAttribute('aria-pressed','false');$('orbit').querySelector('i').textContent='OFF';});
$('reset').onclick=home;$('close-inspection').onclick=home;$('inspect-back').onclick=home;
$('orbit').onclick=()=>{controls.autoRotate=!controls.autoRotate;focus=null;$('orbit').setAttribute('aria-pressed',controls.autoRotate);$('orbit').querySelector('i').textContent=controls.autoRotate?'ON':'OFF';};
$('lighting').onclick=()=>{const night=$('lighting').getAttribute('aria-pressed')!=='true';$('lighting').setAttribute('aria-pressed',night);$('lighting').querySelector('i').textContent=night?'MIDNIGHT':'STUDIO';key.intensity=night?.7:2.2;rim.intensity=night?3:2;fill.intensity=night?.25:.8;scene.environmentIntensity=night?.12:.25;};
$('eyes').onclick=()=>{state.eyes=!state.eyes;if(eyeGroup)eyeGroup.visible=state.eyes&&state.progress<.04;$('eyes').setAttribute('aria-pressed',state.eyes);$('eyes').querySelector('i').textContent=state.eyes?'ON':'OFF';};
function form(target){state.target=target;state.explode=0;document.body.classList.remove('inspecting');$('inspection').hidden=true;clearTimeout(formCameraTimer);if(target===1){focus=null;formCameraTimer=setTimeout(home,1100);}else home();}
$('robot').onclick=()=>form(0);$('vehicle').onclick=()=>form(1);$('transform').onclick=()=>form(1-state.target);
$('explode').onclick=()=>{state.explode=state.explode>.01?0:1;home();};$('separation').oninput=e=>{state.explode=Number(e.target.value)/100;};
const tint=uniform(new THREE.Color('#ffc43b')),tintAmount=uniform(0),colorStart=uniform(new THREE.Color('#ffc43b')),amountStart=uniform(0);
const colorProgress=uniform(0),colorHeight=uniform(4);
function finish(color,name){colorStart.value.copy(tint.value);amountStart.value=tintAmount.value;tint.value.set(color);tintAmount.value=name==='Racing yellow'?0:1;colorProgress.value=0;colorHeight.value=4;$('color-name').textContent=name;document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.name===name));}
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>finish(b.dataset.color,b.dataset.name));$('custom-color').oninput=e=>finish(e.target.value,'Custom finish');
let parts=[],spots=[],eyeGroup,modelRoot;const explodedBounds=new THREE.Box3(),explodedPartBounds=new THREE.Box3();const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),va=new THREE.Vector3(),vb=new THREE.Vector3();
function applyMotion(){const eased=state.progress*state.progress*(3-2*state.progress);const sample=(24+eased*90)/2,index=Math.floor(sample),alpha=sample-index;
 for(const part of parts){const a=part.frames[index],b=part.frames[Math.min(index+1,part.frames.length-1)];part.mesh.position.fromArray(a).lerp(vb.fromArray(b),alpha);qa.fromArray(a,3);qb.fromArray(b,3);part.mesh.quaternion.copy(qa.slerp(qb,alpha));part.mesh.visible=!!a[7];if(state.separation>.001){va.copy(part.center).applyQuaternion(part.mesh.quaternion).add(part.mesh.position);va.y-=state.progress>.5?.7:1.7;va.normalize().multiplyScalar(state.separation*.9);part.mesh.position.add(va);}}
 if(modelRoot){
 const scale=1-state.separation*.24;
 modelRoot.scale.setScalar(scale);modelRoot.position.y=0;
 if(state.separation>0){
 modelRoot.updateMatrixWorld(true);explodedBounds.makeEmpty();
 for(const p of parts)if(p.mesh.visible){explodedPartBounds.copy(p.mesh.geometry.boundingBox).applyMatrix4(p.mesh.matrixWorld);explodedBounds.union(explodedPartBounds);}
 modelRoot.position.y=Math.max(0,.025-explodedBounds.min.y);
 }
 }
 if(eyeGroup){const settled=Math.abs(state.progress-state.target)<.001;eyeGroup.visible=state.eyes&&state.progress<.04;for(const child of eyeGroup.children)if(child.isPointLight)child.intensity=state.eyes&&settled?.7:0;}
}
function addHotspot(name,title,copy,position){const mesh=parts.find(p=>p.mesh.name===name)?.mesh;if(!mesh)return;const local=mesh.worldToLocal(new THREE.Vector3(...position));const button=document.createElement('button');button.className='hotspot';button.textContent='+';button.dataset.label=title.toUpperCase();button.setAttribute('aria-label',`Inspect ${title}`);$('hotspots').append(button);const spot={mesh,local,button};spots.push(spot);button.onclick=()=>{const point=mesh.localToWorld(local.clone());const screen=point.clone().project(camera);const vw=$('viewport').clientWidth,vh=$('viewport').clientHeight,sx=(screen.x*.5+.5)*vw,sy=(-screen.y*.5+.5)*vh;const panelW=280,panelH=190;const shoulder=title.toLowerCase().includes('shoulder');let px=shoulder?vw-panelW-450:(screen.x>0?sx-panelW-28:sx+28);let py=sy-panelH*.5;px=Math.max(16,Math.min(vw-panelW-16,px));py=Math.max(80,Math.min(vh-panelH-24,py));$('inspection').style.left=`${px}px`;$('inspection').style.right='auto';$('inspection').style.top=`${py}px`;$('inspection').style.transform='none';$('inspection').classList.toggle('detail-left',screen.x>0);$('inspection').classList.toggle('detail-right',screen.x<=0);focus={position:point.clone().add(new THREE.Vector3(1.25,.35,3.15)),target:point};controls.autoRotate=false;document.body.classList.add('inspecting');$('inspection').hidden=false;$('inspect-title').textContent=title;$('inspect-copy').textContent=copy;};}
async function load(){const draco=new DRACOLoader();draco.setDecoderPath('/vendor/draco/');const loader=new GLTFLoader();loader.setDRACOLoader(draco);const [gltf,motion]=await Promise.all([loader.loadAsync('/assets/guardian.glb',e=>{$('load-progress').style.width=`${e.total?Math.min(95,e.loaded/e.total*95):45}%`;}),fetch('/assets/guardian-motion.json').then(r=>{if(!r.ok)throw Error('Motion data unavailable');return r.json();})]);
 modelRoot=gltf.scene;scene.add(modelRoot);gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;const frames=motion.parts[mesh.name];if(!frames)return;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.geometry.computeBoundingBox();parts.push({mesh,frames,center:mesh.geometry.boundingBox.getCenter(new THREE.Vector3())});const source=mesh.material;
 const mat=new THREE.MeshStandardNodeMaterial();
 for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','roughness','metalness','aoMapIntensity','side'])if(source[key]!==undefined)mat[key]=source[key];
 mat.color.copy(source.color);mat.emissive.copy(source.emissive);mat.normalScale.copy(source.normalScale);
 const base=materialColor.rgb;
 const mask=smoothstep(.035,.16,base.r.sub(base.b)).mul(smoothstep(.02,.12,base.g.sub(base.b))).mul(smoothstep(.07,.3,base.r));
 const band=smoothstep(colorHeight.sub(.28),colorHeight.add(.32),positionWorld.y).mul(colorProgress);
 mat.colorNode=mix(base,mix(colorStart,tint,band).mul(max(base.r,base.g)),mask.mul(mix(amountStart,tintAmount,band)));
 const region=mix(scan.from,scan.to,step(scan.height,positionWorld.y));
 mat.maskNode=region.lessThan(.5).or(scan.active.greaterThan(.5).and(abs(positionWorld.y.sub(scan.height)).lessThan(.035)));
 const laser=exp(positionWorld.y.sub(scan.height).div(.022).pow(2).negate()).mul(scan.active);
 mat.emissiveNode=materialEmissive.add(vec3(.15,5,9).mul(laser));
 mesh.material=mat;
 });
 {
 const grid=positionWorld.div(.055);
 const normal=normalize(cross(dFdx(positionWorld),dFdy(positionWorld)));
 const lines=abs(fract(grid.sub(.5)).sub(.5)).div(max(fwidth(grid),vec3(.0001))).add(step(vec3(.88),abs(normal)).mul(100));
 const line=smoothstep(.25,1.05,min(lines.x,min(lines.y,lines.z))).oneMinus();
 const region=mix(scan.from,scan.to,step(scan.height,positionWorld.y));
 const wireMat=new THREE.MeshBasicNodeMaterial({transparent:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false,forceSinglePass:true});
 wireMat.colorNode=vec3(.08,2.4,1.5);wireMat.opacityNode=line.mul(.16);wireMat.maskNode=region.greaterThan(.5).and(line.greaterThan(.01));
 for(const part of parts){part.wire=new THREE.Mesh(part.mesh.geometry,wireMat);part.wire.frustumCulled=false;part.wire.visible=false;part.wire.raycast=()=>{};part.mesh.add(part.wire);}
 }
 if(parts.filter(p=>p.mesh.name.startsWith('Original_robot')).length!==177)throw Error('Incomplete robot geometry');applyMotion();scene.updateMatrixWorld(true);
 const head=parts.find(p=>p.mesh.name==='Original_robot_3')?.mesh;if(head){eyeGroup=new THREE.Group();head.add(eyeGroup);for(const x of [-.074,.074]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.019,16,12),new THREE.MeshBasicMaterial({color:new THREE.Color(.2,3,7),toneMapped:false}));eye.position.copy(head.worldToLocal(new THREE.Vector3(x,3.31,.32)));eye.scale.set(1,.8,.5);eyeGroup.add(eye);const glow=new THREE.PointLight(0x35aaff,.7,.5,2);glow.position.copy(eye.position);glow.position.z+=.04;eyeGroup.add(glow);}eyeGroup.visible=false;}
 addHotspot('Original_robot_3','Optical core','A familiar blue gaze. Activate the optics to bring the guardian to life.',[0,3.31,.28]);addHotspot('Original_robot_23','Chest armor','The signature vintage bodywork becomes the guardian’s protective chest armor.',[0,2.7,.4]);addHotspot('Original_robot_1','Shoulder assembly','Explore the layered armor and mechanical components in exploded view.',[.64,2.91,.06]);
 // Compile hidden vehicle components before the first transformation.
 const visibility=parts.map(p=>p.mesh.visible);
 for(const p of parts){p.mesh.visible=true;p.wire.visible=true;}
 await renderer.compileAsync(scene,camera);
 parts.forEach((p,i)=>{p.mesh.visible=visibility[i];p.wire.visible=false;});
 state.ready=true;for(const id of ['robot','vehicle','transform','explode','separation','eyes','wireframe'])$(id).disabled=false;$('load-progress').style.width='100%';$('loading').classList.add('finished');draco.dispose();window.__exhibit={state,parts:parts.length};}
function resize(){const w=$('viewport').clientWidth,h=$('viewport').clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.clearViewOffset();camera.updateProjectionMatrix();}new ResizeObserver(resize).observe($('viewport'));resize();
let last=performance.now();function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.05);last=now;if(state.ready){colorProgress.value=Math.min(1,colorProgress.value+dt/.9);const colorEase=colorProgress.value*colorProgress.value*(3-2*colorProgress.value);colorHeight.value=THREE.MathUtils.lerp(4,-.05,colorEase);state.separation=THREE.MathUtils.damp(state.separation,state.explode,7,dt);if(Math.abs(state.separation-state.explode)<.001)state.separation=state.explode;if(state.separation<.01&&state.progress!==state.target)state.progress=THREE.MathUtils.clamp(state.progress+Math.sign(state.target-state.progress)*Math.min(dt/2.65,Math.abs(state.target-state.progress)),0,1);applyMotion();const moving=Math.abs(state.progress-state.target)>.001;for(const [id,value]of [['robot',0],['vehicle',1]])$(id).setAttribute('aria-pressed',state.target===value);$('transform-label').textContent=state.target?'Transform to robot':'Transform to vehicle';$('explode').disabled=moving;$('separation').disabled=moving;$('eyes').disabled=state.progress>.04;$('explode').setAttribute('aria-pressed',state.explode>.01);$('assembly-label').textContent=state.explode>.01?'Reassemble':'Exploded view';$('separation').value=Math.round(state.separation*100);$('separation-value').textContent=`${Math.round(state.separation*100)}%`;$('status').textContent=moving?'TRANSFORMATION IN PROGRESS':state.separation>.01?'COMPONENT EXPLORATION':state.target?'VEHICLE SYSTEMS READY':'GUARDIAN SYSTEMS READY';$('sequence-label').textContent=moving?'MECHANICAL SEQUENCE':state.target?'VEHICLE STANDBY':'GUARDIAN STANDBY';$('sequence-progress').style.width=`${state.progress*100}%`;$('sequence-number').textContent=`${String(Math.round(state.progress*100)).padStart(2,'0')} / 100`;$('form-index').textContent=state.target?'02 / VEHICLE FORM':'01 / ROBOT FORM';$('part-count').textContent=state.target?'VEHICLE CONFIGURATION':'177 ORIGINAL ROBOT COMPONENTS';}
 if(focus){const t=reduced?1:1-Math.exp(-dt*5);camera.position.lerp(focus.position,t);controls.target.lerp(focus.target,t);if(camera.position.distanceTo(focus.position)<.005)focus=null;}controls.update();scene.updateMatrixWorld(true);updateScan(dt);for(const spot of spots){const p=spot.mesh.localToWorld(spot.local.clone()).project(camera);spot.button.hidden=state.progress>.01||state.separation>.01||p.z>1||camera.position.z<0;spot.button.style.left=`${(p.x*.5+.5)*$('viewport').clientWidth}px`;spot.button.style.top=`${(-p.y*.5+.5)*$('viewport').clientHeight}px`;}if(state.ready)composer.render();}requestAnimationFrame(tick);load().catch(fail);
$('canvas').addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('WebGL context lost'));});
