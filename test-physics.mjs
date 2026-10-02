import assert from 'node:assert/strict';
import { VehiclePhysics, COURSE, getCourse } from './physics.mjs';

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
for (let i = 0; i < 30 / DT; i++) {
  completeState = complete.step(DT, 1);
  maximumHeight = Math.max(maximumHeight, completeState.y);
  if (['won', 'crashed'].includes(completeState.status)) break;
}
assert.equal(completeState.status, 'won', 'Holding the accelerator must allow completing level one.');
assert.ok(maximumHeight > 7, 'Completing the course must involve climbing its elevated launch ramps.');
assert.ok(completeState.time > 15 && completeState.time < 24, 'The extended first level should take a substantial run.');
assert.ok(completeState.x + 3.25 / 2 >= COURSE.finishX, 'Victory should trigger when the vehicle body touches the finish zone.');

// Level one is now a long momentum course. Verify that it has five sea gaps,
// that the take-off ramps grow taller, and that the gaps widen progressively.
assert.ok(COURSE.finishX >= 220, 'The first level must be substantially longer than the original course.');
assert.equal(COURSE.terrainParts.length, 9, 'The first level must be split into start, bridge, bank and ramp sections.');
assert.equal(COURSE.jumpGaps.length, 5, 'The first level must include five sea crossings.');
for (const [index, gap] of COURSE.jumpGaps.entries()) {
  assert.ok(gap.endX - gap.startX >= 9, `Sea gap ${index + 1} must require a real jump.`);
  assert.ok(gap.height >= 3.8, `Launch ramp ${index + 1} must rise well above the water.`);
  if (index > 0) {
    assert.ok(gap.endX - gap.startX > COURSE.jumpGaps[index - 1].endX - COURSE.jumpGaps[index - 1].startX, `Sea gap ${index + 1} must be wider than the previous gap.`);
    assert.ok(gap.height > COURSE.jumpGaps[index - 1].height, `Launch ramp ${index + 1} must be taller than the previous ramp.`);
  }
}

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

const overturnedFour = new VehiclePhysics(4);
placeVehicle(overturnedFour, 0, 2.15, Math.PI);
const roofImpactFour = simulate(overturnedFour, 1, 0);
assert.equal(roofImpactFour.status, 'crashed', 'Roof impacts must also fail level four.');
assert.equal(roofImpactFour.crashReason, 'roof');

const reverseOffIsland = new VehiclePhysics();
const outOfBounds = simulate(reverseOffIsland, 5, -1);
assert.equal(outOfBounds.status, 'crashed', 'Reversing out of the starting island must fail.');
assert.ok(['water', 'bounds'].includes(outOfBounds.crashReason));

const invulnerable = new VehiclePhysics();
invulnerable.setTestMode(true);
const testModeFall = simulate(invulnerable, 8, -1);
assert.notEqual(testModeFall.status, 'crashed', 'Test mode must never enter the dead state, including out of bounds.');
assert.equal(testModeFall.crashReason, null);
invulnerable.reset();
assert.equal(invulnerable.testMode, true, 'Test mode persists across a restart.');
invulnerable.crash('water');
assert.notEqual(invulnerable.getState().status, 'crashed', 'Direct crash requests are ignored during test mode.');

// Water is lethal on contact, not only once the chassis is deeply submerged.
function drownCheck(level, x, openTrapFloor = false) {
  const g = new VehiclePhysics(level);
  g.status = 'running';
  if (openTrapFloor && g.trapFloor) g.trapFloor.setActive(false);
  g.hazardWindmill?.setActive(false);
  g.hazardGears.forEach(gear => gear.setActive(false));
  g.hazardWindmillChain.forEach(rotor => rotor.setActive(false));
  g.hazardChainGears.flat().forEach(gear => gear.setActive(false));
  g.windmills.forEach(w => w.setActive(false));
  const origin = { ...g.body.getPosition() };
  const targetY = g.course.waterY + 6;
  for (const body of [g.body, ...g.wheels]) {
    const p = body.getPosition();
    body.setTransform({ x: p.x - origin.x + x, y: p.y - origin.y + targetY }, 0);
    body.setLinearVelocity({ x: 0, y: 0 });
    body.setAngularVelocity(0);
  }
  let state = g.getState();
  for (let i = 0; i < 120 * 6 && state.status === 'running'; i++) state = g.step(1 / 120, 0);
  let lowest = Infinity;
  for (const body of [g.body, ...g.wheels]) {
    for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
      lowest = Math.min(lowest, fixture.getAABB(0).lowerBound.y);
    }
  }
  return { g, state, lowest };
}

