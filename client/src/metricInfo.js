import { METRIC_INFO } from './metricInfoRaw';

const DEFAULT_METRIC_INFO = 'Display metric info here';

const metricInfoNumberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function toMetricInfoEntries(info) {
  if (Array.isArray(info)) {
    return [...info];
  }

  if (info == null || info === '') {
    return [DEFAULT_METRIC_INFO];
  }

  return [info];
}

function formatMetricInfoNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? metricInfoNumberFormatter.format(numericValue)
    : 'Unavailable';
}

function formatMetricInfoPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? `${metricInfoNumberFormatter.format(numericValue)}%`
    : 'Unavailable';
}

function formatMetricInfoShare(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? formatMetricInfoPercent(numericValue * 100)
    : 'Unavailable';
}

function createMetricInfoTextPart(text, options = {}) {
  return {
    text,
    bold: Boolean(options.bold),
    underline: Boolean(options.underline)
  };
}

function appendMetricInfo(baseInfo, extraEntries) {
  return [
    ...toMetricInfoEntries(baseInfo),
    ...extraEntries
  ];
}

function buildArimaMetricInfo(
  baseInfo,
  goalLineDetails,
  { explanation, valueFormatter = formatMetricInfoNumber }
) {
  const status = String(goalLineDetails?.status ?? '').trim();
  const expectedValue = Number(goalLineDetails?.expectedValue);
  const goalValue = Number(goalLineDetails?.goalValue);
  const challengePercent = Number(goalLineDetails?.challengePercent);
  const forecastMonthLabel = String(goalLineDetails?.forecastMonthLabel ?? '').trim();
  const observationCount = Number(goalLineDetails?.observationCount);
  const requiredObservations = Number(goalLineDetails?.requiredObservations);
  const expectedValuePrefix = forecastMonthLabel
    ? `Based on the ARIMA model, the expected value for ${forecastMonthLabel} is `
    : 'Based on the ARIMA model, the expected value for the next month after the latest filtered month is ';

  return appendMetricInfo(baseInfo, [
    { text: 'Goal Lines', bold: true },
    {
      bullet: true,
      text: explanation
    },
    status === 'insufficient_data'
      ? {
        bullet: true,
        parts: [
          createMetricInfoTextPart('A goal line is not displayed because ARIMA requires '),
          createMetricInfoTextPart(
            Number.isFinite(requiredObservations)
              ? `${formatMetricInfoNumber(requiredObservations)} datapoints`
              : 'more datapoints',
            { bold: true }
          ),
          Number.isFinite(observationCount)
            ? createMetricInfoTextPart(' and the current filtered range has ')
            : createMetricInfoTextPart('.'),
          ...(Number.isFinite(observationCount)
            ? [
              createMetricInfoTextPart(formatMetricInfoNumber(observationCount), { bold: true }),
              createMetricInfoTextPart('.')
            ]
            : [])
        ]
      }
      : Number.isFinite(expectedValue) && Number.isFinite(goalValue) && Number.isFinite(challengePercent)
      ? {
        bullet: true,
        parts: [
          createMetricInfoTextPart(expectedValuePrefix),
          createMetricInfoTextPart(valueFormatter(expectedValue), { bold: true }),
          createMetricInfoTextPart(', and the goal line has been set to '),
          createMetricInfoTextPart(valueFormatter(goalValue), { bold: true }),
          createMetricInfoTextPart(' to present a '),
          createMetricInfoTextPart(formatMetricInfoPercent(challengePercent), { bold: true }),
          createMetricInfoTextPart(' challenge.')
        ]
      }
      : {
        bullet: true,
        parts: [
          createMetricInfoTextPart(expectedValuePrefix),
          createMetricInfoTextPart('Unavailable', { bold: true }),
          createMetricInfoTextPart(', and the goal line has been set to '),
          createMetricInfoTextPart('Unavailable', { bold: true }),
          createMetricInfoTextPart(' to present a '),
          createMetricInfoTextPart('Unavailable', { bold: true }),
          createMetricInfoTextPart(' challenge.')
        ]
      }
  ]);
}

function buildNmfrMetricInfo(baseInfo, goalLineDetails = null) {
  return buildArimaMetricInfo(baseInfo, goalLineDetails, {
    explanation: 'ARIMA projects the next NMFR value, then tightens that forecast slightly to create a realistic stretch target.'
  });
}

function buildOtdMetricInfo(baseInfo, goalLineDetails = null) {
  return buildArimaMetricInfo(baseInfo, goalLineDetails, {
    explanation: 'ARIMA projects the next percent-delivered value, then raises that forecast slightly to create a realistic stretch target.',
    valueFormatter: formatMetricInfoShare
  });
}

export {
  DEFAULT_METRIC_INFO,
  METRIC_INFO,
  appendMetricInfo,
  buildNmfrMetricInfo,
  buildOtdMetricInfo
};
