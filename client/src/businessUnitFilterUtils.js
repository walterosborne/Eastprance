const BUSINESS_UNIT_DIVISION_PREFIX = '__qmi_business_unit_division__:';
const BUSINESS_UNIT_CHILD_PREFIX = '__qmi_business_unit_child__:';

function normalizeComparable(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function encodePair(division, businessUnit) {
  return encodeURIComponent(JSON.stringify([
    String(division ?? '').trim(),
    String(businessUnit ?? '').trim()
  ]));
}

function decodePair(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value));

    if (!Array.isArray(parsed) || parsed.length !== 2) {
      return ['', ''];
    }

    return [String(parsed[0] ?? '').trim(), String(parsed[1] ?? '').trim()];
  } catch {
    return ['', ''];
  }
}

export function makeBusinessUnitDivisionToken(division) {
  return `${BUSINESS_UNIT_DIVISION_PREFIX}${String(division ?? '').trim()}`;
}

export function makeBusinessUnitChildToken(division, businessUnit) {
  return `${BUSINESS_UNIT_CHILD_PREFIX}${encodePair(division, businessUnit)}`;
}

export function parseBusinessUnitFilterToken(value) {
  const text = String(value ?? '').trim();

  if (text.startsWith(BUSINESS_UNIT_DIVISION_PREFIX)) {
    const division = text.slice(BUSINESS_UNIT_DIVISION_PREFIX.length).trim();

    return {
      type: 'division',
      division,
      businessUnit: '',
      label: division
    };
  }

  if (text.startsWith(BUSINESS_UNIT_CHILD_PREFIX)) {
    const [division, businessUnit] = decodePair(
      text.slice(BUSINESS_UNIT_CHILD_PREFIX.length)
    );

    return {
      type: 'businessUnit',
      division,
      businessUnit,
      label: businessUnit
    };
  }

  return {
    type: 'legacy',
    division: '',
    businessUnit: text,
    label: text
  };
}

export function businessUnitFilterMatches(selectedValue, divisionValue, businessUnitValue) {
  const selection = parseBusinessUnitFilterToken(selectedValue);
  const normalizedDivision = normalizeComparable(divisionValue);
  const normalizedBusinessUnit = normalizeComparable(businessUnitValue);

  if (selection.type === 'division') {
    return normalizeComparable(selection.division) === normalizedDivision;
  }

  if (selection.type === 'businessUnit') {
    const businessUnitMatches = normalizeComparable(selection.businessUnit) === normalizedBusinessUnit;
    const selectedDivision = normalizeComparable(selection.division);

    return businessUnitMatches
      && (!selectedDivision || selectedDivision === normalizedDivision);
  }

  // Backward-compatible behavior for presets saved before the hierarchical filter.
  return normalizeComparable(selection.businessUnit) === normalizedBusinessUnit;
}
