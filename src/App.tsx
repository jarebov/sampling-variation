import { useCallback, useEffect, useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type Speed = 'slow' | 'medium' | 'fast';
type MathInlineProps = {
  tex: string;
};

const SUPPORT = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const MU = 1.4;
const NPOP = 10_000;
const MAX_POP_DOTS = 2_000;
const MAX_STORED_MEANS = 4000;
const SPEED_MS: Record<Speed, number> = {
  slow: 900,
  medium: 350,
  fast: 120,
};

const P_LOW = [0, 0.6, 0.4, 0, 0, 0, 0, 0];
const P_HIGH = [0.8, 0, 0, 0, 0, 0, 0, 0.2];

function MathInline({ tex }: MathInlineProps) {
  return (
    <span
      className="math-inline"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(tex, {
          displayMode: false,
          throwOnError: false,
        }),
      }}
    />
  );
}

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

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const xbar = sampleMean(values);
  let squaredDeviations = 0;
  for (const value of values) {
    const deviation = value - xbar;
    squaredDeviations += deviation * deviation;
  }
  return squaredDeviations / (values.length - 1);
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
  const [targetRepetitions, setTargetRepetitions] = useState(100);
  const [speed, setSpeed] = useState<Speed>('medium');
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
  const currentSampleVariance = currentSample.length > 0 ? sampleVariance(currentSample) : null;
  const repetitionCount = means.length;

  const population = useMemo(() => drawSample(mixedPmf, NPOP), [mixedPmf]);

  const populationPreviewDots = useMemo(() => {
    const stride = Math.max(1, Math.floor(population.length / MAX_POP_DOTS));
    const points: Array<{ value: number; jitterX: number; jitterY: number; radius: number }> = [];
    for (let i = 0; i < population.length; i += stride) {
      points.push({
        value: population[i],
        jitterX: (Math.random() - 0.5) * 0.56,
        jitterY: Math.random(),
        radius: 1.75,
      });
    }
    return points;
  }, [population]);

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
    if (means.length >= targetRepetitions) {
      setIsRunning(false);
      return;
    }
    const sample = drawSample(mixedPmf, sampleSize);
    const xbar = sampleMean(sample);
    setCurrentSample(sample);
    setMeans((prev) => {
      if (prev.length >= MAX_STORED_MEANS) {
        return [...prev.slice(1), xbar];
      }
      return [...prev, xbar];
    });
  }, [means.length, mixedPmf, sampleSize, targetRepetitions]);

  useEffect(() => {
    setIsRunning(false);
    setCurrentSample([]);
    setMeans([]);
  }, [lambda, sampleSize]);

  useEffect(() => {
    if (means.length > targetRepetitions) {
      setMeans((prev) => prev.slice(0, targetRepetitions));
      setIsRunning(false);
    }
    if (means.length >= targetRepetitions) {
      setIsRunning(false);
    }
  }, [means.length, targetRepetitions]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const id = window.setInterval(() => {
      runOneSample();
    }, SPEED_MS[speed]);
    return () => window.clearInterval(id);
  }, [isRunning, runOneSample, speed]);

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
          <h1>Sampling Variation Simulator</h1>
          <p className="subtitle">Econ 1117 – Yale University</p>
        </div>
        <img className="yale-logo" src={import.meta.env.BASE_URL + 'yale_logo.png'} alt="Yale University logo" />
      </header>

      <div className="description">
        <p>
          This simulator illustrates sampling variation in the sample mean and highlights the difference between
          population variance, sample variance, and variance of the sample mean.
        </p>

        <p>
          Consider the population of Yale students. Let <MathInline tex={'X'} /> denote the number of siblings of a randomly selected
          student. The population mean is <MathInline tex={'\\mu = 1.4'} /> (that is,{' '}
          <MathInline tex={'E[X] = \\mu = 1.4'} />). This value is fixed and does not change. The slider below allows
          you to change the value of the population variance <MathInline tex={'\\operatorname{Var}(X) = \\sigma^2'} />.
          Once you select a value of <MathInline tex={'\\sigma^2'} />, it is fixed and does not change.
        </p>

        <p>
          Panel A shows the population distribution of <MathInline tex={'X'} />, represented by the gray circles. The
          orange vertical line marks the true population mean <MathInline tex={'\\mu'} />.
        </p>

        <p>
          In each repetition of the simulation, a random sample is drawn from this population. Panel B shows the
          sample drawn in a given repetition (blue dots) and the sample mean computed from that sample.
        </p>

        <p>
          Because the sample changes from one repetition to the next, the sample mean also changes. Panel C records
          the sample mean <MathInline tex={'\\bar X'} /> from each repetition. As more repetitions accumulate, the
          distribution of the sample mean gradually emerges.
        </p>

        <p>
          Observing how the sample mean varies across repetitions illustrates the concept of sampling variation and
          helps visualize the sampling distribution of the mean.
        </p>
      </div>

      <section className="controls">
        <label>
          Population variance <MathInline tex={'\\sigma^2'} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={lambda}
            onChange={(event) => setLambda(Number(event.target.value))}
          />
          <span className="control-readout">
            <MathInline tex={'\\sigma^2 = \\operatorname{Var}(X)'} /> = {varX.toFixed(3)}
          </span>
        </label>

        <label>
          Sample size <MathInline tex={'N'} />
          <input
            type="range"
            min={2}
            max={200}
            step={1}
            value={sampleSize}
            onChange={(event) => setSampleSize(Number(event.target.value))}
          />
          <span className="control-readout">
            <MathInline tex={'N'} /> = {sampleSize}
          </span>
        </label>

        <label>
          Repetitions: <strong>{targetRepetitions}</strong>
          <input
            type="range"
            min={10}
            max={500}
            step={1}
            value={targetRepetitions}
            onChange={(event) => setTargetRepetitions(Number(event.target.value))}
          />
        </label>

        <label>
          Speed
          <select value={speed} onChange={(event) => setSpeed(event.target.value as Speed)}>
            <option value="slow">Slow</option>
            <option value="medium">Medium</option>
            <option value="fast">Fast</option>
          </select>
        </label>

        <div className="buttons">
          <button
            type="button"
            onClick={() => setIsRunning(true)}
            disabled={isRunning || repetitionCount >= targetRepetitions}
          >
            Start
          </button>
          <button type="button" onClick={() => setIsRunning(false)} disabled={!isRunning}>
            Pause
          </button>
          <button type="button" onClick={runOneSample} disabled={repetitionCount >= targetRepetitions}>
            Draw
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
        <div>
          <MathInline tex={'\\mu'} /> = {MU.toFixed(1)}
        </div>
        <div>
          <MathInline tex={'\\operatorname{Var}(X)'} /> = {varX.toFixed(3)}
        </div>
        <div>
          <MathInline tex={'\\operatorname{Var}(\\bar X) = \\sigma^2/N'} /> = {varXBar.toFixed(4)}
        </div>
        <div>
          <MathInline tex={'\\operatorname{SE}(\\bar X) = \\sqrt{\\sigma^2/N}'} /> = {seXBar.toFixed(4)}
        </div>
        <div>Repetitions = {repetitionCount}/{targetRepetitions}</div>
      </section>

      <section className="panel">
        <h2>
          Panel A: Population Distribution of <MathInline tex={'X'} /> (Number of Siblings)
        </h2>
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
            (() => {
              const barHeight = (mixedPmf[dot.value] / maxP) * 116;
              const barTop = panelABottom - barHeight;
              const y = barTop + 4 + dot.jitterY * Math.max(2, barHeight - 8);
              return (
                <circle
                  key={`pop-${idx}`}
                  cx={toX(dot.value + dot.jitterX)}
                  cy={y}
                  r={dot.radius}
                  className="population-dot"
                />
              );
            })()
          ))}
          <line x1={toX(MU)} x2={toX(MU)} y1={axis.top} y2={208} className="mu-line" />
          <text x={toX(MU) + 6} y={30} className="mu-text">
            μ = {MU}
          </text>
          <text x={40} y={206} className="hint">
            Gray dots: population preview (subset shown inside bars)
          </text>
        </svg>
      </section>

      <section className="panel">
        <h2>
          Panel B: Current Sample (size <MathInline tex={'N'} /> = {sampleSize})
        </h2>
        <div className="panel-subtitle">
          <div>
            Sample mean: <MathInline tex={'\\bar X'} /> = {currentMean === null ? '—' : currentMean.toFixed(3)}
          </div>
          <div>
            Sample variance: <MathInline tex={'s^2'} /> ={' '}
            {currentSampleVariance === null ? '—' : currentSampleVariance.toFixed(3)}
          </div>
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
        <h2>
          Panel C: Sampling Distribution of <MathInline tex={'\\bar X'} />
        </h2>
        <div className="panel-subtitle">
          Stored sample means: {means.length}
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

      <footer className="footer-credit">
        Interactive visualization by{' '}
        <a
          href="https://www.jarellanobover.com/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Jaime Arellano-Bover’s website in a new tab"
        >
          Jaime Arellano-Bover
        </a>
      </footer>
    </div>
  );
}
