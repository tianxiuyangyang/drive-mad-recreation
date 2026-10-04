import assert from 'node:assert/strict';
import { VehiclePhysics } from './physics.mjs';
import { Circle } from './vendor/planck.mjs';

const dt = 1/120;
const game = new VehiclePhysics(7);
const config = game.course.gearTrap;
function assertGates(active) {
  assert.equal(game.trapGates.length,2);
  for (const gate of game.trapGates) assert.equal(gate.isActive(),active,'Both laser gates must switch together.');
}
function floorUnderGear() {
  let found=false;
  game.world.rayCast({x:config.x,y:.5},{x:config.x,y:-.5},fixture=>{
    if(fixture.getUserData()?.kind==='ground') found=true;
    return 1;
  });
  return found;
}
assert.ok(config.bottomY+config.radius+config.toothLength/2<-.36,'The entire gear starts below the floor.');
assert.ok(config.topY<=7.2,'The gear peak is lowered well below its old 11.6 height.');
assert.equal(floorUnderGear(),true,'Closed floor supports the vehicle.');
assert.equal(game.getState().trap.phase,'idle');
assert.equal(game.trapGate.isActive(),false);
assertGates(false);
assert.equal(game.trapGear.isActive(),false);
game.status='running';
game.detectTrapCrossing({x:54,y:5},{x:55,y:5});
assert.equal(game.getState().trap.phase,'idle','Flying above the opening must not trigger it.');
game.detectTrapCrossing({x:55,y:1.7},{x:54,y:1.7});
assert.equal(game.getState().trap.phase,'idle','Reverse crossing must not trigger it.');

// Cross the detector with the actual vehicle and let the physics step trigger it.
const origin={...game.body.getPosition()};
for(const body of [game.body,...game.wheels]) {
  const p=body.getPosition();
  body.setTransform({x:p.x-origin.x+54.39,y:p.y-origin.y+1.7},0);
  body.setLinearVelocity({x:6,y:0});
}
game.step(dt,0);
assert.equal(game.getState().trap.phase,'idle','Do not close the third gate while the rear of the car is still in it.');
assertGates(false);
let crossingTicks=0;
while(game.getState().trap.phase==='idle' && crossingTicks++<180) game.step(dt,0);
assert.equal(game.getState().trap.phase,'rising');
for (const body of [game.body,...game.wheels]) {
  for (let fixture=body.getFixtureList();fixture;fixture=fixture.getNext()) {
    assert.ok(fixture.getAABB(0).lowerBound.x>54.5,'The whole vehicle must clear the third opening before activation.');
  }
}
assert.equal(floorUnderGear(),false,'Opening must remove the terrain collision, not just hide its model.');
assertGates(true);

// Park outside the machinery to observe a complete cycle without player death.
const location={...game.body.getPosition()};
for(const body of [game.body,...game.wheels]) {
  const p=body.getPosition();
  body.setTransform({x:p.x-location.x,y:p.y-location.y+1.14},0);
  body.setLinearVelocity({x:0,y:0});
  body.setAngularVelocity(0);
}
// Small physical probes cannot pass either laser curtain in either direction.
for (const gate of game.trapGates) {
  const wall=game.course.wallGaps.find(wall=>wall.x===gate.getPosition().x);
  for (const direction of [-1,1]) {
    const probe=game.world.createDynamicBody({position:{x:wall.x-direction*.7,y:(wall.gapBottom+wall.gapTop)/2},bullet:true,gravityScale:0});
    probe.createFixture(Circle(.25),{density:1});
    probe.setLinearVelocity({x:direction*8,y:0});
    for(let i=0;i<30;i++) game.world.step(dt,8,4);
    assert.ok((probe.getPosition().x-wall.x)*direction<0,'Laser rows must physically block crossing from both sides.');
    game.world.destroyBody(probe);
  }
}
let ticks=0;
while(game.getState().trap.phase==='rising' && ticks++<2000) game.step(dt);
assert.equal(game.getState().trap.phase,'holding');
assert.ok(Math.abs(game.getState().trap.y-config.topY)<1e-8);
const holdAngle=game.getState().trap.angle;
for(let i=0;i<358;i++) game.step(dt);
assert.equal(game.getState().trap.phase,'holding');
assert.equal(game.getState().trap.gateClosed,true);
assertGates(true);
assert.notEqual(game.getState().trap.angle,holdAngle,'The gear must keep spinning at the top.');
for(let i=0;i<3;i++) game.step(dt);
assert.equal(game.getState().trap.phase,'falling');
assert.equal(game.trapFloor.isActive(),false,'The hatch remains open for the descending gear.');
assert.equal(game.getState().trap.gateClosed,false,'Gate must open when descent starts.');
assertGates(false);
const y=game.getState().trap.y;
for(let i=0;i<120;i++) game.step(dt);
assert.ok(Math.abs(y-game.getState().trap.y-config.fallSpeed)<1e-7);
for(let i=0;i<2200;i++) game.step(dt);
assert.equal(game.getState().trap.phase,'done');
assert.equal(floorUnderGear(),true,'Floor closes after the gear returns underground.');
assert.ok(Math.abs(game.getState().trap.y-config.bottomY)<1e-8);

