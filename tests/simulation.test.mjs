import assert from "node:assert/strict";
import test from "node:test";
import { cars } from "../data/cars.ts";
import { enduranceCars } from "../data/endurance-cars.ts";
import { formulaOneCars } from "../data/formula-one.ts";
import { vehicles } from "../data/vehicles.ts";
import {
  advanceSimulation,
  createSimulationState,
  FIXED_STEP_SECONDS,
  INITIAL_SIMULATION_INPUT,
  rpmFromRadiansPerSecond,
  stepSimulation,
} from "../lib/simulation.ts";
import { getOverallRatio } from "../lib/transmission.ts";

const running = { ...INITIAL_SIMULATION_INPUT, engineOn: true };

function simulate(vehicle, input, ticks, initial = createSimulationState(vehicle)) {
  let state = initial;
  for (let tick = 0; tick < ticks; tick += 1) state = stepSimulation(state, input, vehicle);
  return state;
}

function warmRunningState(vehicle, rpm = vehicle.physics.idleRpm) {
  return { ...createSimulationState(vehicle), ...running, powerOn: true, enginePhase: "running",
    engineWarmth: 1, runningSeconds: 3, engineAngularVelocity: rpm * Math.PI / 30 };
}

test("cold ignition spins the crank before combustion, then settles from fast idle and restarts warm", () => {
  for (const vehicle of [vehicles[1], cars.find(({ id }) => id === "toyota-gr-supra"), cars.find(({ id }) => id === "mazda-rx8")]) {
    const starting = simulate(vehicle, running, 26);
    assert.equal(starting.enginePhase, "cranking", vehicle.name);
    assert.equal(starting.combustionTorqueNm, 0);
    assert.equal(starting.starter, 1);
    assert.ok(starting.engineAngularVelocity > 0 && starting.crankAngleRad > 0);
    assert.equal(starting.vehicleSpeed, 0);
    const cold = simulate(vehicle, running, 270, starting);
    const hot = simulate(vehicle, running, 120 * 36, cold);
    assert.equal(cold.enginePhase, "running");
    assert.equal(cold.starter, 0);
    assert.ok(rpmFromRadiansPerSecond(cold.engineAngularVelocity) > vehicle.physics.idleRpm + 170, vehicle.name);
    assert.ok(Math.abs(rpmFromRadiansPerSecond(hot.engineAngularVelocity) - vehicle.physics.idleRpm) < 1, vehicle.name);
    const stopped = simulate(vehicle, INITIAL_SIMULATION_INPUT, 360, hot);
    const restarted = simulate(vehicle, running, 270, stopped);
    assert.equal(stopped.enginePhase, "off");
    assert.ok(rpmFromRadiansPerSecond(restarted.engineAngularVelocity) < vehicle.physics.idleRpm + 60, vehicle.name);
  }
});

test("LMDh drives electrically from the pits before starting the engine and coupling the gearbox", () => {
  for (const car of enduranceCars) {
    const control = { ...running, shiftMode: "AT" };
    const { electricDrive } = car.physics;
    const ready = simulate(car, control, 240);
    assert.equal(ready.enginePhase, "electric", car.name);
    assert.equal(ready.vehicleSpeed, 0);
    assert.equal(ready.engineAngularVelocity, 0);
    const floor = { ...control, throttle: 1 };
    const rolling = simulate(car, floor, 120, ready);
    assert.equal(rolling.enginePhase, "electric", car.name);
    assert.equal(rolling.engineAngularVelocity, 0);
    assert.equal(rolling.combustionTorqueNm, 0);
    assert.ok(rolling.vehicleSpeed > 1 && rolling.motorAngularVelocity > 0 && rolling.motorLoad > 0);
    assert.ok(rolling.electricEnergyKj < ready.electricEnergyKj);
    let state = rolling;
    for (let tick = 0; tick < 360 && state.enginePhase === "electric"; tick += 1) state = stepSimulation(state, floor, car);
    assert.equal(state.enginePhase, "cranking", car.name);
    assert.ok(state.vehicleSpeed * 3.6 >= electricDrive.engineStartKmh);
    assert.equal(state.combustionTorqueNm, 0);
    const runningCar = simulate(car, floor, 140, state);
    assert.equal(runningCar.enginePhase, "running");
    assert.ok(runningCar.vehicleSpeed > state.vehicleSpeed && runningCar.combustionTorqueNm > 0);
    assert.equal(runningCar.electricPowerKw, 0);
    const braking = stepSimulation(runningCar, { ...control, brake: 1 }, car);
    assert.ok(braking.electricPowerKw < 0 && braking.electricEnergyKj > runningCar.electricEnergyKj);
  }
});

