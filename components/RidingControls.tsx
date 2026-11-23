"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import type { AudioStatus } from "../hooks/useEngineAudio";
import type { SimulationInput } from "../lib/simulation";

type Pedal = "brake" | "throttle";
type ShiftMode = SimulationInput["shiftMode"];

interface RidingControlsProps {
  engineOn: boolean;
  engineFailed: boolean;
  shiftMode: ShiftMode;
  onToggleEngine: () => void;
  onReset: () => void;
  audioStatus: AudioStatus;
  volume: number;
  onVolumeChange: (value: number) => void;
  onToggleAudio: () => void;
  onShift: (direction: -1 | 1) => void;
  onPedalChange: (pedal: Pedal, pressed: boolean) => void;
  resetKey: number;
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
        if (pointers.current.delete(event.pointerId) && isInsideButton(event)) onActivate();
      }}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}
      onClick={(event) => {
        // Pointer activation is handled above so a second finger does not need a synthetic click.
        if (event.detail === 0) onActivate();
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

function PedalButton({ pedal, label, onPedalChange }: Pick<RidingControlsProps, "onPedalChange"> & {
  pedal: Pedal;
  label: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Set<number>());
  const keys = useRef(new Set<string>());
  const [pressed, setPressed] = useState(false);

  function updatePressed() {
    const held = pointers.current.size > 0 || keys.current.size > 0;
    setPressed(held);
    onPedalChange(pedal, held);
  }

  useEffect(() => {
    const button = buttonRef.current;
    const activePointers = pointers.current;
    const activeKeys = keys.current;
    const orientation = window.matchMedia("(orientation: portrait)");

    function releaseInputs() {
      for (const pointerId of activePointers) {
        activePointers.delete(pointerId);
        if (button?.hasPointerCapture(pointerId)) {
          button.releasePointerCapture(pointerId);
        }
      }
      activeKeys.clear();
    }

    function reset() {
      releaseInputs();
      setPressed(false);
      onPedalChange(pedal, false);
    }

    function resetWhenHidden() {
      if (document.hidden) reset();
    }

    window.addEventListener("blur", reset);
    window.addEventListener("orientationchange", reset);
    orientation.addEventListener("change", reset);
    document.addEventListener("visibilitychange", resetWhenHidden);

    return () => {
      window.removeEventListener("blur", reset);
      window.removeEventListener("orientationchange", reset);
      orientation.removeEventListener("change", reset);
      document.removeEventListener("visibilitychange", resetWhenHidden);
      releaseInputs();
    };
  }, [onPedalChange, pedal]);

  function pressPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.add(event.pointerId);
    updatePressed();
  }

  function releasePointer(event: PointerEvent<HTMLButtonElement>) {
    const { currentTarget, pointerId } = event;
    if (!pointers.current.delete(pointerId)) return;

    if (currentTarget.hasPointerCapture(pointerId)) {
      currentTarget.releasePointerCapture(pointerId);
    }
    updatePressed();
  }

  function releaseOutside(event: PointerEvent<HTMLButtonElement>) {
    if (pointers.current.has(event.pointerId) && !isInsideButton(event)) {
      releasePointer(event);
    }
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;

    event.preventDefault();
    if (event.type === "keyup") {
      keys.current.delete(event.key);
    } else if (!event.repeat) {
      keys.current.add(event.key);
    }
    updatePressed();
  }

  return (
    <button
      type="button"
      className={`pedal-button ${pedal}-button`}
      aria-pressed={pressed}
      aria-describedby="pedal-instruction"
      onPointerDown={pressPointer}
      onPointerMove={releaseOutside}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onLostPointerCapture={releasePointer}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKey}
      onKeyUp={handleKey}
      onBlur={() => {
        keys.current.clear();
        updatePressed();
      }}
    >
      <span className="pedal-label">{label}</span>
      <span className="pedal-status" aria-hidden="true">{pressed ? "啟用" : "按住"}</span>
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
  engineOn, engineFailed, shiftMode, onToggleEngine, onReset, audioStatus, onToggleAudio,
  volume, onVolumeChange, onShift, onPedalChange, resetKey,
}: RidingControlsProps) {
  return (
    <section className="panel controls-panel" aria-labelledby="controls-title">
      <div className="control-heading">
        <div>
          <h2 id="controls-title">騎乘控制</h2>
          <p id="pedal-instruction">長按操作，放手回彈。</p>
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
            className={`engine-toggle${engineOn || engineFailed ? " engine-running" : ""}`}
            onActivate={engineFailed ? onReset : onToggleEngine}
          >
            {engineFailed ? "重設" : engineOn ? "熄火" : "啟動"}
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
    </section>
  );
}