for (const [level, x, openTrapFloor] of [[2, 34.5, false], [3, 44.5, false], [5, 58.5, true], [6, 58.5, true]]) {
  const { g, state, lowest } = drownCheck(level, x, openTrapFloor);
  assert.equal(state.status, 'crashed', `Level ${level}: touching water must end the run.`);
  assert.equal(state.crashReason, 'water', `Level ${level}: the crash must be reported as water.`);
  assert.ok(lowest <= g.course.waterY + .02, `Level ${level}: drowning must trigger at the surface.`);
  assert.ok(lowest > g.course.waterY - .6, `Level ${level}: the car must not sink far under the surface first.`);
}

// The rebuilt level four uses the normal wheel-driven car with no jet.
const normalLevelFour = new VehiclePhysics(4);
assert.equal(normalLevelFour.seesaws.length, 13, 'Level four must include thirteen independently suspended planks after removing the third plank.');
assert.equal(normalLevelFour.getState().jetForward, false, 'Level four must not activate jet propulsion.');
assert.equal(getCourse(4).landPieces.length, 12, 'There must be one land piece between every remaining pair of suspended planks.');
assert.ok(getCourse(4).landPieces.some(piece => piece.width > 10), 'The removed third plank must be replaced by a long connecting land ramp.');
for (let index = 1; index < getCourse(4).landPieces.length; index++) {
  assert.ok(getCourse(4).landPieces[index].yLeft > getCourse(4).landPieces[index - 1].yLeft, 'Every following land piece must be higher than the previous land piece.');
  assert.ok(getCourse(4).landPieces[index].yRight > getCourse(4).landPieces[index].yLeft, 'Each land piece must form an upward ramp.');
}
const baffleSpeeds = getCourse(4).rotatingBaffles.map(baffle => Math.abs(baffle.speed));
assert.ok(baffleSpeeds.every((speed,index) => index === 0 || speed > baffleSpeeds[index - 1]), 'Each later rotating baffle must spin faster than the previous one.');
assert.ok(getCourse(4).rotatingBaffles.slice(1).every(baffle => baffle.speed < 0), 'Every rotating baffle after the first must spin in the opposite direction.');
assert.ok(getCourse(4).rotatingBaffles.at(-1).speed < 0, 'The final rotating baffle must spin in reverse.');
assert.ok(getCourse(4).upJet, 'Level four must include an upward jet before the first suspended plank.');
for (let index = 1; index < normalLevelFour.seesaws.length; index++) {
  assert.ok(normalLevelFour.seesaws[index].config.y > normalLevelFour.seesaws[index - 1].config.y, 'Every following suspended plank must be higher than the previous plank.');
}
let normalLevelFourState = normalLevelFour.getState();
for (let i = 0; i < 120; i++) {
  normalLevelFour.seesaws[0].body.applyTorque(100, true);
  normalLevelFourState = normalLevelFour.step(DT, 0);
}
assert.ok(Math.abs(normalLevelFourState.seesaws[0].angle) <= .07, 'The suspended planks must have substantially limited rotation.');
const speedRun = new VehiclePhysics(4);
let speedState = speedRun.getState();
for (let i = 0; i < 30 / DT && speedState.x < 60; i++) speedState = speedRun.step(DT, 1);
assert.ok(speedState.vx > 10, 'The large downhill before the suspended planks must build enough speed for the crossing.');
const jetRun = new VehiclePhysics(4);
const jetOrigin = { ...jetRun.body.getPosition() };
for (const body of [jetRun.body, ...jetRun.wheels]) {
  const p = body.getPosition();
  body.setTransform({ x:p.x-jetOrigin.x+72, y:p.y-jetOrigin.y+13.14 }, 0);
  body.setLinearVelocity({ x:0, y:0 });
  body.setAngularVelocity(0);
}
let jetState = jetRun.step(DT, 0);
for (let i = 0; i < 60; i++) jetState = jetRun.step(DT, 0);
assert.ok(jetState.vy > 1 && jetState.y > 14, 'The upward jet must actively lift the vehicle before the first plank.');

