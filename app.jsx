import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";

// Simple rhythm game + step sequencer with a tiny synth
// Controls:
// - Click Play to start audio context & transport
// - Spacebar: hit on-beat to score
// - Grid: toggle Kick/Snare/Hi-Hat steps
// - Synth row: click step to cycle notes ("-" = rest)
// - BPM slider to change tempo
// - Randomize to auto-fill a quick beat
// - Clear to reset

const STEPS = 16;
const SCALE = ["-", "C4", "D#4", "F4", "G4", "A#4", "C5"]; // pentatonic-ish

function classNames(...n) {
  return n.filter(Boolean).join(" ");
}

export default function RhythmGameSequencer() {
  // Transport / timing
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(110);
  const [currentStep, setCurrentStep] = useState(0);

  // Game
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastHitGood, setLastHitGood] = useState(null); // true/false/null
  const lastTickAtRef = useRef(0);
  const sixteenthDurRef = useRef(0.0);

  // Patterns
  const [kick, setKick] = useState(Array(STEPS).fill(false));
  const [snare, setSnare] = useState(Array(STEPS).fill(false));
  const [hat, setHat] = useState(Array(STEPS).fill(false));
  const [synthRow, setSynthRow] = useState(Array(STEPS).fill(0)); // index into SCALE

  // Instruments
  const kickSynth = useMemo(() => {
    const s = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 8,
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.2 },
    }).toDestination();
    return s;
  }, []);

  const snareSynth = useMemo(() => {
    const noise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
    }).toDestination();
    return noise;
  }, []);

  const hatSynth = useMemo(() => {
    const metal = new Tone.MetalSynth({
      frequency: 200,
      envelope: { attack: 0.001, decay: 0.1, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 8000,
      octaves: 1.5,
    }).toDestination();
    return metal;
  }, []);

  const leadSynth = useMemo(() => {
    const s = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.2, release: 0.3 },
    }).toDestination();
    return s;
  }, []);

  // Handle transport scheduling
  useEffect(() => {
    Tone.getTransport().bpm.value = bpm;
    sixteenthDurRef.current = 60 / bpm / 4; // seconds per 16th
  }, [bpm]);

  useEffect(() => {
    // Schedule a 16th-note loop
    const loop = new Tone.Loop((time) => {
      const step = (Math.floor(Tone.getTransport().ticks / Tone.Ticks("16n")) % STEPS + STEPS) % STEPS;
      setCurrentStep(step);
      lastTickAtRef.current = Tone.now();

      // Play drums
      if (kick[step]) kickSynth.triggerAttackRelease("C2", 0.08, time);
      if (snare[step]) snareSynth.triggerAttackRelease("16n", time);
      if (hat[step]) hatSynth.triggerAttackRelease("16n", time, 0.3);

      // Play synth note if set
      const idx = synthRow[step];
      if (idx > 0) {
        const note = SCALE[idx];
        leadSynth.triggerAttackRelease(note, "8n", time);
      }
    }, "16n");

    loop.start(0);

    return () => {
      loop.dispose();
    };
  }, [kick, snare, hat, synthRow, kickSynth, snareSynth, hatSynth, leadSynth]);

  // Start/Stop
  const togglePlay = async () => {
    if (!isPlaying) {
      await Tone.start();
      Tone.getTransport().bpm.value = bpm;
      Tone.getTransport().start();
      setIsPlaying(true);
    } else {
      Tone.getTransport().stop();
      setIsPlaying(false);
      setCurrentStep(0);
    }
  };

  // Game hit detection (Spacebar)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        const now = Tone.now();
        const dt = now - lastTickAtRef.current; // seconds since last tick
        const period = sixteenthDurRef.current || (60 / bpm / 4);
        const window = Math.min(0.08, period * 0.35); // ~tight window
        const onBeat = dt <= window || (period - dt) <= window; // near either side of boundary
        setLastHitGood(onBeat);
        if (onBeat) {
          setScore((s) => s + 10 + Math.min(combo, 50));
          setCombo((c) => c + 1);
        } else {
          setCombo(0);
          setScore((s) => Math.max(0, s - 5));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bpm]);

  // Helpers: set step toggles
  const toggle = (rowSetter, row, i) => {
    const next = row.slice();
    next[i] = !next[i];
    rowSetter(next);
  };

  const cycleSynthStep = (i) => {
    const next = synthRow.slice();
    next[i] = (next[i] + 1) % SCALE.length;
    setSynthRow(next);
  };

  const clearAll = () => {
    setKick(Array(STEPS).fill(false));
    setSnare(Array(STEPS).fill(false));
    setHat(Array(STEPS).fill(false));
    setSynthRow(Array(STEPS).fill(0));
    setScore(0);
    setCombo(0);
    setLastHitGood(null);
  };

  const randomize = () => {
    const rnd = (density) => Array(STEPS).fill(false).map((_, i) => Math.random() < density);
    setKick(Array(STEPS).fill(false).map((_, i) => i % 4 === 0 || (Math.random() < 0.1 && i % 2 === 0)));
    setSnare(Array(STEPS).fill(false).map((_, i) => (i % 8 === 4) || (Math.random() < 0.05 && i % 2 === 0)));
    setHat(rnd(0.45));
    setSynthRow(Array(STEPS).fill(0).map(() => (Math.random() < 0.35 ? 1 + Math.floor(Math.random() * (SCALE.length - 1)) : 0)));
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 flex flex-col items-center gap-6">
      <header className="w-full max-w-5xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={classNames(
            "h-3 w-3 rounded-full",
            lastHitGood === null && "bg-slate-600",
            lastHitGood === true && "bg-emerald-400",
            lastHitGood === false && "bg-rose-400",
          )} />
          <h1 className="text-2xl font-semibold tracking-tight">Rhythm Beat — Mini Game + Synth</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className={classNames(
              "px-4 py-2 rounded-2xl shadow-sm transition active:scale-95",
              isPlaying ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
            )}
          >{isPlaying ? "Stop" : "Play"}</button>
          <button onClick={randomize} className="px-3 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700">Randomize</button>
          <button onClick={clearAll} className="px-3 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700">Clear</button>
        </div>
      </header>

      <section className="w-full max-w-5xl">
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-300">BPM</label>
          <input
            type="range"
            min={70}
            max={160}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-64"
          />
          <span className="tabular-nums text-sm">{bpm}</span>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-sm bg-slate-900/60 rounded-xl px-3 py-2">Score: <span className="tabular-nums font-semibold">{score}</span></div>
            <div className="text-sm bg-slate-900/60 rounded-xl px-3 py-2">Combo: <span className="tabular-nums font-semibold">{combo}</span></div>
            <div className="text-xs text-slate-400">(Hit Space on the beat)</div>
          </div>
        </div>
      </section>

      {/* Step lights */}
      <div className="w-full max-w-5xl grid grid-cols-16 gap-1">
        {Array.from({ length: STEPS }).map((_, i) => (
          <div
            key={i}
            className={classNames(
              "h-2 rounded-full",
              i === currentStep ? "bg-emerald-400" : "bg-slate-700"
            )}
          />
        ))}
      </div>

      {/* Sequencer Grid */}
      <div className="w-full max-w-5xl bg-slate-900/40 rounded-2xl p-4 shadow-inner">
        <TrackRow
          name="Kick"
          color="bg-emerald-500"
          row={kick}
          currentStep={currentStep}
          onToggle={(i) => toggle(setKick, kick, i)}
        />
        <TrackRow
          name="Snare"
          color="bg-rose-500"
          row={snare}
          currentStep={currentStep}
          onToggle={(i) => toggle(setSnare, snare, i)}
        />
        <TrackRow
          name="Hi-Hat"
          color="bg-cyan-500"
          row={hat}
          currentStep={currentStep}
          onToggle={(i) => toggle(setHat, hat, i)}
        />
        <SynthRow
          name="Synth"
          color="bg-violet-500"
          row={synthRow}
          currentStep={currentStep}
          onCycle={cycleSynthStep}
        />
      </div>

      <footer className="text-xs text-slate-400 mt-6">
        Pro tip: While playing, mash <span className="px-1 py-0.5 rounded bg-slate-800">Space</span> right on the step lights to rack up combo. Click synth steps to choose notes.
      </footer>
    </div>
  );
}

