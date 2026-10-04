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

for (const [level, x, openTrapFloor] of [[2, 34.5, false], [3, 44.5, false], [7, 58.5, true], [8, 58.5, true]]) {
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

// Level five is the short jet-flight stage: the car reuses the tunnel jet and
// has to thread three wall openings in a row before the ground gate.
const gateCourse = getCourse(5);
assert.equal(gateCourse.id, 5, 'The jet gate stage must be level five.');
assert.equal(gateCourse.title, 'Jet Gates', 'Level five must be the jet gate stage.');
assert.equal(gateCourse.jet, true, 'Level five must reuse the tunnel jet flight.');
assert.equal(gateCourse.wallGaps.length, 3, 'Level five must place exactly three wall openings.');
assert.equal(gateCourse.terrainParts.length, 1, 'Level five must use one continuous runway.');
const gatePoints = gateCourse.terrainParts[0];
assert.ok(Math.abs(gatePoints[0].y) < 1e-6, 'Level five must spawn on flat ground so the car starts level.');
assert.ok(gatePoints.every(point => point.y >= 0), 'Level five must stay above the water line.');
assert.ok(gateCourse.finishX > gateCourse.wallGaps.at(-1).x, 'The finish must sit behind the third opening.');
assert.ok(gateCourse.finishX < gatePoints.at(-1).x, 'Level five ground must extend past the finish.');
assert.ok(gateCourse.lowCeilings?.length, 'Level five must cap the flight path so the walls cannot be flown over.');
const gateCap = gateCourse.lowCeilings[0];
const ORIGINAL_OPENING = 9.3;
const HALF_OPENING = ORIGINAL_OPENING / 2;
for (const [index, wall] of gateCourse.wallGaps.entries()) {
  assert.ok(wall.x > gateCourse.startX && wall.x < gateCourse.finishX, 'Every wall must sit between the start and the finish.');
  if (index) assert.ok(wall.x > gateCourse.wallGaps[index - 1].x, 'The three wall openings must come in order.');
  assert.ok(Math.abs((wall.gapTop - wall.gapBottom) - HALF_OPENING) < 1e-9, 'Every opening must be half the original height.');
  assert.ok(wall.gapTop <= gateCourse.wallHeight, 'No opening may poke past the wall top.');
}
const gateCapBottom = gateCap.y - gateCap.thickness / 2;
const [middleOpening, lowerOpening, upperOpening] = gateCourse.wallGaps;
assert.ok(middleOpening.gapBottom > 0 && middleOpening.gapTop < gateCapBottom, 'The first opening must sit in the middle of the wall.');
assert.equal(lowerOpening.gapBottom, 0, 'The second opening must sit on the ground.');
assert.ok(gateCapBottom - upperOpening.gapTop >= 0 && gateCapBottom - upperOpening.gapTop < .1, 'The third opening must sit directly under the safe ceiling.');
for (const forbidden of ['gearTrap', 'secondTrap', 'hazardWindmill', 'thirdRotorLaser', 'blockerGear', 'seesaws', 'windmills', 'rotatingBaffles']) {
  assert.ok(!gateCourse[forbidden], `Level five must stay free of ${forbidden}.`);
}
// Level five keeps the tunnel's original jet model: no attitude stabiliser is
// added, so the chassis is free to pitch, and every opening is only half the
// original height. That line is tight but not impossible, so a fixed-seed
// throttle schedule search has to find at least one completed run.
const gateJet = new VehiclePhysics(5);
assert.equal(gateJet.step(DT, 1).jetForward, true, 'Level five must fire the tunnel jet while the throttle is held.');
const JET_SEGMENT = .12;
let jetSeed = 12345;
const jetRandom = () => (jetSeed = (jetSeed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let gateSolved = false;
for (let trial = 0; trial < 400 && !gateSolved; trial++) {
  const schedule = Array.from({ length: Math.ceil(14 / JET_SEGMENT) }, () => (jetRandom() < .5 ? 1 : 0));
  const gateRun = new VehiclePhysics(5);
  let gateState = gateRun.getState();
  for (let i = 0; i < 120 * 14; i++) {
    gateState = gateRun.step(DT, schedule[Math.floor(i * DT / JET_SEGMENT)] ?? 0);
    if (gateState.status === 'won') { gateSolved = true; break; }
    if (gateState.status === 'crashed') break;
  }
}
assert.ok(gateSolved, 'The bottom/top opening layout must still be solvable with the original jet flight.');
// Level six keeps only the middle wall of the level five gate line: the first
// wall becomes a big three-blade fan, a pair of sliding walls shuttles in
// opposite phase where the last wall was, and a much larger four-blade fan spins
// fast behind them. The overhead barrier is now lethal to the roof.
const liftCourse = getCourse(6);
assert.equal(liftCourse.id, 6, 'The lift stage must be level six.');
assert.equal(liftCourse.title, 'Jet Lift', 'Level six must be the jet lift stage.');
assert.equal(liftCourse.jet, true, 'Level six must reuse the tunnel jet flight.');
assert.equal(liftCourse.wallGaps.length, 1, 'Level six must keep only the middle wall.');
const liftWall = liftCourse.wallGaps[0];
assert.equal(liftWall.x, getCourse(5).wallGaps[1].x, 'The surviving wall must be the level five middle wall.');
assert.equal(liftWall.gapBottom, 0, 'The surviving opening must sit on the ground.');
assert.equal(liftWall.gapTop, getCourse(5).wallGaps[1].gapTop / 2, 'The surviving opening must be half the level five height.');
assert.ok(liftCourse.upJet, 'Level six must keep its upward jet.');
assert.equal(liftCourse.upJet.x, liftWall.x + .5, 'The jet must sit half a metre to the right of the surviving wall.');
assert.equal(liftCourse.upJet.force, getCourse(4).upJet.force * 2, 'The jet must run at twice the plank bridge thrust.');
assert.equal(liftCourse.upJet.width, getCourse(4).upJet.width / 2, 'The jet must run at half the plank bridge width.');
assert.equal(liftCourse.upJet.topY - liftCourse.upJet.bottomY, 6.05, 'The jet column must run at half its previous height.');
assert.ok(liftCourse.ceiling, 'Level six must use a real ceiling.');
assert.ok(!liftCourse.lowCeilings, 'Level six must not keep the old safe ceiling list.');
assert.equal(liftCourse.windmills.length, 2, 'Level six must add two fan rotors.');
assert.equal(liftCourse.windmills[0].armCount, 3, 'The front fan must have three blades.');
assert.equal(liftCourse.windmills[1].armCount, 4, 'The rear fan must have four blades.');
assert.ok(liftCourse.windmills[0].x < liftWall.x, 'The three-blade fan must take the first wall position.');
const rearFan = liftCourse.windmills[1];
assert.ok(rearFan.halfLength >= 7, 'The rear fan must be much larger than the previous one.');
assert.ok(rearFan.thickness >= .8, 'The rear fan blades must be much thicker than before.');
assert.ok(Math.abs(rearFan.speed) > Math.abs(liftCourse.windmills[0].speed), 'The rear fan must spin faster than the front one.');
assert.ok(rearFan.x > liftCourse.movingWalls[1].x, 'The rear fan must sit behind both sliding walls.');
assert.ok(rearFan.x + rearFan.halfLength < liftCourse.finishX - 2, 'The rear fan sweep must stop short of the finish gate.');
assert.equal(liftCourse.movingWalls.length, 2, 'Level six must add two sliding walls.');
const [leadSlider, rearSlider] = liftCourse.movingWalls;
assert.ok(leadSlider.x < rearSlider.x, 'The new sliding wall must sit in front of the original one.');
assert.equal(rearSlider.x, getCourse(5).wallGaps[2].x, 'The original sliding wall must take the last wall position.');
assert.ok(Math.abs(leadSlider.minY - leadSlider.height / 2) < 1e-9, 'A sliding wall must be able to reach the ground.');
const liftCap = liftCourse.ceiling;
assert.ok(Math.abs((leadSlider.maxY + leadSlider.height / 2) - (liftCap.y - liftCap.thickness / 2)) < 1e-9, 'A sliding wall must be able to reach the ceiling.');
assert.notEqual(leadSlider.startDirection, rearSlider.startDirection, 'The two sliding walls must start in opposite directions.');
assert.equal(leadSlider.speed, rearSlider.speed, 'The sliding walls must share one speed so they stay mirrored.');
assert.equal(leadSlider.height, rearSlider.height, 'The sliding walls must share one height so they stay mirrored.');
const liftRun = new VehiclePhysics(6);
assert.equal(liftRun.windmills.length, 2, 'Level six must build both fan rotors.');
assert.equal(liftRun.movingWalls.length, 2, 'Level six must build both sliding walls.');
let liftState = liftRun.getState();
let sliderLow = Infinity, sliderHigh = -Infinity, mirrorMin = Infinity, mirrorMax = -Infinity;
for (let i = 0; i < 120 * 8; i++) {
  liftState = liftRun.step(DT, 0);
  sliderLow = Math.min(sliderLow, liftState.movingWalls[0].y);
  sliderHigh = Math.max(sliderHigh, liftState.movingWalls[0].y);
  const mirrored = liftState.movingWalls[0].y + liftState.movingWalls[1].y;
  mirrorMin = Math.min(mirrorMin, mirrored);
  mirrorMax = Math.max(mirrorMax, mirrored);
}
assert.ok(sliderLow <= leadSlider.minY + .05 && sliderHigh >= leadSlider.maxY - .05, 'A sliding wall must travel the whole floor-to-ceiling track.');
assert.ok(mirrorMax - mirrorMin < .4, 'The sliding walls must stay mirrored, so they always travel in opposite directions.');
assert.ok(Math.abs(liftState.windmillAngles[0]) > .5 && Math.abs(liftState.windmillAngles[1]) > .5, 'Both fan rotors must actually spin.');
const hubRun = new VehiclePhysics(6);
placeVehicle(hubRun, rearFan.x, rearFan.y - 1, 0, 0, 2);
let hubState = hubRun.getState();
for (let i = 0; i < 120 && hubState.status === 'running'; i++) hubState = hubRun.step(DT, 0);
assert.equal(hubState.status, 'crashed', 'Touching a rotor hub with the roof must end the run.');
assert.equal(hubState.crashReason, 'roof', 'The rotor hub must use the roof crash reason.');
const capRun = new VehiclePhysics(6);
placeVehicle(capRun, 20, 11.6, 0, 0, 2);
let capState = capRun.getState();
for (let i = 0; i < 120 && capState.status === 'running'; i++) capState = capRun.step(DT, 0);
assert.equal(capState.status, 'crashed', 'Touching the ceiling with the roof must end the run.');
assert.equal(capState.crashReason, 'roof', 'The ceiling must use the roof crash reason.');
// The new sliding wall sits only six metres behind the ground level exit hole,
// which currently seals the stage: no seeded run below gets past that gate. The
// check records the blockage so it stays visible instead of looking cleared.
let liftWins = 0;
for (let trial = 0; trial < 60; trial++) {
  let seed = 4242 + trial;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const solver = new VehiclePhysics(6);
  let solverState = solver.getState();
  for (let i = 0; i < 120 * 18; i++) {
    solverState = solver.step(DT, random() < .5 ? 1 : 0);
    if (solverState.status === 'won') { liftWins++; break; }
    if (solverState.status === 'crashed') break;
  }
}
assert.equal(liftWins, 0, 'The current sliding wall spacing is known to seal level six.');

// Level seven is built around its water pit: the opening must stay open and lethal.
const waterPit = new VehiclePhysics(7);
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
assert.equal(pitState.status, 'crashed', 'Level seven water pit must end the run.');
assert.equal(pitState.crashReason, 'water', 'Level seven water pit must drown the car at the surface.');

// The jet tunnel is now level seven and the gear gauntlet is level eight: the
// gear stage reuses the tunnel terrain but replaces the three middle walls and
// the old gear traps with chained hazard windmills.
const courseSeven = getCourse(7);
const courseEight = getCourse(8);
assert.equal(courseSeven.id, 7, 'The original jet tunnel must move to level seven.');
assert.equal(courseSeven.jet, true, 'Level seven must keep jet propulsion.');
assert.equal(courseEight.id, 8, 'The gear gauntlet must move to level eight.');
assert.equal(courseEight.jet, true, 'Level eight must keep the jet-assisted gear challenge.');
assert.equal(courseEight.terrainParts.length, 2, 'Level eight must keep the original jet tunnel terrain structure.');
assert.equal(courseEight.terrainParts[0], courseSeven.terrainParts[0], 'Level eight must keep the opening water pit.');
assert.equal(courseEight.terrainParts[1][courseEight.terrainParts[1].length - 1].x, 190, 'Level eight must extend the final ground section.');
const raisedGround = courseEight.terrainParts[1].filter(point => point.y === .55);
assert.deepEqual(raisedGround.map(point => point.x), [88, 100], 'The ground under the second chained rotor must be raised slightly.');
assert.ok(courseEight.finishX > courseSeven.finishX, 'Level eight must move the finish beyond the new rotor chain.');
assert.equal(courseEight.wallGaps.length, 2, 'Level eight must keep only the first and last walls.');
assert.equal(courseEight.wallGaps[0], courseSeven.wallGaps[0], 'The first wall must remain unchanged.');
assert.equal(courseEight.wallGaps[1].x, courseSeven.wallGaps[4].x, 'The second wall must keep its position.');
assert.ok(Math.abs((courseEight.wallGaps[1].gapTop - courseEight.wallGaps[1].gapBottom) - 2 * (courseSeven.wallGaps[4].gapTop - courseSeven.wallGaps[4].gapBottom)) < 1e-9, 'The second wall opening must be twice as tall.');
assert.equal(courseEight.gearTrap, undefined, 'Level eight must remove the original gear trap.');
assert.equal(courseEight.secondTrap, undefined, 'Level eight must remove the second gear trap.');
assert.equal(courseEight.hazardWindmill?.gearRadius, 1.18, 'Level eight must define its giant hand-style rotors.');
assert.equal(courseEight.hazardWindmillChain.length, 3, 'Level eight must add three chained rotors behind the last wall.');
for (const config of courseEight.hazardWindmillChain) {
  assert.ok(config.halfLength > courseEight.hazardWindmill.halfLength, 'Each chained rotor arm must be larger than the first rotor.');
  assert.ok(config.gearRadius > courseEight.hazardWindmill.gearRadius, 'Each chained gear must be larger than the first rotor gear.');
}
assert.deepEqual(courseEight.hazardWindmillChain.map(config => config.spinSpeed), [-.27, .24, -.29], 'The three chained rotors must spin at half their previous speed.');
assert.deepEqual(courseEight.hazardWindmillChain.map(config => config.gearSpinSpeed), [-.86, .79, -.91], 'The chained tip gears must also spin at half speed.');
assert.equal(courseEight.hazardWindmillChain[0].armCount, 3, 'The first rotor behind the second wall must have three blades.');
assert.equal(courseEight.hazardWindmillChain[0].startAngle, Math.PI, 'The three-blade rotor must keep one blade against the wall edge.');
assert.notEqual(courseEight.hazardWindmillChain[2].lethalBlades, true, 'The last three-blade rotor must be a normal rotor again.');
assert.equal(courseEight.hazardWindmillChain[2].thickness, .52, 'The last rotor blades must keep their reduced width.');
assert.ok(courseEight.hazardWindmillChain[1].y > courseEight.hazardWindmillChain[0].y, 'The second chained rotor must sit higher than the first.');
assert.ok(courseEight.hazardWindmillChain[1].y > courseEight.hazardWindmillChain[2].y, 'The second chained rotor must be the highest.');
const secondRotorOuter = courseEight.hazardWindmillChain[1].x + courseEight.hazardWindmillChain[1].halfLength + courseEight.hazardWindmillChain[1].gearRadius + courseEight.hazardWindmillChain[1].toothLength / 2;
const lastRotorOuter = courseEight.hazardWindmillChain[2].x - courseEight.hazardWindmillChain[2].halfLength - courseEight.hazardWindmillChain[2].gearRadius - courseEight.hazardWindmillChain[2].toothLength / 2;
assert.ok(Math.abs(secondRotorOuter - lastRotorOuter) < .25, 'The last super rotor must sit directly beside the previous rotor without overlapping.');
assert.equal(courseEight.lowCeilings.length, 4, 'Level eight must add a low ceiling over the first rotor and three long ceilings over the rotor chain.');
const lowCeiling = courseEight.lowCeilings[0];
const firstRotorTop = courseEight.hazardWindmill.y + courseEight.hazardWindmill.halfLength + courseEight.hazardWindmill.gearRadius + courseEight.hazardWindmill.toothLength / 2;
assert.equal(lowCeiling.startX, courseEight.wallGaps[0].x, 'The long ceiling must connect to the first wall.');
assert.ok(lowCeiling.endX >= courseEight.wallGaps[1].x, 'The long ceiling must reach and connect to the last wall.');
assert.ok(lowCeiling.y > firstRotorTop && lowCeiling.y - firstRotorTop < .5, 'The ceiling must sit just above the first rotor to prevent flying over it.');
assert.equal(courseEight.lowCeilings[3].endX, courseEight.finishX, 'The last low ceiling must extend all the way to the finish.');
for (const [index, config] of courseEight.hazardWindmillChain.entries()) {
  const chainCeiling = courseEight.lowCeilings[index + 1];
  assert.ok(chainCeiling.startX <= config.x - config.halfLength, `Chain ceiling ${index + 1} must begin over its rotor.`);
  assert.ok(chainCeiling.endX >= config.x + config.halfLength, `Chain ceiling ${index + 1} must extend beyond its rotor.`);
  const rotorTop = config.y + config.halfLength + config.gearRadius + config.toothLength / 2;
  assert.ok(chainCeiling.y > rotorTop && chainCeiling.y - rotorTop < 1.2, `Chain ceiling ${index + 1} must stay close above every blade tip to block flying over.`);
}
assert.equal(courseEight.lowCeilingConnectors.length, 4, 'Every height transition in the rotor ceiling must be closed by a connector.');
for (const connector of courseEight.lowCeilingConnectors) {
  assert.ok(connector.topY > connector.bottomY, 'Every ceiling connector must have a positive height.');
}
const lastWall = courseEight.wallGaps[1];
const wallEdge = lastWall.x + (lastWall.width || .84) / 2;
const firstChainRotorEdge = courseEight.hazardWindmillChain[0].x - courseEight.hazardWindmillChain[0].halfLength;
assert.ok(Math.abs(firstChainRotorEdge - wallEdge) < .8, 'The first chained rotor must lean against the last wall edge.');
assert.ok(courseEight.finishX > courseEight.hazardWindmillChain[2].x + courseEight.hazardWindmillChain[2].halfLength + courseEight.hazardWindmillChain[2].gearRadius, 'The finish must sit beyond the full rotor chain.');
const jetLevelSeven = new VehiclePhysics(7);
const jetLevelSevenState = jetLevelSeven.step(DT, 1);
assert.equal(jetLevelSevenState.jetForward, true, 'Level seven must keep the jet propulsion used by the original tunnel.');
const gearLevelEight = new VehiclePhysics(8);
assert.ok(gearLevelEight.hazardWindmill, 'Level eight must create the giant rotor body.');
assert.equal(gearLevelEight.hazardGears.length, 4, 'The giant rotor must have four dangerous gears at its tips.');
assert.equal(gearLevelEight.hazardWindmillChain.length, 3, 'Level eight must create all three chained rotor bodies.');
assert.equal(gearLevelEight.hazardChainGears.length, 3, 'Level eight must create gear arrays for all chained rotors.');
assert.deepEqual(gearLevelEight.hazardChainGears.map(gears => gears.length), [3, 4, 3], 'The first and last new rotors must carry three gears.');

const hazardGearRun = new VehiclePhysics(8);
const firstHazardPosition = hazardGearRun.hazardGears[0].getPosition();
placeVehicle(hazardGearRun, firstHazardPosition.x, firstHazardPosition.y, 0, 0, 0);
const hazardGearState = hazardGearRun.step(DT, 0);
assert.equal(hazardGearState.status, 'crashed', 'Touching one of the giant rotor gears must fail the run.');
assert.equal(hazardGearState.crashReason, 'gear', 'The giant rotor tips must use the gear crash reason.');

const normalBladeRun = new VehiclePhysics(8);
normalBladeRun.hazardWindmill.setActive(false);
normalBladeRun.hazardGears.forEach(gear => gear.setActive(false));
for (let i = 0; i < 2; i++) {
  normalBladeRun.hazardWindmillChain[i].setActive(false);
  normalBladeRun.hazardChainGears[i].forEach(gear => gear.setActive(false));
}
const superConfig = courseEight.hazardWindmillChain[2];
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

const laserRun = new VehiclePhysics(8);
laserRun.hazardWindmill.setActive(false);
laserRun.hazardGears.forEach(gear => gear.setActive(false));
laserRun.hazardWindmillChain.forEach(rotor => rotor.setActive(false));
laserRun.hazardChainGears.flat().forEach(gear => gear.setActive(false));
let laserFixtureCount = 0;
for (let fixture = laserRun.thirdLaserGate.getFixtureList(); fixture; fixture = fixture.getNext()) laserFixtureCount++;
assert.ok(laserFixtureCount > 0, 'The third-rotor laser gate must have physical beam fixtures.');
const laserConfig = courseEight.thirdRotorLaser;
const superRotorOuterEdge = courseEight.hazardWindmillChain[2].x + courseEight.hazardWindmillChain[2].halfLength + courseEight.hazardWindmillChain[2].gearRadius + courseEight.hazardWindmillChain[2].toothLength / 2;
assert.ok(laserConfig.gateX < 122 && laserConfig.gateX > superRotorOuterEdge, 'The rear laser gate must stay very close behind the super rotor without overlapping it.');
assert.equal(courseEight.laserCrate.y - courseEight.laserCrate.height / 2, 0, 'The wooden corner crate must rest on the ground.');
assert.ok(Math.abs((courseEight.laserCrate.x + courseEight.laserCrate.width / 2) - (laserConfig.gateX - .045)) < 1e-9, 'The crate must sit directly against the lower-left side of the laser gate.');
assert.deepEqual([courseEight.laserCrate.width, courseEight.laserCrate.height, courseEight.laserCrate.depth], [2.5, 2.5, 2.5], 'The laser corner crate must be 2.5 times its previous size.');
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

const safeCeilingRun = new VehiclePhysics(8);
safeCeilingRun.hazardWindmill.setActive(false);
safeCeilingRun.hazardGears.forEach(gear => gear.setActive(false));
safeCeilingRun.hazardWindmillChain.forEach(rotor => rotor.setActive(false));
safeCeilingRun.hazardChainGears.flat().forEach(gear => gear.setActive(false));
placeVehicle(safeCeilingRun, 50, 13.25, 0, 0, 0);
let safeCeilingState = safeCeilingRun.getState();
for (let i = 0; i < 16 && safeCeilingState.status === 'running'; i++) safeCeilingState = safeCeilingRun.step(DT, 0);
assert.equal(safeCeilingState.status, 'running', 'Touching the long low ceiling with the roof must not kill the player.');

// The moved jet tunnel and gear gauntlet ceilings must stop the car from climbing above them.
for (const level of [7, 8]) {
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
