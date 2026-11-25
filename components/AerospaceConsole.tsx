"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioStatus } from "../hooks/useEngineAudio";
import { aerospaceEngines } from "../data/aerospace";
import type { AerospaceCategory, AerospaceEngine, AerospaceKind } from "../data/aerospace";
import { advanceAerospace, aerospaceStageLabels, INITIAL_AEROSPACE_INPUT, INITIAL_AEROSPACE_STATE } from "../lib/aerospace";
import type { AerospaceInput, AerospaceState } from "../lib/aerospace";
import styles from "./AerospaceConsole.module.css";

const Scene = dynamic(() => import("./AerospaceScene").then((module) => module.AerospaceScene), {
  ssr: false,
  loading: () => <div className="engine-scene engine-scene-fallback" role="status">載入 3D 內構</div>,
});

interface BenchAudio {
  context: AudioContext;
  gain: GainNode;
  ready: Promise<AudioWorkletNode>;
  node?: AudioWorkletNode;
}

function fadeAudio({ gain, context }: BenchAudio, value: number) {
  gain.gain.cancelScheduledValues(context.currentTime);
  gain.gain.setTargetAtTime(value, context.currentTime, 0.04);
}

function useBenchAudio(kind: AerospaceKind, propellerBlades?: number) {
  const [status, setStatus] = useState<AudioStatus>("muted");
  const [volume, setVolume] = useState(65);
  const graph = useRef<BenchAudio | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    function pauseWhenHidden() {
      const audio = graph.current;
      if (!document.hidden || !audio || !requested.current) return;
      requested.current = false;
      fadeAudio(audio, 0);
      setStatus("paused");
    }
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      requested.current = false;
      const audio = graph.current;
      graph.current = null;
      if (!audio) return;
      audio.context.onstatechange = null;
      void audio.context.close().catch(() => {});
    };
  }, []);

  const send = useCallback((state: AerospaceState) => {
    const audio = graph.current;
    if (requested.current && audio?.node && audio.context.state === "running") audio.node.port.postMessage(state);
  }, []);

  function changeVolume(value: number) {
    setVolume(value);
    if (requested.current && graph.current?.node) fadeAudio(graph.current, value / 100);
  }

  async function toggle() {
    const previous = graph.current;
    if (requested.current) {
      requested.current = false;
      if (previous) fadeAudio(previous, 0);
      setStatus("muted");
      return;
    }
    requested.current = true;
    setStatus("starting");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!previous) {
        const context = new AudioContext({ latencyHint: "interactive" });
        if (!context.audioWorklet) {
          void context.close().catch(() => {});
          throw new Error("AudioWorklet unavailable");
        }
        const gain = context.createGain();
        gain.gain.value = 0;
        gain.connect(context.destination);
        const ready = context.audioWorklet.addModule("/aerospace-sound-processor.js").then(() => {
          const node = new AudioWorkletNode(context, "aerospace-sound", {
            numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { kind, propellerBlades },
          });
          node.connect(gain);
          return node;
        });
        const created = { context, gain, ready } as BenchAudio;
        context.onstatechange = () => {
          if (graph.current !== created || !created.node || !requested.current || context.state === "running") return;
          requested.current = false;
          fadeAudio(created, 0);
          setStatus("paused");
        };
        graph.current = created;
      }
      const audio = graph.current!;
      const ready = Promise.all([audio.ready, audio.context.resume()]);
      const expired = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Audio startup timed out")), 2500);
      });
      const [node] = await Promise.race([ready, expired]);
      if (audio !== graph.current || !requested.current) return;
      audio.node = node;
      node.onprocessorerror = () => {
        if (graph.current !== audio) return;
        requested.current = false;
        graph.current = null;
        void audio.context.close().catch(() => {});
        setStatus("unavailable");
      };
      fadeAudio(audio, volume / 100);
      setStatus("enabled");
    } catch {
      if (!requested.current) return;
      requested.current = false;
      const failed = graph.current;
      graph.current = null;
      if (failed) void failed.context.close().catch(() => {});
      setStatus("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  return { status, volume, changeVolume, toggle, send };
}

const audioLabel: Record<AudioStatus, string> = {
  muted: "啟用聲音", starting: "啟動聲音中", enabled: "靜音", paused: "恢復聲音", unavailable: "重試聲音",
};

function Bench({ engine }: { engine: AerospaceEngine }) {
  const [controls, setControls] = useState(INITIAL_AEROSPACE_INPUT);
  const input = useRef(controls);
  const liveState = useRef(INITIAL_AEROSPACE_STATE);
  const [state, setState] = useState(INITIAL_AEROSPACE_STATE);
  const [showScene, setShowScene] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const [sceneSpeed, setSceneSpeed] = useState(1);
  const propeller = engine.kind === "piston" || engine.kind === "turboprop";
  const { status, volume, changeVolume, toggle, send } = useBenchAudio(engine.kind, propeller ? engine.propellerBlades : undefined);
  const readState = useCallback(() => liveState.current, []);

  function change(next: Partial<AerospaceInput>) {
    input.current = { ...input.current, ...next };
    setControls(input.current);
  }

  useEffect(() => {
    let frame = 0;
    let previous: number | undefined;
    let carry = 0;
    let published = 0;
    function tick(now: number) {
      if (previous !== undefined) {
        const next = advanceAerospace(liveState.current, input.current, engine, (now - previous) / 1000, carry);
        carry = next.remainderSeconds;
        liveState.current = next.state;
        if (now - published >= 32) {
          published = now;
          send(next.state);
          setState(next.state);
        }
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    }
    function visibilityChanged() {
      cancelAnimationFrame(frame);
      previous = undefined;
      carry = 0;
      if (!document.hidden) frame = requestAnimationFrame(tick);
    }
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [engine, send]);

  const staged = engine.kind === "staged-rocket";
  const rocket = staged || engine.kind === "rocket";
  const outputLabel = propeller ? "軸功率" : "靜態推力";
  const outputUnit = propeller ? "kW" : "kN";
  const value = propeller ? state.powerKw : state.thrustKn;

  return <div className="console-layout">
    <section className="panel dashboard" aria-label="推進儀表">
      <div className="dashboard-heading">
        <h2>{engine.name}</h2>
        <button type="button" className="mode-button" aria-pressed={showScene} onClick={() => setShowScene(!showScene)}>3D 內構</button>
      </div>
      <div className={`readouts ${styles.instruments}`}>
        <div className="speed-readout">
          <span className="readout-label">{outputLabel}</span>
          <output className="readout-value" aria-label={outputLabel}>{value.toFixed(1)}</output>
          <span className="speed-unit">{outputUnit}</span>
        </div>
        {propeller ? (
          <div className={styles.spools}>
            <div className={styles.metric}><span className="readout-label">螺旋槳轉速</span><output aria-label="螺旋槳轉速">{Math.round(state.shaftRpm)} RPM</output></div>
            {engine.kind === "turboprop" && <div className={styles.metric}><span className="readout-label">氣體產生器</span><output aria-label="氣體產生器">{Math.round(state.secondary * 100)}%</output></div>}
          </div>
        ) : rocket ? (
          <div className={styles.metric}><span className="readout-label">{staged ? "分級狀態" : "推力基準"}</span><output>
            {staged ? aerospaceStageLabels[state.stage] : state.vacuum ? "真空" : "海平面"}
          </output></div>
        ) : (
          <div className={styles.spools}>
            <div className={styles.metric}><span className="readout-label">低壓軸 N1</span><output aria-label="N1">{(state.primary * 100).toFixed(0)}%</output></div>
            <div className={styles.metric}><span className="readout-label">高壓軸 N2</span><output aria-label="N2">{(state.secondary * 100).toFixed(0)}%</output></div>
          </div>
        )}
        <progress aria-label={`${outputLabel}比例`} className={styles.progress} max={1} value={state.outputLevel} />
      </div>
      {showScene && <>
        <Scene engine={engine} readState={readState} cutaway={cutaway} speed={sceneSpeed} />
        <div className={styles.sceneTools}>
          <button type="button" className="mode-button" aria-pressed={cutaway} onClick={() => setCutaway(!cutaway)}>剖面</button>
          <label>動畫速度
            <select value={sceneSpeed} onChange={(event) => setSceneSpeed(Number(event.currentTarget.value))}>
              <option value={1}>1×</option>
              <option value={0.2}>1/5×</option>
              <option value={0.05}>1/20×</option>
              <option value={0}>暫停</option>
            </select>
          </label>
        </div>
      </>}
      <p className="dashboard-note">
        {staged ? "縮時分級示意，機身比例近似。一級先點火，關機分離後，由二級引擎接續推進。"
          : "定點台架近似，聲浪與內構為合成示意。"}
        {rocket && state.vacuum && " 真空模式不播放外部聲音。"}
      </p>
    </section>

    <section className="panel controls-panel" aria-labelledby="bench-control-title">
      <div className="control-heading">
        <h2 id="bench-control-title">推進控制</h2>
        <div className="control-actions">
          <button type="button" className="audio-toggle" disabled={status === "starting"} onClick={() => void toggle()}>{audioLabel[status]}</button>
          <button type="button" className={`engine-toggle${controls.enabled ? " engine-running" : ""}`} onClick={() => change({ enabled: !controls.enabled })}>
            {controls.enabled ? "停止" : staged ? "啟動分級" : "啟動"}
          </button>
        </div>
      </div>
      {!staged && <label className={styles.command}>
        <span>{rocket ? "推力指令" : "油門指令"}</span><span>{Math.round(controls.command * 100)}%</span>
        <input type="range" min={0} max={100} className="volume-slider" aria-label={rocket ? "推力指令" : "油門指令"}
          value={Math.round(controls.command * 100)} onChange={(event) => change({ command: Number(event.currentTarget.value) / 100 })} />
      </label>}
      {propeller && <div className={styles.profile} role="group" aria-label="螺旋槳負載">
        <button type="button" className="mode-button" aria-pressed={!controls.heavyPropLoad} onClick={() => change({ heavyPropLoad: false })}>參考負載</button>
        <button type="button" className="mode-button" aria-pressed={controls.heavyPropLoad} onClick={() => change({ heavyPropLoad: true })}>較重負載</button>
      </div>}
      {engine.kind === "rocket" && engine.seaLevelThrustKn !== null && <div className={styles.profile} role="group" aria-label="推力環境">
        <button type="button" className="mode-button" aria-pressed={!controls.vacuum} onClick={() => change({ vacuum: false })}>海平面</button>
        <button type="button" className="mode-button" aria-pressed={controls.vacuum} onClick={() => change({ vacuum: true })}>真空</button>
      </div>}
      <label className="volume-controls">
        音量<input type="range" min={0} max={100} className="volume-slider" aria-label="音量" value={volume} onChange={(event) => changeVolume(Number(event.currentTarget.value))} />
        <span className="volume-value">{volume}%</span>
      </label>
    </section>
  </div>;
}

export function AerospaceConsole({ category }: { category: AerospaceCategory }) {
  const available = aerospaceEngines.filter((engine) => (category === "space") === (engine.kind === "rocket" || engine.kind === "staged-rocket"));
  const [selection, setSelection] = useState<string>(available[0].id);
  const engine = available.find((option) => option.id === selection) ?? available[0];

  return <>
    <section className="vehicle-section" aria-labelledby="aerospace-title">
      <div className="section-heading">
        <div className="vehicle-heading"><h2 id="aerospace-title">選擇引擎</h2><small>{engine.reference}</small></div>
        <a href={engine.source}>規格來源</a>
      </div>
      <div className={styles.options} role="radiogroup" aria-labelledby="aerospace-title">
        {available.map((option) => <label className="vehicle-option" key={option.id}>
          <input type="radio" name="aerospace-engine" value={option.id} checked={engine.id === option.id} onChange={() => setSelection(option.id)} />
          <span className="vehicle-card"><strong>{option.name}</strong><span className={styles.detail}>{option.detail}</span><span className="radio-indicator" aria-hidden="true" /></span>
        </label>)}
      </div>
    </section>
    <Bench key={engine.id} engine={engine} />
  </>;
}
