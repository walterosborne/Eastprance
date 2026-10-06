import fs from 'node:fs/promises';

function replaceExactly(source, oldText, newText, label) {
  const firstIndex = source.indexOf(oldText);

  if (firstIndex === -1) {
    throw new Error(`Unable to find ${label}.`);
  }

  if (source.indexOf(oldText, firstIndex + oldText.length) !== -1) {
    throw new Error(`Found ${label} more than once; refusing an ambiguous patch.`);
  }

  return `${source.slice(0, firstIndex)}${newText}${source.slice(firstIndex + oldText.length)}`;
}

const appPath = new URL('../client/src/App.jsx', import.meta.url);
const indexPath = new URL('../server/index.js', import.meta.url);

let appSource = await fs.readFile(appPath, 'utf8');
let indexSource = await fs.readFile(indexPath, 'utf8');

appSource = replaceExactly(
  appSource,
  "import { SITE_BRANDING } from './siteBranding';",
  "import { SITE_BRANDING } from './siteBranding';\nimport FacilityHierarchyFilter from './FacilityHierarchyFilter';\nimport { facilityFilterMatches } from './facilityFilterUtils';",
  'App facility filter imports'
);

appSource = replaceExactly(
  appSource,
`      return [
        key,
        Array.isArray(availableOptions)
          ? selectedValues.filter((selectedValue) => availableOptions.includes(selectedValue))
          : selectedValues
      ];`,
`      const normalizedSelectedValues = key === 'facility'
        ? selectedValues
        : Array.isArray(availableOptions)
          ? selectedValues.filter((selectedValue) => availableOptions.includes(selectedValue))
          : selectedValues;

      return [key, normalizedSelectedValues];`,
  'global filter normalization block'
);

appSource = replaceExactly(
  appSource,
"      return selectedValues.includes(normalizeDimensionValue(key, row?.[fieldName]));",
`      const normalizedRowValue = normalizeDimensionValue(key, row?.[fieldName]);

      if (key === 'facility') {
        const originalFacilityValue = normalizeDimensionValue(
          key,
          row?.__facility_original ?? row?.[fieldName]
        );

        return selectedValues.some((selectedValue) =>
          facilityFilterMatches(selectedValue, normalizedRowValue, originalFacilityValue)
        );
      }

      return selectedValues.includes(normalizedRowValue);`,
  'facility-aware global filter match'
);

appSource = replaceExactly(
  appSource,
`function GlobalFilterField({ dimension, options, value, onChange }) {
  const selectOptions = options.map((option) => ({`,
`function GlobalFilterField({ dimension, options, value, onChange }) {
  if (dimension.key === 'facility') {
    return (
      <div className="global-filter-field">
        <label className="global-filter-field-label" htmlFor={\`global-filter-\${dimension.key}\`}>
          {dimension.label}
        </label>
        <FacilityHierarchyFilter
          inputId={\`global-filter-\${dimension.key}\`}
          options={options}
          value={value}
          allLabel={dimension.allLabel}
          onChange={onChange}
        />
      </div>
    );
  }

  const selectOptions = options.map((option) => ({`,
  'GlobalFilterField facility branch'
);

indexSource = replaceExactly(
  indexSource,
  "import { applyFacilityGroupingsToPayload } from './facilityGroupingsRepository.js';",
`import {
  applyFacilityGroupingsToPayload,
  readFacilityGroupingHierarchy
} from './facilityGroupingsRepository.js';`,
  'facility grouping server imports'
);

indexSource = replaceExactly(
  indexSource,
"app.get('/api/health', (_request, response) => {",
`app.get('/api/facility-groupings', async (request, response) => {
  await sendDatasetResponse(
    request,
    response,
    'facility-groupings',
    readFacilityGroupingHierarchy,
    'Unable to read facility groupings.'
  );
});

app.get('/api/health', (_request, response) => {`,
  'facility groupings endpoint insertion'
);

await fs.writeFile(appPath, appSource);
await fs.writeFile(indexPath, indexSource);