test("sports cars rev independently in neutral, accelerate through gears and brake while coupled", () => {
  for (const car of cars) {
    const { physics } = car;
    const floor = { ...running, throttle: 1 };
    const idle = simulate(car, running, 250);
    const neutral = simulate(car, floor, 300, idle);
    assert.equal(neutral.vehicleSpeed, 0, car.name);
    assert.ok(rpmFromRadiansPerSecond(neutral.engineAngularVelocity) >= physics.referenceRpm * 0.85, car.name);
    const fast = simulate(car, { ...floor, shiftMode: "AT" }, 120 * 75);
    assert.ok(fast.gear >= 4 && fast.vehicleSpeed > 40, car.name);
    assert.ok(rpmFromRadiansPerSecond(fast.engineAngularVelocity) <= physics.fuelCutRpm, car.name);
    assert.equal(fast.vehicleSpeed, fast.wheelAngularVelocity * physics.rollingRadiusM);
    assert.ok(Math.abs(fast.clutchSlipRadPerSecond) < 1e-8, car.name);
    if (physics.speedLimitKmh) assert.ok(fast.vehicleSpeed * 3.6 <= physics.speedLimitKmh, car.name);
    const braked = simulate(car, { ...running, brake: 1 }, 120, fast);
    assert.ok(braked.vehicleSpeed < fast.vehicleSpeed - 5, car.name);
  }
});

test("published turbo torque plateaus are used at both ends and in the middle", () => {
  for (const car of cars.filter(({ physics }) => physics.peakTorqueEndRpm !== undefined)) {
    const { peakTorqueRpm, peakTorqueEndRpm, peakTorqueNm } = car.physics;
    for (const rpm of [peakTorqueRpm, (peakTorqueRpm + peakTorqueEndRpm) / 2, peakTorqueEndRpm]) {
      const state = { ...createSimulationState(car), engineAngularVelocity: rpm * Math.PI / 30 };
      const loaded = stepSimulation(state, { ...running, throttle: 1 }, car);
      assert.ok(Math.abs(loaded.engineTorqueNm - peakTorqueNm) < 1e-9, car.name);
    }
  }
});

test("F1 road physics reaches each era's RPM range and uses the configured gears", () => {
  for (const car of formulaOneCars) {
    const floor = { ...running, throttle: 1 };
    const neutral = simulate(car, floor, 340);
    assert.equal(neutral.vehicleSpeed, 0);
    assert.equal(neutral.hybridPowerKw, 0);
    assert.equal(car.gears, car.physics.gearRatios.length);
    assert.ok(rpmFromRadiansPerSecond(neutral.engineAngularVelocity) > 0.88 * car.physics.referenceRpm, car.name);
    const fast = simulate(car, { ...floor, shiftMode: "AT" }, 120 * 32);
    assert.ok(fast.vehicleSpeed > 68 && fast.gear >= car.gears - 1, car.name);
    assert.ok(rpmFromRadiansPerSecond(fast.engineAngularVelocity) <= car.physics.fuelCutRpm, car.name);
    const braked = simulate(car, { ...running, brake: 1 }, 85, fast);
    assert.ok(fast.vehicleSpeed - braked.vehicleSpeed > 12, car.name);
  }
});

