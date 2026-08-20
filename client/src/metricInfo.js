import { METRIC_INFO } from './metricInfoRaw.js';

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

function formatMetricInfoCurrency(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? `$${metricInfoNumberFormatter.format(numericValue)}`
    : 'Unavailable';
}

function parseMetricInfoInlineText(value) {
  const text = String(value ?? '');
  const parts = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let previousEnd = 0;
  let match;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > previousEnd) {
      parts.push({
        text: text.slice(previousEnd, match.index),
        bold: false
      });
    }

    parts.push({
      text: match[1],
      bold: true
    });
    previousEnd = boldPattern.lastIndex;
  }

  if (previousEnd < text.length) {
    parts.push({
      text: text.slice(previousEnd),
      bold: false
    });
  }

  return parts.length > 0 ? parts : [{ text, bold: false }];
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
  {
    explanation,
    forecastDescription = 'the ARIMA model',
    valueFormatter = formatMetricInfoNumber
  }
) {
  const status = String(goalLineDetails?.status ?? '').trim();
  const expectedValue = Number(goalLineDetails?.expectedValue);
  const averageValue = Number(goalLineDetails?.averageValue);
  const goalValue = Number(goalLineDetails?.goalValue);
  const challengePercent = Number(goalLineDetails?.challengePercent);
  const forecastMonthLabel = String(goalLineDetails?.forecastMonthLabel ?? '').trim();
  const observationCount = Number(goalLineDetails?.observationCount);
  const requiredObservations = Number(goalLineDetails?.requiredObservations);
  const timelineLabel = String(goalLineDetails?.timelineLabel ?? '').trim().toLowerCase();
  const selectedTimelineDescription = timelineLabel
    ? `selected ${timelineLabel} timeline`
    : 'current filtered timeline';
  const expectedValuePrefix = forecastMonthLabel
    ? `Based on ${forecastDescription}, the expected value for ${forecastMonthLabel} is `
    : `Based on ${forecastDescription}, the expected value for the next selected period is `;

  const methodExplanation = status === 'insufficient_data'
    ? {
      bullet: true,
      parts: [
        createMetricInfoTextPart('Calculated goals use ARIMA for '),
        createMetricInfoTextPart(`${formatMetricInfoNumber(requiredObservations)} or more`, {
          bold: true
        }),
        createMetricInfoTextPart(' valid timeline points, or average plus '),
        createMetricInfoTextPart('3%', { bold: true }),
        createMetricInfoTextPart(' for 1–9 points.')
      ]
    }
    : status === 'average_fallback'
    ? {
      bullet: true,
      parts: [
        createMetricInfoTextPart('ARIMA requires '),
        createMetricInfoTextPart(formatMetricInfoNumber(requiredObservations), { bold: true }),
        createMetricInfoTextPart(` datapoints. The ${selectedTimelineDescription} has `),
        createMetricInfoTextPart(formatMetricInfoNumber(observationCount), { bold: true }),
        createMetricInfoTextPart(', so the goal uses the average plus '),
        createMetricInfoTextPart(formatMetricInfoPercent(challengePercent), { bold: true }),
        createMetricInfoTextPart('.')
      ]
    }
    : {
      bullet: true,
      text: explanation
    };

  return appendMetricInfo(baseInfo, [
    methodExplanation,
    status === 'insufficient_data'
      ? {
        bullet: true,
        parts: [
          createMetricInfoTextPart('A goal line is not displayed because the '),
          createMetricInfoTextPart(selectedTimelineDescription),
          createMetricInfoTextPart(' has '),
          createMetricInfoTextPart(
            Number.isFinite(observationCount)
              ? `${formatMetricInfoNumber(observationCount)} valid datapoints`
              : 'no valid datapoints',
            { bold: true }
          ),
          createMetricInfoTextPart('; at least one is required.')
        ]
      }
      : status === 'average_fallback'
        && Number.isFinite(averageValue)
        && Number.isFinite(goalValue)
        && Number.isFinite(challengePercent)
      ? {
        bullet: true,
        parts: [
          createMetricInfoTextPart('The current average is '),
          createMetricInfoTextPart(valueFormatter(averageValue), { bold: true }),
          createMetricInfoTextPart(', and the goal line has been set to '),
          createMetricInfoTextPart(valueFormatter(goalValue), { bold: true }),
          createMetricInfoTextPart('.')
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
  const usedRecentBaseline = Boolean(goalLineDetails?.usedRecentBaseline);

  return buildArimaMetricInfo(baseInfo, goalLineDetails, {
    explanation: 'ARIMA projects the next percent-delivered value using completed months only. Forecasts more than 20 percentage points from the recent six-month median use that median before applying the stretch target.',
    forecastDescription: usedRecentBaseline
      ? 'the ARIMA model with its recent-performance safeguard'
      : 'the ARIMA model',
    valueFormatter: formatMetricInfoShare
  });
}

function buildLaborHanaMetricInfo(baseInfo, goalLineDetails = null) {
  return buildArimaMetricInfo(baseInfo, goalLineDetails, {
    explanation: 'ARIMA projects the next direct-labor-share value, then raises that forecast slightly to create a realistic stretch target.',
    valueFormatter: formatMetricInfoShare
  });
}

function buildControllableCostsMetricInfo(baseInfo, goalLineDetails = null) {
  return buildArimaMetricInfo(baseInfo, goalLineDetails, {
    explanation: 'ARIMA projects the next total-cost value, then lowers that forecast slightly to create a realistic stretch target.',
    valueFormatter: formatMetricInfoCurrency
  });
}

function buildLaborMetricInfo(baseInfo, goalLineDetails = null) {
  return buildArimaMetricInfo(baseInfo, goalLineDetails, {
    explanation: 'ARIMA projects the next direct-labor-share value, then raises that forecast slightly to create a realistic stretch target.',
    valueFormatter: formatMetricInfoShare
  });
}

export {
  DEFAULT_METRIC_INFO,
  METRIC_INFO,
  appendMetricInfo,
  buildControllableCostsMetricInfo,
  buildLaborMetricInfo,
  buildLaborHanaMetricInfo,
  buildNmfrMetricInfo,
  buildOtdMetricInfo,
  parseMetricInfoInlineText
};
