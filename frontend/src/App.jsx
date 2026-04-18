import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/stream';

// ─── Helper ──────────────────────────────────────────────────────────────────
const EXERCISE_DESCRIPTIONS = {
  KFE: 'Knee Flexion Extension',
  HAA: 'Hip Abduction & Adduction',
  SQT: 'Squat',
  EAH: 'Elbow Assisted Hip',
  EFE: 'Elbow Flexion Extension',
  SQZ: 'Squeeze Exercise',
  GAT: 'Gait Training',
  GIS: 'Gait - Incline/Stairs',
  GHT: 'Gait - High Terrain',
};

// ─── Icons (inline SVGs to avoid Lucide peer issues) ─────────────────────────
const Icon = {
  Activity: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Wifi: ({ on }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      {on
        ? <><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></>
        : <><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.56 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></>}
    </svg>
  ),
  Zap: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  BarChart: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
};

// ─── Circular Progress Gauge ───────────────────────────────────────────────────
function Gauge({ value, size = 140, label, colorClass }) {
  const r = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - value);
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={value > 0.6 ? '#10b981' : value > 0.35 ? '#f59e0b' : '#ef4444'}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={fill}
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease' }}
        />
      </svg>
      <div className="flex flex-col items-center -mt-[80px] mb-[60px]">
        <span className={`text-3xl font-extrabold ${colorClass}`}>{Math.round(value * 100)}%</span>
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
}

