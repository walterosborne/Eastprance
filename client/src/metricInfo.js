// Each metric can be a plain string, a multiline string, an array of bullets,
// or objects like { text, bold, underline, bullet }. Whole-line markers also
// work: **bold**, __underlined__, and **__both__**.
const DEFAULT_METRIC_INFO = 'Display metric info here';

const METRIC_INFO = {
  controllableCosts: 'Compares controllable and uncontrollable costs over time.',
  sif: 'Counts significant injuries or fatalities over time.',
  potentialSif: 'Counts potential serious injury or fatality incidents.',
  nmfr: 'Tracks near miss frequency rate across periods.',
  otd: 'Compares committed units against actual delivered units.',
  labor: 'Shows direct labor hours as percent of total.'
};

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

function buildNmfrMetricInfo(baseInfo, goalLineDetails = null) {
  const expectedValue = Number(goalLineDetails?.expectedValue);
  const goalValue = Number(goalLineDetails?.goalValue);
  const challengePercent = Number(goalLineDetails?.challengePercent);

  return appendMetricInfo(baseInfo, [
    { text: 'Goal Lines', bold: true },
    {
      bullet: true,
      text: 'Goal lines use a client-side ARIMA forecast of the calculated NMFR series, then tighten that forecast slightly to create a realistic stretch target.'
    },
    Number.isFinite(expectedValue) && Number.isFinite(goalValue) && Number.isFinite(challengePercent)
      ? {
        bullet: true,
        parts: [
          createMetricInfoTextPart('Based on the ARIMA model, the expected value is '),
          createMetricInfoTextPart(formatMetricInfoNumber(expectedValue), { bold: true }),
          createMetricInfoTextPart(', and the goal line has been set to '),
          createMetricInfoTextPart(formatMetricInfoNumber(goalValue), { bold: true }),
          createMetricInfoTextPart(' to present a '),
          createMetricInfoTextPart(formatMetricInfoPercent(challengePercent), { bold: true }),
          createMetricInfoTextPart(' challenge.')
        ]
      }
      : {
        bullet: true,
        parts: [
          createMetricInfoTextPart('Based on the ARIMA model, the expected value is '),
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

export {
  DEFAULT_METRIC_INFO,
  METRIC_INFO,
  appendMetricInfo,
  buildNmfrMetricInfo
};
