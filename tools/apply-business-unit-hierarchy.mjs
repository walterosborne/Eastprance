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
let appSource = await fs.readFile(appPath, 'utf8');

appSource = replaceExactly(
  appSource,
`import FacilityHierarchyFilter from './FacilityHierarchyFilter';
import { facilityFilterMatches } from './facilityFilterUtils';`,
`import FacilityHierarchyFilter from './FacilityHierarchyFilter';
import BusinessUnitHierarchyFilter from './BusinessUnitHierarchyFilter';
import { facilityFilterMatches } from './facilityFilterUtils';
import { businessUnitFilterMatches } from './businessUnitFilterUtils';`,
  'hierarchy filter imports'
);

appSource = replaceExactly(
  appSource,
`function normalizeGlobalFilters(value, optionsByDimension = null) {`,
`function getBusinessUnitHierarchy(rowsByMetric) {
  const divisionsByKey = new Map();

  Object.entries(rowsByMetric).forEach(([metricKey, rows]) => {
    const metricFieldMap = GLOBAL_FILTER_FIELD_MAP[metricKey];
    const divisionFieldName = metricFieldMap?.division;
    const businessUnitFieldName = metricFieldMap?.businessUnit;

    if (!divisionFieldName || !businessUnitFieldName || !Array.isArray(rows)) {
      return;
    }

    rows.forEach((row) => {
      const division = normalizeDivisionValue(row?.[divisionFieldName]);
      const businessUnit = normalizeBusinessUnitValue(row?.[businessUnitFieldName]);

      if (!division || !businessUnit || isExcludedDivision(division)) {
        return;
      }

      const divisionKey = division.toLowerCase();
      const entry = divisionsByKey.get(divisionKey) ?? {
        division,
        businessUnits: new Set()
      };

      entry.businessUnits.add(businessUnit);
      divisionsByKey.set(divisionKey, entry);
    });
  });

  return [...divisionsByKey.values()]
    .map((entry) => ({
      division: entry.division,
      businessUnits: [...entry.businessUnits]
        .sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => left.division.localeCompare(right.division));
}

function normalizeGlobalFilters(value, optionsByDimension = null) {`,
  'business unit hierarchy helper insertion'
);

appSource = replaceExactly(
  appSource,
`      const normalizedSelectedValues = key === 'facility'
        ? selectedValues
        : Array.isArray(availableOptions)`,
`      const normalizedSelectedValues = key === 'facility' || key === 'businessUnit'
        ? selectedValues
        : Array.isArray(availableOptions)`,
  'hierarchical global-filter normalization'
);

appSource = replaceExactly(
  appSource,
`      if (key === 'facility') {
        const originalFacilityValue = normalizeDimensionValue(
          key,
          row?.__facility_original ?? row?.[fieldName]
        );

        return selectedValues.some((selectedValue) =>
          facilityFilterMatches(selectedValue, normalizedRowValue, originalFacilityValue)
        );
      }

      return selectedValues.includes(normalizedRowValue);`,
`      if (key === 'facility') {
        const originalFacilityValue = normalizeDimensionValue(
          key,
          row?.__facility_original ?? row?.[fieldName]
        );

        return selectedValues.some((selectedValue) =>
          facilityFilterMatches(selectedValue, normalizedRowValue, originalFacilityValue)
        );
      }

      if (key === 'businessUnit') {
        const normalizedDivision = divisionFieldName
          ? normalizeDivisionValue(row?.[divisionFieldName])
          : '';

        return selectedValues.some((selectedValue) =>
          businessUnitFilterMatches(selectedValue, normalizedDivision, normalizedRowValue)
        );
      }

      return selectedValues.includes(normalizedRowValue);`,
  'business-unit-aware global filter match'
);

appSource = replaceExactly(
  appSource,
`function GlobalFilterField({ dimension, options, value, onChange }) {`,
`function GlobalFilterField({
  dimension,
  options,
  value,
  onChange,
  businessUnitHierarchy = []
}) {`,
  'GlobalFilterField signature'
);

appSource = replaceExactly(
  appSource,
`  const selectOptions = options.map((option) => ({
    value: option,
    label: option
  }));`,
`  if (dimension.key === 'businessUnit') {
    return (
      <div className="global-filter-field">
        <label className="global-filter-field-label" htmlFor={\`global-filter-\${dimension.key}\`}>
          {dimension.label}
        </label>
        <BusinessUnitHierarchyFilter
          inputId={\`global-filter-\${dimension.key}\`}
          hierarchy={businessUnitHierarchy}
          options={options}
          value={value}
          allLabel={dimension.allLabel}
          onChange={onChange}
        />
      </div>
    );
  }

  const selectOptions = options.map((option) => ({
    value: option,
    label: option
  }));`,
  'Business Unit hierarchy branch'
);

appSource = replaceExactly(
  appSource,
`  const globalFilterOptions = Object.fromEntries(
    GLOBAL_FILTER_DIMENSIONS.map(({ key }) => [
      key,
      getGlobalFilterOptions(dashboardRowsByMetric, key)
    ])
  );
  const activeGlobalFilters = normalizeGlobalFilters(globalFilters, globalFilterOptions);`,
`  const globalFilterOptions = Object.fromEntries(
    GLOBAL_FILTER_DIMENSIONS.map(({ key }) => [
      key,
      getGlobalFilterOptions(dashboardRowsByMetric, key)
    ])
  );
  const businessUnitHierarchy = getBusinessUnitHierarchy(dashboardRowsByMetric);
  const activeGlobalFilters = normalizeGlobalFilters(globalFilters, globalFilterOptions);`,
  'business unit hierarchy calculation'
);

appSource = replaceExactly(
  appSource,
`                          options={globalFilterOptions[dimension.key]}
                          value={activeGlobalFilters[dimension.key]}`, 
`                          options={globalFilterOptions[dimension.key]}
                          businessUnitHierarchy={businessUnitHierarchy}
                          value={activeGlobalFilters[dimension.key]}`,
  'GlobalFilterField business unit hierarchy prop'
);

await fs.writeFile(appPath, appSource);