// ─── Mini Waveform ─────────────────────────────────────────────────────────────
function Waveform({ data }) {
  const max = Math.max(...data.map(Math.abs), 1);
  const h = 48;
  const w = 280;
  const step = w / data.length;
  const mid = h / 2;
  const pts = data.map((v, i) => `${i * step},${mid - (v / max) * (mid - 4)}`).join(' ');
  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ─── Phase Badge ───────────────────────────────────────────────────────────────
function PhaseBadge({ phase }) {
  const config = {
    idle:             { label: 'Idle',             bg: 'bg-slate-700/60',     text: 'text-slate-400' },
    buffering:        { label: 'Collecting Data…', bg: 'bg-blue-500/20',      text: 'text-blue-400'  },
    exercise_detected:{ label: 'Exercise Found!',  bg: 'bg-violet-500/20',    text: 'text-violet-400'},
    complete:         { label: 'Analysis Done',    bg: 'bg-emerald-500/20',   text: 'text-emerald-400'},
    error:            { label: 'Error',            bg: 'bg-rose-500/20',      text: 'text-rose-400'  },
  };
  const c = config[phase] || config.idle;
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [exercise, setExercise] = useState(null);  // { code, name, confidence }
  const [correctness, setCorrectness] = useState(null);  // { score, is_correct }
  const [history, setHistory] = useState([]);
  const [waveData, setWaveData] = useState(Array(60).fill(0));
  const [sessionStats, setSessionStats] = useState({ total: 0, correct: 0, incorrect: 0, avg: 0 });
  const [streamingActive, setStreamingActive] = useState(false);

  const wsRef = useRef(null);
  const intervalRef = useRef(null);
  const waveBufferRef = useRef([]);

  // ── WebSocket Connect / Disconnect ────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setPhase('idle');
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.phase === 'buffering') {
        setPhase('buffering');
        setProgress(msg.progress);
      }

      if (msg.phase === 'exercise_detected') {
        setPhase('exercise_detected');
        setExercise({
          code: msg.exercise_code,
          name: msg.exercise_name,
          confidence: msg.exercise_confidence,
        });
        setCorrectness(null); // reset while waiting for full result
      }

      if (msg.phase === 'complete') {
        setPhase('complete');
        setExercise({
          code: msg.exercise_code,
          name: msg.exercise_name,
          confidence: msg.exercise_confidence,
        });
        setCorrectness({
          score: msg.correctness_score,
          is_correct: msg.is_correct,
        });
        setHistory(prev => [{
          exercise: msg.exercise_code,
          name: msg.exercise_name,
          score: msg.correctness_score,
          is_correct: msg.is_correct,
          time: new Date().toLocaleTimeString(),
        }, ...prev.slice(0, 9)]);
        setSessionStats(prev => {
          const total = prev.total + 1;
          const correct = prev.correct + (msg.is_correct ? 1 : 0);
          const incorrect = prev.incorrect + (msg.is_correct ? 0 : 1);
          const avg = ((prev.avg * prev.total) + msg.correctness_score) / total;
          return { total, correct, incorrect, avg };
        });
      }

      if (msg.phase === 'reset') {
        setPhase('idle');
        setExercise(null);
        setCorrectness(null);
        setProgress(0);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setPhase('idle');
      setStreamingActive(false);
    };

    ws.onerror = () => ws.close();
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    stopStreaming();
  }, []);

  // ── Simulated Sensor Streaming ────────────────────────────────────────────
  const startStreaming = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setStreamingActive(true);
    let t = 0;
    intervalRef.current = setInterval(() => {
      t += 0.15;
      // Simulated sinusoidal sensor values (realistic-ish IMU noise)
      const reading = {
        gx: Math.sin(t) * 3 + (Math.random() - 0.5) * 0.5,
        gy: Math.cos(t * 0.7) * 2 + (Math.random() - 0.5) * 0.4,
        gz: Math.sin(t * 1.3) * 1.5 + (Math.random() - 0.5) * 0.3,
        ax: Math.sin(t * 0.5) * 0.5 + 0.98,
        ay: Math.cos(t * 0.3) * 0.2,
        az: Math.sin(t * 0.8) * 0.15,
        mx: 23 + Math.sin(t) * 2,
        my: -4.5 + Math.cos(t) * 1,
        mz: 12 + Math.sin(t * 0.5) * 3,
      };
      wsRef.current.send(JSON.stringify(reading));

      // Update waveform
      waveBufferRef.current = [...waveBufferRef.current, reading.ax].slice(-60);
      setWaveData([...waveBufferRef.current]);
    }, 50); // 20 Hz
  }, []);

  const stopStreaming = useCallback(() => {
    clearInterval(intervalRef.current);
    setStreamingActive(false);
  }, []);

  const resetSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reset' }));
    }
    setHistory([]);
    setSessionStats({ total: 0, correct: 0, incorrect: 0, avg: 0 });
    setExercise(null);
    setCorrectness(null);
    setProgress(0);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  const correctnessColor = correctness
    ? correctness.is_correct ? 'text-emerald-400' : 'text-rose-400'
    : 'text-slate-500';

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      {/* Background Glow */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle at 15% 25%, rgba(99,102,241,0.12) 0%, transparent 50%), radial-gradient(circle at 85% 75%, rgba(16,185,129,0.07) 0%, transparent 50%)'
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 36, fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>
              AI <span style={{ color: '#6366f1' }}>Rehab</span> Monitor
            </h1>
            <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 14, fontWeight: 500 }}>
              Real-time LSTM exercise analysis via WebSocket stream
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Connection Status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              background: 'rgba(30,41,59,0.8)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: connected ? '#10b981' : '#ef4444',
                boxShadow: connected ? '0 0 10px #10b981' : 'none',
                transition: 'all 0.3s'
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: connected ? '#10b981' : '#ef4444' }}>
                {connected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>

            {/* Connect/Disconnect */}
            {!connected
              ? <button onClick={connect} style={btnStyle('#6366f1')}>Connect</button>
              : <button onClick={disconnect} style={btnStyle('#475569')}>Disconnect</button>
            }
          </div>
        </header>

        {/* ── Main Grid ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Stream Control Card ─────────────────────────────────────────── */}
            <div style={glassCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#6366f1' }}><Icon.Activity /></span>
                  <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>
                    Live Sensor Stream
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <PhaseBadge phase={phase} />
                  <button onClick={resetSession} style={btnStyle('#334155', { fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 })}>
                    <Icon.Refresh /> Reset
                  </button>
                </div>
              </div>

              {/* Stream Buttons */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                <button
                  onClick={startStreaming}
                  disabled={!connected || streamingActive}
                  style={btnStyle(streamingActive ? '#1e3a29' : '#10b981', {
                    flex: 1, opacity: (!connected || streamingActive) ? 0.5 : 1,
                    cursor: (!connected || streamingActive) ? 'not-allowed' : 'pointer',
                    position: 'relative', overflow: 'hidden',
                  })}
                >
                  {streamingActive && (
                    <span style={{
                      position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.15)',
                      animation: 'pulse 1.5s infinite'
                    }} />
                  )}
                  ▶ {streamingActive ? 'Streaming…' : 'Start Stream'}
                </button>
                <button
                  onClick={stopStreaming}
                  disabled={!streamingActive}
                  style={btnStyle('#ef4444', { flex: 1, opacity: !streamingActive ? 0.4 : 1, cursor: !streamingActive ? 'not-allowed' : 'pointer' })}
                >
                  ■ Stop Stream
                </button>
              </div>

              {/* Buffer Progress Bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Buffer Fill</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                    {Math.round(progress * 100)}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${progress * 100}%`,
                    background: progress >= 1 ? 'linear-gradient(90deg,#6366f1,#10b981)' : 'linear-gradient(90deg,#6366f1,#818cf8)',
                    borderRadius: 99, transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {/* Waveform */}
              <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Accelerometer X — Live Trace
                </p>
                <Waveform data={waveData} />
              </div>
            </div>

            {/* ── Analysis Result ─────────────────────────────────────────────── */}
            <div style={glassCard}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, margin: '0 0 24px' }}>
                Analysis Result
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* Step 1: Exercise Detection */}
                <div style={{
                  padding: 24, borderRadius: 16,
                  background: exercise ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${exercise ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.5s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', background: '#6366f1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: 'white'
                    }}>1</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Exercise Detection
                    </span>
                  </div>
                  {exercise ? (
                    <>
                      <div style={{ fontSize: 42, fontFamily: "'Outfit', sans-serif", fontWeight: 800, color: '#a5b4fc', letterSpacing: '-1px' }}>
                        {exercise.code}
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 12 }}>{exercise.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99 }}>
                          <div style={{ height: '100%', width: `${exercise.confidence * 100}%`, background: '#6366f1', borderRadius: 99, transition: 'width 1s ease' }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6366f1', fontWeight: 700 }}>
                          {Math.round(exercise.confidence * 100)}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#334155', fontSize: 32, fontWeight: 800, letterSpacing: 2 }}>— —</div>
                  )}
                </div>

                {/* Step 2: Correctness */}
                <div style={{
                  padding: 24, borderRadius: 16,
                  background: correctness
                    ? correctness.is_correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${correctness
                    ? correctness.is_correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'
                    : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.5s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: correctness ? (correctness.is_correct ? '#10b981' : '#ef4444') : '#334155',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: 'white', transition: 'background 0.5s ease'
                    }}>2</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Correctness Check
                    </span>
                  </div>

                  {/* Show "thinking" animation when exercise is detected but correctness not yet in */}
                  {phase === 'exercise_detected' && !correctness ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        border: '3px solid #6366f1', borderTopColor: 'transparent',
                        animation: 'spin 0.8s linear infinite', marginBottom: 10
                      }} />
                      <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, animation: 'pulse 1.5s infinite' }}>
                        Scoring…
                      </span>
                    </div>
                  ) : correctness ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: correctness.is_correct ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: correctness.is_correct ? '#10b981' : '#ef4444'
                      }}>
                        {correctness.is_correct ? <Icon.Check /> : <Icon.X />}
                      </div>
                      <div style={{
                        fontSize: 40, fontFamily: "'Outfit', sans-serif", fontWeight: 800,
                        color: correctness.is_correct ? '#34d399' : '#f87171'
                      }}>
                        {Math.round(correctness.score * 100)}%
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: correctness.is_correct ? '#10b981' : '#ef4444' }}>
                        {correctness.is_correct ? '✓ Correct Form' : '✗ Needs Correction'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#334155', fontSize: 32, fontWeight: 800, letterSpacing: 2 }}>— —</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Sidebar ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Session Stats */}
            <div style={glassCard}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6366f1' }}><Icon.BarChart /></span>
                Session Stats
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Total Reps', val: sessionStats.total, color: '#a5b4fc' },
                  { label: 'Correct', val: sessionStats.correct, color: '#34d399' },
                  { label: 'Incorrect', val: sessionStats.incorrect, color: '#f87171' },
                  { label: 'Avg Score', val: `${Math.round(sessionStats.avg * 100)}%`, color: '#fbbf24' },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '14px 12px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* History */}
            <div style={{ ...glassCard, flex: 1 }}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>
                Activity Log
              </h2>
              {history.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#334155', fontSize: 13, padding: '32px 0' }}>
                  No activity yet
                  <br />
                  <span style={{ fontSize: 11 }}>Start streaming to begin</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                  {history.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.3s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: item.is_correct ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: item.is_correct ? '#10b981' : '#ef4444', fontSize: 14,
                        }}>
                          {item.is_correct ? '✓' : '✗'}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{item.exercise}</div>
                          <div style={{ fontSize: 10, color: '#475569' }}>{item.time}</div>
                        </div>
                      </div>
                      <div style={{
                        fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
                        color: item.is_correct ? '#34d399' : '#f87171'
                      }}>
                        {Math.round(item.score * 100)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* How it works */}
            <div style={{ ...glassCard, borderColor: 'rgba(99,102,241,0.2)' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                How It Works
              </h3>
              {[
                ['📡', 'Sensor data streams via WebSocket at 20 Hz'],
                ['🧠', 'LSTM buffers 150 readings then classifies exercise'],
                ['✅', 'Correctness score is then predicted from same window'],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 99px; }
      `}</style>
    </div>
  );
}

// ─── Shared Styles ─────────────────────────────────────────────────────────────
const glassCard = {
  background: 'rgba(30,41,59,0.65)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 20,
  padding: 24,
};

function btnStyle(bg, extra = {}) {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 10,
    padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    transition: 'opacity 0.2s, transform 0.1s', fontFamily: "'Inter', sans-serif",
    ...extra,
  };
}