// Level five is built around its water pit: the opening must stay open and lethal.
const waterPit = new VehiclePhysics(5);
waterPit.status = 'running';
const pitOrigin = { ...waterPit.body.getPosition() };
for (const body of [waterPit.body, ...waterPit.wheels]) {
  const p = body.getPosition();
  body.setTransform({ x: p.x - pitOrigin.x + 18, y: p.y - pitOrigin.y + .6 }, 0);
  body.setLinearVelocity({ x: 0, y: 0 });
  body.setAngularVelocity(0);
}
let pitState = waterPit.getState();
for (let i = 0; i < 120 * 4 && pitState.status === 'running'; i++) pitState = waterPit.step(1 / 120, 0);
assert.equal(pitState.status, 'crashed', 'Level five water pit must end the run.');
assert.equal(pitState.crashReason, 'water', 'Level five water pit must drown the car at the surface.');

// Level five keeps the jet tunnel course but replaces the three middle walls
// and old gear traps with a four-armed hazard windmill.
const courseFive = getCourse(5);
const courseSix = getCourse(6);
assert.equal(courseFive.id, 5, 'The original jet tunnel must move to level five.');
assert.equal(courseFive.jet, true, 'Level five must keep jet propulsion.');
assert.equal(courseSix.id, 6, 'The gear gauntlet must move to level six.');
assert.equal(courseSix.jet, true, 'Level six must keep the jet-assisted gear challenge.');
assert.equal(courseSix.terrainParts.length, 2, 'Level six must keep the original jet tunnel terrain structure.');
assert.equal(courseSix.terrainParts[0], courseFive.terrainParts[0], 'Level six must keep the opening water pit.');
assert.equal(courseSix.terrainParts[1][courseSix.terrainParts[1].length - 1].x, 190, 'Level six must extend the final ground section.');
const raisedGround = courseSix.terrainParts[1].filter(point => point.y === .55);
assert.deepEqual(raisedGround.map(point => point.x), [88, 100], 'The ground under the second chained rotor must be raised slightly.');
assert.ok(courseSix.finishX > courseFive.finishX, 'Level six must move the finish beyond the new rotor chain.');
assert.equal(courseSix.wallGaps.length, 2, 'Level six must keep only the first and last walls.');
assert.equal(courseSix.wallGaps[0], courseFive.wallGaps[0], 'The first wall must remain unchanged.');
assert.equal(courseSix.wallGaps[1].x, courseFive.wallGaps[4].x, 'The second wall must keep its position.');
assert.ok(Math.abs((courseSix.wallGaps[1].gapTop - courseSix.wallGaps[1].gapBottom) - 2 * (courseFive.wallGaps[4].gapTop - courseFive.wallGaps[4].gapBottom)) < 1e-9, 'The second wall opening must be twice as tall.');
assert.equal(courseSix.gearTrap, undefined, 'Level six must remove the original gear trap.');
assert.equal(courseSix.secondTrap, undefined, 'Level six must remove the second gear trap.');
assert.equal(courseSix.hazardWindmill?.gearRadius, 1.18, 'Level six must define its giant hand-style rotors.');
assert.equal(courseSix.hazardWindmillChain.length, 3, 'Level six must add three chained rotors behind the last wall.');
for (const config of courseSix.hazardWindmillChain) {
  assert.ok(config.halfLength > courseSix.hazardWindmill.halfLength, 'Each chained rotor arm must be larger than the first rotor.');
  assert.ok(config.gearRadius > courseSix.hazardWindmill.gearRadius, 'Each chained gear must be larger than the first rotor gear.');
}
assert.deepEqual(courseSix.hazardWindmillChain.map(config => config.spinSpeed), [-.27, .24, -.29], 'The three chained rotors must spin at half their previous speed.');
assert.deepEqual(courseSix.hazardWindmillChain.map(config => config.gearSpinSpeed), [-.86, .79, -.91], 'The chained tip gears must also spin at half speed.');
assert.equal(courseSix.hazardWindmillChain[0].armCount, 3, 'The first rotor behind the second wall must have three blades.');
assert.equal(courseSix.hazardWindmillChain[0].startAngle, Math.PI, 'The three-blade rotor must keep one blade against the wall edge.');
assert.notEqual(courseSix.hazardWindmillChain[2].lethalBlades, true, 'The last three-blade rotor must be a normal rotor again.');
assert.equal(courseSix.hazardWindmillChain[2].thickness, .52, 'The last rotor blades must keep their reduced width.');
assert.ok(courseSix.hazardWindmillChain[1].y > courseSix.hazardWindmillChain[0].y, 'The second chained rotor must sit higher than the first.');
assert.ok(courseSix.hazardWindmillChain[1].y > courseSix.hazardWindmillChain[2].y, 'The second chained rotor must be the highest.');
const secondRotorOuter = courseSix.hazardWindmillChain[1].x + courseSix.hazardWindmillChain[1].halfLength + courseSix.hazardWindmillChain[1].gearRadius + courseSix.hazardWindmillChain[1].toothLength / 2;
const lastRotorOuter = courseSix.hazardWindmillChain[2].x - courseSix.hazardWindmillChain[2].halfLength - courseSix.hazardWindmillChain[2].gearRadius - courseSix.hazardWindmillChain[2].toothLength / 2;
assert.ok(Math.abs(secondRotorOuter - lastRotorOuter) < .25, 'The last super rotor must sit directly beside the previous rotor without overlapping.');
assert.equal(courseSix.lowCeilings.length, 4, 'Level six must add a low ceiling over the first rotor and three long ceilings over the rotor chain.');
const lowCeiling = courseSix.lowCeilings[0];
const firstRotorTop = courseSix.hazardWindmill.y + courseSix.hazardWindmill.halfLength + courseSix.hazardWindmill.gearRadius + courseSix.hazardWindmill.toothLength / 2;
assert.equal(lowCeiling.startX, courseSix.wallGaps[0].x, 'The long ceiling must connect to the first wall.');
assert.ok(lowCeiling.endX >= courseSix.wallGaps[1].x, 'The long ceiling must reach and connect to the last wall.');
assert.ok(lowCeiling.y > firstRotorTop && lowCeiling.y - firstRotorTop < .5, 'The ceiling must sit just above the first rotor to prevent flying over it.');
assert.equal(courseSix.lowCeilings[3].endX, courseSix.finishX, 'The last low ceiling must extend all the way to the finish.');
for (const [index, config] of courseSix.hazardWindmillChain.entries()) {
  const chainCeiling = courseSix.lowCeilings[index + 1];
  assert.ok(chainCeiling.startX <= config.x - config.halfLength, `Chain ceiling ${index + 1} must begin over its rotor.`);
  assert.ok(chainCeiling.endX >= config.x + config.halfLength, `Chain ceiling ${index + 1} must extend beyond its rotor.`);
  const rotorTop = config.y + config.halfLength + config.gearRadius + config.toothLength / 2;
  assert.ok(chainCeiling.y > rotorTop && chainCeiling.y - rotorTop < 1.2, `Chain ceiling ${index + 1} must stay close above every blade tip to block flying over.`);
}
assert.equal(courseSix.lowCeilingConnectors.length, 4, 'Every height transition in the rotor ceiling must be closed by a connector.');
for (const connector of courseSix.lowCeilingConnectors) {
  assert.ok(connector.topY > connector.bottomY, 'Every ceiling connector must have a positive height.');
}
const lastWall = courseSix.wallGaps[1];
const wallEdge = lastWall.x + (lastWall.width || .84) / 2;
const firstChainRotorEdge = courseSix.hazardWindmillChain[0].x - courseSix.hazardWindmillChain[0].halfLength;
assert.ok(Math.abs(firstChainRotorEdge - wallEdge) < .8, 'The first chained rotor must lean against the last wall edge.');
assert.ok(courseSix.finishX > courseSix.hazardWindmillChain[2].x + courseSix.hazardWindmillChain[2].halfLength + courseSix.hazardWindmillChain[2].gearRadius, 'The finish must sit beyond the full rotor chain.');
const jetLevelFive = new VehiclePhysics(5);
const jetLevelFiveState = jetLevelFive.step(DT, 1);
assert.equal(jetLevelFiveState.jetForward, true, 'Level five must use the jet control from the original fourth level.');
const gearLevelSix = new VehiclePhysics(6);
assert.ok(gearLevelSix.hazardWindmill, 'Level six must create the giant rotor body.');
assert.equal(gearLevelSix.hazardGears.length, 4, 'The giant rotor must have four dangerous gears at its tips.');
assert.equal(gearLevelSix.hazardWindmillChain.length, 3, 'Level six must create all three chained rotor bodies.');
assert.equal(gearLevelSix.hazardChainGears.length, 3, 'Level six must create gear arrays for all chained rotors.');
assert.deepEqual(gearLevelSix.hazardChainGears.map(gears => gears.length), [3, 4, 3], 'The first and last new rotors must carry three gears.');

