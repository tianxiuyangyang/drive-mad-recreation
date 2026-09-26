import * as THREE from './vendor/three.module.js';
import { COURSE } from './physics.mjs';

const color = value => new THREE.Color(value);
const palettes = new Map();
function materials(hex) {
  if (palettes.has(hex)) return palettes.get(hex);
  const c = color(hex);
  const list = [0.92, 0.71, 1.18, 0.56, 1, 0.84].map(k => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(k) }));
  palettes.set(hex, list);
  return list;
}
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
function block(parent, x, y, z, width, height, depth, hex, custom) {
  const mesh = new THREE.Mesh(cubeGeometry, custom || materials(hex));
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  parent.add(mesh);
  return mesh;
}
let seed = 8675309;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const mix = THREE.MathUtils.lerp;
function groundY(points, x) {
  if (points.length && Array.isArray(points[0])) {
    for (const part of points) {
      if (x >= part[0].x && x <= part[part.length - 1].x) return groundY(part, x);
    }
    return 0;
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x <= b.x) return mix(a.y, b.y, THREE.MathUtils.clamp((x - a.x) / (b.x - a.x), 0, 1));
  }
  return 0;
}

function pixelTexture(type, variant = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d');
  if (type === 'wood') {
    c.fillStyle = ['#bb7983', '#b9737f', '#b77580'][variant % 3]; c.fillRect(0, 0, 64, 64);
    const colors = ['#a96676','#c7898e','#d09396','#ac6a79'];
    for (let i = 0; i < 17; i++) {
      c.fillStyle = colors[i % colors.length];
      const x = Math.floor(random() * 16) * 4, y = Math.floor(random() * 16) * 4;
      c.fillRect(x, y, 4 + Math.floor(random() * 2) * 4, 4 + Math.floor(random() * 2) * 4);
    }
    c.fillStyle = '#935465'; c.fillRect(0,0,64,3); c.fillRect(0,61,64,3);
    c.fillStyle = '#d79999'; c.fillRect(0,3,64,3);
    c.fillStyle = '#955a69'; for(const x of [9,50]) for (const y of [10,51]) c.fillRect(x,y,4,4);
  } else {
    c.fillStyle = '#ffd4bd'; c.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 8; i++) { c.fillStyle = i%2 ? '#f4b4a6' : '#f7c2af'; c.fillRect(Math.floor(random()*15)*4,Math.floor(random()*15)*4,4,4); }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function polygon(parent, points, hex, depth = 0.12) {
  const shape = new THREE.Shape();
  points.forEach((p, i) => i ? shape.lineTo(...p) : shape.moveTo(...p));
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), materials(hex));
  parent.add(mesh);
  return mesh;
}

export class SceneView {
  constructor(canvas, course = COURSE) {
    this.canvas = canvas;
    this.course = course;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#60d4f3');
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 160);
    this.cameraOffset = new THREE.Vector3(-7, 9.2, 18);
    this.focus = new THREE.Vector3(1.8, 2.1, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.scenery = new THREE.Group(); this.scene.add(this.scenery);
    this.particles = [];
    this.clock = 0;
    this.lastX = 0;
    this.followX = 0;
    this.shake = 0;
    this.createBackground();
    this.createCourse();
    this.createCar();
    this.resize();
  }

  setLevel(course = COURSE) {
    this.course = course;
    this.world.clear();
    this.scenery.clear();
    this.createBackground();
    this.createCourse();
    this.createCar();
    this.reset();
  }

