import fs from 'node:fs/promises';

function replaceExactly(source, oldText, newText, label) {
  const firstIndex = source.indexOf(oldText);

  if (firstIndex === -1) {
    throw new Error(`Unable to find ${label}.`);
  }

  if (source.indexOf(oldText, firstIndex + oldText.length) !== -1) {
    throw new Error(`Found ${label} more than once; refusing ambiguous patch.`);
  }

  return `${source.slice(0, firstIndex)}${newText}${source.slice(firstIndex + oldText.length)}`;
}

const hierarchyPath = new URL('./client/src/HierarchyFilters.jsx', import.meta.url);
let hierarchySource = await fs.readFile(hierarchyPath, 'utf8');

hierarchySource = replaceExactly(
  hierarchySource,
`  makeChildToken,\n  getTokenLabel,\n  loading = false,\n  warning = ''\n}) {`,
`  makeChildToken,\n  getTokenLabel,\n  loading = false,\n  warning = '',\n  flat = false\n}) {`,
  'HierarchyFilter props'
);

hierarchySource = replaceExactly(
  hierarchySource,
`    <div className="hierarchy-filter" ref={rootRef}>`,
`    <div className={\`hierarchy-filter\${flat ? ' hierarchy-filter-flat' : ''}\`} ref={rootRef}>`,
  'HierarchyFilter root class'
);

hierarchySource += `\n\nexport function FlatCheckboxFilter({\n  options = [],\n  value = [],\n  onChange,\n  allLabel = 'All options',\n  inputId = 'global-filter-flat',\n  ariaLabel = 'Filter dashboard',\n  menuAriaLabel = 'Filter options',\n  searchPlaceholder = 'Search options',\n  searchAriaLabel = 'Search options'\n}) {\n  const normalizedOptions = useMemo(() => [...new Set(\n    (Array.isArray(options) ? options : [])\n      .map(normalizeLabel)\n      .filter(Boolean)\n  )].sort((left, right) => left.localeCompare(right)), [options]);\n\n  const optionByKey = useMemo(\n    () => new Map(normalizedOptions.map((option) => [normalizeKey(option), option])),\n    [normalizedOptions]\n  );\n\n  const canonicalValue = useMemo(() => [...new Set(\n    (Array.isArray(value) ? value : [])\n      .map((selectedValue) => {\n        const normalizedValue = normalizeLabel(selectedValue);\n        return optionByKey.get(normalizeKey(normalizedValue)) ?? normalizedValue;\n      })\n      .filter(Boolean)\n  )], [value, optionByKey]);\n\n  const entries = useMemo(\n    () => normalizedOptions.map((option) => ({ parent: option, children: [] })),\n    [normalizedOptions]\n  );\n\n  return (\n    <HierarchyFilter\n      entries={entries}\n      value={canonicalValue}\n      onChange={onChange}\n      allLabel={allLabel}\n      inputId={inputId}\n      ariaLabel={ariaLabel}\n      menuAriaLabel={menuAriaLabel}\n      searchPlaceholder={searchPlaceholder}\n      searchAriaLabel={searchAriaLabel}\n      makeParentToken={(entry) => entry.parent}\n      makeChildToken={() => ''}\n      getTokenLabel={(token) => normalizeLabel(token)}\n      flat\n    />\n  );\n}\n`;

await fs.writeFile(hierarchyPath, hierarchySource);

const cssPath = new URL('./client/src/hierarchyFilter.css', import.meta.url);
let cssSource = await fs.readFile(cssPath, 'utf8');
cssSource += `\n\n/* Flat mode uses the same control/menu as the hierarchical filters without parent indentation. */\n.hierarchy-filter-flat .hierarchy-filter-group-row {\n  grid-template-columns: minmax(0, 1fr);\n  padding-left: 0.65rem;\n}\n\n.hierarchy-filter-flat .hierarchy-filter-expand {\n  display: none;\n}\n\n.hierarchy-filter-flat .hierarchy-filter-group-name {\n  font-weight: 600;\n}\n`;
await fs.writeFile(cssPath, cssSource);

const appPath = new URL('./client/src/App.jsx', import.meta.url);
let appSource = await fs.readFile(appPath, 'utf8');

appSource = replaceExactly(
  appSource,
`import {\n  BusinessUnitHierarchyFilter,\n  FacilityHierarchyFilter\n} from './HierarchyFilters';`,
`import {\n  BusinessUnitHierarchyFilter,\n  FacilityHierarchyFilter,\n  FlatCheckboxFilter\n} from './HierarchyFilters';`,
  'hierarchy filter imports'
);

appSource = replaceExactly(
  appSource,
`  businessUnitHierarchy = []\n}) {\n  if (dimension.key === 'facility') {`,
`  businessUnitHierarchy = []\n}) {\n  if (dimension.key === 'division') {\n    return (\n      <div className="global-filter-field">\n        <label className="global-filter-field-label" htmlFor={\`global-filter-\${dimension.key}\`}>\n          {dimension.label}\n        </label>\n        <FlatCheckboxFilter\n          inputId={\`global-filter-\${dimension.key}\`}\n          options={options}\n          value={value}\n          allLabel={dimension.allLabel}\n          ariaLabel="Filter dashboard by Division"\n          menuAriaLabel="Divisions"\n          searchPlaceholder="Search divisions"\n          searchAriaLabel="Search divisions"\n          onChange={onChange}\n        />\n      </div>\n    );\n  }\n\n  if (dimension.key === 'facility') {`,
  'Division filter branch'
);

await fs.writeFile(appPath, appSource);
