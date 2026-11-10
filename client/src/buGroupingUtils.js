import {
  makeBusinessUnitChildToken,
  makeBusinessUnitDivisionToken,
  makeBusinessUnitOtherToken,
  parseBusinessUnitFilterToken
} from './hierarchyFilterUtils.js';

const label = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().replace(/^DS\s+/i, '');
const key = (value) => label(value).toLowerCase();

function groupingLookup(groups) {
  const lookup = new Map();
  for (const entry of groups) {
    const group = label(entry.group);
    if (!group) continue;
    for (const original of entry.originals ?? []) lookup.set(key(original), group);
  }
  for (const entry of groups) {
    const group = label(entry.group);
    if (group) lookup.set(key(group), group);
  }
  return lookup;
}

export function buildBuDivisionEntries(hierarchy) {
  return hierarchy.map((entry) => {
    const parent = label(entry.division);
    const mapped = [...new Map((entry.mappedBusinessUnits ?? [])
      .map((name) => [key(name), label(name)]).filter(([name]) => name)).values()]
      .sort((a, b) => a.localeCompare(b));
    const hasUnmapped = (entry.unmappedBusinessUnits ?? []).length > 0;
    return {
      parent,
      label: mapped.length ? parent : `${parent} (All)`,
      children: mapped.length ? [...mapped, ...(hasUnmapped ? ['Other'] : [])] : [],
      hasUnmapped,
      unmappedBusinessUnits: entry.unmappedBusinessUnits ?? []
    };
  }).sort((a, b) => a.parent.localeCompare(b.parent));
}

export function makeBuEntryChildToken(entry, child) {
  return child === 'Other' && entry.hasUnmapped
    ? makeBusinessUnitOtherToken(entry.parent)
    : makeBusinessUnitChildToken(entry.parent, child);
}

export function canonicalizeBuGroupSelections(values, groups, hierarchy) {
  const lookup = groupingLookup(groups);
  const entries = buildBuDivisionEntries(hierarchy);
  const selections = [];
  for (const value of values) {
    const parsed = parseBusinessUnitFilterToken(value);
    if (parsed.type === 'division') {
      selections.push(makeBusinessUnitDivisionToken(label(parsed.division)));
      continue;
    }
    const name = parsed.businessUnit || parsed.label;
    const group = lookup.get(key(name)) ?? label(name);
    let matched = false;
    for (const entry of entries) {
      if (parsed.division && key(parsed.division) !== key(entry.parent)) continue;
      const child = entry.children.find((candidate) => key(candidate) === key(group));
      if (parsed.type === 'other') {
        selections.push(entry.children.length
          ? makeBusinessUnitOtherToken(entry.parent)
          : makeBusinessUnitDivisionToken(entry.parent));
        matched = true;
      } else if (child) {
        selections.push(makeBuEntryChildToken(entry, child));
        matched = true;
      } else if (entry.unmappedBusinessUnits.some((original) => key(original) === key(name))) {
        selections.push(entry.children.length
          ? makeBusinessUnitOtherToken(entry.parent)
          : makeBusinessUnitDivisionToken(entry.parent));
        matched = true;
      }
    }
    // Preserve saved selections until their division data has loaded.
    if (!matched) selections.push(value);
  }
  return [...new Set(selections.filter(Boolean))];
}
