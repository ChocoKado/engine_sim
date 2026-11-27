"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import type { TuningProfile } from "../data/tuning";
import type { AudioStatus } from "../hooks/useEngineAudio";
import type { SimulationInput } from "../lib/simulation";

type Pedal = "brake" | "throttle";
type ShiftMode = SimulationInput["shiftMode"];

interface RidingControlsProps {
  title: string;
  powerOn: boolean;
  pitControls: boolean;
  engineFailed: boolean;
  shiftMode: ShiftMode;
  onToggleEngine: () => void;
  onReset: () => void;
  audioStatus: AudioStatus;
  volume: number;
  onVolumeChange: (value: number) => void;
  tuning: TuningProfile;
  onTuningChange: (tuning: TuningProfile) => void;
  availableTunings: readonly TuningProfile[];
  canToggleRotaryPort?: boolean;
  rotaryPortEnabled?: boolean;
  onToggleRotaryPort?: () => void;
  canToggleTurboFlutter?: boolean;
  turboFlutterEnabled?: boolean;
  onToggleTurboFlutter?: () => void;
  onToggleAudio: () => void;
  onShift: (direction: -1 | 1) => void;
  onPedalChange: (pedal: Pedal, opening: number) => void;
  resetKey: number;
  recordingComparison?: ReactNode;
}

function isInteractiveInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
  return target.classList.contains("engine-canvas") || target.isContentEditable;
}

function isInsideButton({ clientX, clientY, currentTarget }: PointerEvent<HTMLButtonElement>) {
  const { left, top, right, bottom } = currentTarget.getBoundingClientRect();
  return clientX >= left && clientX < right && clientY >= top && clientY < bottom;
}

function PointerActionButton({ className, onActivate, disabled, pressed, children }: {
  className: string;
  onActivate: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  const pointers = useRef(new Set<number>());
  const lastPointerUp = useRef(-Infinity);

  function cancelPointer({ pointerId }: PointerEvent<HTMLButtonElement>) {
    pointers.current.delete(pointerId);
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-pressed={pressed}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.add(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (pointers.current.delete(event.pointerId) && isInsideButton(event)) {
          lastPointerUp.current = performance.now();
          onActivate();
        }
      }}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}
      onClick={() => {
        // Ignore synthetic clicks following pointer activation while preserving keyboard/assistive clicks.
        if (performance.now() - lastPointerUp.current < 350) return;
        onActivate();
      }}
    >
      {children}
    </button>
  );
}

function ShiftButton({ direction, onShift, disabled }: Pick<RidingControlsProps, "onShift"> & {
  direction: -1 | 1;
  disabled: boolean;
}) {
  const isDownshift = direction === -1;

  return (
    <PointerActionButton className="shift-button" disabled={disabled} onActivate={() => onShift(direction)}>
      <span className="shift-symbol" aria-hidden="true">{isDownshift ? "−" : "+"}</span>
      <span className="shift-label">{isDownshift ? "降檔" : "升檔"}</span>
    </PointerActionButton>
  );
}

function pedalPercent({ clientY, currentTarget }: PointerEvent<HTMLButtonElement>) {
  const { top, height } = currentTarget.getBoundingClientRect();
  // Leave room at the top to reach 100% comfortably with a thumb and eliminate the bottom dead zone inside the pad.
  const position = (clientY - top) / Math.max(1, height);
  const opening = Math.min(1, Math.max(0, (1.0 - position) / 0.90));
  return Math.round(opening * 100);
}

