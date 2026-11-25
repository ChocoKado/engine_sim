"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import type { RecordingKind } from "../lib/recorded-engine";

const recordingLabels: Record<RecordingKind, string> = {
  idle: "怠速定轉", load: "帶負載定轉", start: "啟動", lift: "收油",
};

export function RecordingComparison({ vehicleId, idleRpm, recordedKind, onSelect, onLoad, onRemove }: {
  vehicleId: string;
  idleRpm: number;
  recordedKind: RecordingKind | null;
  onSelect: (preferred: boolean) => void;
  onLoad: (kind: RecordingKind, file: File, rpm?: number) => Promise<void>;
  onRemove: (kind: RecordingKind) => void;
}) {
  const [preferred, setPreferred] = useState(false);
  const [kind, setKind] = useState<RecordingKind>("idle");
  const [files, setFiles] = useState<Partial<Record<RecordingKind, {name: string; rpm?: number}>>>({});
  const [idleReference, setIdleReference] = useState(String(idleRpm));
  const [loadReference, setLoadReference] = useState("4000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const needsRpm = kind === "idle" || kind === "load";
  const rpm = Number(kind === "idle" ? idleReference : loadReference);
  const file = files[kind];

  function select(prefer: boolean) {
    setPreferred(prefer);
    onSelect(prefer);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!chosen) return;
    setError("");
    setLoading(true);
    try {
      const reference = needsRpm ? rpm : undefined;
      await onLoad(kind, chosen, reference);
      setFiles((current) => ({ ...current, [kind]: { name: chosen.name, rpm: reference } }));
      select(true);
    } catch (reason) {
      setError(reason instanceof Error && /^[\u3400-\u9fff]/u.test(reason.message)
        ? reason.message : "無法讀取這個音檔。請選擇可播放的 WAV、MP3 或 M4A。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="recording-comparison">
      <summary>聲源 A/B</summary>
      <p>匯入你有權使用的錄音。檔案留在目前分頁。</p>
      <div className="shift-mode" role="group" aria-label="比較聲源">
        <button type="button" className="mode-button" aria-pressed={!preferred} onClick={() => select(false)}>合成</button>
        <button type="button" className="mode-button" aria-pressed={preferred} onClick={() => select(true)}>實錄優先</button>
      </div>
      <p className="recording-status" role="status">
        {loading ? "載入錄音中" : recordedKind ? `實錄・${recordingLabels[recordedKind]}`
          : preferred ? "合成・目前工況無對應錄音" : "合成"}
      </p>
      <div className="recording-inputs">
        <label>
          錄音工況
          <select value={kind} disabled={loading} onChange={(event) => {
            setKind(event.currentTarget.value as RecordingKind);
            setError("");
          }}>
            {Object.entries(recordingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {needsRpm && <label>
          錄製轉速 RPM
          <input type="number" inputMode="numeric" min={300} max={25000}
            value={kind === "idle" ? idleReference : loadReference}
            onChange={(event) => (kind === "idle" ? setIdleReference : setLoadReference)(event.currentTarget.value)} />
        </label>}
      </div>
      <label className="recording-file">
        本機錄音
        <input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg"
          disabled={loading || (needsRpm && (!Number.isFinite(rpm) || rpm < 300 || rpm > 25000))}
          onChange={(event) => void importFile(event)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {file && (
        <div className="recording-file-row">
          <span>{file.name}{file.rpm !== undefined && `・${file.rpm} RPM`}</span>
          <button type="button" className="mode-button" disabled={loading} onClick={() => {
            onRemove(kind);
            setFiles((current) => ({ ...current, [kind]: undefined }));
          }}>移除</button>
        </div>
      )}
      {(vehicleId === "toyota-gr-supra" || vehicleId === "toyota-supra-a80") && (
        <div className="recording-reference">
          <p>Supra 測功機錄音節選・世代未知</p>
          <audio controls preload="none" src="/recordings/supra-dyno-496171.wav" aria-label="Supra 測功機參考錄音" />
          <a href="https://freesound.org/people/editboy23/sounds/496171/">editboy23・CC0</a>
        </div>
      )}
      {vehicleId === "mazda-rx7-spirit-r" && (
        <div className="recording-reference"><a href="https://www.autoexe.co.jp/?page_id=30712">RX-7 FD 聲浪參考</a></div>
      )}
      {vehicleId === "cadillac-v-series-r" && (
        <div className="recording-reference">
          <a href="https://www.24h-lemans.com/en/news/enjoy-a-lap-of-the-circuit-des-24-heures-du-mans-on-board-the-cadillac-v-series-r-57781">
            Cadillac V-Series.R 車載聲浪參考
          </a>
        </div>
      )}
      {(vehicleId === "kawasaki-h2" || vehicleId === "kawasaki-h2r") && (
        <div className="recording-reference"><a href="https://www.youtube.com/watch?v=9sTa7tngJZY">Kawasaki 機械增壓聲浪參考</a></div>
      )}
    </details>
  );
}