const hazardGearRun = new VehiclePhysics(6);
const firstHazardPosition = hazardGearRun.hazardGears[0].getPosition();
placeVehicle(hazardGearRun, firstHazardPosition.x, firstHazardPosition.y, 0, 0, 0);
const hazardGearState = hazardGearRun.step(DT, 0);
assert.equal(hazardGearState.status, 'crashed', 'Touching one of the giant rotor gears must fail the run.');
assert.equal(hazardGearState.crashReason, 'gear', 'The giant rotor tips must use the gear crash reason.');

const normalBladeRun = new VehiclePhysics(6);
normalBladeRun.hazardWindmill.setActive(false);
normalBladeRun.hazardGears.forEach(gear => gear.setActive(false));
for (let i = 0; i < 2; i++) {
  normalBladeRun.hazardWindmillChain[i].setActive(false);
  normalBladeRun.hazardChainGears[i].forEach(gear => gear.setActive(false));
}
const superConfig = courseSix.hazardWindmillChain[2];
const superAngle = superConfig.startAngle;
placeVehicle(
  normalBladeRun,
  superConfig.x + Math.cos(superAngle) * superConfig.halfLength * .5,
  superConfig.y + Math.sin(superAngle) * superConfig.halfLength * .5,
  0,
  0,
  0,
);
const normalBladeState = normalBladeRun.step(DT, 0);
assert.equal(normalBladeState.status, 'running', 'Touching a normal rotor blade must not kill the player.');