function PedalButton({ pedal, label, onPedalChange }: Pick<RidingControlsProps, "onPedalChange"> & {
  pedal: Pedal;
  label: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, number>());
  const keys = useRef(new Set<string>());
  const [opening, setOpening] = useState(0);

  function updateOpening() {
    const percent = keys.current.size > 0 ? 100 : Math.max(0, ...pointers.current.values());
    setOpening(percent);
    onPedalChange(pedal, percent / 100);
  }

  useEffect(() => {
    const button = buttonRef.current;
    const activePointers = pointers.current;
    const activeKeys = keys.current;
    const orientation = window.matchMedia("(orientation: portrait)");

    function releaseInputs() {
      for (const pointerId of activePointers.keys()) {
        activePointers.delete(pointerId);
        if (button?.hasPointerCapture(pointerId)) {
          button.releasePointerCapture(pointerId);
        }
      }
      activeKeys.clear();
    }

    function reset() {
      releaseInputs();
      setOpening(0);
      onPedalChange(pedal, 0);
    }

    function resetWhenHidden() {
      if (document.hidden) reset();
    }

    function matchesGlobalPedalKey(key: string): boolean {
      const lower = key.toLowerCase();
      return pedal === "throttle" ? (lower === "w" || key === "ArrowUp") : (lower === "s" || key === "ArrowDown");
    }

    function onWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isInteractiveInputTarget(event.target)) return;
      if (!matchesGlobalPedalKey(event.key)) return;
      event.preventDefault();
      if (event.repeat) return;
      activeKeys.add(`global:${event.key.toLowerCase()}`);
      const percent = 100;
      setOpening(percent);
      onPedalChange(pedal, 1);
    }

    function onWindowKeyUp(event: globalThis.KeyboardEvent) {
      if (!matchesGlobalPedalKey(event.key)) return;
      if (!activeKeys.delete(`global:${event.key.toLowerCase()}`)) return;
      const percent = activeKeys.size > 0 ? 100 : Math.max(0, ...activePointers.values());
      setOpening(percent);
      onPedalChange(pedal, percent / 100);
    }

    window.addEventListener("blur", reset);
    window.addEventListener("orientationchange", reset);
    orientation.addEventListener("change", reset);
    document.addEventListener("visibilitychange", resetWhenHidden);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);

    return () => {
      window.removeEventListener("blur", reset);
      window.removeEventListener("orientationchange", reset);
      orientation.removeEventListener("change", reset);
      document.removeEventListener("visibilitychange", resetWhenHidden);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      releaseInputs();
      onPedalChange(pedal, 0);
    };
  }, [onPedalChange, pedal]);

  function pressPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    if (event.pointerType === "touch") event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, pedalPercent(event));
    updateOpening();
  }

  function releasePointer(event: PointerEvent<HTMLButtonElement>) {
    const { currentTarget, pointerId } = event;
    if (!pointers.current.delete(pointerId)) return;

    if (currentTarget.hasPointerCapture(pointerId)) {
      currentTarget.releasePointerCapture(pointerId);
    }
    updateOpening();
  }

  function dragPointer(event: PointerEvent<HTMLButtonElement>) {
    const { pointerId } = event;
    const previous = pointers.current.get(pointerId);
    if (previous === undefined) return;
    const next = pedalPercent(event);
    if (next === previous) return;
    pointers.current.set(pointerId, next);
    updateOpening();
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;

    event.preventDefault();
    if (event.type === "keyup") {
      keys.current.delete(event.key);
    } else if (!event.repeat) {
      keys.current.add(event.key);
    }
    updateOpening();
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`pedal-button ${pedal}-button`}
      style={{ "--pedal-opening": `${opening}%` } as CSSProperties}
      aria-pressed={opening > 0}
      aria-label={label}
      aria-describedby={`pedal-instruction ${pedal}-opening`}
      onPointerDown={pressPointer}
      onPointerMove={dragPointer}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onLostPointerCapture={releasePointer}
      onKeyDown={handleKey}
      onKeyUp={handleKey}
      onBlur={() => {
        keys.current.clear();
        updateOpening();
      }}
    >
      <span className="pedal-label">{label}</span>
      <span className="pedal-status" id={`${pedal}-opening`}>{opening}%</span>
    </button>
  );
}

export function ShiftModeControls({ mode, onModeChange }: {
  mode: ShiftMode;
  onModeChange: (mode: ShiftMode) => void;
}) {
  return (
    <div className="shift-mode" role="group" aria-label="換檔模式">
      <PointerActionButton className="mode-button" pressed={mode === "MT"} onActivate={() => onModeChange("MT")}>
        MT 手動
      </PointerActionButton>
      <PointerActionButton className="mode-button" pressed={mode === "AT"} onActivate={() => onModeChange("AT")}>
        AT 虛擬
      </PointerActionButton>
    </div>
  );
}

const audioLabels: Record<AudioStatus, string> = {
  muted: "啟用聲音",
  starting: "啟動聲音中",
  enabled: "靜音",
  paused: "恢復聲音",
  unavailable: "重試聲音",
};