  createBackground() {
    // The original's scenery consists of deliberately broad, flat blue facets.
    const mountainData = [
      [-12, -6, -10, 10, 8.5, '#0089e9'], [-2, -6, -10, 7.5, 6.5, '#0088e6'],
      [9.5, -6, -13, 12, 10.7, '#0094f0'], [19, -6, -15, 12, 13.5, '#0076db'],
      [30, -6, -13, 13, 9.5, '#008ced'], [44, -6, -13, 10, 14.5, '#0079dc'],
      [57, -6, -14, 14, 11.5, '#008eef'], [72, -6, -15, 16, 13, '#0078db'],
      [89, -6, -16, 18, 10, '#008ce9'],
    ];
    mountainData.forEach(([x,y,z,w,h,c],i) => {
      const g = new THREE.Group();g.position.set(x,y,z);this.scenery.add(g);
      const shape = i % 2 ? [[-w/2,0],[-w/2, h*.75],[-w*.2,h],[w*.25,h*.9],[w/2,0]] : [[-w/2,0],[-w*.34,h*.65],[w*.05,h],[w*.30,h*.83],[w/2,0]];
      polygon(g, shape, c, 3);
      const facet = polygon(g, [[shape[2][0],h],[w/2,0],[w*.10,0],[-w*.17,h*.78]], '#0083e5',.015);
      facet.position.z = 3.02;
    });
    for(const [x,y,z,w] of [[-5,4.8,-16,7],[11,7,-18,5],[31,5.5,-19,9],[52,7,-16,6]]) {
      const cloud = new THREE.Group();cloud.position.set(x,y,z);this.scenery.add(cloud);
      block(cloud,0,0,0,w,.42,1.3,'#ffffff');
      block(cloud,-w*.17,.3,-.08,w*.48,.45,1.05,'#ffffff');
    }
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(220,70),new THREE.MeshBasicMaterial({color:'#00bde7'}));
    this.water.rotation.x=-Math.PI/2;this.water.position.set(25,-2.1,29);this.world.add(this.water);
    const blue = new THREE.MeshBasicMaterial({color:'#009dfa'});
    for(const [z,w] of [[4.9,1.8],[8.9,5],[18,6],[-5,3]]){
      const stripe=new THREE.Mesh(new THREE.PlaneGeometry(220,w),blue);stripe.rotation.x=-Math.PI/2;stripe.position.set(25,-2.095,z);this.world.add(stripe);
    }
    this.ripples=[];
    for(const z of [-4.3,4.0,8.4,14.5]) {
      const points=[];for(let x=-60;x<120;x+=3)points.push(new THREE.Vector3(x,-2.086,z+Math.sin(x*.22)*.075));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#e3fbff',transparent:true,opacity:.88}));
      this.world.add(line);this.ripples.push(line);
    }
  }

  createCourse() {
    if (this.course.id !== 1) return this.createChallengeCourse();
    this.island(-4,5);
    this.island(this.course.bridge.endX, this.course.maxX);
    const plankMaps = [0,1,2].map(n=>pixelTexture('wood',n));
    const mats = plankMaps.map(map=>[
      new THREE.MeshBasicMaterial({color:'#a65f71'}),new THREE.MeshBasicMaterial({color:'#a05c70'}),
      new THREE.MeshBasicMaterial({map}),new THREE.MeshBasicMaterial({color:'#98536a'}),
      new THREE.MeshBasicMaterial({color:'#fbd0b4'}),new THREE.MeshBasicMaterial({color:'#c2868a'})]);
    const t = this.course.terrain;
    for (let i=1;i<t.length;i++){
      const a=t[i-1],b=t[i]; if(a.x<5||b.x>26)continue;
      const length=Math.hypot(b.x-a.x,b.y-a.y);
      const count=Math.ceil(length/.92);
      for(let n=0;n<count;n++){
        const f=(n+.5)/count,group=new THREE.Group();group.position.set(mix(a.x,b.x,f),mix(a.y,b.y,f)-.12,0);group.rotation.z=Math.atan2(b.y-a.y,b.x-a.x);this.world.add(group);
        block(group,0,0,0,length/count-.035,.23,2.85,'#b87883',mats[(i+n)%3]);
        block(group,0,-.015,1.435,length/count-.04,.12,.015,'#f7cbb0');
      }
    }
    // Upright trestles appear below the gentle wooden bridge.
    for(let x=5.5;x<26;x+=2.3){
      const y=groundY(this.course.terrain,x);const h=y+2.08;
      block(this.world,x,y-h/2-.15,-1.06,.19,h,.19,'#bd7784');
      block(this.world,x,y-h/2-.15,1.06,.19,h,.19,'#bc7581');
      block(this.world,x,y-.36,0,.27,.22,2.92,'#a85e73');
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.26,h*.53),new THREE.MeshBasicMaterial({color:'#008fd1',transparent:true,opacity:.32}));
      shadow.rotation.x=-Math.PI/2;shadow.rotation.z=-.5;shadow.position.set(x+.65,-2.075,1.6);this.world.add(shadow);
    }
    this.makeArrow(3.35,.02,-1.55);
    this.makeStartRail(-3.3);
    this.makeFinish();
  }

  createChallengeCourse() {
    const parts = this.course.terrainParts || [this.course.terrain];
    const t = this.course.terrain;
    const min = t[0].x, max = t[t.length - 1].x;
    // Each terrain segment is rendered as a thick, grass-topped voxel ramp.
    // This keeps the visual surface aligned with the exact Planck chain.
    for (const terrain of parts) for (let i = 1; i < terrain.length; i++) {
      const a = terrain[i - 1], b = terrain[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const group = new THREE.Group();
      group.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - .22, 0);
      group.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      this.world.add(group);
      block(group, 0, 0, 0, length + .04, .44, 2.85, '#ffd4be');
      block(group, 0, .23, 0, length + .05, .13, 2.86, '#48c441');
      block(group, 0, .31, 1.44, length, .08, .035, '#6bd84c');
    }
    // Extra soil pillars make the floating ramp sections read clearly above water.
    for (const point of t) {
      const h = Math.max(.2, point.y + 1.45);
      block(this.world, point.x, point.y - h / 2 - .08, 0, .35, h, 2.78, '#bd7784');
    }
    const windmillConfigs = this.course.windmills || (this.course.windmill ? [this.course.windmill] : []);
    this.windmillVisuals = windmillConfigs.map(config => this.createWindmill(config));
    this.makeStartRail(this.course.startX - 3.3);
    this.makeFinish();
    this.makeArrow(this.course.finishX - 2.4, 0, -1.55);
    this.island(min - .3, min + 2.8);
    this.island(max - 2.8, max + .3);
  }

  createWindmill(config) {
    const {x, y, halfLength} = config;
    const rig = new THREE.Group();
    rig.position.set(x, y, 0);
    this.world.add(rig);
    block(rig, 0, -2.15, 0, .55, 4.3, .55, '#6e5964');
    block(rig, 0, -4.25, 0, 1.25, .22, 1.25, '#a97079');
    const hub = new THREE.Group();
    // The visual hub shares the exact center used by the physics body.
    hub.position.y = 0;
    rig.add(hub);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(halfLength * .92, halfLength * .92, .16, 32),
      new THREE.MeshBasicMaterial({ color: '#d67b82', transparent: true, opacity: .28, depthWrite: false }),
    );
    disc.rotation.x = Math.PI / 2;
    disc.position.z = -.38;
    hub.add(disc);
    block(hub, 0, 0, 0, .72, .72, .72, '#f4c935');
    const armMaterials = ['#c36d76', '#d88b80', '#b95e70', '#e3a092'];
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = i * Math.PI / 2;
      hub.add(arm);
      block(arm, halfLength / 2, 0, 0, halfLength, .28, .62, armMaterials[i]);
      block(arm, halfLength - .7, .16, 0, 1.4, .22, .88, '#f4c35a');
      block(arm, halfLength - .7, -.16, 0, 1.4, .16, .88, '#9d5c6d');
    }
    return hub;
  }

  island(from,to){
    const width=to-from,center=(from+to)/2,depth=2.85;
    const soilMap=pixelTexture('soil');soilMap.wrapS=THREE.RepeatWrapping;soilMap.repeat.set(width/3,1);
    const soilMaterials=[new THREE.MeshBasicMaterial({color:'#ffd4be'}),new THREE.MeshBasicMaterial({color:'#ad6a79'}),new THREE.MeshBasicMaterial({color:'#53c542'}),new THREE.MeshBasicMaterial({color:'#c88086'}),new THREE.MeshBasicMaterial({map:soilMap}),new THREE.MeshBasicMaterial({color:'#e6ad9e'})];
    block(this.world,center,-.91,0,width,1.68,depth,'#ffd4be',soilMaterials);
    block(this.world,center,-.045,0,width,.14,depth,'#46c641',[
      new THREE.MeshBasicMaterial({color:'#42b837'}),new THREE.MeshBasicMaterial({color:'#3dad36'}),new THREE.MeshBasicMaterial({color:'#46cb40'}),new THREE.MeshBasicMaterial({color:'#3aaf39'}),new THREE.MeshBasicMaterial({color:'#3ab73b'}),new THREE.MeshBasicMaterial({color:'#43bd3b'})]);
    for(let x=from+.12;x<to;x+=.2)block(this.world,x,-.16,depth/2+.014,.072,.23,.04,'#49c43e');
    // Pixel weeds are placed on the surface; no texture filtering softens them.
    for(let n=0;n<width*8;n++){
      const x=from+.1+random()*(width-.2),z=(random()-.5)*2.5,s=.05+Math.floor(random()*3)*.045;
      block(this.world,x,.033,z,s,.009,s*.75,n%4===0?'#bbdf5a':n%3===0?'#8bdc4d':'#68d447');
      if(n%3===0)block(this.world,x+s*.6,.034,z+s*.6,s*.65,.009,s*.65,'#8fe250');
    }
    for(const x of [from,to]){
      block(this.world,x,-.8,0,.75,1.8,depth+.055,'#b5757f');
      for(const z of [-1,0,1])block(this.world,x+.39,-.92,z,.02,.9,.08,'#a96878');
      // Square end-grain motif on the near face of each bridge anchor.
      const z=depth/2+.035;
      block(this.world,x,-.40,z,.56,.62,.016,'#fac9ae');
      block(this.world,x,-.40,z+.013,.39,.44,.016,'#b87b83');
      block(this.world,x,-.40,z+.026,.21,.25,.016,'#f9c9af');
      for(let n=0;n<20;n++){
        block(this.world,x+(random()-.5)*.7,-1.6+random()*1.3,z+.012,.075,.075,.01,n%2?'#ce9292':'#a56375');
      }
    }
  }

  makeStartRail(x){
    const rail=new THREE.Group();rail.position.x=x;this.world.add(rail);
    block(rail,0,.61,-1.25,.17,1.28,.17,'#bd7c89');
    block(rail,0,.61,1.25,.17,1.28,.17,'#bd7c89');
    block(rail,0,1.27,0,.20,.19,2.67,'#c98b95');
  }

  makeArrow(x,y,z){
    const sign=new THREE.Group();sign.position.set(x,y,z);this.world.add(sign);
    block(sign,0,1.12,0,.19,2.24,.18,'#bb7785');
    const arrow=polygon(sign,[[-.95,1.71],[.3,2.08],[.16,2.29],[1.03,2.36],[.73,1.55],[.61,1.84],[-.88,1.37]],'#ffffff',.09);
    arrow.position.z=.08;
    return sign;
  }

  makeFinish(){
    const x=this.course.finishX;
    for(let i=0;i<4;i++)for(let j=0;j<8;j++){
      block(this.world,x+i*.26,.037,-1.4+j*.35,.26,.014,.35,(i+j)%2?'#fff6e3':'#343546');
    }
    for(const z of [-1.5,1.5]){
      block(this.world,x+1.25,1.72,z,.15,3.48,.15,'#fef5e7');
      block(this.world,x+1.25,-.06,z,.37,.2,.37,'#b67a83');
    }
    for(let i=0;i<12;i++)for(let j=0;j<3;j++){
      block(this.world,x+1.25,3.31+j*.25,-1.5+i*.25,.12,.25,.25,(i+j)%2?'#fff8e9':'#333445');
    }
    this.makeArrow(x - 2.5,0,-1.55);
  }

  createCar(){
    this.chassis=new THREE.Group();this.world.add(this.chassis);
    const b=(x,y,z,w,h,d,c,custom)=>block(this.chassis,x,y,z,w,h,d,c,custom);
    b(0,-.1,0,3.21,.30,1.25,'#edbd18');
    b(-.02,.12,0,3.35,.4,1.43,'#ffd42a');
    b(0,-.32,0,2.5,.16,.85,'#30313c');
    // Rear gray hardtop and yellow cab retain the voxel proportions.
    b(-.90,.64,0,1.27,.79,1.39,'#bfc6cf');
    b(-.90,1.06,0,1.32,.14,1.45,'#c6cbd2');
    b(.10,.69,0,1.02,.79,1.38,'#ffd620');
    b(.08,1.10,0,1.10,.13,1.47,'#ffde22');
    b(1.08,.40,0,1.13,.42,1.45,'#ffcf21');
    b(1.08,.64,0,1.15,.09,1.47,'#ffe12c');
    for(const z of [-.705,.705]){
      b(-.91,.73,z,.76,.26,.019,'#394355');
      b(-.91,.83,z+.002,.76,.04,.025,'#657086');
      b(.11,.77,z,.75,.34,.025,'#2e394c');
      b(.07,.89,z+.002,.67,.046,.03,'#4a5465');
      b(.42,.73,z+.009,.028,.35,.026,'#fff0a3');
      b(.02,.37,z+.02,1.0,.10,.035,'#fff077');
      b(1.10,.39,z+.027,.95,.09,.028,'#fff383');
      b(-.25,.47,z+.027,.15,.045,.027,'#b68f19');
      b(.60,.73,z*1.11,.18,.14,.19,'#dfba26');
    }
    // Back window, two tail lamps, and yellow frame strips.
    b(-1.551,.72,0,.021,.31,1.05,'#525e70');
    b(-1.558,.72,0,.025,.40,.09,'#bfc6cf');
    for(const z of [-.57,.57]){
      b(-1.70,.13,z,.03,.20,.16,'#f04639');
      b(-1.725,-.02,z,.025,.09,.16,'#ffbe2b');
      b(1.765,.40,z,.025,.20,.23,'#fff3a1');
    }
    b(1.74,.19,0,.15,.16,1.62,'#e2b427');
    b(1.82,.24,0,.03,.17,.69,'#6d642d');
    b(-1.70,-.17,0,.18,.15,1.60,'#ebc424');
    this.axles=[];
    this.wheelMeshes=[];
    const r=this.course.wheelRadius;
    for(let i=0;i<2;i++){
      const axle=block(this.world,0,0,0,.17,.17,2.05,'#34343e');this.axles.push(axle);
      const pair=[];
      for(const side of [-1,1]){
        const wheel=new THREE.Group();this.world.add(wheel);pair.push(wheel);
        const tire=new THREE.Mesh(new THREE.CylinderGeometry(r*.91,r*.91,.55,12,1),[
          new THREE.MeshBasicMaterial({color:'#252936'}),new THREE.MeshBasicMaterial({color:'#1b202c'}),new THREE.MeshBasicMaterial({color:'#202530'})]);
        tire.rotation.x=Math.PI/2;wheel.add(tire);
        for(let n=0;n<12;n++){
          const a=n/12*Math.PI*2;
          const tread=block(wheel,Math.cos(a)*(r-.035),Math.sin(a)*(r-.035),0,.20,.16,.60,n%2?'#2e3342':'#353a48');tread.rotation.z=a;
          for(const dz of [-.155,.155]){
            const ridge=block(wheel,Math.cos(a)*(r+.008),Math.sin(a)*(r+.008),dz,.10,.19,.17,'#424859');ridge.rotation.z=a+.09;
          }
        }
        for(const outer of [-1,1]){
          const hub=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.025,6),new THREE.MeshBasicMaterial({color:outer===side?'#737b8a':'#555b6b'}));hub.rotation.x=Math.PI/2;hub.position.z=outer*.286;wheel.add(hub);
          block(wheel,.01,-.042,outer*.306,.26,.16,.025,'#596070');
        }
      }
      this.wheelMeshes.push(pair);
    }
    this.suspensions=[];
    for(let i=0;i<2;i++)for(const side of [-1,1]){
      const arm=block(this.world,0,0,side*.8,.095,1,.095,'#555465');this.suspensions.push(arm);
    }
    // Flat contact shadows suit the sharply lit, toy-like environment.
    const shadowShape=new THREE.Shape();shadowShape.moveTo(-1.75,-.8);shadowShape.lineTo(1.7,-.8);shadowShape.lineTo(2.1,.7);shadowShape.lineTo(-1.5,1);shadowShape.closePath();
    this.shadow=new THREE.Mesh(new THREE.ShapeGeometry(shadowShape),new THREE.MeshBasicMaterial({color:'#164c29',transparent:true,opacity:.32,depthWrite:false}));
    this.shadow.rotation.x=-Math.PI/2;this.world.add(this.shadow);
    this.rocketGlow = block(this.world, -1.78, .28, 0, .18, .22, .42, '#ff6b30');
    this.rocketGlow.visible = false;
    this.rocketFlame = new THREE.Group();
    this.world.add(this.rocketFlame);
    const flameLayer = (radius, length, material) => {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 8, 1, true), material);
      mesh.rotation.z = -Math.PI / 2;
      this.rocketFlame.add(mesh);
      return mesh;
    };
    this.rocketOuter = flameLayer(.52, 1.65, new THREE.MeshBasicMaterial({ color: '#ed3b20', transparent: true, opacity: .78, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.rocketMid = flameLayer(.34, 1.35, new THREE.MeshBasicMaterial({ color: '#ff9d1e', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.rocketCore = flameLayer(.17, 1.08, new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: .98, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.rocketFlame.visible = false;
  }

  reset(){this.followX=0;this.lastX=0;this.focus.set(1.8,2.1,0);this.shake=0;for(const p of this.particles)this.scene.remove(p.mesh);this.particles=[];}
  resize(){
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
    this.renderer.setSize(width,height,false);
    const aspect=width/Math.max(1,height);
    const vertical=aspect<1?12:10.8;
    this.camera.left=-vertical*aspect/2;this.camera.right=vertical*aspect/2;
    this.camera.top=vertical/2;this.camera.bottom=-vertical/2;
    this.camera.updateProjectionMatrix();
  }
  celebration(){
    for(let i=0;i<90;i++){
      const mesh=block(this.scene,this.lastX+(random()-.5)*5,2+random()*4,(random()-.5)*3,.09,.20,.025,['#ffdc2c','#ffffff','#fb6382','#62d4eb','#7dd43d'][i%5]);
      this.particles.push({mesh,vx:(random()-.5)*4,vy:3+random()*5,vz:(random()-.5)*3,life:2+random()*2});
    }
  }
  crash(){this.shake=.12;}
  render(state,dt){
    this.clock+=dt;this.lastX=state.x;
    this.chassis.position.set(state.x,state.y,0);this.chassis.rotation.z=state.angle;
    if (this.rocketGlow) {
      this.rocketGlow.position.set(state.x - 1.78 * Math.cos(state.angle), state.y - 1.78 * Math.sin(state.angle) + .28, 0);
      this.rocketGlow.rotation.z = state.angle;
      this.rocketGlow.visible = Boolean(state.rocketActive);
      this.rocketGlow.scale.y = state.rocketActive ? .8 + Math.sin(this.clock * 32) * .25 : 1;
    }
    if (this.rocketFlame) {
      const c = Math.cos(state.angle), s = Math.sin(state.angle);
      this.rocketFlame.position.set(state.x - c * 1.78, state.y + .26 - s * 1.78, 0);
      this.rocketFlame.rotation.z = state.angle;
      this.rocketFlame.visible = Boolean(state.rocketActive);
      const pulse = .9 + Math.sin(this.clock * 44) * .12;
      this.rocketFlame.scale.set(pulse, .88 + Math.sin(this.clock * 31) * .12, 1);
      this.rocketOuter.material.opacity = .6 + Math.sin(this.clock * 37) * .16;
    }
    const windmillAngles = state.windmillAngles || (state.windmillAngle === null ? [] : [state.windmillAngle]);
    this.windmillVisuals?.forEach((hub, index) => {
      if (windmillAngles[index] !== undefined) hub.rotation.z = windmillAngles[index];
    });
    state.wheels.forEach((w,i)=>{
      this.wheelMeshes[i].forEach((mesh,j)=>{mesh.position.set(w.x,w.y,j===0?-1.02:1.02);mesh.rotation.z=w.angle;});
      this.axles[i].position.set(w.x,w.y,0);
      for(let side=0;side<2;side++){
        const arm=this.suspensions[i*2+side],off=i?1.05:-1.05;
        const bx=state.x+Math.cos(state.angle)*off,by=state.y+Math.sin(state.angle)*off-.12;
        arm.position.set((w.x+bx)/2,(w.y+by)/2,side? .8:-.8);arm.scale.y=Math.hypot(w.x-bx,w.y-by);arm.rotation.z=-Math.atan2(w.x-bx,w.y-by);
      }
    });
    const terrain = this.course.terrainParts || this.course.terrain;
    const ground=groundY(terrain,state.x),surfaceAngle=Math.atan2(groundY(terrain,state.x+.1)-groundY(terrain,state.x-.1),.2);
    this.shadow.position.set(state.x+.16,ground+.05,.16);this.shadow.rotation.set(-Math.PI/2,0,0);this.shadow.rotateY(-surfaceAngle);
    this.shadow.material.opacity=THREE.MathUtils.clamp(.36-(state.y-ground-1.15)*.09,0,.36);
    const followSpeed=1-Math.exp(-dt*5);
    this.followX=mix(this.followX,state.x,followSpeed);
    const targetY=2.1+Math.max(0,groundY(terrain,this.followX))*0.84;
    const aspect=this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight);
    this.focus.x=this.followX+(aspect<1?.6:1.8);
    this.focus.y=mix(this.focus.y,targetY,1-Math.exp(-dt*3.5));
    this.camera.position.copy(this.focus).add(this.cameraOffset);
    if(this.shake>0){this.camera.position.y+=(random()-.5)*this.shake;this.shake=Math.max(0,this.shake-dt*.4);}
    this.camera.lookAt(this.focus);
    // A small amount of distant parallax keeps cliffs calm as the car advances.
    this.scenery.position.x=this.followX*.24;
    this.ripples.forEach((r,i)=>r.position.z=Math.sin(this.clock*.42+i)*.035);
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.vy-=6*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.rotation.x+=dt*3;p.mesh.rotation.z+=dt*2;if(p.life<0){this.scene.remove(p.mesh);this.particles.splice(i,1);}}
    this.renderer.render(this.scene,this.camera);
  }
}
