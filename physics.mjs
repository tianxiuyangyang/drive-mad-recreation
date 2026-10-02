import { World, Vec2, Chain, Box, Circle, RevoluteJoint, WheelJoint } from './vendor/planck.mjs';

// Metres, seconds and radians. The rendered scene uses the same coordinates.
const COURSE_1_PARTS = Object.freeze([
  Object.freeze([{x:-4,y:0},{x:5,y:0}].map(Object.freeze)),
  Object.freeze([
    {x:5,y:0},{x:6,y:.15},{x:7,y:.48},{x:8,y:.95},{x:9,y:1.53},{x:10,y:2.15},
    {x:11,y:2.78},{x:12,y:3.39},{x:13,y:3.94},{x:14,y:4.3},{x:18,y:4.3},
    {x:19,y:3.96},{x:20,y:3.39},{x:21,y:2.69},{x:22,y:1.93},{x:23,y:1.18},
    {x:24,y:.56},{x:25,y:.16},{x:26,y:0},
  ].map(Object.freeze)),
  Object.freeze([{x:26,y:0},{x:38,y:0}].map(Object.freeze)),
  // Each long bank combines a forgiving landing slope, a short run-up and a
  // taller launch ramp. The sea gaps widen from nine to thirteen metres.
  Object.freeze([{x:38,y:0},{x:40,y:.55},{x:44,y:2.15},{x:48,y:3.8}].map(Object.freeze)),
  Object.freeze([{x:57,y:1.1},{x:61,y:.25},{x:72,y:.25},{x:74,y:.85},{x:78,y:2.35},{x:82,y:4}].map(Object.freeze)),
  Object.freeze([{x:92,y:1.35},{x:96,y:.35},{x:108,y:.35},{x:110,y:1},{x:114,y:2.7},{x:118,y:4.5}].map(Object.freeze)),
  Object.freeze([{x:129,y:1.65},{x:133,y:.45},{x:146,y:.45},{x:148,y:1.15},{x:152,y:3},{x:156,y:4.9}].map(Object.freeze)),
  Object.freeze([{x:168,y:1.9},{x:172,y:.55},{x:186,y:.55},{x:188,y:1.3},{x:193,y:3.35},{x:197,y:5.3}].map(Object.freeze)),
  Object.freeze([{x:210,y:2.15},{x:216,y:.75},{x:246,y:.75}].map(Object.freeze)),
]);
const COURSE_1 = Object.freeze({
  id: 1,
  title: 'First Gear',
  startX: 0,
  finishX: 232,
  minX: -4,
  maxX: 250,
  waterY: -2.1,
  finishTop: 3.45,
  finishY: .75,
  wheelRadius: 0.63,
  axleHalfWidth: 1.25,
  bridge: Object.freeze({ startX: 5, crestStartX: 14, crestEndX: 18, endX: 26, height: 4.3 }),
  terrain: Object.freeze(COURSE_1_PARTS.flat()),
  terrainParts: COURSE_1_PARTS,
  jumpGaps: Object.freeze([
    Object.freeze({startX:48,endX:57,height:3.8}),
    Object.freeze({startX:82,endX:92,height:4}),
    Object.freeze({startX:118,endX:129,height:4.5}),
    Object.freeze({startX:156,endX:168,height:4.9}),
    Object.freeze({startX:197,endX:210,height:5.3}),
  ]),
});

// The second and third tracks keep the same compact physics model as the
// original first track, but introduce ramps, drops and short flat sections so
// they feel like proper Drive Mad stages instead of menu placeholders.
const COURSE_2_PARTS = Object.freeze([
  Object.freeze([
    {x:-4,y:0},{x:8,y:0},{x:12,y:.3},{x:15,y:1.2},{x:18,y:1.2},
  ].map(Object.freeze)),
  Object.freeze([
    // The far bank begins after all three rising discs.
    {x:51.0,y:4.2},{x:54,y:3.2},{x:57,y:1.7},{x:60,y:.65},{x:62,y:0},
  ].map(Object.freeze)),
]);
const COURSE_2 = Object.freeze({
  id: 2,
  title: 'Windmill Crossing',
  startX: 0, finishX: 59, minX: -4, maxX: 62, waterY: -2.1, finishTop: 3.45,
  wheelRadius: .63, axleHalfWidth: 1.25,
  terrain: Object.freeze(COURSE_2_PARTS.flat()), terrainParts: COURSE_2_PARTS,
  windmills: Object.freeze([
    Object.freeze({x:24,y:1.35,halfLength:7.0,thickness:.58,speed:-.66,startAngle:.45}),
    Object.freeze({x:36,y:2.85,halfLength:7.0,thickness:.58,speed:-1.32,startAngle:.05}),
    Object.freeze({x:48,y:4.35,halfLength:7.0,thickness:.58,speed:-1.98,startAngle:-.3}),
  ]),
});

// Level three is mostly open sea: a short launch platform, a wide stretch of
// water, and one small island in the middle that carries the finish gate.
const COURSE_3_PARTS = Object.freeze([
  Object.freeze([
    {x:-4,y:0},{x:6,y:0},
  ].map(Object.freeze)),
  // A small sloped island sits in the middle of the sea like a launch ramp.
  Object.freeze([
    {x:34,y:0},{x:44,y:8},
  ].map(Object.freeze)),
  Object.freeze([
    {x:58,y:0},{x:72,y:7.5},{x:88,y:7.5},
  ].map(Object.freeze)),
]);
const COURSE_3 = Object.freeze({
  id: 3, title: 'Open Sea', startX: 0, finishX: 80, minX: -4, maxX: 104, waterY: -2.1, finishTop: 3.45, finishY: 7.5, finishTouch: true, rocketUp: 92,
  // A spinning gear stands on the plateau just before the gate and blocks the
  // ground route, so the last stretch has to be flown.
  blockerGear: Object.freeze({x:75,groundY:7.5,radius:.675,toothLength:.23,toothWidth:.17,teeth:14,spinSpeed:-2.4}),
  wheelRadius: .63, axleHalfWidth: 1.25, terrain: Object.freeze(COURSE_3_PARTS.flat()), terrainParts: COURSE_3_PARTS,
});