export function RidingControls({
  title, powerOn, pitControls, engineFailed, shiftMode, onToggleEngine, onReset, audioStatus, onToggleAudio,
  volume, onVolumeChange, tuning, onTuningChange, availableTunings,
  canToggleRotaryPort = false, rotaryPortEnabled = false, onToggleRotaryPort,
  canToggleTurboFlutter = false, turboFlutterEnabled = false, onToggleTurboFlutter,
  onShift, onPedalChange, resetKey, recordingComparison,
}: RidingControlsProps) {
  useEffect(() => {
    function onWindowShiftKey(event: globalThis.KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || shiftMode === "AT") return;
      if (isInteractiveInputTarget(event.target)) return;
      const lower = event.key.toLowerCase();
      if (lower === "e" || event.key === "]") {
        event.preventDefault();
        onShift(1);
      } else if (lower === "q" || event.key === "[") {
        event.preventDefault();
        onShift(-1);
      }
    }
    window.addEventListener("keydown", onWindowShiftKey);
    return () => window.removeEventListener("keydown", onWindowShiftKey);
  }, [onShift, shiftMode]);

  return (
    <section className="panel controls-panel" aria-labelledby="controls-title">
      <div className="control-heading">
        <div>
          <h2 id="controls-title">{title}</h2>
          <p id="pedal-instruction">上滑加大，放手歸零；鍵盤支援 W/↑ 油門、S/↓ 煞車、Q/E 換檔。</p>
        </div>
        <div className="control-actions">
          <button
            type="button"
            className="audio-toggle"
            disabled={audioStatus === "starting"}
            onClick={onToggleAudio}
          >
            {audioLabels[audioStatus]}
          </button>
          <PointerActionButton
            className={`engine-toggle${powerOn || engineFailed ? " engine-running" : ""}`}
            onActivate={engineFailed ? onReset : onToggleEngine}
          >
            {engineFailed ? "重設" : powerOn ? (pitControls ? "關閉動力" : "熄火") : pitControls ? "出站待命" : "啟動"}
          </PointerActionButton>
        </div>
      </div>
      <div key={resetKey} className="control-grid">
        <div className="shifter-controls">
          <ShiftButton direction={-1} onShift={onShift} disabled={shiftMode === "AT"} />
          <ShiftButton direction={1} onShift={onShift} disabled={shiftMode === "AT"} />
        </div>
        <div className="pedal-controls">
          <PedalButton pedal="brake" label="煞車" onPedalChange={onPedalChange} />
          <PedalButton pedal="throttle" label="油門" onPedalChange={onPedalChange} />
        </div>
      </div>
      <div className="volume-controls">
        <label className="volume-label" htmlFor="engine-volume">音量</label>
        <input
          className="volume-slider"
          id="engine-volume"
          type="range"
          min={0}
          max={100}
          value={volume}
          aria-valuetext={`${volume}%`}
          onChange={(event) => onVolumeChange(event.currentTarget.valueAsNumber)}
        />
        <span className="volume-value" aria-hidden="true">{volume}%</span>
      </div>
      <div className="tuning-controls">
        <label htmlFor="engine-voicing">合成音色</label>
        <div className="tuning-select-wrap">
          <select
            className="tuning-select"
            id="engine-voicing"
            value={tuning.id}
            onChange={(event) => {
              const next = availableTunings.find((profile) => profile.id === event.currentTarget.value);
              if (next) onTuningChange(next);
            }}
          >
            {availableTunings.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label} · {profile.version}</option>
            ))}
          </select>
        </div>
      </div>
      {(canToggleRotaryPort || canToggleTurboFlutter) && (
        <div className="mod-effect-toggles" role="group" aria-label="改裝聲浪特效（可複選）">
          <span className="mod-effect-label">改裝特效</span>
          {canToggleRotaryPort && onToggleRotaryPort && (
            <button
              type="button"
              className="mode-button"
              aria-pressed={rotaryPortEnabled}
              onClick={onToggleRotaryPort}
            >
              轉子・橋式汽口 (Brap)
            </button>
          )}
          {canToggleTurboFlutter && onToggleTurboFlutter && (
            <button
              type="button"
              className="mode-button"
              aria-pressed={turboFlutterEnabled}
              onClick={onToggleTurboFlutter}
            >
              進氣・渦輪顫振 (Stu-tu-tu)
            </button>
          )}
        </div>
      )}
      {recordingComparison}
    </section>
  );
}
