import assert from 'node:assert/strict';
import { VehiclePhysics, COURSE } from './physics.mjs';

const DT = 1 / 120;
function simulate(game, seconds, throttle) {
  let state = game.getState();
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    state = game.step(DT, throttle);
    if (state.status === 'crashed' || state.status === 'won') break;
  }
  return state;
}

// Move all three rigid bodies together, preserving the suspension geometry.
// This creates reproducible airborne and overturned initial conditions.
function placeVehicle(game, x, y, angle = 0, vx = 0, vy = 0) {
  const origin = { ...game.body.getPosition() };
  const bodies = [game.body, ...game.wheels];
  const offsets = bodies.map(body => ({
    x: body.getPosition().x - origin.x,
    y: body.getPosition().y - origin.y,
  }));
  for (const [index, body] of bodies.entries()) {
    const offset = offsets[index];
    body.setTransform({
      x: x + offset.x * Math.cos(angle) - offset.y * Math.sin(angle),
      y: y + offset.x * Math.sin(angle) + offset.y * Math.cos(angle),
    }, angle);
    body.setLinearVelocity({ x: vx, y: vy });
    body.setAngularVelocity(0);
    body.setAwake(true);
  }
  game.status = 'running';
  game.step(DT, 0);
}

const stationary = new VehiclePhysics();
const initial = stationary.getState();
const settled = simulate(stationary, 10, 0);
assert.equal(settled.status, 'ready', 'No input must leave the level ready.');
assert.equal(settled.time, 0, 'The timer must wait for the first input.');
assert.ok(Math.abs(settled.x - initial.x) < 0.01, 'A parked vehicle must not creep.');
assert.ok(Math.abs(settled.y - initial.y) < 0.01, 'Suspension must settle before play.');
assert.ok(settled.wheels.every(wheel => wheel.grounded), 'Both wheels must rest on the starting island.');

const forward = new VehiclePhysics();
const moving = simulate(forward, 2, 1);
assert.ok(moving.x > 5 && moving.vx > 2, 'Positive input must drive toward the bridge.');
assert.ok(moving.y > 1.3, 'The rigid vehicle must begin climbing the bridge.');
assert.ok(moving.wheels.every(wheel => wheel.angle < -1), 'Wheels must rotate clockwise while driving right.');

const braking = new VehiclePhysics();
const beforeBraking = simulate(braking, 0.65, 1);
const afterBraking = simulate(braking, 0.65, -1);
assert.ok(beforeBraking.vx > 0 && afterBraking.vx < -0.5, 'Opposite input must brake and then reverse.');

const complete = new VehiclePhysics();
let maximumHeight = 0;
let completeState;
for (let i = 0; i < 15 / DT; i++) {
  completeState = complete.step(DT, 1);
  maximumHeight = Math.max(maximumHeight, completeState.y);
  if (['won', 'crashed'].includes(completeState.status)) break;
}
assert.equal(completeState.status, 'won', 'Holding the accelerator must allow completing level one.');
assert.ok(maximumHeight > 5, 'Completing the course must involve climbing its elevated peak.');
assert.ok(completeState.time > 6 && completeState.time < 12, 'Level one should take under twelve seconds.');
assert.ok(completeState.x + 3.25 / 2 >= COURSE.finishX, 'Victory should trigger when the vehicle body touches the finish zone.');

const airborneFinish = new VehiclePhysics();
placeVehicle(airborneFinish, COURSE.finishX - 1.5, 2.2, 0, 1, 0);
const airborneFinishState = simulate(airborneFinish, 0.15, 0);
assert.equal(airborneFinishState.status, 'won', 'Touching the finish zone while airborne must win.');

const aboveFinish = new VehiclePhysics();
placeVehicle(aboveFinish, COURSE.finishX - 1.5, 8, 0, 1, 0);
const aboveFinishState = simulate(aboveFinish, 0.15, 0);
assert.equal(aboveFinishState.status, 'running', 'Flying above the finish gate must not win.');

const flyingAcrossFinish = new VehiclePhysics();
placeVehicle(flyingAcrossFinish, COURSE.finishX - 1.5, 2.2, 0, 1, 0);
const flyingState = simulate(flyingAcrossFinish, 0.15, 0);
assert.equal(flyingState.status, 'won', 'Crossing the finish trigger in midair must win.');
assert.equal(flyingState.grounded, false);

const airborne = new VehiclePhysics();
placeVehicle(airborne, 10, 15);
const airState = simulate(airborne, 0.3, 1);
const totalMomentumX = [airborne.body, ...airborne.wheels]
  .reduce((sum, body) => sum + body.getMass() * body.getLinearVelocity().x, 0);
assert.equal(airState.grounded, false);
assert.ok(Math.abs(totalMomentumX) < 1e-6, 'An airborne motor must not invent horizontal thrust.');
assert.ok(airState.vy < -3, 'The vehicle must fall under gravity.');
assert.ok(airState.angularVelocity > 0.01, 'Wheel motor reaction torque must permit airborne pitch control.');

const overturned = new VehiclePhysics();
placeVehicle(overturned, 0, 2.15, Math.PI);
const roofImpact = simulate(overturned, 1, 0);
assert.equal(roofImpact.status, 'crashed', 'Landing on the roof must fail the level.');
assert.equal(roofImpact.crashReason, 'roof');

const reverseOffIsland = new VehiclePhysics();
const outOfBounds = simulate(reverseOffIsland, 5, -1);
assert.equal(outOfBounds.status, 'crashed', 'Reversing out of the starting island must fail.');
assert.ok(['water', 'bounds'].includes(outOfBounds.crashReason));

const reset = overturned.reset();
assert.equal(reset.status, 'ready');
assert.equal(reset.time, 0);
assert.equal(reset.crashReason, null);
assert.ok(Math.abs(reset.x) < 0.01 && reset.wheels.every(wheel => wheel.grounded), 'Restart must restore the complete physical world.');

console.log(`Physics checks passed: suspension, forward/reverse, bridge completion (${completeState.time.toFixed(2)} s), landing-only victory, airborne torque, roof crash, bounds and reset.`);