// Crossing the fourth opening starts the second trap: only the fifth laser closes,
// while the two gears travel through one another to exchange vertical positions.
game.setTestMode(true);
const fourthWall = game.course.wallGaps[3];
const fourthExit = fourthWall.x + (fourthWall.width || .84) / 2;
const secondOrigin = {...game.body.getPosition()};
for (const body of [game.body,...game.wheels]) {
  const p=body.getPosition();
  body.setTransform({x:p.x-secondOrigin.x+fourthExit-1.9-.45,y:p.y-secondOrigin.y+7.4},0);
  body.setLinearVelocity({x:6,y:0});
}
game.step(dt,0);
assert.equal(game.getState().secondTrap.phase,'idle','The fourth detector uses the same conservative crossing rule as the first.');
let secondTicks=0;
while(game.getState().secondTrap.phase==='idle' && secondTicks++<400) game.step(dt,0);
assert.equal(game.getState().secondTrap.phase,'moving','Crossing the fourth opening must start the second trap once the car has cleared it.');
for (const body of [game.body,...game.wheels]) {
  for (let fixture=body.getFixtureList();fixture;fixture=fixture.getNext()) {
    assert.ok(fixture.getAABB(0).lowerBound.x>fourthExit,'The complete vehicle must clear the fourth wall before the second trap starts.');
  }
}
assert.equal(game.getState().secondTrap.gateClosed,true,'The fifth opening laser must close during the crossing.');
assert.equal(game.getState().trap.gateClosed,false,'The fourth opening must remain open during the second trap.');
const startGearY=game.getState().secondTrap.gears.map(gear=>gear.y);
const trapConfig=game.course.secondTrap;
const gearDistance=trapConfig.topY-trapConfig.bottomY;
const noBoostLowerArrival=gearDistance/trapConfig.moveSpeed;
let travelTicks=0;
while(game.getState().secondTrap.gateClosed && travelTicks++<15000) game.step(dt,0);
const afterLower=game.getState().secondTrap;
assert.equal(afterLower.gateClosed,false,'The fifth laser must open as soon as the lower gear reaches the top.');
assert.equal(afterLower.phase,'moving','The slower upper gear must still be descending when the gate opens.');
assert.ok(Math.abs(afterLower.gears[0].y-trapConfig.topY)<1e-6,'The lower gear must have reached the top.');
assert.ok(afterLower.gears[1].y>trapConfig.bottomY+.5,'The upper gear must not have reached the bottom yet.');
assert.ok(travelTicks/120 < noBoostLowerArrival,'Contact boost must make the gears arrive sooner than the unboosted travel time.');
let gearTicks=0;
while(game.getState().secondTrap.phase==='moving' && gearTicks++<15000) game.step(dt,0);
const finishedSecond=game.getState().secondTrap;
assert.equal(finishedSecond.phase,'done');
assert.equal(finishedSecond.gateClosed,false,'The fifth laser stays open after both gears finish.');
assert.ok(finishedSecond.gears[0].y>startGearY[0] && finishedSecond.gears[1].y<startGearY[1]);
assert.ok(Math.abs(finishedSecond.gears[0].y-trapConfig.topY)<1e-6);
assert.ok(Math.abs(finishedSecond.gears[1].y-trapConfig.bottomY)<1e-6);
game.detectTrapCrossing({x:54,y:1.7},{x:55,y:1.7});
assert.equal(game.getState().trap.phase,'done','Detector must trigger only once per attempt.');

// A physical overlap with a tooth/disc is a hazard, not a decorative animation.
game.setTestMode(false);
game.body.setTransform({x:config.x,y:config.bottomY},0);
game.step(dt);
assert.equal(game.getState().crashReason,'gear');
game.reset();
assert.equal(game.getState().trap.phase,'idle');
assert.equal(game.trapGate.isActive(),false);
assertGates(false);
assert.equal(game.trapGear.isActive(),false);
assert.equal(game.getState().secondTrap.phase,'idle');
assert.equal(game.secondTrapGate.isActive(),false);

// The second detector remains independent while the first gear is descending.
const fallingCheck = new VehiclePhysics(7);
fallingCheck.status = 'running';
fallingCheck.trapElapsed = 10;
fallingCheck.trapPhase = 'falling';
const fallingOrigin = {...fallingCheck.body.getPosition()};
for (const body of [fallingCheck.body,...fallingCheck.wheels]) {
  const p=body.getPosition();
  body.setTransform({x:p.x-fallingOrigin.x+66.5,y:p.y-fallingOrigin.y+7.4},0);
}
fallingCheck.detectSecondTrapCrossing({x:64.1,y:7.4},{x:64.3,y:7.4});
assert.equal(fallingCheck.getState().secondTrap.phase,'moving','Second detector must still work while the first gear descends.');
game.setLevel(1);
assert.equal(game.getState().trap,null);
console.log('Trap checks passed: full-vehicle crossing, synchronized laser gates, second detector parity, half-speed upper gear, contact boost and early fifth-gate opening, physical blocking, reduced peak, rise/hold/fall cycle, floor reopening, gear collision, reset and level switch.');
