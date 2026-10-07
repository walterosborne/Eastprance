const FACILITY_GROUP_PREFIX = '__qmi_facility_group__:';
const FACILITY_ORIGINAL_PREFIX = '__qmi_facility_original__:';
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

export function makeFacilityGroupToken(group) {
  return `${FACILITY_GROUP_PREFIX}${String(group ?? '').trim()}`;
}

export function makeFacilityOriginalToken(original) {
  return `${FACILITY_ORIGINAL_PREFIX}${String(original ?? '').trim()}`;
}

export function parseFacilityFilterToken(value) {
  const text = String(value ?? '').trim();

  if (text.startsWith(FACILITY_GROUP_PREFIX)) {
    return {
      type: 'group',
      label: text.slice(FACILITY_GROUP_PREFIX.length)
    };
  }

  if (text.startsWith(FACILITY_ORIGINAL_PREFIX)) {
    return {
      type: 'original',
      label: text.slice(FACILITY_ORIGINAL_PREFIX.length)
    };
  }

  return {
    type: 'legacy',
    label: text
  };
}

export function facilityFilterMatches(selectedValue, groupValue, originalValue) {
  const selection = parseFacilityFilterToken(selectedValue);
  const normalizedSelection = normalizeComparable(selection.label);
  const normalizedGroup = normalizeComparable(groupValue);
  const normalizedOriginal = normalizeComparable(originalValue);

  if (!normalizedSelection) {
    return false;
  }

  if (selection.type === 'group') {
    return normalizedSelection === normalizedGroup;
  }

  if (selection.type === 'original') {
    return normalizedSelection === normalizedOriginal;
  }

  return normalizedSelection === normalizedGroup || normalizedSelection === normalizedOriginal;
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

  return normalizeComparable(selection.businessUnit) === normalizedBusinessUnit;
}