test("F1 ERS spends charge when applying torque and recovers it from existing brake force", () => {
  const car = formulaOneCars.find(({ id }) => id === "ferrari-sf-26");
  const hybrid = car.physics.hybridAssist;
  const rolling = (speedKmh, gear) => {
    const vehicleSpeed = speedKmh / 3.6;
    const wheelAngularVelocity = vehicleSpeed / car.physics.rollingRadiusM;
    return { ...createSimulationState(car), ...running, gear, vehicleSpeed, wheelAngularVelocity,
      engineAngularVelocity: wheelAngularVelocity * getOverallRatio(car, gear) };
  };
  const atSpeed = rolling(205, 5);
  const full = { ...running, throttle: 1 };
  const boost = stepSimulation(atSpeed, full, car);
  const empty = stepSimulation({ ...atSpeed, hybridEnergyKj: 0 }, full, car);
  assert.ok(boost.hybridPowerKw > 150 && boost.hybridPowerKw <= hybrid.peakPowerKw);
  assert.equal(boost.hybridEnergyKj, hybrid.capacityKj - boost.hybridPowerKw * FIXED_STEP_SECONDS);
  assert.equal(boost.combustionTorqueNm, empty.combustionTorqueNm);
  assert.ok(boost.vehicleSpeed > empty.vehicleSpeed);
  assert.equal(empty.hybridPowerKw, 0);
  assert.equal(stepSimulation(rolling(hybrid.taperEndKmh + 5, 8), full, car).hybridPowerKw, 0);
  const recovered = stepSimulation(empty, { ...running, brake: 1 }, car);
  const saturated = stepSimulation({ ...empty, hybridEnergyKj: hybrid.capacityKj }, { ...running, brake: 1 }, car);
  assert.ok(recovered.hybridPowerKw < -150 && recovered.hybridEnergyKj > 0);
  assert.equal(saturated.hybridEnergyKj, hybrid.capacityKj);
  assert.equal(recovered.vehicleSpeed, saturated.vehicleSpeed);
});

test("turbo pressure takes time to build and release needs pressure and a throttle drop", () => {
  const car = cars.find(({ id }) => id === "toyota-gr-supra");
  const rpm = 4300;
  const gear = 3;
  const wheelAngularVelocity = rpm * Math.PI / 30 / getOverallRatio(car, gear);
  const start = { ...createSimulationState(car), ...running, gear, engineAngularVelocity: rpm * Math.PI / 30,
    wheelAngularVelocity, vehicleSpeed: wheelAngularVelocity * car.physics.rollingRadiusM };
  const wideOpen = { ...running, throttle: 1 };
  const coldLift = stepSimulation(stepSimulation(start, wideOpen, car), running, car);
  const boosted = simulate(car, wideOpen, 90, start);
  assert.equal(coldLift.turboRelease, 0);
  assert.ok(boosted.turboBoostBar > 0.9 * car.turbocharger.maxBoostBar);
  assert.equal(boosted.turboRelease, 0);
  const vent = stepSimulation(boosted, running, car);
  assert.ok(vent.turboRelease > 0.9 && vent.turboBoostBar < boosted.turboBoostBar);
  const coast = simulate(car, running, 60, vent);
  assert.ok(coast.turboRelease < 0.004 && coast.turboBoostBar < 0.004);
  const naturallyAspirated = cars.find(({ id }) => id === "toyota-gr86");
  assert.equal(stepSimulation(boosted, running, naturallyAspirated).turboRelease, 0);
});

function rollingInSecond(vehicle) {
  const { physics } = vehicle;
  const speed = 12;
  const wheelOmega = speed / physics.rollingRadiusM;
  return {
    ...createSimulationState(vehicle),
    ...running,
    gear: 2,
    vehicleSpeed: speed,
    wheelAngularVelocity: wheelOmega,
    engineAngularVelocity: wheelOmega * physics.primaryRatio * physics.gearRatios[1] * physics.finalDriveRatio,
  };
}