const JET_TUNNEL_PARTS = Object.freeze([
  Object.freeze([{x:-4,y:0},{x:10,y:0},{x:13,y:0},{x:13,y:-6},{x:23,y:-6},{x:27,y:-1.2},{x:30,y:0},{x:55.8,y:0}].map(Object.freeze)),
  Object.freeze([{x:61.2,y:0},{x:92,y:0}].map(Object.freeze)),
]);
const COURSE_5 = Object.freeze({
  id: 5, title: 'Jet Tunnel', startX: 0, finishX: 84, minX: -4, maxX: 92, waterY: -2.1, finishTop: 3.45, jet: true,
  wheelRadius: .63, axleHalfWidth: 1.25, terrain: Object.freeze(JET_TUNNEL_PARTS.flat()), terrainParts: JET_TUNNEL_PARTS,
  wallHeight: 14,
  gearTrap: Object.freeze({x:58.5,bottomY:-2.4,topY:7.2,radius:1.5,toothLength:.5,toothWidth:.38,teeth:12,riseSpeed:1.15,fallSpeed:1.1,holdSeconds:3,spinSpeed:-3}),
  secondTrap: Object.freeze({x:67.5,bottomY:-2.4,topY:13.2,radius:1.25,toothLength:.44,toothWidth:.34,teeth:12,moveSpeed:.625,upperSpeedFactor:.5,contactBoost:4,spinSpeed:3}),
  ceiling: Object.freeze({startX:2,endX:92,y:14,thickness:.55}),
  wallGaps: Object.freeze([
    Object.freeze({x:36,gapBottom:.775,gapTop:3.625}),
    Object.freeze({x:45,gapBottom:4.5,gapTop:7.5}),
    Object.freeze({x:54,gapBottom:.375,gapTop:3.225}),
    Object.freeze({x:63,gapBottom:6.2,gapTop:8.8,width:2.4}),
    Object.freeze({x:72,gapBottom:6.8,gapTop:9.4,width:2.4}),
  ]),
});
const COURSE_4_BRIDGE_START = 74;
const COURSE_4_PLANK_LENGTH = 7;
const COURSE_4_PLANK_SPACING = 10.5;
const COURSE_4_PLANK_COUNT = 14;
const COURSE_4_PLANK_RISE = .75;
const COURSE_4_SEESAWS = Object.freeze(Array.from({length:COURSE_4_PLANK_COUNT},(_,index)=>index)
  .filter(index => index !== 2)
  .map(index => Object.freeze({
  x:COURSE_4_BRIDGE_START + COURSE_4_PLANK_LENGTH / 2 + 1 + COURSE_4_PLANK_SPACING * index,
  y:12.22 + COURSE_4_PLANK_RISE * index,
  supportY:28,
  halfLength:COURSE_4_PLANK_LENGTH / 2,
  thickness:.22,
  limit:.06,
})));
const COURSE_4_LAND_PIECES = Object.freeze(Array.from({length:COURSE_4_SEESAWS.length - 1},(_,index)=>{
  const left = COURSE_4_SEESAWS[index], right = COURSE_4_SEESAWS[index + 1];
  return Object.freeze({
    x:(left.x + right.x) / 2,
    yLeft:left.y,
    yRight:right.y,
    width:right.x - left.x - 2 * (left.halfLength + .1),
  });
}));
const COURSE_4_PARTS = Object.freeze([
  Object.freeze([
    {x:-4,y:0},{x:10,y:0},{x:18,y:3},{x:30,y:9},{x:42,y:18},
    {x:50,y:15},{x:60,y:13},{x:70,y:12},{x:COURSE_4_BRIDGE_START,y:12.22},
  ].map(Object.freeze)),
  ...COURSE_4_LAND_PIECES.map(piece => Object.freeze([
    {x:piece.x-piece.width/2,y:piece.yLeft},{x:piece.x+piece.width/2,y:piece.yRight},
  ].map(Object.freeze))),
  Object.freeze([
    {x:COURSE_4_SEESAWS.at(-1).x + COURSE_4_PLANK_LENGTH / 2 + .8,y:.8},
    {x:242,y:0},{x:320,y:0},{x:345,y:0},
  ].map(Object.freeze)),
]);
const COURSE_4 = Object.freeze({
  id: 4, title: 'Ascending Planks', startX: 0, finishX: 300, minX: -4, maxX: 350, waterY: -2.1, finishTop: 3.45,
  wheelRadius: .63, axleHalfWidth: 1.25, terrain: Object.freeze(COURSE_4_PARTS.flat()), terrainParts: COURSE_4_PARTS,
  seesaws: COURSE_4_SEESAWS,
  landPieces: COURSE_4_LAND_PIECES,
  upJet: Object.freeze({x:72,width:3.4,bottomY:12,topY:24,force:90}),
  rotatingBaffles: Object.freeze([
    Object.freeze({x:64,y:12.2,length:6,thickness:.42,speed:.7}),
    Object.freeze({x:132,y:15,length:8,thickness:.5,speed:-1.35}),
    Object.freeze({x:170,y:16.5,length:9,thickness:.54,speed:-1.7}),
    Object.freeze({x:228,y:18,length:24,thickness:.8,speed:-2.1}),
  ]),
});
const COURSE_6_PARTS = Object.freeze([
  JET_TUNNEL_PARTS[0],
  Object.freeze([
    {x:61.2,y:0},{x:86,y:0},{x:88,y:.55},{x:100,y:.55},{x:102,y:0},{x:190,y:0},
  ].map(Object.freeze)),
]);
const COURSE_6 = Object.freeze({
  ...COURSE_5,
  id: 6,
  title: 'Gear Gauntlet',
  finishX: 150,
  maxX: 195,
  terrain: Object.freeze(COURSE_6_PARTS.flat()),
  terrainParts: COURSE_6_PARTS,
  wallHeight: 20,
  ceiling: Object.freeze({startX:2,endX:190,y:23,thickness:.55}),
  lowCeilings: Object.freeze([
    Object.freeze({startX:36,endX:72,y:14,thickness:.55}),
    Object.freeze({startX:72,endX:89,y:16.1,thickness:.55}),
    Object.freeze({startX:86,endX:126,y:20.3,thickness:.55}),
    Object.freeze({startX:103,endX:150,y:17.9,thickness:.55}),
  ]),
  lowCeilingConnectors: Object.freeze([
    Object.freeze({x:72,bottomY:14,topY:16.1,thickness:.55}),
    Object.freeze({x:89,bottomY:16.1,topY:20.3,thickness:.55}),
    Object.freeze({x:103,bottomY:17.9,topY:20.3,thickness:.55}),
    Object.freeze({x:126,bottomY:17.9,topY:20.3,thickness:.55}),
  ]),
  wallGaps: Object.freeze([
    COURSE_5.wallGaps[0],
    Object.freeze({...COURSE_5.wallGaps[4], gapBottom:5.5, gapTop:10.7}),
  ]),
  gearTrap: undefined,
  secondTrap: undefined,
  hazardWindmill: Object.freeze({
    x: 58.5, y: 6.55, halfLength: 5.9, thickness: .82, startAngle: .34, spinSpeed: -.62,
    gearRadius: 1.18, gearTeeth: 14, toothLength: .38, toothWidth: .27, gearSpinSpeed: -1.9,
  }),
  hazardWindmillChain: Object.freeze([
    Object.freeze({
      x: 80.2, y: 7.1, halfLength: 7.0, thickness: 1.02, startAngle: Math.PI, spinSpeed: -.27, armCount: 3,
      gearRadius: 1.35, gearTeeth: 16, toothLength: .42, toothWidth: .31, gearSpinSpeed: -.86,
    }),
    Object.freeze({
      x: 94.2, y: 11.1, halfLength: 7.2, thickness: 1.08, startAngle: .72, spinSpeed: .24,
      gearRadius: 1.42, gearTeeth: 16, toothLength: .44, toothWidth: .33, gearSpinSpeed: .79,
    }),
    Object.freeze({
      x: 111.7, y: 8.8, halfLength: 7.1, thickness: .52, startAngle: 1.26, spinSpeed: -.29, armCount: 3,
      gearRadius: 1.38, gearTeeth: 16, toothLength: .42, toothWidth: .32, gearSpinSpeed: -.91,
    }),
  ]),
  thirdRotorLaser: Object.freeze({
    sensorX:111.7,sensorBottom:8.8,sensorTop:17.6,gateX:120.55,gateBottom:0,gateTop:17.6,duration:25,
  }),
  laserCrate: Object.freeze({x:119.255,y:1.25,width:2.5,height:2.5,depth:2.5}),
});

