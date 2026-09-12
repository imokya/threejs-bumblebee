import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const $=id=>document.getElementById(id),view=$('viewport'),mobile=()=>view.clientWidth<761;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true,powerPreference:'high-performance'});}catch(e){fail('无法启动 3D，请开启浏览器硬件加速后重试。');throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.background=new THREE.Color('#0c0d10');scene.fog=new THREE.Fog('#0c0d10',12,32);
const camera=new THREE.PerspectiveCamera(34,1,.03,80);camera.position.set(4.1,2.9,7.1);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.075;orbit.target.set(0,1.7,0);orbit.minDistance=.65;orbit.maxDistance=14;orbit.maxPolarAngle=Math.PI*.49;orbit.autoRotateSpeed=.55;orbit.enablePan=false;
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.05).texture;room.dispose();pmrem.dispose();
const key=new THREE.DirectionalLight('#fff0d5',3.2);key.position.set(-3,6,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=5;key.shadow.camera.bottom=-3;key.shadow.normalBias=.025;key.shadow.bias=-.0002;scene.add(key);
const rim=new THREE.DirectionalLight('#88aaff',2.4);rim.position.set(3,4,-3);scene.add(rim);
const fill=new THREE.DirectionalLight('#ffffff',.75);fill.position.set(3,2,5);scene.add(fill);scene.add(new THREE.HemisphereLight('#c6d0e1','#171619',.45));
const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#101216',metalness:.55,roughness:.38}));ground.rotation.x=-Math.PI/2;ground.position.y=-.047;ground.receiveShadow=true;scene.add(ground);
for(const [r,color]of [[2.25,'#6c613d'],[2.3,'#242932']]){let ring=new THREE.Mesh(new THREE.TorusGeometry(r,.004,6,160),new THREE.MeshBasicMaterial({color}));ring.rotation.x=-Math.PI/2;ring.position.y=-.042;scene.add(ring);}
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(800,600),.24,.4,2);composer.addPass(bloom);composer.addPass(new OutputPass());
function resize(){const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(view);resize();
let ready=false,t=0,target=0,explosion=0,explodeTarget=0,eyes=false,annotations=true,focus=null,camTween=null,last=performance.now(),motion={},parts=[],nodes={},eyeGroup;
const tint={value:new THREE.Color('#efb920')},tintStrength={value:0},v=new THREE.Vector3(),q=new THREE.Quaternion(),projected=new THREE.Vector3();
const spots=[
 {id:'optics',label:'光学传感器',code:'01 / OPTICS',part:'R_tripo_part_3',p:[0,3.31,.28],distance:1.05,copy:'蓝色光学组件与多层面部装甲。点亮眼睛，观察镜片的发光与金属边缘。'},
 {id:'chest',label:'胸部装甲',code:'02 / ARMOR',p:[0,2.76,.4],distance:1.8,copy:'经典圆形车灯融入胸甲。靠近观察车漆、护杠与装甲接缝。'},
 {id:'shoulder',label:'肩部关节',code:'03 / JOINT',part:'R_tripo_part_1',p:[.64,2.91,.06],distance:1.35,copy:'外侧护甲包裹肩部机械结构。开启部件拆分，查看原有分件的相对位置。'},
 {id:'hand',label:'机械手臂',code:'04 / MANIPULATOR',part:'R_tripo_part_8',p:[.82,1.92,.13],distance:1.6,copy:'多层前臂护板与机械指节。拖动视角，探索内外侧的不同细节。'},
 {id:'leg',label:'行走机构',code:'05 / MOBILITY',part:'R_tripo_part_10',p:[.36,.93,.17],distance:1.85,copy:'小腿装甲、轮组与踝部结构。原始部件在拆分模式下向外展开。'}
];
function pressed(id,on){$(id).setAttribute('aria-pressed',String(on));}
function ui(){const car=target===1,moving=Math.abs(t-target)>.002;$('transform-text').textContent=car?'变形为人形':'变形为汽车';$('mode-name').textContent=car?'经典甲壳虫 · 汽车':'守护者 · 人形';$('part-count').textContent=car?'92 PARTS':'177 PARTS';$('robot-mode').classList.toggle('selected',!car);$('car-mode').classList.toggle('selected',car);$('eyes').disabled=!ready||t>.02||moving;$('explode').disabled=!ready||moving;pressed('eyes',eyes);pressed('explode',explodeTarget>0);pressed('rotate',orbit.autoRotate);}
function panorama(){focus=null;$('detail').hidden=true;spots.forEach(s=>s.el?.classList.remove('active'));const k=target;moveCamera(new THREE.Vector3(mobile()?4.7:4.1,2.9-k*.7,mobile()?8.2:7.1),new THREE.Vector3(0,1.7-k*.85,0),.85);}
function moveCamera(pos,look,duration=1){camTween={start:performance.now(),duration:reduced?.01:duration,p0:camera.position.clone(),p1:pos,t0:orbit.target.clone(),t1:look};orbit.autoRotate=false;pressed('rotate',false);}
function setMode(mode){if(!ready)return;target=mode==='car'?1:0;explodeTarget=0;panorama();ui();}
$('transform').onclick=()=>setMode(target?'robot':'car');$('robot-mode').onclick=()=>setMode('robot');$('car-mode').onclick=()=>setMode('car');
$('eyes').onclick=()=>{eyes=!eyes;ui();};$('explode').onclick=()=>{explodeTarget=explodeTarget?0:1;panorama();if(explodeTarget)moveCamera(new THREE.Vector3(5.6,3.6,9.4),new THREE.Vector3(0,1.7-target*.8,0));ui();};
$('rotate').onclick=()=>{camTween=null;orbit.autoRotate=!orbit.autoRotate;pressed('rotate',orbit.autoRotate);};$('reset').onclick=()=>{explodeTarget=0;panorama();ui();};$('close-detail').onclick=$('back-view').onclick=panorama;
$('annotations').onclick=()=>{annotations=!annotations;pressed('annotations',annotations);$('annotations').querySelector('i').textContent=annotations?'ON':'OFF';};
$('roughness').oninput=e=>{let r=Number(e.target.value)/100;$('rough-label').textContent=r<.25?'镜面':r>.5?'磨砂':'缎面';parts.forEach(o=>o.material.roughness=r);};
$('light').oninput=e=>{const x=Number(e.target.value);$('light-label').textContent=x+'%';renderer.toneMappingExposure=.5+x/136;key.intensity=1+x/34;};
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{tint.value.set(b.dataset.color);tintStrength.value=b.dataset.name==='竞速黄'?0:1;$('color-name').textContent=b.dataset.name;document.querySelectorAll('[data-color]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
orbit.addEventListener('start',()=>{camTween=null;orbit.autoRotate=false;pressed('rotate',false);});
function fail(message){$('load-title').textContent='展厅暂未就绪';$('load-status').textContent=message;$('retry').hidden=false;$('retry').onclick=()=>location.reload();}
function addTint(m){m.onBeforeCompile=shader=>{shader.uniforms.armorColor=tint;shader.uniforms.armorMix=tintStrength;shader.fragmentShader='uniform vec3 armorColor;\nuniform float armorMix;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float maskYellow=smoothstep(0.035,0.16,diffuseColor.r-diffuseColor.b)*smoothstep(0.02,0.12,diffuseColor.g-diffuseColor.b)*smoothstep(0.07,0.3,diffuseColor.r);
 float brightness=max(diffuseColor.r,diffuseColor.g);
 diffuseColor.rgb=mix(diffuseColor.rgb,armorColor*brightness,maskYellow*armorMix);
 `);};m.customProgramCacheKey=()=> 'armor-tint-v1';}
async function load(){try{
 const draco=new DRACOLoader();draco.setDecoderPath('/vendor/draco/');draco.setWorkerLimit(2);const loader=new GLTFLoader().setDRACOLoader(draco);
 const [data,gltf]=await Promise.all([fetch('/assets/exhibit-motion.json').then(r=>{if(!r.ok)throw Error('motion');return r.json();}),loader.loadAsync('/assets/exhibit.glb',e=>{let n=e.total?Math.round(e.loaded/e.total*100):0;$('load-status').textContent=n===100?'解析机械部件…':'载入模型与材质 · '+n+'%';$('load-bar').style.width=n+'%';})]);motion=data;scene.add(gltf.scene);
 gltf.scene.traverse(o=>{if(!o.isMesh||!motion[o.name])return;nodes[o.name]=o;parts.push(o);o.castShadow=true;o.receiveShadow=true;o.material=o.material.clone();o.material.metalness=.65;o.material.roughness=.32;o.material.envMapIntensity=.72;addTint(o.material);if(o.material.map)o.material.map.anisotropy=4;o.geometry.computeBoundingBox();o.userData.center=o.geometry.boundingBox.getCenter(new THREE.Vector3());const frame=motion[o.name][o.name.startsWith('R_')?0:96];const mat=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(frame.p),new THREE.Quaternion().fromArray(frame.q),new THREE.Vector3().fromArray(frame.s));const center=o.userData.center.clone().applyMatrix4(mat);const dir=center.clone().sub(new THREE.Vector3(0,o.name.startsWith('R_')?1.65:.65,0));if(dir.length()<.1)dir.set(0,1,0);dir.normalize();dir.y=Math.max(.08,dir.y);o.userData.explode=dir.multiplyScalar(.65+Math.min(center.length(),3)*.12);});
 if(parts.length!==269)throw Error('incomplete meshes '+parts.length);
 applyMotion();scene.updateMatrixWorld(true);
 for(const s of spots){s.point=new THREE.Vector3(...s.p);if(!s.part){let closest=Infinity;for(const o of parts.filter(o=>o.name.startsWith('R_'))){let c=o.userData.center.clone().applyMatrix4(o.matrixWorld);if(c.distanceTo(s.point)<closest){closest=c.distanceTo(s.point);s.part=o.name;}}}s.node=nodes[s.part];s.local=s.node.worldToLocal(s.point.clone());s.el=document.createElement('button');s.el.className='hotspot';s.el.textContent='+';s.el.dataset.label=s.label;s.el.setAttribute('aria-label','聚焦'+s.label);s.el.onclick=()=>focusSpot(s);$('hotspots').appendChild(s.el);}
 const head=nodes.R_tripo_part_3;eyeGroup=new THREE.Group();head.add(eyeGroup);
 for(const x of [-.074,.072]){let world=new THREE.Vector3(x,3.31,.278);let local=head.worldToLocal(world);const lens=new THREE.Mesh(new THREE.SphereGeometry(.022,20,12),new THREE.MeshBasicMaterial({color:new THREE.Color(.2,3.8,8)}));lens.position.copy(local);lens.scale.set(1,.8,.45);eyeGroup.add(lens);const light=new THREE.PointLight('#47baff',.7,.4,2);light.position.copy(local).add(new THREE.Vector3(0,0,.04));eyeGroup.add(light);}eyeGroup.visible=false;
 ready=true;['transform','robot-mode','car-mode','eyes','explode'].forEach(id=>$(id).disabled=false);$('loading').classList.add('finished');$('loading').setAttribute('aria-hidden','true');if(mobile())panorama();ui();draco.dispose();
 }catch(e){console.error(e);fail('模型载入失败，请刷新重试。');}}
function focusSpot(s){if(!ready||t>.02)return;focus=s.id;$('detail').hidden=false;$('detail-index').textContent=s.code;$('detail-title').textContent=s.label;$('detail-copy').textContent=s.copy;spots.forEach(x=>x.el.classList.toggle('active',x===s));const point=s.node.localToWorld(s.local.clone());const offset=new THREE.Vector3(.32,.14,1).normalize().multiplyScalar(s.distance);moveCamera(point.clone().add(offset),point,1.1);}
function applyMotion(){const frame=t*96,lo=Math.floor(frame),hi=Math.min(96,lo+1),f=frame-lo;for(const o of parts){const a=motion[o.name][lo],b=motion[o.name][hi];o.position.fromArray(a.p).lerp(v.fromArray(b.p),f);o.quaternion.fromArray(a.q).slerp(q.fromArray(b.q),f);o.scale.fromArray(a.s).lerp(v.fromArray(b.s),f);let alpha=THREE.MathUtils.lerp(a.a,b.a,f);o.visible=alpha>.008;if(!o.visible)continue;o.material.opacity=alpha;const trans=alpha<.995;if(o.material.transparent!==trans){o.material.transparent=trans;o.material.depthWrite=!trans;o.material.needsUpdate=true;}o.position.addScaledVector(o.userData.explode,explosion);}}
function animate(now){requestAnimationFrame(animate);let dt=Math.min((now-last)/1000,.05);last=now;if(ready){let step=dt/3;t+=Math.sign(target-t)*Math.min(Math.abs(target-t),step);explosion=THREE.MathUtils.damp(explosion,explodeTarget,6,dt);applyMotion();eyeGroup.visible=eyes&&t<.1;const moving=Math.abs(t-target)>.001;$('progress').style.width=(t*100)+'%';$('status').textContent=moving?(target?'变形中 · 汽车':'变形中 · 人形'):explosion>.1?'独立部件 · 展开视图':focus?'细节聚焦 · 拖动探索':'实时展品 · 自由探索';$('phase').textContent=moving?'TRANSFORMING':t>.99?'VEHICLE MODE':'ROBOT MODE';$('eyes').disabled=t>.02||moving;$('explode').disabled=moving;
 scene.updateMatrixWorld(true);for(const s of spots){const world=s.node.localToWorld(s.local.clone());projected.copy(world).project(camera);const show=annotations&&t<.02&&explosion<.05&&projected.z<1&&projected.z>-1&&camera.position.z>-.3;s.el.hidden=!show;if(show){s.el.style.left=((projected.x*.5+.5)*view.clientWidth)+'px';s.el.style.top=((-projected.y*.5+.5)*view.clientHeight)+'px';}}
 }
 if(camTween){const k=Math.min(1,(now-camTween.start)/(camTween.duration*1000)),e=k*k*(3-2*k);camera.position.lerpVectors(camTween.p0,camTween.p1,e);orbit.target.lerpVectors(camTween.t0,camTween.t1,e);if(k===1)camTween=null;}orbit.update();composer.render();}
load();requestAnimationFrame(animate);
window.bee={getState:()=>({ready,progress:t,target,eyes,explosion,explodeTarget,focus,parts:parts.length,color:$('color-name').textContent,position:camera.position.toArray(),cameraTarget:orbit.target.toArray()}),setMode,focusPart:id=>{const s=spots.find(s=>s.id===id);if(s)focusSpot(s);}};