for (const vehicle of vehicles) {
  const blipRpm = Math.min(10_000, vehicle.physics.fuelCutRpm - 550);
  test(`${vehicle.name}: neutral throttle reaches ${blipRpm} RPM without moving the wheel`, () => {
    const idle = simulate(vehicle, running, 240);
    const revving = simulate(vehicle, { ...running, throttle: 1 }, 186, idle);
    assert.ok(rpmFromRadiansPerSecond(revving.engineAngularVelocity) >= blipRpm);
    assert.equal(revving.wheelAngularVelocity, 0);
  });

  test(`${vehicle.name}: rolling off in neutral drops revs quickly and allows a second blip`, () => {
    const initial = warmRunningState(vehicle, blipRpm);
    const released = simulate(vehicle, running, 192, initial);
    const releaseRpm = rpmFromRadiansPerSecond(released.engineAngularVelocity);
    assert.ok(releaseRpm <= 4000 && releaseRpm >= vehicle.physics.idleRpm);
    assert.equal(released.drivetrainTorqueNm, 0);
    assert.equal(released.wheelAngularVelocity, 0);

    const settled = simulate(vehicle, running, 480, released);
    assert.ok(Math.abs(rpmFromRadiansPerSecond(settled.engineAngularVelocity) - vehicle.physics.idleRpm) < 1);

    const blip = simulate(vehicle, { ...running, throttle: 1 }, 186, released);
    assert.ok(rpmFromRadiansPerSecond(blip.engineAngularVelocity) >= blipRpm);
    assert.equal(blip.vehicleSpeed, 0);
  });

  test(`${vehicle.name}: neutral revs independently of wheel speed and brakes`, () => {
    const idle = simulate(vehicle, running, 240, warmRunningState(vehicle));
    assert.ok(Math.abs(rpmFromRadiansPerSecond(idle.engineAngularVelocity) - vehicle.physics.idleRpm) < 1);
    const input = { ...running, throttle: 1 };
    const revving = simulate(vehicle, input, 120, idle);
    assert.ok(revving.engineAngularVelocity > idle.engineAngularVelocity * 2);
    assert.equal(revving.wheelAngularVelocity, 0);
    assert.equal(revving.vehicleSpeed, 0);
    assert.equal(revving.drivetrainTorqueNm, 0);
    assert.equal(simulate(vehicle, { ...input, brake: 1 }, 120, idle).engineAngularVelocity, revving.engineAngularVelocity);
    const rolling = { ...rollingInSecond(vehicle), gear: 0 };
    const neutralCoast = simulate(vehicle, running, 60, rolling);
    const neutralBrake = simulate(vehicle, { ...running, brake: 1 }, 60, rolling);
    assert.ok(neutralBrake.vehicleSpeed < neutralCoast.vehicleSpeed);
    assert.equal(neutralBrake.engineAngularVelocity, neutralCoast.engineAngularVelocity);
  });

  test(`${vehicle.name}: first-gear launch transfers torque through a slipping clutch`, () => {
    const idle = simulate(vehicle, running, 120);
    const input = { ...running, throttle: 1 };
    const firstGear = { ...idle, gear: 1 };
    const firstTick = stepSimulation(firstGear, input, vehicle);
    const engaging = simulate(vehicle, input, 30, firstTick);
    const launch = simulate(vehicle, input, 120, firstGear);
    assert.ok(firstTick.vehicleSpeed < 0.1);
    assert.ok(launch.vehicleSpeed > 1);
    assert.ok(launch.drivetrainTorqueNm > 0);
    assert.ok(engaging.clutchSlipRadPerSecond > 0);
    assert.equal(launch.vehicleSpeed, launch.wheelAngularVelocity * vehicle.physics.rollingRadiusM);
    assert.ok(launch.crankAngleRad >= 0 && launch.crankAngleRad < 4 * Math.PI);
  });

  test(`${vehicle.name}: engine braking and wheel brakes act through the drivetrain`, () => {
    const initial = rollingInSecond(vehicle);
    const coast = simulate(vehicle, running, 60, { ...initial, gear: 0 });
    const engineBrake = simulate(vehicle, running, 60, initial);
    const braked = simulate(vehicle, { ...running, brake: 1 }, 60, initial);
    assert.ok(engineBrake.drivetrainTorqueNm < 0);
    assert.ok(engineBrake.vehicleSpeed < coast.vehicleSpeed);
    assert.ok(braked.vehicleSpeed < engineBrake.vehicleSpeed);
    assert.ok(braked.engineAngularVelocity < engineBrake.engineAngularVelocity);
    const stopped = simulate(vehicle, { ...running, brake: 1 }, 480, initial);
    assert.equal(stopped.vehicleSpeed, 0);
    assert.equal(stopped.wheelAngularVelocity, 0);
  });
}

for (const vehicle of vehicles.filter(({ id }) => id === "yamaha-r6" || id === "yamaha-r1")) {
  test(`${vehicle.name}: equal RPM bands get faster as the engine climbs, even under load`, () => {
    const idle = simulate(vehicle, running, 240);
    const input = { ...running, throttle: 1 };
    const rpmBands = [3000, 5000, 9000, 11000];
    const passageTimes = [0, 1].map((gear) => {
      let state = { ...idle, gear };
      const times = [];
      for (let tick = 1; tick <= 720 && times.length < rpmBands.length; tick += 1) {
        state = stepSimulation(state, input, vehicle);
        if (rpmFromRadiansPerSecond(state.engineAngularVelocity) >= rpmBands[times.length]) times.push(tick);
      }
      assert.equal(times.length, rpmBands.length);
      const lowBand = times[1] - times[0];
      const highBand = times[3] - times[2];
      assert.ok(highBand <= lowBand * 0.75, `gear ${gear}: high ${highBand} ticks, low ${lowBand} ticks`);
      return times.at(-1);
    });
    assert.ok(passageTimes[1] > passageTimes[0]);
  });
}

