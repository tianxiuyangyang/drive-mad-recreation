import { World, Vec2, Chain, Box, Circle, WheelJoint } from './vendor/planck.mjs';

// Metres, seconds and radians. The rendered scene uses the same coordinates.
const COURSE_1 = Object.freeze({
  id: 1,
  title: 'First Gear',
  startX: 0,
  finishX: 52,
  minX: -4,
  maxX: 60,
  waterY: -2.4,
  finishTop: 3.45,
  wheelRadius: 0.63,
  axleHalfWidth: 1.25,
  bridge: Object.freeze({ startX: 5, crestStartX: 14, crestEndX: 18, endX: 26, height: 4.3 }),
  terrain: Object.freeze([
    { x: -4, y: 0 }, { x: 5, y: 0 },
    { x: 6, y: 0.15 }, { x: 7, y: 0.48 }, { x: 8, y: 0.95 },
    { x: 9, y: 1.53 }, { x: 10, y: 2.15 }, { x: 11, y: 2.78 },
    { x: 12, y: 3.39 }, { x: 13, y: 3.94 }, { x: 14, y: 4.3 },
    { x: 18, y: 4.3 }, { x: 19, y: 3.96 }, { x: 20, y: 3.39 },
    { x: 21, y: 2.69 }, { x: 22, y: 1.93 }, { x: 23, y: 1.18 },
    { x: 24, y: 0.56 }, { x: 25, y: 0.16 }, { x: 26, y: 0 },
    { x: 60, y: 0 },
  ].map(Object.freeze)),
});

// The second and third tracks keep the same compact physics model as the
// original first track, but introduce ramps, drops and short flat sections so
// they feel like proper Drive Mad stages instead of menu placeholders.
const COURSE_2 = Object.freeze({
  id: 2,
  title: 'Ramp Up',
  startX: 0, finishX: 54, minX: -4, maxX: 62, waterY: -2.4, finishTop: 3.45,
  wheelRadius: .63, axleHalfWidth: 1.25,
  terrain: Object.freeze([
    {x:-4,y:0},{x:4,y:0},{x:5,y:.7},{x:7,y:.7},{x:8,y:0},
    {x:12,y:0},{x:13,y:.8},{x:15,y:1.6},{x:17,y:1.6},{x:18,y:.6},
    {x:20,y:.6},{x:21,y:1.3},{x:23,y:1.3},{x:24,y:.2},{x:28,y:.2},
    {x:29,y:1.0},{x:31,y:1.0},{x:32,y:0},{x:38,y:0},{x:39,y:.8},{x:42,y:.8},{x:43,y:0},{x:62,y:0},
  ].map(Object.freeze)),
});

const COURSE_3_PARTS = Object.freeze([
  Object.freeze([
    {x:-4,y:0},{x:3,y:0},{x:4,y:.9},{x:5.5,y:.9},{x:6.5,y:0},
    {x:9,y:0},{x:10,y:1.2},{x:12,y:1.2},{x:13,y:.3},{x:16,y:.3},
    {x:17,y:1.2},{x:19,y:2.1},{x:21,y:2.1},{x:22,y:.8},{x:25,y:.8},
    {x:26,y:0},{x:29,y:0},{x:30,y:1.2},{x:32,y:1.2},{x:33,y:0},
    {x:35,y:1.6},{x:37,y:2.8},{x:39,y:2.8},
  ].map(Object.freeze)),
  Object.freeze([
    {x:50,y:0},{x:52,y:0},{x:53,y:1.0},{x:55,y:1.0},{x:56,y:0},{x:68,y:0},
  ].map(Object.freeze)),
]);
const COURSE_3 = Object.freeze({
  id: 3, title: 'Back Up', startX: 0, finishX: 62, minX: -4, maxX: 68, waterY: -2.4, finishTop: 3.45,
  wheelRadius: .63, axleHalfWidth: 1.25, terrain: Object.freeze(COURSE_3_PARTS.flat()), terrainParts: COURSE_3_PARTS,
});

