import { DEFAULT_GOAL_LABEL } from './metricGoals';

const NMFR_ARIMA_MIN_OBSERVATIONS = 10;
const NMFR_GOAL_CHALLENGE_RATIO = 0.03;
const NMFR_ARIMA_OPTIONS = Object.freeze({
  p: 1,
  d: 1,
  q: 1,
  verbose: false
});

let arimaConstructorPromise = null;

function normalizeSeries(seriesValues) {
  return seriesValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function roundRate(value) {
  return Number(value.toFixed(2));
}

async function loadArimaConstructor() {
  if (!arimaConstructorPromise) {
    arimaConstructorPromise = import('arima/async')
      .then((moduleValue) => moduleValue?.default ?? moduleValue)
      .then((exportedValue) => Promise.resolve(exportedValue))
      .then((resolvedValue) => resolvedValue?.default ?? resolvedValue);
  }

  return arimaConstructorPromise;
}

export async function forecastNmfrGoalLineFromSeries(seriesValues) {
  const numericSeries = normalizeSeries(seriesValues);

  if (numericSeries.length < NMFR_ARIMA_MIN_OBSERVATIONS) {
    return null;
  }

  const ARIMA = await loadArimaConstructor();
  let model = null;

  try {
    model = new ARIMA(NMFR_ARIMA_OPTIONS).train(numericSeries);
    const [predictions] = model.predict(1);
    const predictedValue = Number(predictions?.[0]);

    if (!Number.isFinite(predictedValue)) {
      return null;
    }

    const expectedValue = roundRate(Math.max(0, predictedValue));
    const goalValue = roundRate(Math.max(0, predictedValue * (1 - NMFR_GOAL_CHALLENGE_RATIO)));
    const challengePercent = Number((NMFR_GOAL_CHALLENGE_RATIO * 100).toFixed(2));

    return {
      label: DEFAULT_GOAL_LABEL,
      value: goalValue,
      expectedValue,
      goalValue,
      challengePercent
    };
  } finally {
    model?.destroy?.();
  }
}