function TrackRow({ name, color, row, onToggle, currentStep }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-2">
        <div className={classNames("h-2 w-2 rounded-full", color)} />
        <div className="font-medium">{name}</div>
      </div>
      <div className="grid grid-cols-16 gap-1">
        {row.map((val, i) => (
          <button
            key={i}
            onClick={() => onToggle(i)}
            className={classNames(
              "h-10 rounded-md border text-xs tabular-nums transition",
              i === currentStep ? "ring-2 ring-emerald-400" : "",
              val ? "bg-slate-200 text-slate-900 border-slate-300" : "bg-slate-800/70 border-slate-700 hover:bg-slate-800"
            )}
          >
            {((i % 4) + 1)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SynthRow({ name, color, row, onCycle, currentStep }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={classNames("h-2 w-2 rounded-full", color)} />
        <div className="font-medium">{name} (click to cycle)</div>
      </div>
      <div className="grid grid-cols-16 gap-1">
        {row.map((idx, i) => (
          <button
            key={i}
            onClick={() => onCycle(i)}
            className={classNames(
              "h-10 rounded-md border text-xs transition flex items-center justify-center",
              i === currentStep ? "ring-2 ring-violet-400" : "",
              idx > 0 ? "bg-violet-200 text-slate-900 border-violet-300" : "bg-slate-800/70 text-slate-200 border-slate-700 hover:bg-slate-800"
            )}
            title="Click to change note"
          >
            {idx === 0 ? "-" : SCALE[idx]}
          </button>
        ))}
      </div>
    </div>
  );
}