const laserRun = new VehiclePhysics(6);
laserRun.hazardWindmill.setActive(false);
laserRun.hazardGears.forEach(gear => gear.setActive(false));
laserRun.hazardWindmillChain.forEach(rotor => rotor.setActive(false));
laserRun.hazardChainGears.flat().forEach(gear => gear.setActive(false));
let laserFixtureCount = 0;
for (let fixture = laserRun.thirdLaserGate.getFixtureList(); fixture; fixture = fixture.getNext()) laserFixtureCount++;
assert.ok(laserFixtureCount > 0, 'The third-rotor laser gate must have physical beam fixtures.');
const laserConfig = courseSix.thirdRotorLaser;
const superRotorOuterEdge = courseSix.hazardWindmillChain[2].x + courseSix.hazardWindmillChain[2].halfLength + courseSix.hazardWindmillChain[2].gearRadius + courseSix.hazardWindmillChain[2].toothLength / 2;
assert.ok(laserConfig.gateX < 122 && laserConfig.gateX > superRotorOuterEdge, 'The rear laser gate must stay very close behind the super rotor without overlapping it.');
assert.equal(courseSix.laserCrate.y - courseSix.laserCrate.height / 2, 0, 'The wooden corner crate must rest on the ground.');
assert.ok(Math.abs((courseSix.laserCrate.x + courseSix.laserCrate.width / 2) - (laserConfig.gateX - .045)) < 1e-9, 'The crate must sit directly against the lower-left side of the laser gate.');
assert.deepEqual([courseSix.laserCrate.width, courseSix.laserCrate.height, courseSix.laserCrate.depth], [2.5, 2.5, 2.5], 'The laser corner crate must be 2.5 times its previous size.');
placeVehicle(laserRun, laserConfig.sensorX, (laserConfig.sensorBottom + laserConfig.sensorTop) / 2, 0, 0, 0);
laserRun.step(DT, 0);
let laserState = laserRun.getState();
assert.equal(laserState.thirdRotorLaser.triggered, true, 'Passing the sensor must trigger the third-rotor laser.');
laserRun.step(DT, 0);
laserState = laserRun.getState();
assert.equal(laserState.thirdRotorLaser.active, true, 'The rear laser gate must light after the detector is crossed.');
for (let i = 0; i < 3000; i++) laserRun.advanceThirdLaser();
laserState = laserRun.getState();
assert.equal(laserState.thirdRotorLaser.active, false, 'The rear laser gate must turn off after twenty-five seconds.');
assert.equal(laserRun.thirdLaserGate.isActive(), false, 'The physical rear laser barrier must deactivate with the visual gate.');

