import { parseBusinessUnitFilterToken } from './hierarchyFilterUtils.js';

const label = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().replace(/^DS\s+/i, '');
const key = (value) => label(value).toLowerCase();

function groupingLookup(groups) {
  const lookup = new Map();
  for (const entry of groups) {
    const group = label(entry.group);
    if (!group) continue;
    for (const original of entry.originals ?? []) lookup.set(key(original), group);
  }
  // Group titles take precedence over originals that happen to share a title.
  for (const entry of groups) {
    const group = label(entry.group);
    if (group) lookup.set(key(group), group);
  }
  return lookup;
}

export function getBuGroupOptions(groups, options) {
  const lookup = groupingLookup(groups);
  const names = new Map();
  for (const value of [...groups.map((entry) => entry.group), ...options]) {
    const name = lookup.get(key(value)) ?? label(value);
    if (name) names.set(key(name), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function canonicalizeBuGroupSelections(values, groups, hierarchy) {
  const lookup = groupingLookup(groups);
  const selections = [];
  for (const value of values) {
    const parsed = parseBusinessUnitFilterToken(value);
    if (parsed.type === 'division') {
      const entry = hierarchy.find((entry) => key(entry.division) === key(parsed.division));
      if (entry) {
        selections.push(...entry.businessUnits.map((name) => lookup.get(key(name)) ?? label(name)));
      } else {
        // Retain saved division selections until their dataset has loaded.
        selections.push(value);
      }
    } else {
      const name = parsed.businessUnit || parsed.label;
      selections.push(lookup.get(key(name)) ?? label(name));
    }
  }
  return [...new Set(selections.filter(Boolean))];
}
