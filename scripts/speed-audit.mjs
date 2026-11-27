import { vehicles } from "../data/vehicles.ts";
import { cars } from "../data/cars.ts";
import { formulaOneCars } from "../data/formula-one.ts";
import { enduranceCars } from "../data/endurance-cars.ts";
import { createSimulationState, INITIAL_SIMULATION_INPUT, rpmFromRadiansPerSecond, stepSimulation } from "../lib/simulation.ts";

const wecTiming = "https://fiawec.alkamelsystems.com/Results/14_2025/04_LE%20MANS/600_FIA%20WEC/202506141600_Race/24_Hour%2024/15_EventMaxiumSpeed_Race_Hour%2024.PDF";
const evidence = {
  "yamaha-r3": [181, "cross-market test", "MotoStatz road version", "https://motostatz.com/yamaha-yzf-r3-acceleration/"],
  "yamaha-r6": [260, "cross-version test", "road R6, not the RACE preset", "https://motostatz.com/yamaha-yzf-r6-acceleration/"],
  "kawasaki-zx25r": [176, "cross-version GPS", "2020 Japan, not the 2025 model", "https://young-machine.com/2020/10/23/135876/"],
  "kawasaki-zx10r": [298, "same-market GPS", "2026 Europe", "https://www.crazywheels.it/27680-kawasaki-zx10r-2026-top-speed-acceleration-braking-test/amp"],
  "suzuki-hayabusa": [298, "cross-generation test", "second-generation test", "https://www.motorradonline.de/tourer/vergleichstest-sport-gegen-speedbikes-die-schnellsten-motorraeder-im-test/"],
  "bmw-s1000rr": [303, "manufacturer claim", "2025 EU technical data", "https://www.press.bmwgroup.com/switzerland/article/attachment/T0446040DE/624096"],
  "bmw-m1000rr": [314, "manufacturer claim", "2025 EU technical data", "https://www.press.bmwgroup.com/switzerland/article/attachment/T0446040DE/624096"],
  "ducati-panigale-v4-r": [318.4, "manufacturer claim", "road configuration", "https://www.ducati.com/gb/en/bikes/panigale/panigale-v4-r/insights"],
  "toyota-gr-supra": [249, "manufacturer governor", "North America 3.0 6MT 155 mph limit", "https://www.toyota.com/content/dam/toyota/brochures/pdf/2025/grsupra_ebrochure.pdf"],
  "ford-mustang-gt": [249, "same-generation test", "2024 6MT at 155 mph governor", "https://www.caranddriver.com/reviews/a44892132/2024-ford-mustang-gt-test/"],
  "porsche-911-gt3-992": [313, "manufacturer claim", "992.2 6MT claimed maximum", "https://pnr-prd2-pub2.newsroom.porsche.com/dam/jcr%3A46cb0e24-ad5a-489c-a404-52c678071d03/pag-911-gt3-mt-en.pdf"],
  "lexus-lfa": [325, "manufacturer claim", "factory rated maximum speed", "https://www.toyota.co.jp/jpn/company/history/75years/vehicle_lineage/car/id60016301/"],
  "porsche-carrera-gt": [330, "manufacturer claim", "factory rated maximum speed", "https://newsroom.porsche.com/en/2020/history/porsche-carrera-gt-20-years-anniversary-paris-22455.html"],
  "nissan-gtr-r35": [315, "manufacturer claim", "R35 570 PS European press specification", "https://global.nissannews.com/en/releases/2017-nissan-gt-r-makes-world-debut-at-new-york-international-auto-show"],
  "red-bull-rb19": [354.3, "F1 event speed trap", "2023 Monza race, Sergio Perez",
    "https://www.fia.com/events/fia-formula-one-world-championship/season-2023/italian-grand-prix/race-classification"],
  "cadillac-v-series-r": [343.4, "WEC event speed trap", "2025 Le Mans race car #12", wecTiming],
  "porsche-963": [344.5, "WEC event speed trap", "2025 Le Mans FP1 car #5", wecTiming],
  "bmw-m-hybrid-v8": [343.4, "WEC event speed trap", "2025 Le Mans FP2 car #15", wecTiming],
  "ferrari-499p": [349, "WEC event speed trap", "2025 Le Mans race car #50", wecTiming],
  "toyota-gr010-hybrid": [343.4, "WEC event speed trap", "2025 Le Mans FP2 car #8", wecTiming],
  "aston-martin-valkyrie-lmh": [342.3, "WEC event speed trap", "2025 Le Mans race car #007", wecTiming],
};

function simulate(vehicle, unlimited) {
  let state = createSimulationState(vehicle);
  const input = { ...INITIAL_SIMULATION_INPUT, engineOn: true, shiftMode: "AT", throttle: 1,
    roadSpeedLimitDisabled: unlimited };
  let peakKmh = 0;
  for (let tick = 0; tick < 75 * 120; tick += 1) {
    state = stepSimulation(state, input, vehicle);
    peakKmh = Math.max(peakKmh, state.vehicleSpeed * 3.6);
  }
  return { peakKmh, finalKmh: state.vehicleSpeed * 3.6, gear: state.gear, rpm: rpmFromRadiansPerSecond(state.engineAngularVelocity) };
}

function csvRow(fields) {
  return fields.map((field) => {
    const value = String(field);
    return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }).join(",");
}

console.log("id,kind,brand,model,version,modeled_limiter_kmh,sim_75s_peak_kmh,sim_75s_end_kmh,sim_end_gear,sim_end_rpm,sim_unlimited_75s_end_kmh,reference_kmh,evidence_type,reference_context,reference_url,preset_source");
for (const vehicle of [...vehicles, ...cars, ...formulaOneCars, ...enduranceCars]) {
  const limited = simulate(vehicle, false);
  const limiter = vehicle.physics.speedLimitKmh;
  const unlimited = limiter === undefined ? "" : simulate(vehicle, true).finalKmh.toFixed(1);
  const reference = evidence[vehicle.id] ?? ["unknown", "unknown", "", ""];
  console.log(csvRow([
    vehicle.id, vehicle.kind ?? "motorcycle", vehicle.brand, vehicle.name, vehicle.version,
    limiter ?? "unknown", limited.peakKmh.toFixed(1), limited.finalKmh.toFixed(1), limited.gear, Math.round(limited.rpm),
    unlimited, ...reference, vehicle.source,
  ]));
}