const safeCeilingRun = new VehiclePhysics(6);
safeCeilingRun.hazardWindmill.setActive(false);
safeCeilingRun.hazardGears.forEach(gear => gear.setActive(false));
safeCeilingRun.hazardWindmillChain.forEach(rotor => rotor.setActive(false));
safeCeilingRun.hazardChainGears.flat().forEach(gear => gear.setActive(false));
placeVehicle(safeCeilingRun, 50, 13.25, 0, 0, 0);
let safeCeilingState = safeCeilingRun.getState();
for (let i = 0; i < 16 && safeCeilingState.status === 'running'; i++) safeCeilingState = safeCeilingRun.step(DT, 0);
assert.equal(safeCeilingState.status, 'running', 'Touching the long low ceiling with the roof must not kill the player.');

// The moved jet tunnel and gear gauntlet ceilings must stop the car from climbing above them.
for (const level of [5, 6]) {
  const ceilingRun = new VehiclePhysics(level);
  ceilingRun.status = 'running';
  let ceilingState = ceilingRun.getState();
  for (let i = 0; i < 120 * 20; i++) {
    ceilingState = ceilingRun.step(1 / 120, 1);
    if (ceilingState.status !== 'running') break;
    assert.ok(ceilingState.y < getCourse(level).ceiling.y, `The car must stay under the level ${level} ceiling.`);
  }
}

