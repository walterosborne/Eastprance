import { DEFAULT_GOAL_LABEL } from './metricGoals.js';

const NMFR_ARIMA_MIN_OBSERVATIONS = 10;
const NMFR_GOAL_CHALLENGE_RATIO = 0.03;
const OTD_ARIMA_MIN_OBSERVATIONS = 10;
const OTD_GOAL_CHALLENGE_RATIO = 0.03;
const OTD_RECENT_BASELINE_MONTHS = 6;
const OTD_MAX_FORECAST_DEVIATION = 0.2;
const LABOR_HANA_ARIMA_MIN_OBSERVATIONS = 10;
const LABOR_HANA_GOAL_CHALLENGE_RATIO = 0.03;
const NMFR_ARIMA_OPTIONS = Object.freeze({
  p: 1,
  d: 1,
  q: 1,
  verbose: false
});
const OTD_ARIMA_OPTIONS = Object.freeze({
  p: 1,
  d: 0,
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

function roundShare(value) {
  return Number(value.toFixed(4));
}

function getMedian(values) {
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
    : sortedValues[middleIndex];
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

export async function forecastOtdGoalLineFromSeries(seriesValues) {
  const numericSeries = normalizeSeries(seriesValues).map((value) =>
    Math.min(1, Math.max(0, value))
  );

  if (numericSeries.length < OTD_ARIMA_MIN_OBSERVATIONS) {
    return null;
  }

  const ARIMA = await loadArimaConstructor();
  let model = null;

  try {
    const percentagePointSeries = numericSeries.map((value) => value * 100);
    const recentBaselineValue = getMedian(
      numericSeries.slice(-OTD_RECENT_BASELINE_MONTHS)
    );

    model = new ARIMA(OTD_ARIMA_OPTIONS).train(percentagePointSeries);
    const [predictions] = model.predict(1);
    const predictedValue = Number(predictions?.[0]) / 100;

    if (!Number.isFinite(predictedValue)) {
      return null;
    }

    const boundedPrediction = Math.min(1, Math.max(0, predictedValue));
    const usedRecentBaseline =
      Math.abs(boundedPrediction - recentBaselineValue) > OTD_MAX_FORECAST_DEVIATION;
    const expectedValue = roundShare(
      usedRecentBaseline ? recentBaselineValue : boundedPrediction
    );
    const goalValue = roundShare(
      Math.min(1, expectedValue * (1 + OTD_GOAL_CHALLENGE_RATIO))
    );
    const challengePercent = expectedValue > 0
      ? Number((((goalValue / expectedValue) - 1) * 100).toFixed(2))
      : 0;

    return {
      label: DEFAULT_GOAL_LABEL,
      value: goalValue,
      expectedValue,
      goalValue,
      challengePercent,
      rawExpectedValue: roundShare(boundedPrediction),
      recentBaselineValue: roundShare(recentBaselineValue),
      usedRecentBaseline
    };
  } finally {
    model?.destroy?.();
  }
}

export async function forecastLaborHanaGoalLineFromSeries(seriesValues) {
  const numericSeries = normalizeSeries(seriesValues);

  if (numericSeries.length < LABOR_HANA_ARIMA_MIN_OBSERVATIONS) {
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

    const expectedValue = roundShare(Math.min(1, Math.max(0, predictedValue)));
    const goalValue = roundShare(
      Math.min(1, expectedValue * (1 + LABOR_HANA_GOAL_CHALLENGE_RATIO))
    );
    const challengePercent = Number((LABOR_HANA_GOAL_CHALLENGE_RATIO * 100).toFixed(2));

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

export {
  LABOR_HANA_ARIMA_MIN_OBSERVATIONS,
  NMFR_ARIMA_MIN_OBSERVATIONS,
  OTD_ARIMA_MIN_OBSERVATIONS
};
