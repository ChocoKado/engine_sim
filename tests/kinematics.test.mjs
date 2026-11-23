import assert from "node:assert/strict";
import test from "node:test";
import { vehicles } from "../data/vehicles.ts";
import { getEnginePose } from "../lib/kinematics.ts";

for (const vehicle of vehicles) {
  test(`${vehicle.name}: piston stroke and rod length hold through a full cycle`, () => {
    const { strokeM, rodLengthM } = vehicle.geometry;
    const atTop = getEnginePose(vehicle, 0).cylinders[0];
    const atBottom = getEnginePose(vehicle, Math.PI).cylinders[0];
    assert.ok(Math.abs(atTop.pistonYM - atBottom.pistonYM - strokeM) < 1e-12);
    for (let step = 0; step < 24; step += 1) {
      const angle = step / 24 * 4 * Math.PI;
      const pose = getEnginePose(vehicle, angle);
      assert.ok(Math.abs(pose.camAngleRad - angle / 2) < 1e-12);
      for (const cylinder of pose.cylinders) {
        const distance = Math.hypot(cylinder.pistonYM - cylinder.crankPinYM, cylinder.crankPinZM);
        assert.ok(Math.abs(distance - rodLengthM) < 1e-12);
      }
    }
    assert.deepEqual(getEnginePose(vehicle, 4 * Math.PI), getEnginePose(vehicle, 0));
  });
}

test("720-degree cycle, cylinder offset and indicative valves use the firing phase", () => {
  const [r15, r3] = vehicles;
  assert.deepEqual([0, 1, 2, 3].map((turn) => getEnginePose(r15, turn * Math.PI).cylinders[0].stroke),
    ["power", "exhaust", "intake", "compression"]);
  const [first, second] = getEnginePose(r3, Math.PI).cylinders;
  assert.equal(first.stroke, "exhaust");
  assert.equal(second.stroke, "power");
  assert.equal(second.crankAngleRad, 0);
  assert.equal(second.intakeLiftM, 0);
  assert.ok(first.exhaustLiftM > 0);
  assert.ok(getEnginePose(r15, 2.5 * Math.PI).cylinders[0].intakeLiftM > 0);
  assert.equal(getEnginePose(r15, 2.5 * Math.PI, 9500).vvaMode, "unknown");
  assert.equal(getEnginePose(r3, 2.5 * Math.PI).vvaMode, null);
});
