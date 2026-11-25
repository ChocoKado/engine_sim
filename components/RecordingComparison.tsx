"use client";

import { calibrationProfiles, extraAudioReferences } from "../data/calibration-profiles";
import type { ReplayStatus } from "../hooks/useSimulation";
import { formatTelemetryCsv, formatTelemetryJson } from "../lib/telemetry-recorder";
import type { TelemetryRun } from "../lib/telemetry-recorder";

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RecordingComparison({
  vehicleId, replayStatus, recordedRun, onToggleRunRecording, onToggleRunReplay,
}: {
  vehicleId: string;
  replayStatus: ReplayStatus;
  recordedRun: TelemetryRun | null;
  onToggleRunRecording: () => void;
  onToggleRunReplay: () => void;
}) {
  const profile = calibrationProfiles[vehicleId];
  const extraRef = extraAudioReferences[vehicleId];

  return (
    <details className="recording-comparison">
      <summary>操作重播・量測與原聲參考</summary>
      <p>可錄製一段油門、煞車與換檔軌跡，切換不同排氣／進氣音色做同軌重播比較，或匯出 120 Hz 物理紀錄。</p>
      <div className="replay-controls" role="group" aria-label="操作軌跡錄製與重播">
        <button
          type="button"
          className="mode-button"
          aria-pressed={replayStatus === "recording"}
          disabled={replayStatus === "replaying"}
          onClick={onToggleRunRecording}
        >
          {replayStatus === "recording" ? "停止錄製" : "錄製操作"}
        </button>
        <button
          type="button"
          className="mode-button"
          aria-pressed={replayStatus === "replaying"}
          disabled={!recordedRun && replayStatus !== "replaying"}
          onClick={onToggleRunReplay}
        >
          {replayStatus === "replaying" ? "停止重播" : "同軌重播"}
        </button>
        {recordedRun && (
          <>
            <button
              type="button"
              className="mode-button"
              onClick={() => downloadBlob(`${recordedRun.vehicleId}-telemetry.csv`, formatTelemetryCsv(recordedRun), "text/csv;charset=utf-8")}
            >
              匯出 CSV
            </button>
            <button
              type="button"
              className="mode-button"
              onClick={() => downloadBlob(`${recordedRun.vehicleId}-telemetry.json`, formatTelemetryJson(recordedRun), "application/json")}
            >
              匯出 JSON
            </button>
          </>
        )}
      </div>
      <p className="recording-status" role="status">
        {replayStatus === "recording" ? "正在記錄 120 Hz 油門、煞車與換檔軌跡（上限 60 秒）…"
          : replayStatus === "replaying" ? `重播中・${recordedRun?.durationSeconds.toFixed(1)} 秒同軌比較`
          : recordedRun ? `已保存 ${recordedRun.durationSeconds.toFixed(1)} 秒軌跡（${recordedRun.samples.length} 筆樣本）`
          : "尚未錄製操作軌跡"}
      </p>
      {profile && (
        <div className="recording-reference">
          <p>{profile.speedEvidence}</p>
          <p>{profile.acousticStatus}</p>
          {profile.bundledSampleSrc && (
            <>
              <p>{profile.bundledSampleNote}</p>
              <audio controls preload="none" src={profile.bundledSampleSrc} aria-label="Supra 測功機參考錄音" />
            </>
          )}
          {profile.referenceUrl && profile.referenceLabel && (
            <a href={profile.referenceUrl} target="_blank" rel="noopener noreferrer">{profile.referenceLabel}</a>
          )}
        </div>
      )}
      {!profile && extraRef && (
        <div className="recording-reference">
          <a href={extraRef.url} target="_blank" rel="noopener noreferrer">{extraRef.label}</a>
        </div>
      )}
    </details>
  );
}
