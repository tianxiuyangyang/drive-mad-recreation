import * as THREE from './vendor/three.module.js?v=20261002-58';
import { COURSE, TRAP_LASER, trapLaserRows } from './physics.mjs?v=20261002-58';

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
// Orthographic cameras change apparent distance through zoom, not position.
// A shared zoom-out keeps more of the track visible on every level.
const BASE_CAMERA_ZOOM = .8;
const JUMP_CAMERA_ZOOM = .58;
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
    this.camera.zoom = BASE_CAMERA_ZOOM;
    this.cameraOffset = new THREE.Vector3(-7, 9.2, 18);
    this.focus = new THREE.Vector3(1.8, 2.1, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.scenery = new THREE.Group(); this.scene.add(this.scenery);
    this.particles = [];
    this.hazardWindmillVisual = null;
    this.hazardGearVisuals = [];
    this.hazardWindmillChainVisuals = [];
    this.hazardWindmillChainGearVisuals = [];
    this.thirdRotorLaserVisual = null;
    this.seesawVisuals = [];
    this.rotatingBaffleVisuals = [];
    this.upJetVisual = null;
    this.upJetPuffs = [];
    this.carSkin = null;
    this.carSkinMeshes = [];
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
    this.setCarSkin(this.carSkin);
    this.reset();
  }

  setCarSkin(colors) {
    this.carSkin = colors ? {...colors} : null;
    if (!this.carSkin) return;
    for (const entry of this.carSkinMeshes) {
      const hex = this.carSkin[entry.role] || this.carSkin.primary;
      if (!hex) continue;
      const base = color(hex);
      entry.mesh.material.forEach((material, index) => {
        material.color.copy(base).multiplyScalar(entry.shades[index] ?? 1);
      });
    }
  }

  createBackground() {
    // The original's scenery consists of deliberately broad, flat blue facets.
    const mountainData = [
      [-12, -6, -10, 10, 8.5, '#0089e9'], [-2, -6, -10, 7.5, 6.5, '#0088e6'],
      [9.5, -6, -13, 12, 10.7, '#0094f0'], [19, -6, -15, 12, 13.5, '#0076db'],
      [30, -6, -13, 13, 9.5, '#008ced'], [44, -6, -13, 10, 14.5, '#0079dc'],
      [57, -6, -14, 14, 11.5, '#008eef'], [72, -6, -15, 16, 13, '#0078db'],
      [89, -6, -16, 18, 10, '#008ce9'],
      [108, -6, -15, 15, 12.5, '#0086e7'], [128, -6, -14, 17, 9.2, '#0092ef'],
      [150, -6, -16, 19, 14, '#0078db'], [174, -6, -15, 16, 11.2, '#008eef'],
      [198, -6, -17, 18, 13.2, '#0081e4'], [224, -6, -16, 20, 10.8, '#008ce9'],
      [250, -6, -18, 18, 14.6, '#0079dc'],
    ];
    mountainData.forEach(([x,y,z,w,h,c],i) => {
      const g = new THREE.Group();g.position.set(x,y,z);this.scenery.add(g);
      const shape = i % 2 ? [[-w/2,0],[-w/2, h*.75],[-w*.2,h],[w*.25,h*.9],[w/2,0]] : [[-w/2,0],[-w*.34,h*.65],[w*.05,h],[w*.30,h*.83],[w/2,0]];
      polygon(g, shape, c, 3);
      const facet = polygon(g, [[shape[2][0],h],[w/2,0],[w*.10,0],[-w*.17,h*.78]], '#0083e5',.015);
      facet.position.z = 3.02;
    });
    for(const [x,y,z,w] of [[-5,4.8,-16,7],[11,7,-18,5],[31,5.5,-19,9],[52,7,-16,6],
      [76,5.2,-18,7],[102,7.4,-17,5],[133,5.6,-19,8],[165,7.8,-18,6],[199,5.4,-19,9],[235,7.2,-17,6]]) {
      const cloud = new THREE.Group();cloud.position.set(x,y,z);this.scenery.add(cloud);
      block(cloud,0,0,0,w,.42,1.3,'#ffffff');
      block(cloud,-w*.17,.3,-.08,w*.48,.45,1.05,'#ffffff');
    }
    // The visible ocean sits exactly on the course water line used by physics,
    // so touching the surface and drowning happen at the same height.
    const waterY = this.course.waterY ?? -2.1;
    const waterWidth = Math.max(220, this.course.maxX - this.course.minX + 120);
    const waterCenterX = (this.course.minX + this.course.maxX) / 2;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(waterWidth,70),new THREE.MeshBasicMaterial({color:'#00bde7'}));
    this.water.rotation.x=-Math.PI/2;this.water.position.set(waterCenterX,waterY,29);this.world.add(this.water);
    const blue = new THREE.MeshBasicMaterial({color:'#009dfa'});
    for(const [z,w] of [[4.9,1.8],[8.9,5],[18,6],[-5,3]]){
      const stripe=new THREE.Mesh(new THREE.PlaneGeometry(waterWidth,w),blue);stripe.rotation.x=-Math.PI/2;stripe.position.set(waterCenterX,waterY+.005,z);this.world.add(stripe);
    }
    this.ripples=[];
    for(const z of [-4.3,4.0,8.4,14.5]) {
      const points=[];for(let x=this.course.minX-60;x<this.course.maxX+60;x+=3)points.push(new THREE.Vector3(x,waterY+.014,z+Math.sin(x*.22)*.075));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#e3fbff',transparent:true,opacity:.88}));
      this.world.add(line);this.ripples.push(line);
    }
  }

  createCourse() {
    if (this.course.id !== 1) return this.createChallengeCourse();
    const parts = this.course.terrainParts || [this.course.terrain];
    const plankMaps = [0,1,2].map(n=>pixelTexture('wood',n));
    const mats = plankMaps.map(map=>[
      new THREE.MeshBasicMaterial({color:'#a65f71'}),new THREE.MeshBasicMaterial({color:'#a05c70'}),
      new THREE.MeshBasicMaterial({map}),new THREE.MeshBasicMaterial({color:'#98536a'}),
      new THREE.MeshBasicMaterial({color:'#fbd0b4'}),new THREE.MeshBasicMaterial({color:'#c2868a'})]);
    const flat = terrain => terrain.every(point => Math.abs(point.y - terrain[0].y) < 1e-6);
    for (const terrain of parts) {
      if (flat(terrain)) {
        this.island(terrain[0].x, terrain[terrain.length - 1].x, terrain[0].y);
        continue;
      }
      for (let i=1;i<terrain.length;i++){
        const a=terrain[i-1],b=terrain[i];
        const length=Math.hypot(b.x-a.x,b.y-a.y);
        if (length < .05) continue;
        const count=Math.ceil(length/.92);
        for(let n=0;n<count;n++){
          const f=(n+.5)/count,group=new THREE.Group();group.position.set(mix(a.x,b.x,f),mix(a.y,b.y,f)-.12,0);group.rotation.z=Math.atan2(b.y-a.y,b.x-a.x);this.world.add(group);
          block(group,0,0,0,length/count-.035,.23,2.85,'#b87883',mats[(i+n)%3]);
          block(group,0,-.015,1.435,length/count-.04,.12,.015,'#f7cbb0');
        }
      }
      // Upright trestles make every ramp read as a built bridge over the sea.
      for(let x=terrain[0].x+.6;x<terrain[terrain.length-1].x;x+=2.3){
        const y=groundY(terrain,x);const h=y+2.08;
        block(this.world,x,y-h/2-.15,-1.06,.19,h,.19,'#bd7784');
        block(this.world,x,y-h/2-.15,1.06,.19,h,.19,'#bc7581');
        block(this.world,x,y-.36,0,.27,.22,2.92,'#a85e73');
        const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.26,h*.53),new THREE.MeshBasicMaterial({color:'#008fd1',transparent:true,opacity:.32}));
        shadow.rotation.x=-Math.PI/2;shadow.rotation.z=-.5;shadow.position.set(x+.65,-2.075,1.6);this.world.add(shadow);
      }
    }
    // Yellow chevrons mark every take-off lip without changing its collision.
    for (const gap of this.course.jumpGaps || []) {
      this.makeArrow(gap.startX - 2.15, gap.height - .72, -1.55, '#ffdc32');
    }
    this.makeArrow(3.35,.02,-1.55);
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
    const seesawConfigs = this.course.seesaws || [];
    if (seesawConfigs.length) {
      const supportY = seesawConfigs[0].supportY;
      const left = seesawConfigs[0].x - seesawConfigs[0].halfLength;
      const right = seesawConfigs.at(-1).x + seesawConfigs.at(-1).halfLength;
      block(this.world,(left+right)/2,supportY,0,right-left+.5,.2,.38,'#596070');
    }
    this.seesawVisuals = seesawConfigs.map(config => {
      block(this.world,config.x,(config.supportY+config.y)/2,0,.14,config.supportY-config.y,.14,'#6e5964');
      block(this.world,config.x,config.y,0,.34,.34,.42,'#596070');
      const board = new THREE.Group();
      this.world.add(board);
      const wood = new THREE.MeshBasicMaterial({map:pixelTexture('wood',0)});
      block(board,0,0,0,config.halfLength*2,config.thickness,.95,'#b87883',wood);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.48,16),materials('#596070'));
      hinge.rotation.x = Math.PI / 2;
      board.add(hinge);
      block(board,-config.halfLength+.24,.08,.49,.42,.12,.035,'#ffe07a');
      block(board,config.halfLength-.24,.08,.49,.42,.12,.035,'#ffe07a');
      return board;
    });
    this.rotatingBaffleVisuals = (this.course.rotatingBaffles || []).map(config => {
      const group = new THREE.Group();
      group.position.set(config.x,config.y,0);
      this.world.add(group);
      block(group,0,0,0,config.length,config.thickness,1.05,'#8f5e78');
      block(group,0,0,.56,config.length*.92,.1,.06,'#f7cd62');
      block(group,0,0,-.56,config.length*.92,.1,.06,'#f7cd62');
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.62,16),materials('#596070'));
      axle.rotation.x = Math.PI / 2;
      group.add(axle);
      const flames = [];
      for (const side of [-1,1]) {
        const material = new THREE.MeshBasicMaterial({color:side<0?'#43d8ff':'#ff8a32',transparent:true,opacity:.48,depthWrite:false,blending:THREE.AdditiveBlending});
        const flame = new THREE.Mesh(new THREE.ConeGeometry(.15,.7,10,1,true),material);
        flame.position.set(side * (config.length / 2 + .18),0,0);
        flame.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(flame);
        flames.push({flame,material});
      }
      return {group,flames};
    });
    if (this.course.upJet) {
      const jet = this.course.upJet;
      const group = new THREE.Group();
      group.position.set(jet.x,0,0);
      this.world.add(group);
      block(group,0,jet.bottomY-.18,0,2.4,.36,1.4,'#596070');
      block(group,0,jet.bottomY+.08,0,1.4,.28,1.05,'#f6c94e');
      const height = jet.topY - jet.bottomY;
      const makeFlame = (radius,color,opacity,scale=1) => {
        const material = new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
        const flame = new THREE.Mesh(new THREE.ConeGeometry(radius,height,14,1,true),material);
        flame.position.set(0,jet.bottomY+height/2,0);
        flame.scale.x = flame.scale.z = scale;
        group.add(flame);
        return {flame,material};
      };
      this.upJetVisual = [
        makeFlame(1.25,'#23c8ff',.24),
        makeFlame(.82,'#55f0ff',.34),
        makeFlame(.38,'#f2ffff',.58),
      ];
      this.upJetPuffs = Array.from({length:9},(_,index)=>{
        const material = new THREE.MeshBasicMaterial({color:index%3===0?'#d9fbff':index%2?'#43d8ff':'#79efff',transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending});
        const puff = new THREE.Mesh(new THREE.SphereGeometry(.13+(index%3)*.035,8,8),material);
        group.add(puff);
        return {puff,material,offset:index/9};
      });
    }
    // Extra soil pillars make the floating ramp sections read clearly above water.
    for (const point of t) {
      const h = Math.max(.2, point.y + 1.45);
      block(this.world, point.x, point.y - h / 2 - .08, 0, .35, h, 2.78, '#bd7784');
    }
    // Level three is an ocean crossing; its flat landing platforms are drawn as
    // solid islands so they read as real land surrounded by water.
    if (this.course.id === 3) {
      for (const terrain of parts) {
        const width = terrain[terrain.length - 1].x - terrain[0].x;
        if (width >= 8 && terrain.every(point => point.y === 0)) this.island(terrain[0].x, terrain[terrain.length - 1].x);
      }
    }
    const windmillConfigs = this.course.windmills || (this.course.windmill ? [this.course.windmill] : []);
    this.windmillVisuals = windmillConfigs.map(config => this.createWindmill(config));
    this.hazardWindmillVisual = null;
    this.hazardGearVisuals = [];
    this.hazardWindmillChainVisuals = [];
    this.hazardWindmillChainGearVisuals = [];
    if (this.course.hazardWindmill) {
      const config = this.course.hazardWindmill;
      this.hazardWindmillVisual = this.createHazardWindmill(config);
      this.hazardGearVisuals = Array.from({length:config.armCount || 4},(_,index)=>this.createHazardGear(config,index));
    }
    if (this.course.hazardWindmillChain) {
      this.hazardWindmillChainVisuals = this.course.hazardWindmillChain.map(config => this.createHazardWindmill(config));
      this.hazardWindmillChainGearVisuals = this.course.hazardWindmillChain.map(config => (
        Array.from({length:config.armCount || 4},(_,index)=>this.createHazardGear(config,index))
      ));
    }
    this.thirdRotorLaserVisual = null;
    if (this.course.thirdRotorLaser) {
      const config = this.course.thirdRotorLaser;
      const sensorHeight = config.sensorTop - config.sensorBottom;
      const sensorMiddle = (config.sensorTop + config.sensorBottom) / 2;
      const sensorBeamMaterial = new THREE.MeshBasicMaterial({color:'#63ffe3',transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending});
      const sensorBeam = block(this.world,config.sensorX,sensorMiddle,1.72,.085,sensorHeight,.08,'#63ffe3',sensorBeamMaterial);
      for (const y of [config.sensorBottom,config.sensorTop]) {
        block(this.world,config.sensorX,y,1.72,.42,.25,.32,'#263d51');
        block(this.world,config.sensorX,y,1.9,.2,.11,.07,'#63ffe3',sensorBeamMaterial);
      }
      const gateHeight = config.gateTop - config.gateBottom;
      const gateMiddle = (config.gateTop + config.gateBottom) / 2;
      const gateMaterial = new THREE.MeshBasicMaterial({color:'#ff254d',transparent:true,opacity:.34,depthWrite:false,blending:THREE.AdditiveBlending});
      const gate = new THREE.Group();
      gate.visible = false;
      this.world.add(gate);
      block(gate,config.gateX,gateMiddle,0,.13,gateHeight,3.25,'#ff254d',gateMaterial);
      for (let y = config.gateBottom + .18; y < config.gateTop; y += .34) {
        block(gate,config.gateX,y,0,.19,.055,3.32,'#ff7b89');
      }
      this.thirdRotorLaserVisual = {sensorBeam,gate,gateMaterial};
    }
    if (this.course.laserCrate) {
      const crate = this.course.laserCrate;
      const crateMaterial = new THREE.MeshBasicMaterial({map:pixelTexture('wood',0)});
      block(this.world,crate.x,crate.y,0,crate.width,crate.height,crate.depth,'#b87883',crateMaterial);
    }
    if (this.course.wallGaps) {
      for (const wall of this.course.wallGaps) {
        const wallWidth = wall.width || .84;
        const lower = wall.gapBottom > 0 ? block(this.world, wall.x, wall.gapBottom / 2, 0, wallWidth, wall.gapBottom, 3.2, '#b86f7a') : null;
        const upperHeight = this.course.wallHeight - wall.gapTop;
        const upper = block(this.world, wall.x, wall.gapTop + upperHeight / 2, 0, wallWidth, upperHeight, 3.2, '#8f5e78');
        for (const part of [lower, upper].filter(Boolean)) part.material = new THREE.MeshBasicMaterial({color:'#a96479'});
        if (wall.gapBottom > 0) block(this.world, wall.x, wall.gapBottom, -1.62, 1.0, .12, .08, '#f8d06c');
      }
    }
    if (this.course.ceiling) {
      const {startX, endX, y, thickness} = this.course.ceiling;
      block(this.world, (startX + endX) / 2, y, 0, endX - startX, thickness, 3.35, '#76566f');
      block(this.world, (startX + endX) / 2, y - thickness / 2 - .06, -1.7, endX - startX, .12, .08, '#f7cd62');
    }
    for (const {startX, endX, y, thickness} of this.course.lowCeilings || []) {
      block(this.world, (startX + endX) / 2, y, 0, endX - startX, thickness, 3.35, '#76566f');
      block(this.world, (startX + endX) / 2, y - thickness / 2 - .06, -1.7, endX - startX, .12, .08, '#f7cd62');
    }
    for (const {x, bottomY, topY, thickness} of this.course.lowCeilingConnectors || []) {
      block(this.world, x, (bottomY + topY) / 2, 0, thickness, topY - bottomY, 3.35, '#76566f');
    }
    this.trapVisual = null;
    if (this.course.gearTrap) {
      const trap = this.course.gearTrap, secondTrap = this.course.secondTrap, sensor = this.course.wallGaps[2], sensor2 = this.course.wallGaps[3], fifth = this.course.wallGaps[4];
      const sensorX = sensor.x + (sensor.width || .84)/2;
      const lampMaterial = new THREE.MeshBasicMaterial({color:'#63ffe3'});
      for (const y of [sensor.gapBottom,sensor.gapTop]) {
        block(this.world,sensorX,y,1.76,.35,.24,.3,'#263d51');
        block(this.world,sensorX,y,1.94,.18,.1,.06,'#63ffe3',lampMaterial);
      }
      const beam = block(this.world,sensorX,(sensor.gapBottom+sensor.gapTop)/2,1.76,.055,sensor.gapTop-sensor.gapBottom,.045,'#63ffe3',new THREE.MeshBasicMaterial({color:'#63ffe3',transparent:true,opacity:.55}));
      const sensor2X = sensor2.x + (sensor2.width || .84) / 2;
      const sensor2LampMaterial = new THREE.MeshBasicMaterial({color:'#ffca4a'});
      for (const y of [sensor2.gapBottom,sensor2.gapTop]) {
        block(this.world,sensor2X,y,1.76,.35,.24,.3,'#263d51');
        block(this.world,sensor2X,y,1.94,.18,.1,.06,'#ffca4a',sensor2LampMaterial);
      }
      const sensor2Beam = block(this.world,sensor2X,(sensor2.gapBottom+sensor2.gapTop)/2,1.76,.055,sensor2.gapTop-sensor2.gapBottom,.045,'#ffca4a',new THREE.MeshBasicMaterial({color:'#ffca4a',transparent:true,opacity:.55}));
      const laserGlow = new THREE.MeshBasicMaterial({color:'#ff153a',transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending});
      const laserCore = new THREE.MeshBasicMaterial({color:'#ff5266'});
      const lasers = this.course.wallGaps.slice(2,4).map(gate=>{
        const beams = new THREE.Group();this.world.add(beams);beams.visible=false;
        for (const y of trapLaserRows(gate)) {
          for (const z of [-1.66,1.66]) {
            block(this.world,gate.x,y,z,.2,.13,.16,'#263d51');
            block(beams,gate.x,y,z+Math.sign(z)*.09,.09,.065,.025,'#ff5266',laserCore);
          }
          block(beams,gate.x,y,0,TRAP_LASER.width,TRAP_LASER.height,3.25,'#ff5266',laserCore);
          block(beams,gate.x,y,0,TRAP_LASER.width*2.4,TRAP_LASER.height*2.6,3.3,'#ff153a',laserGlow);
        }
        return beams;
      });
      const secondLaserGlow = new THREE.MeshBasicMaterial({color:'#ff153a',transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending});
      const secondLaserCore = new THREE.MeshBasicMaterial({color:'#ff5266'});
      const secondLasers = new THREE.Group();this.world.add(secondLasers);secondLasers.visible=false;
      for (const y of trapLaserRows(fifth)) {
        for (const z of [-1.66,1.66]) {
          block(this.world,fifth.x,y,z,.2,.13,.16,'#263d51');
          block(secondLasers,fifth.x,y,z+Math.sign(z)*.09,.09,.065,.025,'#ff5266',secondLaserCore);
        }
        block(secondLasers,fifth.x,y,0,TRAP_LASER.width,TRAP_LASER.height,3.25,'#ff5266',secondLaserCore);
        block(secondLasers,fifth.x,y,0,TRAP_LASER.width*2.4,TRAP_LASER.height*2.6,3.3,'#ff153a',secondLaserGlow);
      }
      const gear = new THREE.Group();this.world.add(gear);gear.visible=false;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(trap.radius,trap.radius,2.5,48),materials('#53677c'));
      disc.rotation.x=Math.PI/2;gear.add(disc);
      for(let i=0;i<trap.teeth;i++) {
        const a=i*Math.PI*2/trap.teeth;
        const tooth=block(gear,Math.cos(a)*trap.radius,Math.sin(a)*trap.radius,0,trap.toothLength,trap.toothWidth,2.5,'#f6b93e');
        tooth.rotation.z=a;
      }
      for(let i=0;i<4;i++) {
        const spoke=block(gear,0,0,1.28,trap.radius*1.55,.14,.05,'#f6b93e');spoke.rotation.z=i*Math.PI/4;
      }
      block(gear,0,0,1.34,.48,.48,.1,'#e7edf5');
      const makeSecondGear = () => {
        const group = new THREE.Group();this.world.add(group);group.visible=false;
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(secondTrap.radius,secondTrap.radius,2.25,48),materials('#53677c'));
        disc.rotation.x=Math.PI/2;group.add(disc);
        for(let i=0;i<secondTrap.teeth;i++) {
          const a=i*Math.PI*2/secondTrap.teeth;
          const tooth=block(group,Math.cos(a)*secondTrap.radius,Math.sin(a)*secondTrap.radius,0,secondTrap.toothLength,secondTrap.toothWidth,2.25,'#f6b93e');
          tooth.rotation.z=a;
        }
        for(let i=0;i<4;i++) {
          const spoke=block(group,0,0,1.16,secondTrap.radius*1.55,.12,.05,'#f6b93e');spoke.rotation.z=i*Math.PI/4;
        }
        block(group,0,0,1.22,.42,.42,.1,'#e7edf5');
        return group;
      };
      const secondGears = secondTrap ? [makeSecondGear(),makeSecondGear()] : [];
      this.trapVisual={gear,lasers,laserGlow,beam,lampMaterial,sensor2Beam,sensor2LampMaterial,secondLasers,secondLaserGlow,secondGears};
      const floor = block(this.world, trap.x, -.18, 0, 5.4, .36, 3.3, '#b86f7a');
      floor.material = new THREE.MeshBasicMaterial({color:'#b86f7a'});
      this.trapVisual.floor=floor;
    }
    this.blockerVisual = null;
    if (this.course.blockerGear) {
      const gear = this.course.blockerGear;
      const outerRadius = gear.radius + gear.toothLength / 2;
      const centerY = gear.groundY + outerRadius;
      // A stubby post anchors the gear to the plateau so it reads as built in.
      block(this.world, gear.x, gear.groundY + outerRadius / 2, -.85, .34, outerRadius, .34, '#6e5964');
      const group = new THREE.Group();
      group.position.set(gear.x, centerY, 0);
      this.world.add(group);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(gear.radius,gear.radius,2.2,48),materials('#53677c'));
      disc.rotation.x=Math.PI/2;group.add(disc);
      for(let i=0;i<gear.teeth;i++) {
        const a=i*Math.PI*2/gear.teeth;
        const tooth=block(group,Math.cos(a)*gear.radius,Math.sin(a)*gear.radius,0,gear.toothLength,gear.toothWidth,2.2,'#f6b93e');
        tooth.rotation.z=a;
      }
      for(let i=0;i<4;i++) {
        const spoke=block(group,0,0,1.14,gear.radius*1.5,.12,.05,'#f6b93e');spoke.rotation.z=i*Math.PI/4;
      }
      block(group,0,0,1.2,.42,.42,.1,'#e7edf5');
      this.blockerVisual = group;
    }

    this.makeFinish();
    this.makeArrow(this.course.finishX - 2.4, 0, -1.55);
    // Level three already draws its own solid islands; the generic end caps
    // would overlap them and z-fight.
    if (this.course.id !== 3) {
      this.island(min - .3, min + 2.8);
      this.island(max - 2.8, max + .3);
    }
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
    block(hub, 0, 0, 0, .72, .72, .72, '#f4c935');
    const armMaterials = ['#c36d76', '#d88b80', '#b95e70', '#e3a092'];
    const armCount = config.armCount || 4;
    for (let i = 0; i < armCount; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = i * Math.PI * 2 / armCount;
      hub.add(arm);
      block(arm, halfLength / 2, 0, 0, halfLength, .28, .62, armMaterials[i]);
      block(arm, halfLength - .7, .16, 0, 1.4, .22, .88, '#f4c35a');
      block(arm, halfLength - .7, -.16, 0, 1.4, .16, .88, '#9d5c6d');
    }
    return hub;
  }

  createHazardWindmill(config) {
    const {x, y, halfLength, thickness} = config;
    const rig = new THREE.Group();
    rig.position.set(x, y, 0);
    this.world.add(rig);
    const supportMaterial = new THREE.MeshBasicMaterial({color:'#6e5964',transparent:true,opacity:.38,depthWrite:false});
    block(rig, 0, -y - .82, 0, .72, Math.max(.4, y * 2 + 1.64), .72, '#6e5964', supportMaterial);
    block(rig, 0, -y - .72, 0, 1.55, .24, 1.55, '#a97079');
    const hub = new THREE.Group();
    rig.add(hub);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(halfLength * .22, halfLength * .22, .3, 32), new THREE.MeshBasicMaterial({color:'#d67b82',transparent:true,opacity:.42,depthWrite:false}));
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -.48;
    hub.add(ring);
    block(hub, 0, 0, 0, .98, .98, .98, '#f4c935');
    const armMaterials = ['#bd4f3f','#e06442','#d74a36','#ec7a42'];
    const armCount = config.armCount || 4;
    for (let i = 0; i < armCount; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = i * Math.PI * 2 / armCount;
      hub.add(arm);
      block(arm, halfLength / 2, 0, 0, halfLength, thickness, .9, armMaterials[i % armMaterials.length]);
      block(arm, halfLength - .72, -.17, 0, 1.5, .2, 1.08, '#843f45');
      if (config.lethalBlades) {
        block(arm, halfLength / 2, 0, .5, halfLength, thickness * .52, .08, '#ff9c55');
        const toothCount = Math.max(6, Math.floor(halfLength / .55));
        for (let toothIndex = 1; toothIndex < toothCount; toothIndex++) {
          const toothX = toothIndex * halfLength / toothCount;
          for (const side of [-1, 1]) {
            block(arm, toothX, side * (thickness / 2 + .1), 0, .31, .25, 1.0, '#ff7045');
          }
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      const spoke = block(hub, 0, 0, .53, halfLength * 1.7, .12, .06, '#f6c94e');
      spoke.rotation.z = i * Math.PI / 4;
    }
    block(hub, 0, 0, .58, .52, .52, .12, '#eef3f8');
    return hub;
  }

  createHazardGear(config, index) {
    const group = new THREE.Group();
    this.world.add(group);
    const discMaterials = index % 2 ? materials('#a73737') : materials('#8f3039');
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(config.gearRadius,config.gearRadius,2.15,40),discMaterials);
    disc.rotation.x = Math.PI / 2;
    group.add(disc);
    for (let i = 0; i < config.gearTeeth; i++) {
      const angle = i * Math.PI * 2 / config.gearTeeth;
      const tooth = block(group,Math.cos(angle)*config.gearRadius,Math.sin(angle)*config.gearRadius,0,config.toothLength,config.toothWidth,2.15,'#ff7045');
      tooth.rotation.z = angle;
    }
    for (let i = 0; i < 4; i++) {
      const spoke = block(group,0,0,1.1,config.gearRadius*1.58,.15,.08,'#ffd44f');
      spoke.rotation.z = i * Math.PI / 4;
    }
    block(group,0,0,1.16,.42,.42,.1,'#f5e8c8');
    return group;
  }

  island(from,to,y=0){
    const width=to-from,center=(from+to)/2,depth=2.85;
    const soilMap=pixelTexture('soil');soilMap.wrapS=THREE.RepeatWrapping;soilMap.repeat.set(width/3,1);
    const soilMaterials=[new THREE.MeshBasicMaterial({color:'#ffd4be'}),new THREE.MeshBasicMaterial({color:'#ad6a79'}),new THREE.MeshBasicMaterial({color:'#53c542'}),new THREE.MeshBasicMaterial({color:'#c88086'}),new THREE.MeshBasicMaterial({map:soilMap}),new THREE.MeshBasicMaterial({color:'#e6ad9e'})];
    block(this.world,center,y-.91,0,width,1.68,depth,'#ffd4be',soilMaterials);
    block(this.world,center,y-.045,0,width,.14,depth,'#46c641',[
      new THREE.MeshBasicMaterial({color:'#42b837'}),new THREE.MeshBasicMaterial({color:'#3dad36'}),new THREE.MeshBasicMaterial({color:'#46cb40'}),new THREE.MeshBasicMaterial({color:'#3aaf39'}),new THREE.MeshBasicMaterial({color:'#3ab73b'}),new THREE.MeshBasicMaterial({color:'#43bd3b'})]);
    for(let x=from+.12;x<to;x+=.2)block(this.world,x,y-.16,depth/2+.014,.072,.23,.04,'#49c43e');
    // Pixel weeds are placed on the surface; no texture filtering softens them.
    for(let n=0;n<width*8;n++){
      const x=from+.1+random()*(width-.2),z=(random()-.5)*2.5,s=.05+Math.floor(random()*3)*.045;
      block(this.world,x,y+.033,z,s,.009,s*.75,n%4===0?'#bbdf5a':n%3===0?'#8bdc4d':'#68d447');
      if(n%3===0)block(this.world,x+s*.6,y+.034,z+s*.6,s*.65,.009,s*.65,'#8fe250');
    }
    for(const x of [from,to]){
      block(this.world,x,y-.8,0,.75,1.8,depth+.055,'#b5757f');
      for(const z of [-1,0,1])block(this.world,x+.39,y-.92,z,.02,.9,.08,'#a96878');
      // Square end-grain motif on the near face of each bridge anchor.
      const z=depth/2+.035;
      block(this.world,x,y-.40,z,.56,.62,.016,'#fac9ae');
      block(this.world,x,y-.40,z+.013,.39,.44,.016,'#b87b83');
      block(this.world,x,y-.40,z+.026,.21,.25,.016,'#f9c9af');
      for(let n=0;n<20;n++){
        block(this.world,x+(random()-.5)*.7,y-1.6+random()*1.3,z+.012,.075,.075,.01,n%2?'#ce9292':'#a56375');
      }
    }
  }

  makeArrow(x,y,z,arrowColor='#ffffff'){
    const sign=new THREE.Group();sign.position.set(x,y,z);this.world.add(sign);
    block(sign,0,1.12,0,.19,2.24,.18,'#bb7785');
    const arrow=polygon(sign,[[-.95,1.71],[.3,2.08],[.16,2.29],[1.03,2.36],[.73,1.55],[.61,1.84],[-.88,1.37]],arrowColor,.09);
    arrow.position.z=.08;
    return sign;
  }

  makeFinish(){
    const x=this.course.finishX;
    // finishY lets a level place its gate on a raised plateau; it is 0 elsewhere.
    const baseY=this.course.finishY ?? 0;
    for(let i=0;i<4;i++)for(let j=0;j<8;j++){
      block(this.world,x+i*.26,baseY+.037,-1.4+j*.35,.26,.014,.35,(i+j)%2?'#fff6e3':'#343546');
    }
    for(const z of [-1.5,1.5]){
      block(this.world,x+1.25,baseY+1.72,z,.15,3.48,.15,'#fef5e7');
      block(this.world,x+1.25,baseY-.06,z,.37,.2,.37,'#b67a83');
    }
    for(let i=0;i<12;i++)for(let j=0;j<3;j++){
      block(this.world,x+1.25,baseY+3.31+j*.25,-1.5+i*.25,.12,.25,.25,(i+j)%2?'#fff8e9':'#333445');
    }
    this.makeArrow(x - 2.5,baseY,-1.55);
  }

  createCar(){
    this.chassis=new THREE.Group();this.world.add(this.chassis);
    const b=(x,y,z,w,h,d,c,custom)=>block(this.chassis,x,y,z,w,h,d,c,custom);
    this.carSkinMeshes=[];
    const sb=(role,x,y,z,w,h,d,hex)=>{
      const shaded=materials(hex).map(material=>material.clone());
      const base=color(hex);
      const shades=shaded.map(material=>{
        const channel=base.r || base.g || base.b || 1;
        return material.color.r / channel;
      });
      const mesh=block(this.chassis,x,y,z,w,h,d,hex,shaded);
      this.carSkinMeshes.push({mesh,role,shades});
      return mesh;
    };
    sb('dark',0,-.1,0,3.21,.30,1.25,'#edbd18');
    sb('primary',-.02,.12,0,3.35,.4,1.43,'#ffd42a');
    b(0,-.32,0,2.5,.16,.85,'#30313c');
    // Rear gray hardtop and yellow cab retain the voxel proportions.
    b(-.90,.64,0,1.27,.79,1.39,'#bfc6cf');
    b(-.90,1.06,0,1.32,.14,1.45,'#c6cbd2');
    sb('primary',.10,.69,0,1.02,.79,1.38,'#ffd620');
    sb('light',.08,1.10,0,1.10,.13,1.47,'#ffde22');
    sb('secondary',1.08,.40,0,1.13,.42,1.45,'#ffcf21');
    sb('light',1.08,.64,0,1.15,.09,1.47,'#ffe12c');
    for(const z of [-.705,.705]){
      b(-.91,.73,z,.76,.26,.019,'#394355');
      b(-.91,.83,z+.002,.76,.04,.025,'#657086');
      b(.11,.77,z,.75,.34,.025,'#2e394c');
      b(.07,.89,z+.002,.67,.046,.03,'#4a5465');
      sb('highlight',.42,.73,z+.009,.028,.35,.026,'#fff0a3');
      sb('highlight',.02,.37,z+.02,1.0,.10,.035,'#fff077');
      sb('highlight',1.10,.39,z+.027,.95,.09,.028,'#fff383');
      sb('dark',-.25,.47,z+.027,.15,.045,.027,'#b68f19');
      sb('dark',.60,.73,z*1.11,.18,.14,.19,'#dfba26');
    }
    // Back window, two tail lamps, and yellow frame strips.
    b(-1.551,.72,0,.021,.31,1.05,'#525e70');
    b(-1.558,.72,0,.025,.40,.09,'#bfc6cf');
    for(const z of [-.57,.57]){
      b(-1.70,.13,z,.03,.20,.16,'#f04639');
      sb('secondary',-1.725,-.02,z,.025,.09,.16,'#ffbe2b');
      sb('highlight',1.765,.40,z,.025,.20,.23,'#fff3a1');
    }
    sb('dark',1.74,.19,0,.15,.16,1.62,'#e2b427');
    b(1.82,.24,0,.03,.17,.69,'#6d642d');
    sb('secondary',-1.70,-.17,0,.18,.15,1.60,'#ebc424');
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
    if (this.course.jet === true) {
      this.wheelMeshes.flat().forEach(mesh => { mesh.visible = false; });
      this.axles.forEach(axle => { axle.visible = false; });
    }
    this.suspensions=[];
    for(let i=0;i<2;i++)for(const side of [-1,1]){
      const arm=block(this.world,0,0,side*.8,.095,1,.095,'#555465');this.suspensions.push(arm);
    }
    if (this.course.jet === true) this.suspensions.forEach(arm => { arm.visible = false; });
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
    this.jetFlames = [];
    if (this.course.jet === true) {
      for (const x of [-1.25, 1.25]) {
        const jet = new THREE.Mesh(new THREE.ConeGeometry(.32, 1.25, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ff9d1e', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
        jet.position.set(x, -.58, 0); jet.rotation.z = Math.PI; jet.visible = false; this.chassis.add(jet); this.jetFlames.push(jet);
      }
    }
  }

  reset(){this.followX=0;this.lastX=0;this.focus.set(1.8,2.1,0);this.camera.zoom=BASE_CAMERA_ZOOM;this.camera.updateProjectionMatrix();this.shake=0;for(const p of this.particles)this.scene.remove(p.mesh);this.particles=[];}
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
    if (this.trapVisual && state.trap) {
      const {gear,lasers,laserGlow,beam,lampMaterial,floor,sensor2Beam,sensor2LampMaterial,secondLasers,secondLaserGlow,secondGears}=this.trapVisual, trap=state.trap, secondTrapState=state.secondTrap;
      gear.visible=trap.visible;gear.position.set(trap.x,trap.y,0);gear.rotation.z=trap.angle;
      lasers.forEach(laser=>{laser.visible=trap.gateClosed;});
      laserGlow.opacity=.22+Math.sin(this.clock*15)*.07;
      floor.visible=!trap.visible || trap.phase==='done';
      const tint=trap.gateClosed?'#ff6550':'#63ffe3';
      lampMaterial.color.set(tint);beam.material.color.set(tint);
      beam.material.opacity=trap.gateClosed?.35+Math.sin(this.clock*9)*.2:.55;
      if (secondTrapState) {
        const secondClosed = secondTrapState.gateClosed;
        sensor2Beam.material.opacity = secondTrapState.visible ? .25 + Math.sin(this.clock*10)*.18 : .55;
        sensor2Beam.material.color.set(secondTrapState.visible ? '#ff6550' : '#ffca4a');
        sensor2LampMaterial.color.set(secondTrapState.visible ? '#ff6550' : '#ffca4a');
        secondLasers.visible = secondClosed;
        secondLaserGlow.opacity = .22 + Math.sin(this.clock*15)*.07;
        secondGears.forEach((mesh,index) => {
          const gearState = secondTrapState.gears[index];
          mesh.visible = secondTrapState.visible;
          if (gearState) {
            mesh.position.set(gearState.x,gearState.y,0);
            mesh.rotation.z=gearState.angle;
          }
        });
      }
    }
    if (this.blockerVisual && state.blocker) this.blockerVisual.rotation.z=state.blocker.angle;
    this.chassis.position.set(state.x,state.y,0);this.chassis.rotation.z=state.angle;
    this.seesawVisuals?.forEach((board,index) => {
      const seesaw = state.seesaws?.[index];
      if (!seesaw) return;
      board.position.set(seesaw.x,seesaw.y,0);
      board.rotation.z = seesaw.angle;
    });
    this.rotatingBaffleVisuals?.forEach((baffle,index) => {
      const stateBaffle = state.rotatingBaffles?.[index];
      if (stateBaffle) baffle.group.rotation.z = stateBaffle.angle;
      baffle.flames.forEach(({flame,material},flameIndex) => {
        flame.scale.y = .86 + Math.sin(this.clock * (28 + index * 2) + flameIndex) * .16;
        material.opacity = .4 + Math.sin(this.clock * 24 + flameIndex) * .12;
      });
    });
    this.upJetVisual?.forEach(({flame,material},index) => {
      const pulse = 1 + Math.sin(this.clock * (22 + index * 3) + index) * .08;
      flame.scale.y = pulse;
      material.opacity = (index === 0 ? .24 : index === 1 ? .34 : .58) + Math.sin(this.clock * 20 + index) * .05;
    });
    const jet = this.course.upJet;
    if (jet) this.upJetPuffs.forEach(({puff,material,offset},index) => {
      const progress = (this.clock * .72 + offset) % 1;
      puff.position.set(Math.sin(this.clock * 13 + index) * .28,jet.bottomY + progress * (jet.topY-jet.bottomY),0);
      puff.scale.setScalar(.7 + progress * .9);
      material.opacity = Math.sin(progress * Math.PI) * .72;
    });
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
    if (this.jetFlames?.length) {
      const active = Boolean(state.jetForward || state.jetReverse);
      this.jetFlames.forEach((jet, index) => { jet.visible = active && ((state.jetForward && index === 0) || (state.jetReverse && index === 1)); jet.scale.y = .8 + Math.sin(this.clock * 36 + index) * .14; });
    }
    const windmillAngles = state.windmillAngles || (state.windmillAngle === null ? [] : [state.windmillAngle]);
    this.windmillVisuals?.forEach((hub, index) => {
      if (windmillAngles[index] !== undefined) hub.rotation.z = windmillAngles[index];
    });
    if (this.hazardWindmillVisual && state.hazardWindmill) {
      this.hazardWindmillVisual.rotation.z = state.hazardWindmill.angle;
      this.hazardGearVisuals.forEach((gear, index) => {
        const gearState = state.hazardWindmill.gears[index];
        if (!gearState) return;
        gear.position.set(gearState.x, gearState.y, 0);
        gear.rotation.z = gearState.angle;
      });
    }
    this.hazardWindmillChainVisuals?.forEach((rotor, rotorIndex) => {
      const rotorState = state.hazardWindmillChain?.[rotorIndex];
      if (!rotorState) return;
      rotor.rotation.z = rotorState.angle;
      this.hazardWindmillChainGearVisuals[rotorIndex]?.forEach((gear, gearIndex) => {
        const gearState = rotorState.gears[gearIndex];
        if (!gearState) return;
        gear.position.set(gearState.x, gearState.y, 0);
        gear.rotation.z = gearState.angle;
      });
    });
    if (this.thirdRotorLaserVisual && state.thirdRotorLaser) {
      const laserState = state.thirdRotorLaser;
      this.thirdRotorLaserVisual.gate.visible = laserState.active;
      this.thirdRotorLaserVisual.gateMaterial.opacity = .28 + Math.sin(this.clock * 18) * .12;
      this.thirdRotorLaserVisual.sensorBeam.material.color.set(laserState.triggered ? '#ff6d7c' : '#63ffe3');
      this.thirdRotorLaserVisual.sensorBeam.material.opacity = laserState.active ? .82 : .5 + Math.sin(this.clock * 5) * .12;
    }
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
    const baseTargetY=2.1+Math.max(0,groundY(terrain,this.followX))*0.84;
    // Keep a jumping vehicle in view without letting the camera chase it
    // indefinitely. The zoom-out gives the player both the car and the track
    // context when a jet launch reaches a higher altitude.
    const altitude=Math.max(0,state.y-ground);
    const targetY=Math.max(baseTargetY,state.y+1.15);
    const targetZoom=THREE.MathUtils.clamp(BASE_CAMERA_ZOOM-Math.max(0,altitude-2)*.07,JUMP_CAMERA_ZOOM,BASE_CAMERA_ZOOM);
    this.camera.zoom=mix(this.camera.zoom || BASE_CAMERA_ZOOM,targetZoom,1-Math.exp(-dt*4));
    this.camera.updateProjectionMatrix();
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