export const LEVELS = Object.freeze([COURSE_1, COURSE_2, COURSE_3]);
export const COURSE = COURSE_1;
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
  motorSpeed: 12,
  motorTorque: 18,
});

const FIXED_STEP = 1 / 120;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const normalizedAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export class VehiclePhysics {
  constructor(level = 1) {
    this.course = getCourse(level);
    this.reset();
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
    this.groundContacts = [new Set(), new Set()];
    this.roofContacts = new Set();

    const ground = this.world.createBody();
    const course = this.course;
    for (const terrain of course.terrainParts || [course.terrain]) {
      ground.createFixture(Chain(terrain, false), {
        friction: 1.2, restitution: 0, userData: { kind: 'ground' },
      });
    }

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
    const vehicle = a?.kind === 'ground' ? b : b?.kind === 'ground' ? a : null;
    if (!vehicle) return;
    let contacts;
    if (vehicle.kind === 'wheel') contacts = this.groundContacts[vehicle.index];
    if (vehicle.kind === 'roof') contacts = this.roofContacts;
    if (contacts) touching ? contacts.add(contact) : contacts.delete(contact);
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
    const hasInput = Math.abs(throttle) > 0.01;
    const driveTorque = throttle < 0 ? VEHICLE.motorTorque * 5 : VEHICLE.motorTorque;
    for (let i = 0; i < this.joints.length; i++) {
      const grounded = this.groundContacts[i].size > 0;
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
    if (throttle < -0.01 && this.groundContacts[0].size > 0) {
      this.body.applyForceToCenter(Vec2(-14, 0), true);
    }
    this.rocketActive = this.course.id === 3 && rocket && this.rocketFuel > 0;
    if (this.rocketActive) {
      const angle = this.body.getAngle();
      const forward = Vec2(Math.cos(angle), Math.sin(angle));
      const up = Vec2(-Math.sin(angle), Math.cos(angle));
      this.body.applyForceToCenter(Vec2(forward.x * 150 + up.x * 58, forward.y * 150 + up.y * 58), true);
      this.rocketFuel = Math.max(0, this.rocketFuel - FIXED_STEP);
    }
    this.world.step(FIXED_STEP, 8, 4);
    if (this.status === 'running') this.time += FIXED_STEP;

    const position = this.body.getPosition();
    if (this.roofContacts.size > 0) return this.crash('roof');
    const course = this.course;
    if (position.y < course.waterY || this.wheels.some(wheel => wheel.getPosition().y < course.waterY)) return this.crash('water');
    if (position.x < course.minX - 0.8 || position.x > course.maxX + 2) return this.crash('bounds');

    // The finish is a generous vertical trigger zone. Any part of the car
    // crossing it counts, including an airborne rocket jump.
    const bodyRight = position.x + VEHICLE.bodyWidth / 2;
    const vehicleBottom = Math.min(position.y - .6, ...this.wheels.map(wheel => wheel.getPosition().y - course.wheelRadius));
    const vehicleTop = Math.max(position.y + 1.42, ...this.wheels.map(wheel => wheel.getPosition().y + course.wheelRadius));
    const insideGateHeight = vehicleBottom <= course.finishTop && vehicleTop >= -.2;
    const vehicleInFinish = insideGateHeight && (bodyRight >= course.finishX || this.wheels.some(wheel => wheel.getPosition().x >= course.finishX));
    this.finishContactTime = vehicleInFinish ? this.finishContactTime + FIXED_STEP : 0;
    if (this.finishContactTime >= 0.12) this.status = 'won';
  }

  crash(reason) {
    this.status = 'crashed';
    this.crashReason = reason;
  }

  getState() {
    const position = this.body.getPosition();
    const velocity = this.body.getLinearVelocity();
    const groundedWheels = this.groundContacts.map(contacts => contacts.size > 0);
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
    };
  }
}