// Level three is an ocean crossing: a launch pad, a small sloped island in the
// middle of the sea, and a finish island raised well above the water.
const seaCourse = getCourse(3);
assert.equal(seaCourse.terrainParts.length, 3, 'Level three must be launch pad, mid-sea ramp and finish island.');
const [launchPad, midRamp, finishIsland] = seaCourse.terrainParts;
const firstSea = midRamp[0].x - launchPad[launchPad.length - 1].x;
const secondSea = finishIsland[0].x - midRamp[midRamp.length - 1].x;
assert.ok(firstSea >= 20 && secondSea >= 10, `Level three must be mostly open sea (${firstSea} / ${secondSea}).`);
assert.ok(midRamp[midRamp.length - 1].y > midRamp[0].y, 'The mid-sea land must be a sloped launch ramp.');
assert.ok(midRamp[midRamp.length - 1].y >= 6, `The mid-sea island must be raised high above the water (got ${midRamp[midRamp.length - 1].y}).`);
assert.ok(seaCourse.finishY >= 5, `The finish ground must be raised high above the water (got ${seaCourse.finishY}).`);
assert.equal(finishIsland[finishIsland.length - 1].y, seaCourse.finishY, 'The finish island plateau must sit at finishY.');
assert.ok(seaCourse.finishX > finishIsland[0].x && seaCourse.finishX < finishIsland[finishIsland.length - 1].x, 'The finish gate must stand on the raised island.');

const seaRun = new VehiclePhysics(3);
seaRun.status = 'running';
let seaState = seaRun.getState();
for (let i = 0; i < 120 * 25; i++) {
  const boost = seaState.y < 3;
  seaState = seaRun.step(1 / 120, boost ? 1 : 0, boost);
  if (seaState.status !== 'running') break;
}
assert.equal(seaState.status, 'won', 'Boosting across the sea must be able to finish level three.');

// The spinning gear in front of the level three finish is lethal: driving into
// it ends the run instead of letting the car squeeze past to the gate.
const gearBlock = new VehiclePhysics(3);
gearBlock.status = 'running';
const gearConfig = gearBlock.course.blockerGear;
assert.ok(gearConfig, 'Level three must define its finish blocker.');
assert.ok(gearConfig.x < gearBlock.course.finishX, 'The blocker must stand in front of the finish gate.');
assert.equal(gearConfig.radius, .675, 'The finish blocker must be half its previous size.');
const blockOrigin = { ...gearBlock.body.getPosition() };
for (const body of [gearBlock.body, ...gearBlock.wheels]) {
  const p = body.getPosition();
  body.setTransform({ x: p.x - blockOrigin.x + gearConfig.x - 3, y: p.y - blockOrigin.y + gearConfig.groundY }, 0);
  body.setLinearVelocity({ x: 0, y: 0 });
  body.setAngularVelocity(0);
}
let blockedState = gearBlock.getState();
for (let i = 0; i < 120 * 6; i++) {
  blockedState = gearBlock.step(1 / 120, 1);
  if (blockedState.status !== 'running') break;
}
assert.ok(Math.abs(gearBlock.blockerGear.getAngularVelocity()) > 0, 'The finish blocker must keep spinning.');
assert.equal(blockedState.status, 'crashed', 'Touching the finish blocker must end the run.');
assert.equal(blockedState.crashReason, 'gear');

// Level three only ends on contact with the gate itself: passing above it is not enough.
const overGate = new VehiclePhysics(3);
overGate.status = 'running';
const overOrigin = { ...overGate.body.getPosition() };
for (const body of [overGate.body, ...overGate.wheels]) {
  const p = body.getPosition();
  body.setTransform({ x: p.x - overOrigin.x + overGate.course.finishX + 1, y: p.y - overOrigin.y + overGate.course.finishY + 9 }, 0);
  body.setLinearVelocity({ x: 0, y: 0 });
  body.setAngularVelocity(0);
}
let overState = overGate.getState();
for (let i = 0; i < 12; i++) overState = overGate.step(1 / 120, 0);
assert.notEqual(overState.status, 'won', 'Flying clear above the gate must not finish level three.');

const reset = overturned.reset();
assert.equal(reset.status, 'ready');
assert.equal(reset.time, 0);
assert.equal(reset.crashReason, null);
assert.ok(Math.abs(reset.x) < 0.01 && reset.wheels.every(wheel => wheel.grounded), 'Restart must restore the complete physical world.');

console.log(`Physics checks passed: suspension, forward/reverse, extended momentum course completion (${completeState.time.toFixed(2)} s), landing-only victory, airborne torque, roof crash, bounds and reset.`);
