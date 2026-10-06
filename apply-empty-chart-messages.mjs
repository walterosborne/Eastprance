import fs from 'node:fs/promises';

const appPath = new URL('./client/src/App.jsx', import.meta.url);
let source = await fs.readFile(appPath, 'utf8');

function replaceRequired(oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`Unable to find ${label}.`);
  }
  source = source.replace(oldText, newText);
}

function replaceAllRequired(oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`Unable to find ${label}.`);
  }
  source = source.split(oldText).join(newText);
}

// Make graph empty states user-facing rather than describing implementation rows.
const messageReplacements = [
  ['No controllable cost rows are available for charting.', 'No controllable costs are available for charting.'],
  ['No controllable cost rows match the selected filters.', 'No controllable costs were found for the selected filters.'],
  ['No controllable cost rows fall within the selected date range.', 'No controllable costs were found in the selected date range.'],
  ['No HANA cost rows are available for charting.', 'No HANA costs are available for charting.'],
  ['No HANA cost rows match the selected filters.', 'No HANA costs were found for the selected filters.'],
  ['No HANA cost rows fall within the selected date range.', 'No HANA costs were found in the selected date range.'],
  ['No Defense SIF rows are available for charting.', 'No SIFs are available for charting.'],
  ['No Defense SIF rows match the selected filters.', 'No SIFs were found for the selected criteria.'],
  ['No Defense SIF rows fall within the selected date range.', 'No SIFs were found in the selected date range.'],
  ['No Defense potential SIF rows are available for charting.', 'No pSIFs are available for charting.'],
  ['No Defense potential SIF rows match the selected filters.', 'No pSIFs were found for the selected criteria.'],
  ['No Defense potential SIF rows fall within the selected date range.', 'No pSIFs were found in the selected date range.'],
  ['No Defense NMFR rows are available for charting.', 'No near-miss data are available for charting.'],
  ['No Defense NMFR rows match the selected filters.', 'No near misses were found for the selected filters.'],
  ['No Defense NMFR rows fall within the selected date range.', 'No near misses were found in the selected date range.'],
  ['No OTD rows are available for charting.', 'No OTD data are available for charting.'],
  ['No OTD rows match the selected filters.', 'No OTD data were found for the selected filters.'],
  ['No labor rows are available for charting.', 'No labor data are available for charting.'],
  ['No labor rows match the selected filters.', 'No labor data were found for the selected filters.'],
  ['No labor utilization rows are available for charting.', 'No labor utilization data are available for charting.'],
  ['No labor rows fall within the selected date range.', 'No labor data were found in the selected date range.'],
  ['No Labor Direct or Labor Indirect rows are available to chart.', 'No Labor Direct or Labor Indirect data are available to chart.'],
  ['No HANA labor rows are available for charting.', 'No HANA labor data are available for charting.'],
  ['No HANA labor rows match the selected filters.', 'No HANA labor data were found for the selected filters.']
];

for (const [oldText, newText] of messageReplacements) {
  replaceAllRequired(oldText, newText, oldText);
}

// A SIF/pSIF chart with all-zero buckets is not useful; show the empty-state message instead.
replaceRequired(
  '  const sifForecastCalculation = useCalculatedMetricGoalLine({',
  `  const sifHasIncidents = sifChartData.some((bucket) => Number(bucket.total) > 0);\n  const sifForecastCalculation = useCalculatedMetricGoalLine({`,
  'SIF forecast calculation'
);
replaceRequired(
  '  const potentialSifForecastCalculation = useCalculatedMetricGoalLine({',
  `  const potentialSifHasIncidents = potentialSifChartData.some((bucket) => Number(bucket.total) > 0);\n  const potentialSifForecastCalculation = useCalculatedMetricGoalLine({`,
  'pSIF forecast calculation'
);

replaceRequired(
  ': sifChartData.length > 0) &&',
  ': sifChartData.length > 0 && sifHasIncidents) &&',
  'SIF chart render condition'
);
replaceRequired(
  ': potentialSifChartData.length > 0) &&',
  ': potentialSifChartData.length > 0 && potentialSifHasIncidents) &&',
  'pSIF chart render condition'
);
replaceRequired(
  ': globallyFilteredSifRows.length === 0)) && (',
  ': globallyFilteredSifRows.length === 0 || !sifHasIncidents)) && (',
  'SIF empty-state condition'
);
replaceRequired(
  ': globallyFilteredPotentialSifRows.length === 0)) && (',
  ': globallyFilteredPotentialSifRows.length === 0 || !potentialSifHasIncidents)) && (',
  'pSIF empty-state condition'
);

replaceRequired(
`                            {sifState.rows.length === 0
                              ? 'No SIFs are available for charting.'
                              : filteredSifRows.length === 0 && !isSifPareto && !isSifPalette
                                ? 'No SIFs were found for the selected criteria.'
                                : 'No SIFs were found in the selected date range.'}`,
`                            {sifState.rows.length === 0
                              ? 'No SIFs are available for charting.'
                              : !sifHasIncidents && !isSifPareto && !isSifPalette
                                ? 'No SIFs were found for the selected criteria.'
                                : filteredSifRows.length === 0 && !isSifPareto && !isSifPalette
                                  ? 'No SIFs were found for the selected criteria.'
                                  : 'No SIFs were found in the selected date range.'}`,
  'SIF empty-state message logic'
);
replaceRequired(
`                            {potentialSifState.rows.length === 0
                              ? 'No pSIFs are available for charting.'
                              : filteredPotentialSifRows.length === 0 && !isPotentialSifPareto && !isPotentialSifPalette
                                ? 'No pSIFs were found for the selected criteria.'
                                : 'No pSIFs were found in the selected date range.'}`,
`                            {potentialSifState.rows.length === 0
                              ? 'No pSIFs are available for charting.'
                              : !potentialSifHasIncidents && !isPotentialSifPareto && !isPotentialSifPalette
                                ? 'No pSIFs were found for the selected criteria.'
                                : filteredPotentialSifRows.length === 0 && !isPotentialSifPareto && !isPotentialSifPalette
                                  ? 'No pSIFs were found for the selected criteria.'
                                  : 'No pSIFs were found in the selected date range.'}`,
  'pSIF empty-state message logic'
);

await fs.writeFile(appPath, source);