test("fixed steps give the same state across frame schedules and bound elapsed-time catch-up", () => {
  const vehicle = vehicles[0];
  const initial = { ...createSimulationState(vehicle), gear: 1 };
  const input = { ...running, throttle: 1 };
  const reference = simulate(vehicle, input, 120, initial);
  let frame = { state: initial, remainderSeconds: 0 };
  for (let index = 0; index < 50; index += 1) {
    frame = advanceSimulation(frame.state, input, vehicle, 0.02, frame.remainderSeconds);
  }
  assert.deepEqual(frame.state, reference);
  assert.ok(frame.remainderSeconds < FIXED_STEP_SECONDS);
  assert.equal(advanceSimulation(initial, input, vehicle, 0.001).state, initial);
  assert.deepEqual(advanceSimulation(initial, input, vehicle, 60).state, simulate(vehicle, input, 12, initial));
});

test("per-bike parameters give distinct profiles, and ignition off transfers no drive torque", () => {
  const input = { ...running, throttle: 1 };
  const results = vehicles.map((vehicle) => simulate(vehicle, input, 240, { ...createSimulationState(vehicle), gear: 1 }));
  assert.ok(results[1].vehicleSpeed > results[0].vehicleSpeed);
  const [vehicle] = vehicles;
  const off = simulate(vehicle, { ...INITIAL_SIMULATION_INPUT, throttle: 1 }, 240, results[0]);
  assert.equal(off.drivetrainTorqueNm, 0);
  assert.ok(off.vehicleSpeed < results[0].vehicleSpeed);
  assert.ok(off.engineAngularVelocity < results[0].engineAngularVelocity);
});

test("pure rolling keeps the R1 wheel tied to road speed through a launch and a full stop", () => {
  const vehicle = vehicles.find(({ id }) => id === "yamaha-r1");
  let state = { ...warmRunningState(vehicle), gear: 1 };
  for (let tick = 0; tick < 660; tick += 1) {
    const input = tick < 180 ? { ...running, throttle: 1 } : { ...running, brake: 1 };
    state = stepSimulation(state, input, vehicle);
    assert.equal(state.vehicleSpeed, state.wheelAngularVelocity * vehicle.physics.rollingRadiusM);
    assert.ok(state.vehicleSpeed >= 0);
    if (tick === 179) assert.ok(state.vehicleSpeed > 5);
  }
  assert.equal(state.vehicleSpeed, 0);
});

test("H2 and H2R drive separate impeller phases at 9.18 times crank speed", () => {
  const supercharged = vehicles.filter((vehicle) => vehicle.supercharger);
  assert.deepEqual(supercharged.map(({ id }) => id), ["kawasaki-h2", "kawasaki-h2r"]);
  const revolution = 2 * Math.PI;
  for (const vehicle of supercharged) {
    let state = {
      ...createSimulationState(vehicle),
      engineAngularVelocity: 10000 * revolution / 60,
      crankAngleRad: 2 * revolution - 0.1,
      superchargerAngleRad: 0.25,
    };
    for (const throttle of [1, 0]) {
      const next = stepSimulation(state, { ...running, throttle }, vehicle);
      const advance = FIXED_STEP_SECONDS * (state.engineAngularVelocity + next.engineAngularVelocity) / 2;
      const angle = (state.superchargerAngleRad + 9.18 * advance) % revolution;
      assert.equal(next.superchargerAngularVelocity, 9.18 * next.engineAngularVelocity);
      assert.ok(Math.abs(next.superchargerAngleRad - angle) < 1e-10);
      state = next;
    }
  }

  const naturallyAspirated = vehicles.find(({ id }) => id === "kawasaki-zx10r");
  const runningEngine = simulate(naturallyAspirated, { ...running, throttle: 1 }, 120);
  assert.equal(runningEngine.superchargerAngularVelocity, 0);
  assert.equal(runningEngine.superchargerAngleRad, 0);
});