export const LEVELS = Object.freeze([COURSE_1, COURSE_2, COURSE_3, COURSE_4, COURSE_5, COURSE_6]);
export const COURSE = COURSE_1;
// Shared beam dimensions keep the visible laser rows and collisions aligned.
export const TRAP_LASER = Object.freeze({width:.09,height:.055,spacing:.22});
export function trapLaserRows(wall) {
  const count = Math.ceil((wall.gapTop-wall.gapBottom)/TRAP_LASER.spacing);
  return Array.from({length:count},(_,i)=>wall.gapBottom+(i+.5)*(wall.gapTop-wall.gapBottom)/count);
}
export function getCourse(level = 1) {
  const id = Number(level) || 1;
  return LEVELS.find(course => course.id === id) || COURSE_1;
}

export const VEHICLE = Object.freeze({
  bodyWidth: 3.25,
  bodyHeight: 0.5,
  wheelRadius: COURSE.wheelRadius,
  axleHalfWidth: COURSE.axleHalfWidth,
  cabinX: 0.18,
  cabinY: 0.53,
  cabinWidth: 1.44,
  cabinHeight: 0.6,
  suspensionFrequency: 5,
  suspensionDamping: 0.8,
  motorSpeed: 24,
  motorTorque: 18,
});

const FIXED_STEP = 1 / 120;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const normalizedAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export class VehiclePhysics {
  constructor(level = 1) {
    this.course = getCourse(level);
    this.testMode = false;
    this.reset();
  }

  setTestMode(enabled) {
    this.testMode = Boolean(enabled);
    return this.getState();
  }

  setLevel(level) {
    this.course = getCourse(level);
    return this.reset();
  }

  reset() {
    this.world = new World({ gravity: Vec2(0, -13), allowSleep: true });
    this.status = 'ready';
    this.time = 0;
    this.accumulator = 0;
    this.finishContactTime = 0;
    this.crashReason = null;
    this.rocketFuel = this.course.id === 3 ? 2.4 : 0;
    this.rocketActive = false;
    this.jetForward = false;
    this.jetReverse = false;
    this.trapElapsed = null;
    this.trapPhase = 'idle';
    this.gearHit = false;
    this.trapGear = null;
    this.trapGate = null;
    this.trapGates = [];
    this.trapCrossingPending = false;
    this.trapFloor = null;
    this.blockerGear = null;
    this.hazardWindmill = null;
    this.hazardGears = [];
    this.hazardWindmillChain = [];
    this.hazardChainGears = [];
    this.thirdSensor = null;
    this.thirdLaserGate = null;
    this.thirdLaserTriggered = false;
    this.thirdLaserActivated = false;
    this.thirdLaserActive = false;
    this.thirdLaserElapsed = 0;
    this.seesaws = [];
    this.rotatingBaffles = [];
    this.secondTrapElapsed = null;
    this.secondTrapPhase = 'idle';
    this.secondTrapCrossingPending = false;
    this.secondTrapGears = [];
    this.secondTrapGate = null;
    this.groundContacts = [new Set(), new Set()];
    this.windmillContacts = [new Set(), new Set()];
    this.roofContacts = new Set();

    const ground = this.world.createBody();
    const course = this.course;
    for (const terrain of course.terrainParts || [course.terrain]) {
      ground.createFixture(Chain(terrain, false), {
        friction: 1.2, restitution: 0, userData: { kind: 'ground' },
      });
    }
    for (const config of course.seesaws || []) {
      const pivot = this.world.createBody({position:Vec2(config.x,config.y)});
      const board = this.world.createDynamicBody({
        position:Vec2(config.x,config.y),
        angularDamping:.75,
        linearDamping:.08,
        bullet:true,
        userData:{kind:'seesaw'},
      });
      board.createFixture(Box(config.halfLength,config.thickness/2),{
        density:.9,friction:1.15,restitution:0,filterGroupIndex:-16,userData:{kind:'seesaw'},
      });
      this.world.createJoint(RevoluteJoint({
        enableLimit:true,
        lowerAngle:-config.limit,
        upperAngle:config.limit,
      },pivot,board,Vec2(config.x,config.y)));
      this.seesaws.push({body:board,pivot,config});
    }
    for (const config of course.rotatingBaffles || []) {
      const body = this.world.createKinematicBody({position:Vec2(config.x,config.y),angle:0});
      body.createFixture(Box(config.length / 2,config.thickness / 2),{
        friction:1.1,restitution:0,userData:{kind:'rotating-baffle'},
      });
      body.setAngularVelocity(config.speed);
      this.rotatingBaffles.push(body);
    }
    if (course.wallGaps) {
      const walls = this.world.createBody();
      for (const wall of course.wallGaps) {
        const wallHalfWidth = (wall.width || .84) / 2;
        if (wall.gapBottom > 0) walls.createFixture(Box(wallHalfWidth, wall.gapBottom / 2, Vec2(wall.x, wall.gapBottom / 2), 0), { friction: 0.8, userData: { kind: 'ground' } });
        const upperHeight = course.wallHeight - wall.gapTop;
        walls.createFixture(Box(wallHalfWidth, upperHeight / 2, Vec2(wall.x, wall.gapTop + upperHeight / 2), 0), { friction: 0.8, userData: { kind: 'ground' } });
      }
    }
    if (course.ceiling) {
      const {startX, endX, y, thickness} = course.ceiling;
      const ceiling = this.world.createBody();
      ceiling.createFixture(Box((endX - startX) / 2, thickness / 2, Vec2((startX + endX) / 2, y), 0), { friction: 0.8, userData: { kind: 'ground' } });
    }
    for (const {startX, endX, y, thickness} of course.lowCeilings || []) {
      const ceiling = this.world.createBody();
      ceiling.createFixture(Box((endX - startX) / 2, thickness / 2, Vec2((startX + endX) / 2, y), 0), { friction: 0.8, userData: { kind: 'safe-ceiling' } });
    }
    for (const {x, bottomY, topY, thickness} of course.lowCeilingConnectors || []) {
      const connector = this.world.createBody();
      connector.createFixture(Box(thickness / 2, (topY - bottomY) / 2, Vec2(x, (bottomY + topY) / 2), 0), { friction: 0.8, userData: { kind: 'safe-ceiling' } });
    }
    if (course.hazardWindmill) {
      const config = course.hazardWindmill;
      this.hazardWindmill = this.world.createKinematicBody({ position: Vec2(config.x, config.y), angle: config.startAngle });
      const armCount = config.armCount || 4;
      for (let i = 0; i < armCount; i++) {
        const angle = i * Math.PI * 2 / armCount;
        this.hazardWindmill.createFixture(Box(config.halfLength / 2, config.thickness / 2, Vec2(Math.cos(angle) * config.halfLength / 2, Math.sin(angle) * config.halfLength / 2), angle), {
          friction: 1.8, restitution: 0, userData: { kind: config.lethalBlades ? 'hazard-blade' : 'windmill' },
        });
      }
      const gearFixture = { friction: 1.2, restitution: 0, userData: { kind: 'hazard-gear' } };
      for (let i = 0; i < armCount; i++) {
        const angle = config.startAngle + i * Math.PI * 2 / armCount;
        const gear = this.world.createKinematicBody({
          position: Vec2(config.x + Math.cos(angle) * config.halfLength, config.y + Math.sin(angle) * config.halfLength),
          angle,
        });
        gear.createFixture(Circle(config.gearRadius), gearFixture);
        for (let n = 0; n < config.gearTeeth; n++) {
          const toothAngle = n * Math.PI * 2 / config.gearTeeth;
          gear.createFixture(Box(config.toothLength / 2, config.toothWidth / 2, Vec2(Math.cos(toothAngle) * config.gearRadius, Math.sin(toothAngle) * config.gearRadius), toothAngle), gearFixture);
        }
        this.hazardGears.push(gear);
      }
    }
    if (course.hazardWindmillChain) {
      for (const config of course.hazardWindmillChain) {
        const rotor = this.world.createKinematicBody({ position: Vec2(config.x, config.y), angle: config.startAngle });
        const armCount = config.armCount || 4;
        for (let i = 0; i < armCount; i++) {
          const angle = i * Math.PI * 2 / armCount;
          rotor.createFixture(Box(config.halfLength / 2, config.thickness / 2, Vec2(Math.cos(angle) * config.halfLength / 2, Math.sin(angle) * config.halfLength / 2), angle), {
            friction: 1.8, restitution: 0, userData: { kind: config.lethalBlades ? 'hazard-blade' : 'windmill' },
          });
        }
        const gears = [];
        const gearFixture = { friction: 1.2, restitution: 0, userData: { kind: 'hazard-gear' } };
        for (let i = 0; i < armCount; i++) {
          const angle = config.startAngle + i * Math.PI * 2 / armCount;
          const gear = this.world.createKinematicBody({
            position: Vec2(config.x + Math.cos(angle) * config.halfLength, config.y + Math.sin(angle) * config.halfLength),
            angle,
          });
          gear.createFixture(Circle(config.gearRadius), gearFixture);
          for (let n = 0; n < config.gearTeeth; n++) {
            const toothAngle = n * Math.PI * 2 / config.gearTeeth;
            gear.createFixture(Box(config.toothLength / 2, config.toothWidth / 2, Vec2(Math.cos(toothAngle) * config.gearRadius, Math.sin(toothAngle) * config.gearRadius), toothAngle), gearFixture);
          }
          gears.push(gear);
        }
        this.hazardWindmillChain.push(rotor);
        this.hazardChainGears.push(gears);
      }
    }
    if (course.thirdRotorLaser) {
      const config = course.thirdRotorLaser;
      this.thirdSensor = this.world.createBody({ position: Vec2(config.sensorX, (config.sensorBottom + config.sensorTop) / 2) });
      this.thirdSensor.createFixture(Box(.18, (config.sensorTop - config.sensorBottom) / 2), {
        isSensor: true, friction: 0, restitution: 0, userData: { kind: 'third-rotor-sensor' },
      });
      this.thirdLaserGate = this.world.createBody();
      for (const y of trapLaserRows({gapBottom:config.gateBottom,gapTop:config.gateTop})) {
        this.thirdLaserGate.createFixture(Box(TRAP_LASER.width / 2, TRAP_LASER.height / 2, Vec2(0, y)), {
          friction: 0, restitution: 0, userData: { kind: 'trap-laser' },
        });
      }
      this.thirdLaserGate.setTransform(Vec2(config.gateX, 0), 0);
      this.thirdLaserGate.setActive(false);
    }
    if (course.laserCrate) {
      const crate = course.laserCrate;
      const crateBody = this.world.createBody();
      crateBody.createFixture(Box(crate.width / 2, crate.height / 2, Vec2(crate.x, crate.y)), {
        friction: 1.15, restitution: 0, userData: { kind: 'ground' },
      });
    }
    if (course.gearTrap) {
      const trap = course.gearTrap;
      this.trapGates = course.wallGaps.slice(2,4).map(gate=>{
        const body = this.world.createBody({position:Vec2(gate.x,0)});
        for (const y of trapLaserRows(gate)) {
          body.createFixture(Box(TRAP_LASER.width/2,TRAP_LASER.height/2,Vec2(0,y)), {friction:0,restitution:0,userData:{kind:'trap-laser'}});
        }
        body.setActive(false);
        return body;
      });
      this.trapGate = this.trapGates[1];
      this.trapGear = this.world.createKinematicBody({position:Vec2(trap.x,trap.bottomY)});
      const fixture = {friction:1.2,userData:{kind:'trap-gear'}};
      this.trapGear.createFixture(Circle(trap.radius),fixture);
      for(let i=0;i<trap.teeth;i++) {
        const angle=i*Math.PI*2/trap.teeth;
        this.trapGear.createFixture(Box(trap.toothLength/2,trap.toothWidth/2,Vec2(Math.cos(angle)*trap.radius,Math.sin(angle)*trap.radius),angle),fixture);
      }
      this.trapGear.setActive(false);
      this.trapFloor = this.world.createBody();
      this.trapFloor.createFixture(Box(2.7,.18,Vec2(trap.x,-.18),0), {friction:1.2,userData:{kind:'ground'}});
      this.trapFloor.setActive(true);
      const secondTrap = course.secondTrap;
      if (secondTrap) {
        const fifth = course.wallGaps[4];
        this.secondTrapGate = this.world.createBody({position:Vec2(fifth.x,0)});
        for (const y of trapLaserRows(fifth)) {
          this.secondTrapGate.createFixture(Box(TRAP_LASER.width/2,TRAP_LASER.height/2,Vec2(0,y)), {friction:0,restitution:0,userData:{kind:'trap-laser'}});
        }
        this.secondTrapGate.setActive(false);
        const fixture = {friction:1.2,userData:{kind:'trap-gear'}};
        const lowerGear = this.world.createKinematicBody({position:Vec2(secondTrap.x,secondTrap.bottomY)});
        const upperGear = this.world.createKinematicBody({position:Vec2(secondTrap.x,secondTrap.topY)});
        for (const gear of [lowerGear,upperGear]) {
          gear.createFixture(Circle(secondTrap.radius),fixture);
          for (let i=0;i<secondTrap.teeth;i++) {
            const angle=i*Math.PI*2/secondTrap.teeth;
            gear.createFixture(Box(secondTrap.toothLength/2,secondTrap.toothWidth/2,Vec2(Math.cos(angle)*secondTrap.radius,Math.sin(angle)*secondTrap.radius),angle),fixture);
          }
          gear.setActive(false);
        }
        this.secondTrapGears = [lowerGear,upperGear];
      }
    }
    if (course.blockerGear) {
      const gear = course.blockerGear;
      const outerRadius = gear.radius + gear.toothLength / 2;
      this.blockerGear = this.world.createKinematicBody({ position: Vec2(gear.x, gear.groundY + outerRadius) });
      const gearFixture = { friction: 1.1, restitution: 0, userData: { kind: 'blocker-gear' } };
      this.blockerGear.createFixture(Circle(gear.radius), gearFixture);
      for (let i = 0; i < gear.teeth; i++) {
        const angle = i * Math.PI * 2 / gear.teeth;
        this.blockerGear.createFixture(Box(gear.toothLength / 2, gear.toothWidth / 2, Vec2(Math.cos(angle) * gear.radius, Math.sin(angle) * gear.radius), angle), gearFixture);
      }
      this.blockerGear.setAngularVelocity(gear.spinSpeed);
    }

    this.windmills = [];
    const windmillConfigs = course.windmills || (course.windmill ? [course.windmill] : []);
    for (const config of windmillConfigs) {
      const {x,y,halfLength,thickness,startAngle} = config;
      const windmill = this.world.createKinematicBody({position:Vec2(x,y),angle:startAngle});
      for (const angle of [0,Math.PI/2]) {
        windmill.createFixture(Box(halfLength,thickness/2,Vec2(0,0),angle), {
          friction:2.2,restitution:0,userData:{kind:'windmill'},
        });
      }
      this.windmills.push(windmill);
    }
    // Keep the singular alias for older scene integrations and diagnostics.
    this.windmill = this.windmills[0] || null;

    this.body = this.world.createDynamicBody({
      position: Vec2(course.startX, 1.2),
      linearDamping: 0.015,
      angularDamping: 0.18,
      bullet: true,
      userData: { kind: 'chassis' },
    });
    const vehicleFilter = { filterGroupIndex: -1 };
    this.body.createFixture(Box(VEHICLE.bodyWidth / 2, VEHICLE.bodyHeight / 2), {
      density: 1.7, friction: 0.35, ...vehicleFilter,
      userData: { kind: 'chassis' },
    });
    this.body.createFixture(Box(0.72, 0.3, Vec2(VEHICLE.cabinX, VEHICLE.cabinY)), {
      density: 0.42, friction: 0.3, ...vehicleFilter,
      userData: { kind: 'cabin' },
    });
    this.body.createFixture(Box(0.76, 0.045, Vec2(VEHICLE.cabinX, 0.865)), {
      density: 0.05, friction: 0.3, ...vehicleFilter,
      userData: { kind: 'roof' },
    });

    this.wheels = [];
    this.joints = [];
    for (const [index, offset] of [-course.axleHalfWidth, course.axleHalfWidth].entries()) {
      const wheel = this.world.createDynamicBody({
        position: Vec2(course.startX + offset, 0.655),
        linearDamping: 0.015,
        angularDamping: 0.015,
        bullet: true,
        userData: { kind: 'wheel', index },
      });
      wheel.createFixture(Circle(course.wheelRadius), {
        density: 0.72, friction: 1.65, restitution: 0.03,
        ...vehicleFilter, userData: { kind: 'wheel', index },
      });
      const joint = this.world.createJoint(WheelJoint({
        enableMotor: true,
        motorSpeed: 0,
        maxMotorTorque: 2,
        frequencyHz: VEHICLE.suspensionFrequency,
        dampingRatio: VEHICLE.suspensionDamping,
      }, this.body, wheel, wheel.getPosition(), Vec2(0, 1)));
      this.wheels.push(wheel);
      this.joints.push(joint);
    }

    this.world.on('begin-contact', contact => this.updateContact(contact, true));
    this.world.on('end-contact', contact => this.updateContact(contact, false));

    // Settle suspension before the first rendered frame without starting the clock.
    for (let i = 0; i < 180; i++) this.world.step(FIXED_STEP, 8, 4);
    this.body.setLinearVelocity(Vec2());
    this.body.setAngularVelocity(0);
    for (const wheel of this.wheels) {
      wheel.setLinearVelocity(Vec2());
      wheel.setAngularVelocity(0);
    }
    return this.getState();
  }

  updateContact(contact, touching) {
    const a = contact.getFixtureA().getUserData();
    const b = contact.getFixtureB().getUserData();
    const vehicleKinds = ['wheel','chassis','cabin','roof'];
    const lethalGear = ['trap-gear','blocker-gear','hazard-gear','hazard-blade'];
    if (touching && lethalGear.some(kind => (a?.kind === kind && vehicleKinds.includes(b?.kind)) || (b?.kind === kind && vehicleKinds.includes(a?.kind)))) this.gearHit = true;
    if (touching && !this.thirdLaserActivated && ((a?.kind === 'third-rotor-sensor' && vehicleKinds.includes(b?.kind)) || (b?.kind === 'third-rotor-sensor' && vehicleKinds.includes(a?.kind)))) {
      this.thirdLaserTriggered = true;
      this.thirdLaserActivated = true;
    }
    const surface = a?.kind === 'ground' || a?.kind === 'seesaw' || a?.kind === 'windmill' ? a : b?.kind === 'ground' || b?.kind === 'seesaw' || b?.kind === 'windmill' ? b : null;
    const vehicle = surface === a ? b : surface === b ? a : null;
    if (!vehicle || !surface) return;
    let contacts;
    if (vehicle.kind === 'wheel') contacts = surface.kind === 'windmill' ? this.windmillContacts[vehicle.index] : this.groundContacts[vehicle.index];
    if (vehicle.kind === 'roof' && surface.kind === 'ground') contacts = this.roofContacts;
    if (contacts) touching ? contacts.add(contact) : contacts.delete(contact);
  }

  wheelGrounded(index) {
    return this.groundContacts[index].size > 0 || this.windmillContacts[index].size > 0;
  }

  step(dt, throttle = 0, rocket = false) {
    if (!Number.isFinite(dt) || dt <= 0) return this.getState();
    throttle = Number.isFinite(throttle) ? clamp(throttle, -1, 1) : 0;
    if (this.status === 'won' || this.status === 'crashed') return this.getState();
    if (this.status === 'ready' && (Math.abs(throttle) > 0.01 || rocket)) this.status = 'running';
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      this.integrate(throttle, rocket);
      this.accumulator -= FIXED_STEP;
      if (this.status === 'won' || this.status === 'crashed') {
        this.accumulator = 0;
        break;
      }
    }
    return this.getState();
  }

  integrate(throttle, rocket = false) {
    const previousPosition = Vec2(this.body.getPosition());
    this.advanceTrap();
    this.advanceHazardWindmill();
    this.advanceThirdLaser();
    const windmillConfigs = this.course.windmills || (this.course.windmill ? [this.course.windmill] : []);
    this.windmills.forEach((windmill, index) => windmill.setAngularVelocity(windmillConfigs[index].speed));
    if (this.blockerGear) this.blockerGear.setAngularVelocity(this.course.blockerGear.spinSpeed);
    if (this.rotatingBaffles.length) {
      this.rotatingBaffles.forEach((body,index)=>body.setAngularVelocity(this.course.rotatingBaffles[index].speed));
    }
    if (this.course.upJet) {
      const jet = this.course.upJet;
      const position = this.body.getPosition();
      if (Math.abs(position.x - jet.x) <= jet.width / 2 && position.y >= jet.bottomY && position.y <= jet.topY) {
        this.body.applyForceToCenter(Vec2(0, jet.force), true);
      }
    }
    const hasInput = Math.abs(throttle) > 0.01;
    const driveTorque = throttle < 0 ? VEHICLE.motorTorque * 5 : VEHICLE.motorTorque;
    for (let i = 0; i < this.joints.length; i++) {
      const grounded = this.wheelGrounded(i);
      const joint = this.joints[i];
      const powered = i === 0; // rear axle only; the front axle freewheels
      // A motor applies equal and opposite torques to wheel and chassis. Its
      // reduced airborne torque lets the player correct a jump physically.
      const motorFactor = throttle < 0 ? 1.5 : 1;
      joint.setMotorSpeed(powered ? -throttle * VEHICLE.motorSpeed * motorFactor : 0);
      joint.setMaxMotorTorque(powered && hasInput ? driveTorque * (grounded ? 1 : 0.15) : 0);
    }
    // A short drivetrain push keeps reverse responsive with only the rear axle
    // powered, while remaining grounded so airborne momentum is unchanged.
    if (throttle < -0.01 && this.wheelGrounded(0)) {
      this.body.applyForceToCenter(Vec2(-14, 0), true);
    }
    this.rocketActive = this.course.id === 3 && rocket && this.rocketFuel > 0;
    this.jetForward = this.course.jet === true && throttle > 0.01;
    this.jetReverse = this.course.jet === true && throttle < -0.01;
    if (this.course.jet === true) {
      for (const joint of this.joints) { joint.setMotorSpeed(0); joint.setMaxMotorTorque(0); }
      const thrust = 125;
      if (this.jetForward || this.jetReverse) {
        this.body.applyForceToCenter(Vec2((this.jetForward ? 1 : -1) * 80, thrust), true);
        const velocity = this.body.getLinearVelocity();
        this.body.setLinearVelocity(Vec2(clamp(velocity.x, -18, 18), clamp(velocity.y, -18, 18)));
      }
    }
    // The rotating blade transfers momentum into the chassis. A small
    // stabilizing torque while a wheel is on the blade keeps the exit
    // readable and gives the far bank a fair landing angle.
    if (this.windmills.length && (this.windmillContacts[0].size || this.windmillContacts[1].size)) {
      const angle = normalizedAngle(this.body.getAngle());
      this.body.applyTorque(clamp(-angle * 250, -90, 90), true);
      this.body.setAngularVelocity(clamp(this.body.getAngularVelocity(), -1.65, 1.65));
      if (this.body.getLinearVelocity().x < 1.2) this.body.applyForceToCenter(Vec2(110, 0), true);
    }
    if (this.rocketActive) {
      const angle = this.body.getAngle();
      const forward = Vec2(Math.cos(angle), Math.sin(angle));
      const up = Vec2(-Math.sin(angle), Math.cos(angle));
      const rocketUp = this.course.rocketUp ?? 58;
      this.body.applyForceToCenter(Vec2(forward.x * 150 + up.x * rocketUp, forward.y * 150 + up.y * rocketUp), true);
      // Long rocket flights over open water need a flyable attitude; without
      // this the nose drops and the car dives straight into the sea.
      if (!this.wheelGrounded(0) && !this.wheelGrounded(1)) {
        const flightAngle = normalizedAngle(this.body.getAngle());
        const flightSpin = this.body.getAngularVelocity();
        this.body.applyTorque(clamp(-flightAngle * 230 - flightSpin * 62, -150, 150), true);
      }
      this.rocketFuel = Math.max(0, this.rocketFuel - FIXED_STEP);
    }
    this.world.step(FIXED_STEP, 8, 4);
    if (this.status === 'running') this.time += FIXED_STEP;

    const position = this.body.getPosition();
    this.detectTrapCrossing(previousPosition, position);
    this.detectSecondTrapCrossing(previousPosition, position);
    if (this.gearHit) return this.crash('gear');
    if (this.roofContacts.size > 0) return this.crash('roof');
    const course = this.course;
    // Any part of the car touching the water surface is fatal, on every level.
    let touchesWater = false;
    for (const body of [this.body, ...this.wheels]) {
      for (let fixture=body.getFixtureList(); fixture; fixture=fixture.getNext()) {
        if (fixture.getAABB(0).lowerBound.y <= course.waterY + .02) { touchesWater = true; break; }
      }
      if (touchesWater) break;
    }
    if (touchesWater) return this.crash('water');
    if (position.x < course.minX - 0.8 || position.x > course.maxX + 2) return this.crash('bounds');

    // The finish is a generous vertical trigger zone. Any part of the car
    // crossing it counts, including an airborne rocket jump.
    const bodyRight = position.x + VEHICLE.bodyWidth / 2;
    const vehicleBottom = Math.min(position.y - .6, ...this.wheels.map(wheel => wheel.getPosition().y - course.wheelRadius));
    const vehicleTop = Math.max(position.y + 1.42, ...this.wheels.map(wheel => wheel.getPosition().y + course.wheelRadius));
    const finishGround = course.finishY ?? 0;
    let vehicleInFinish;
    if (course.finishTouch) {
      // This level only ends when the car physically reaches the finish gate.
      const gateLeft = course.finishX, gateRight = course.finishX + 2.5;
      const gateBottom = finishGround, gateTop = finishGround + course.finishTop;
      vehicleInFinish = false;
      for (const body of [this.body, ...this.wheels]) {
        for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
          const aabb = fixture.getAABB(0);
          if (aabb.upperBound.x > gateLeft && aabb.lowerBound.x < gateRight && aabb.upperBound.y > gateBottom && aabb.lowerBound.y < gateTop) { vehicleInFinish = true; break; }
        }
        if (vehicleInFinish) break;
      }
    } else {
      const insideGateHeight = vehicleBottom <= finishGround + course.finishTop && vehicleTop >= finishGround - .2;
      vehicleInFinish = insideGateHeight && (bodyRight >= course.finishX || this.wheels.some(wheel => wheel.getPosition().x >= course.finishX));
    }
    this.finishContactTime = vehicleInFinish ? this.finishContactTime + FIXED_STEP : 0;
    if (this.finishContactTime >= 0.12) this.status = 'won';
  }

  detectTrapCrossing(previous, current) {
    if (!this.trapGear || this.trapElapsed !== null || this.status !== 'running') return;
    const wall = this.course.wallGaps[2];
    const exitX = wall.x + (wall.width || .84)/2;
    if (current.x <= exitX) this.trapCrossingPending = false;
    if (previous.x <= exitX && current.x > exitX) {
      const fraction = (exitX-previous.x)/(current.x-previous.x);
      const crossingY = previous.y+(current.y-previous.y)*fraction;
      this.trapCrossingPending = crossingY > wall.gapBottom && crossingY < wall.gapTop;
    }
    if (!this.trapCrossingPending) return;
    // Wait until the whole car clears the third opening before closing behind it.
    for (const body of [this.body,...this.wheels]) {
      for (let fixture=body.getFixtureList();fixture;fixture=fixture.getNext()) {
        if (fixture.getAABB(0).lowerBound.x <= exitX+.08) return;
      }
    }
    this.trapElapsed = 0;
    this.trapPhase = 'rising';
    this.trapGates.forEach(gate=>gate.setActive(true));
    this.trapGear.setActive(true);
    this.trapFloor.setActive(false);
  }

  detectSecondTrapCrossing(previous, current) {
    if (!this.secondTrapGate || this.secondTrapElapsed !== null || this.status !== 'running') return;
    const wall = this.course.wallGaps[3];
    const exitX = wall.x + (wall.width || .84) / 2;
    if (current.x <= exitX) this.secondTrapCrossingPending = false;
    if (previous.x <= exitX && current.x > exitX) {
      const fraction = (exitX - previous.x) / (current.x - previous.x);
      const crossingY = previous.y + (current.y - previous.y) * fraction;
      this.secondTrapCrossingPending = crossingY > wall.gapBottom && crossingY < wall.gapTop;
    }
    if (!this.secondTrapCrossingPending) return;
    // Match the first detector: wait until the complete vehicle has cleared
    // the wall so the new laser cannot appear inside the car.
    for (const body of [this.body, ...this.wheels]) {
      for (let fixture=body.getFixtureList(); fixture; fixture=fixture.getNext()) {
        if (fixture.getAABB(0).lowerBound.x <= exitX + .08) return;
      }
    }
    this.secondTrapElapsed = 0;
    this.secondTrapPhase = 'moving';
    this.secondTrapGate.setActive(true);
    this.secondTrapGears.forEach(gear => gear.setActive(true));
  }

  advanceTrap() {
    if (this.trapElapsed !== null) {
      const trap = this.course.gearTrap;
      const distance = trap.topY-trap.bottomY;
      const riseTime = distance/trap.riseSpeed;
      const descendTime = riseTime+trap.holdSeconds;
      this.trapElapsed += FIXED_STEP;
      const t = this.trapElapsed;
      const y = t < riseTime ? trap.bottomY+t*trap.riseSpeed : t < descendTime ? trap.topY : Math.max(trap.bottomY,trap.topY-(t-descendTime)*trap.fallSpeed);
      this.trapPhase = t < riseTime ? 'rising' : t < descendTime ? 'holding' : y > trap.bottomY ? 'falling' : 'done';
      this.trapGates.forEach(gate=>gate.setActive(t < descendTime));
      this.trapFloor.setActive(this.trapPhase === 'done');
      this.trapGear.setLinearVelocity(Vec2(0,(y-this.trapGear.getPosition().y)/FIXED_STEP));
      this.trapGear.setAngularVelocity(trap.spinSpeed);
    }
    if (this.secondTrapElapsed === null) return;
    const trap = this.course.secondTrap;
    const distance = trap.topY - trap.bottomY;
    const upperSpeed = trap.moveSpeed * (trap.upperSpeedFactor ?? .5);
    const boost = trap.contactBoost ?? 4;
    const contactGap = (trap.radius + trap.toothLength / 2) * 2;
    // The gears accelerate once their teeth meet at the middle of the shaft.
    const contactTime = Math.max(0, (distance - contactGap) / (trap.moveSpeed + upperSpeed));
    const lowerFastSpeed = trap.moveSpeed * boost;
    const upperFastSpeed = upperSpeed * boost;
    const lowerContactY = trap.bottomY + contactTime * trap.moveSpeed;
    const upperContactY = trap.topY - contactTime * upperSpeed;
    const lowerArrivalTime = contactTime + (trap.topY - lowerContactY) / lowerFastSpeed;
    const upperArrivalTime = contactTime + (upperContactY - trap.bottomY) / upperFastSpeed;
    this.secondTrapElapsed += FIXED_STEP;
    const t = this.secondTrapElapsed;
    const lowerY = t <= contactTime ? trap.bottomY + t * trap.moveSpeed
      : Math.min(trap.topY, lowerContactY + (t - contactTime) * lowerFastSpeed);
    const upperY = t <= contactTime ? trap.topY - t * upperSpeed
      : Math.max(trap.bottomY, upperContactY - (t - contactTime) * upperFastSpeed);
    this.secondTrapPhase = t >= Math.max(lowerArrivalTime, upperArrivalTime) ? 'done' : 'moving';
    // The fifth opening opens the moment the lower gear reaches the top,
    // while the slower upper gear is still on its way down.
    this.secondTrapGate.setActive(t < lowerArrivalTime);
    this.secondTrapGears[0].setLinearVelocity(Vec2(0,(lowerY-this.secondTrapGears[0].getPosition().y)/FIXED_STEP));
    this.secondTrapGears[1].setLinearVelocity(Vec2(0,(upperY-this.secondTrapGears[1].getPosition().y)/FIXED_STEP));
    this.secondTrapGears.forEach(gear=>gear.setAngularVelocity(trap.spinSpeed));
  }

  advanceHazardRotor(config, rotor, gears) {
    const nextAngle = rotor.getAngle() + config.spinSpeed * FIXED_STEP;
    rotor.setAngularVelocity(config.spinSpeed);
    for (let i = 0; i < gears.length; i++) {
      const gear = gears[i];
      const angle = nextAngle + i * Math.PI * 2 / gears.length;
      const position = gear.getPosition();
      const targetX = config.x + Math.cos(angle) * config.halfLength;
      const targetY = config.y + Math.sin(angle) * config.halfLength;
      gear.setLinearVelocity(Vec2((targetX - position.x) / FIXED_STEP, (targetY - position.y) / FIXED_STEP));
      gear.setAngularVelocity(config.gearSpinSpeed);
    }
  }

  advanceHazardWindmill() {
    if (this.hazardWindmill) this.advanceHazardRotor(this.course.hazardWindmill, this.hazardWindmill, this.hazardGears);
    for (let i = 0; i < this.hazardWindmillChain.length; i++) {
      this.advanceHazardRotor(this.course.hazardWindmillChain[i], this.hazardWindmillChain[i], this.hazardChainGears[i]);
    }
  }

  advanceThirdLaser() {
    if (!this.thirdLaserGate) return;
    const config = this.course.thirdRotorLaser;
    if (this.thirdLaserTriggered && !this.thirdLaserActive) {
      this.thirdLaserActive = true;
      this.thirdLaserTriggered = false;
      this.thirdLaserElapsed = 0;
    }
    if (!this.thirdLaserActive) return;
    this.thirdLaserElapsed += FIXED_STEP;
    if (this.thirdLaserElapsed >= config.duration) {
      this.thirdLaserActive = false;
      this.thirdLaserElapsed = config.duration;
      this.thirdLaserGate.setActive(false);
      return;
    }
    this.thirdLaserGate.setActive(true);
  }

  crash(reason) {
    if (this.testMode) {
      this.gearHit = false;
      this.roofContacts.clear();
      return;
    }
    this.status = 'crashed';
    this.crashReason = reason;
  }

  getState() {
    const position = this.body.getPosition();
    const velocity = this.body.getLinearVelocity();
    const groundedWheels = this.groundContacts.map((contacts, i) => contacts.size > 0 || this.windmillContacts[i].size > 0);
    return {
      x: position.x,
      y: position.y,
      angle: this.body.getAngle(),
      vx: velocity.x,
      vy: velocity.y,
      angularVelocity: this.body.getAngularVelocity(),
      wheels: this.wheels.map((wheel, i) => ({
        x: wheel.getPosition().x,
        y: wheel.getPosition().y,
        angle: wheel.getAngle(),
        grounded: groundedWheels[i],
      })),
      status: this.status,
      time: this.time,
      grounded: groundedWheels.some(Boolean),
      crashReason: this.crashReason,
      rocketFuel: this.rocketFuel,
      rocketActive: this.rocketActive,
      jetForward: this.jetForward,
      jetReverse: this.jetReverse,
      trap: this.trapGear ? {phase:this.trapPhase,gateClosed:this.trapGate.isActive(),visible:this.trapElapsed !== null,x:this.trapGear.getPosition().x,y:this.trapGear.getPosition().y,angle:this.trapGear.getAngle(),holdRemaining:this.trapPhase === 'holding' ? Math.max(0,(this.course.gearTrap.topY-this.course.gearTrap.bottomY)/this.course.gearTrap.riseSpeed+this.course.gearTrap.holdSeconds-this.trapElapsed) : 0} : null,
      secondTrap: this.secondTrapGate ? {phase:this.secondTrapPhase,gateClosed:this.secondTrapGate.isActive(),visible:this.secondTrapElapsed !== null,gears:this.secondTrapGears.map(gear=>({x:gear.getPosition().x,y:gear.getPosition().y,angle:gear.getAngle()}))} : null,
      blocker: this.blockerGear ? { x: this.blockerGear.getPosition().x, y: this.blockerGear.getPosition().y, angle: this.blockerGear.getAngle() } : null,
      seesaws: this.seesaws.map(seesaw => ({
        x:seesaw.body.getPosition().x,
        y:seesaw.body.getPosition().y,
        angle:seesaw.body.getAngle(),
      })),
      rotatingBaffles: this.rotatingBaffles.map(body => ({ angle:body.getAngle() })),
      hazardWindmill: this.hazardWindmill ? {
        angle: this.hazardWindmill.getAngle(),
        gears: this.hazardGears.map(gear => ({ x: gear.getPosition().x, y: gear.getPosition().y, angle: gear.getAngle() })),
      } : null,
      hazardWindmillChain: this.hazardWindmillChain.map((rotor, index) => ({
        angle: rotor.getAngle(),
        gears: this.hazardChainGears[index].map(gear => ({ x: gear.getPosition().x, y: gear.getPosition().y, angle: gear.getAngle() })),
      })),
      thirdRotorLaser: this.thirdSensor ? {
        active: this.thirdLaserActive,
        triggered: this.thirdLaserTriggered,
        remaining: Math.max(0, this.course.thirdRotorLaser.duration - this.thirdLaserElapsed),
        sensorX: this.course.thirdRotorLaser.sensorX,
        gateX: this.course.thirdRotorLaser.gateX,
      } : null,
      windmillAngle: this.windmill?.getAngle() ?? null,
      windmillAngles: this.windmills.map(windmill => windmill.getAngle()),
    };
  }
}
