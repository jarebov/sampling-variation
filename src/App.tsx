import { useCallback, useEffect, useMemo, useState } from 'react';

const SUPPORT = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const MU = 1.4;
const PREVIEW_POP_DOTS = 300;
const MAX_STORED_MEANS = 4000;

const P_LOW = [0, 0.6, 0.4, 0, 0, 0, 0, 0];
const P_HIGH = [0.8, 0, 0, 0, 0, 0, 0, 0.2];

function meanFromPmf(probabilities: number[]): number {
  let expected = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    expected += i * probabilities[i];
  }
  return expected;
}

function varianceFromPmf(probabilities: number[], mu: number): number {
  let expectedSquare = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    expectedSquare += i * i * probabilities[i];
  }
  return expectedSquare - mu * mu;
}

function drawOne(probabilities: number[]): number {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    cumulative += probabilities[i];
    if (r <= cumulative) return i;
  }
  return probabilities.length - 1;
}

function drawSample(probabilities: number[], n: number): number[] {
  const sample = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    sample[i] = drawOne(probabilities);
  }
  return sample;
}

function sampleMean(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

const lowMu = meanFromPmf(P_LOW);
const highMu = meanFromPmf(P_HIGH);
console.assert(Math.abs(lowMu - MU) < 1e-12, `p_low mean expected 1.4, got ${lowMu}`);
console.assert(Math.abs(highMu - MU) < 1e-12, `p_high mean expected 1.4, got ${highMu}`);

for (const lambdaToCheck of [0, 0.2, 0.5, 0.8, 1]) {
  const mixed = SUPPORT.map(
    (x) => (1 - lambdaToCheck) * P_LOW[x] + lambdaToCheck * P_HIGH[x]
  );
  console.assert(
    Math.abs(meanFromPmf(mixed) - MU) < 1e-12,
    `mixture mean expected 1.4 at lambda=${lambdaToCheck}`
  );
}

export default function App() {
  const [lambda, setLambda] = useState(0.25);
  const [sampleSize, setSampleSize] = useState(40);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSample, setCurrentSample] = useState<number[]>([]);
  const [means, setMeans] = useState<number[]>([]);

  const mixedPmf = useMemo(() => {
    const probs = SUPPORT.map((x) => (1 - lambda) * P_LOW[x] + lambda * P_HIGH[x]);
    const sum = probs.reduce((acc, p) => acc + p, 0);
    const mixMu = meanFromPmf(probs);
    console.assert(Math.abs(sum - 1) < 1e-12, `pmf sum expected 1, got ${sum}`);
    console.assert(Math.abs(mixMu - MU) < 1e-12, `mixture mean expected 1.4, got ${mixMu}`);
    return probs;
  }, [lambda]);

  const varX = useMemo(() => varianceFromPmf(mixedPmf, MU), [mixedPmf]);
  const varXBar = varX / sampleSize;
  const seXBar = Math.sqrt(varXBar);
  const currentMean = currentSample.length > 0 ? sampleMean(currentSample) : null;
  const repetitionCount = means.length;

  const populationPreviewDots = useMemo(() => {
    const draws = drawSample(mixedPmf, PREVIEW_POP_DOTS);
    return draws.map((value, idx) => ({
      value,
      jitterX: (Math.random() - 0.5) * 0.56,
      y: 176 + ((idx * 37) % 26),
      radius: 2.2 + ((idx * 17) % 10) * 0.04,
    }));
  }, [mixedPmf]);

  const currentSampleDots = useMemo(
    () =>
      currentSample.map((value, idx) => ({
        value,
        jitterX: (Math.random() - 0.5) * 0.56,
        y: 44 + (idx % 20) * 6.4,
      })),
    [currentSample]
  );

  const runOneSample = useCallback(() => {
    const sample = drawSample(mixedPmf, sampleSize);
    const xbar = sampleMean(sample);
    setCurrentSample(sample);
    setMeans((prev) => {
      if (prev.length >= MAX_STORED_MEANS) {
        return [...prev.slice(1), xbar];
      }
      return [...prev, xbar];
    });
  }, [mixedPmf, sampleSize]);

  useEffect(() => {
    setIsRunning(false);
    setCurrentSample([]);
    setMeans([]);
  }, [lambda, sampleSize]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const id = window.setInterval(() => {
      runOneSample();
    }, 320);
    return () => window.clearInterval(id);
  }, [isRunning, runOneSample]);

  const axis = { min: 0, max: 7, left: 36, right: 620, top: 18 };
  const toX = (value: number) =>
    axis.left + ((value - axis.min) / (axis.max - axis.min)) * (axis.right - axis.left);

  const panelABottom = 158;
  const barWidth = ((axis.right - axis.left) / SUPPORT.length) * 0.7;
  const maxP = Math.max(...mixedPmf, 0.001);

  const histBins = 42;
  const histCounts = useMemo(() => {
    const counts = new Array<number>(histBins).fill(0);
    for (const value of means) {
      let idx = Math.floor(((value - axis.min) / (axis.max - axis.min)) * histBins);
      if (idx < 0) idx = 0;
      if (idx >= histBins) idx = histBins - 1;
      counts[idx] += 1;
    }
    return counts;
  }, [means]);
  const maxHistCount = Math.max(...histCounts, 1);
  const histBottom = 196;
  const histBinWidth = (axis.right - axis.left) / histBins;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Sampling Variation Visualizer</h1>
          <p className="subtitle">
            Population distribution, repeated samples, and the variance relationship:
            {' '}
            <strong>Var(X̄) = Var(X) / N</strong>
          </p>
        </div>
      </header>

      <section className="controls">
        <label>
          Variance of X (mixing λ)
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={lambda}
            onChange={(event) => setLambda(Number(event.target.value))}
          />
          <span className="control-readout">
            λ = {lambda.toFixed(2)} | Var(X) = {varX.toFixed(3)}
          </span>
        </label>

        <label>
          Sample size N
          <input
            type="range"
            min={2}
            max={200}
            step={1}
            value={sampleSize}
            onChange={(event) => setSampleSize(Number(event.target.value))}
          />
          <span className="control-readout">N = {sampleSize}</span>
        </label>

        <div className="buttons">
          <button type="button" onClick={() => setIsRunning((v) => !v)}>
            {isRunning ? 'Pause' : 'Run'}
          </button>
          <button type="button" onClick={runOneSample}>
            Step
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRunning(false);
              setCurrentSample([]);
              setMeans([]);
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="stats">
        <div>μ = {MU.toFixed(1)}</div>
        <div>Var(X) = {varX.toFixed(3)}</div>
        <div>Var(X̄) = Var(X)/N = {varXBar.toFixed(4)}</div>
        <div>SE(X̄) = √(Var(X)/N) = {seXBar.toFixed(4)}</div>
        <div>Repetitions = {repetitionCount}</div>
      </section>

      <section className="panel">
        <h2>Panel A: Population Distribution of X (Number of Siblings)</h2>
        <svg viewBox="0 0 660 220" className="svg-chart" role="img">
          <line x1={axis.left} x2={axis.right} y1={panelABottom} y2={panelABottom} className="axis" />
          {SUPPORT.map((x) => {
            const center = toX(x);
            const barHeight = (mixedPmf[x] / maxP) * 116;
            const top = panelABottom - barHeight;
            return (
              <g key={x}>
                <rect
                  x={center - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={barHeight}
                  className="pmf-bar"
                />
                <text x={center} y={176} textAnchor="middle" className="axis-label">
                  {x}
                </text>
                <text x={center} y={top - 4} textAnchor="middle" className="prob-label">
                  {mixedPmf[x].toFixed(2)}
                </text>
              </g>
            );
          })}
          {populationPreviewDots.map((dot, idx) => (
            <circle
              key={`pop-${idx}`}
              cx={toX(dot.value + dot.jitterX)}
              cy={dot.y}
              r={dot.radius}
              className="population-dot"
            />
          ))}
          <line x1={toX(MU)} x2={toX(MU)} y1={axis.top} y2={208} className="mu-line" />
          <text x={toX(MU) + 6} y={30} className="mu-text">
            μ = {MU}
          </text>
          <text x={40} y={206} className="hint">
            Gray dots: synthetic population preview (n≈300)
          </text>
        </svg>
      </section>

      <section className="panel">
        <h2>Panel B: Current Sample (size N = {sampleSize})</h2>
        <div className="panel-subtitle">
          Current sample mean X̄ =
          {' '}
          {currentMean === null ? '—' : currentMean.toFixed(3)}
        </div>
        <svg viewBox="0 0 660 190" className="svg-chart" role="img">
          <line x1={axis.left} x2={axis.right} y1={174} y2={174} className="axis" />
          {SUPPORT.map((x) => (
            <text key={`sample-axis-${x}`} x={toX(x)} y={186} textAnchor="middle" className="axis-label">
              {x}
            </text>
          ))}
          {currentSampleDots.map((dot, idx) => (
            <circle key={`sample-dot-${idx}`} cx={toX(dot.value + dot.jitterX)} cy={dot.y} r={3.1} className="sample-dot" />
          ))}
          {currentMean !== null && (
            <>
              <line x1={toX(currentMean)} x2={toX(currentMean)} y1={20} y2={174} className="xbar-line" />
              <text x={toX(currentMean) + 6} y={30} className="xbar-text">
                X̄ = {currentMean.toFixed(3)}
              </text>
            </>
          )}
          <line x1={toX(MU)} x2={toX(MU)} y1={20} y2={174} className="mu-line-faint" />
        </svg>
      </section>

      <section className="panel">
        <h2>Panel C: Sampling Distribution of X̄</h2>
        <div className="panel-subtitle">
          Stored sample means: {means.length} (max {MAX_STORED_MEANS})
        </div>
        <svg viewBox="0 0 660 240" className="svg-chart" role="img">
          <line x1={axis.left} x2={axis.right} y1={histBottom} y2={histBottom} className="axis" />
          {histCounts.map((count, i) => {
            const x = axis.left + i * histBinWidth;
            const barHeight = (count / maxHistCount) * 160;
            return (
              <rect
                key={`hist-${i}`}
                x={x}
                y={histBottom - barHeight}
                width={Math.max(0.1, histBinWidth - 0.7)}
                height={barHeight}
                className="hist-bar"
              />
            );
          })}
          {SUPPORT.map((x) => (
            <text key={`hist-axis-${x}`} x={toX(x)} y={214} textAnchor="middle" className="axis-label">
              {x}
            </text>
          ))}
          <line x1={toX(MU)} x2={toX(MU)} y1={22} y2={histBottom} className="mu-line" />
          <text x={toX(MU) + 6} y={36} className="mu-text">
            μ = {MU}
          </text>
        </svg>
      </section>
    </div>
  );
}