test("all models reach a stable, fully coupled road speed under sustained throttle", () => {
  const input = { ...running, throttle: 1, shiftMode: "AT" };
  const speedRanges = {
    "yamaha-r15": [130, 144], "yamaha-r3": [169, 183], "yamaha-r6": [255, 273],
    "yamaha-r7": [205, 226], "yamaha-r9": [242, 257], "yamaha-r1": [290, 308],
    "kawasaki-zx25r": [174, 185], "kawasaki-zx4r": [195, 215], "kawasaki-zx6r599": [247, 268],
    "kawasaki-zx6r636": [226, 242], "kawasaki-zx10r": [290, 304], "kawasaki-zx14r": [290, 307],
    "kawasaki-h2": [297, 299], "kawasaki-h2r": [345, 370],
    "aprilia-rs125": [114, 125], "suzuki-hayabusa": [297, 299],
    "bmw-s1000rr": [302, 304], "bmw-m1000rr": [313, 315], "ducati-panigale-v4-r": [317, 320],
  };

  for (const vehicle of vehicles) {
    const fast = simulate(vehicle, input, 120 * 75);
    const ratio = getOverallRatio(vehicle, fast.gear);
    const cutoff = vehicle.physics.gearFuelCutRpm?.[fast.gear] ?? vehicle.physics.fuelCutRpm;
    const limiterSpeed = cutoff * Math.PI / 30 * vehicle.physics.rollingRadiusM / ratio * 3.6;
    const [minimum, maximum] = speedRanges[vehicle.id] ?? [90, limiterSpeed];
    const kmh = fast.vehicleSpeed * 3.6;
    const rpm = rpmFromRadiansPerSecond(fast.engineAngularVelocity);
    assert.ok(kmh >= minimum && kmh <= maximum, `${vehicle.name}: ${kmh.toFixed(1)} km/h`);
    assert.ok(rpm <= cutoff, `${vehicle.name}: ${rpm.toFixed(1)} RPM`);
    const coupledEngineSpeed = fast.wheelAngularVelocity * ratio;
    assert.ok(Math.abs(fast.engineAngularVelocity - coupledEngineSpeed) < 1e-8, `${vehicle.name}: clutch slip at speed`);
    assert.ok(Math.abs(simulate(vehicle, input, 120, fast).vehicleSpeed - fast.vehicleSpeed) < 0.04, vehicle.name);
  }
});

test("removing an electronic road-speed limit still obeys the gearing and fuel cutoff", () => {
  const input = { ...running, throttle: 1, shiftMode: "AT", roadSpeedLimitDisabled: true };
  for (const [id, minimum, maximum] of [["kawasaki-h2", 307, 312], ["suzuki-hayabusa", 308, 313]]) {
    const vehicle = vehicles.find((bike) => bike.id === id);
    const state = simulate(vehicle, input, 9000);
    const rpm = rpmFromRadiansPerSecond(state.engineAngularVelocity);
    assert.ok(state.vehicleSpeed * 3.6 >= minimum && state.vehicleSpeed * 3.6 <= maximum, id);
    assert.ok(rpm < vehicle.physics.fuelCutRpm && state.gear === 6, id);
    const restored = simulate(vehicle, { ...input, roadSpeedLimitDisabled: false }, 9000, state);
    assert.ok(restored.vehicleSpeed * 3.6 <= vehicle.physics.speedLimitKmh, id);
  }
});

test("the Panigale V4 R continues making torque above 16,000 RPM only in sixth", () => {
  const vehicle = vehicles.find(({ id }) => id === "ducati-panigale-v4-r");
  const engineAngularVelocity = 16200 * Math.PI / 30;
  function atGear(gear) {
    const wheelAngularVelocity = engineAngularVelocity / getOverallRatio(vehicle, gear);
    return stepSimulation({
      ...createSimulationState(vehicle), ...running, gear, engineAngularVelocity, wheelAngularVelocity,
      vehicleSpeed: wheelAngularVelocity * vehicle.physics.rollingRadiusM,
    }, { ...running, throttle: 1 }, vehicle);
  }
  assert.equal(atGear(5).combustionTorqueNm, 0);
  assert.ok(atGear(6).combustionTorqueNm > 0);
  assert.equal(atGear(6).mechanicalOverRev, false);
});
