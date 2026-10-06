import { useEffect, useMemo, useRef, useState } from 'react';
import {
  makeBusinessUnitChildToken,
  makeBusinessUnitDivisionToken,
  parseBusinessUnitFilterToken
} from './businessUnitFilterUtils';
import './facilityHierarchyFilter.css';

const FALLBACK_DIVISION_LABEL = 'Other / Unassigned';

function normalizeLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeLabel(value).toLowerCase();
}

function mergeHierarchy(hierarchy, fallbackBusinessUnits) {
  const divisionsByKey = new Map();
  const mappedBusinessUnitKeys = new Set();

  (Array.isArray(hierarchy) ? hierarchy : []).forEach((entry) => {
    const division = normalizeLabel(entry?.division);

    if (!division) {
      return;
    }

    const businessUnits = [...new Set(
      (Array.isArray(entry?.businessUnits) ? entry.businessUnits : [])
        .map(normalizeLabel)
        .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right));

    businessUnits.forEach((businessUnit) => mappedBusinessUnitKeys.add(normalizeKey(businessUnit)));
    divisionsByKey.set(normalizeKey(division), { division, businessUnits });
  });

  const fallbackBusinessUnitsFiltered = [...new Set(
    (Array.isArray(fallbackBusinessUnits) ? fallbackBusinessUnits : [])
      .map(normalizeLabel)
      .filter((businessUnit) => businessUnit && !mappedBusinessUnitKeys.has(normalizeKey(businessUnit)))
  )].sort((left, right) => left.localeCompare(right));

  if (fallbackBusinessUnitsFiltered.length > 0) {
    divisionsByKey.set('__fallback__', {
      division: FALLBACK_DIVISION_LABEL,
      businessUnits: fallbackBusinessUnitsFiltered,
      matchDivision: ''
    });
  }

  return [...divisionsByKey.values()].sort((left, right) =>
    left.division.localeCompare(right.division)
  );
}

function canonicalizeSelections(values, hierarchy) {
  const divisionByKey = new Map();
  const businessUnitLocations = new Map();

  hierarchy.forEach((entry) => {
    const matchDivision = entry.matchDivision ?? entry.division;
    divisionByKey.set(normalizeKey(entry.division), matchDivision);

    entry.businessUnits.forEach((businessUnit) => {
      const key = normalizeKey(businessUnit);
      const locations = businessUnitLocations.get(key) ?? [];
      locations.push({ division: matchDivision, businessUnit });
      businessUnitLocations.set(key, locations);
    });
  });

  const selections = [];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const parsed = parseBusinessUnitFilterToken(value);

    if (parsed.type === 'division') {
      selections.push(makeBusinessUnitDivisionToken(parsed.division));
      return;
    }

    if (parsed.type === 'businessUnit') {
      selections.push(makeBusinessUnitChildToken(parsed.division, parsed.businessUnit));
      return;
    }

    const matchingLocations = businessUnitLocations.get(normalizeKey(parsed.businessUnit)) ?? [];

    if (matchingLocations.length > 0) {
      matchingLocations.forEach(({ division, businessUnit }) => {
        selections.push(makeBusinessUnitChildToken(division, businessUnit));
      });
      return;
    }

    const matchingDivision = divisionByKey.get(normalizeKey(parsed.businessUnit));

    if (matchingDivision !== undefined) {
      selections.push(makeBusinessUnitDivisionToken(matchingDivision));
      return;
    }

    // Preserve unknown legacy values so older presets do not silently lose a filter.
    selections.push(value);
  });

  return [...new Set(selections.filter(Boolean))];
}

function setIndeterminate(element, indeterminate) {
  if (element) {
    element.indeterminate = indeterminate;
  }
}

export default function BusinessUnitHierarchyFilter({
  hierarchy = [],
  options = [],
  value = [],
  onChange,
  allLabel = 'All business units',
  inputId = 'global-filter-businessUnit'
}) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [expandedDivisions, setExpandedDivisions] = useState(() => new Set());

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const divisions = useMemo(
    () => mergeHierarchy(hierarchy, options),
    [hierarchy, options]
  );
  const canonicalValue = useMemo(
    () => canonicalizeSelections(value, divisions),
    [value, divisions]
  );
  const selectedSet = useMemo(() => new Set(canonicalValue), [canonicalValue]);
  const normalizedSearch = normalizeKey(searchText);
  const visibleDivisions = useMemo(() => {
    if (!normalizedSearch) {
      return divisions;
    }

    return divisions
      .map((entry) => {
        const divisionMatches = normalizeKey(entry.division).includes(normalizedSearch);
        const matchingBusinessUnits = entry.businessUnits.filter((businessUnit) =>
          normalizeKey(businessUnit).includes(normalizedSearch)
        );

        if (!divisionMatches && matchingBusinessUnits.length === 0) {
          return null;
        }

        return {
          ...entry,
          visibleBusinessUnits: divisionMatches ? entry.businessUnits : matchingBusinessUnits
        };
      })
      .filter(Boolean);
  }, [divisions, normalizedSearch]);

  const emitChange = (nextValues) => {
    onChange?.([...new Set(nextValues)]);
  };

  const toggleDivision = (entry) => {
    const matchDivision = entry.matchDivision ?? entry.division;
    const divisionToken = makeBusinessUnitDivisionToken(matchDivision);
    const childTokens = entry.businessUnits.map((businessUnit) =>
      makeBusinessUnitChildToken(matchDivision, businessUnit)
    );
    const nextSet = new Set(canonicalValue);

    if (nextSet.has(divisionToken)) {
      nextSet.delete(divisionToken);
    } else {
      childTokens.forEach((token) => nextSet.delete(token));
      nextSet.add(divisionToken);
    }

    emitChange([...nextSet]);
  };

  const toggleBusinessUnit = (entry, businessUnit) => {
    const matchDivision = entry.matchDivision ?? entry.division;
    const divisionToken = makeBusinessUnitDivisionToken(matchDivision);
    const childTokens = entry.businessUnits.map((candidateBusinessUnit) =>
      makeBusinessUnitChildToken(matchDivision, candidateBusinessUnit)
    );
    const businessUnitToken = makeBusinessUnitChildToken(matchDivision, businessUnit);
    const nextSet = new Set(canonicalValue);

    if (nextSet.has(divisionToken)) {
      nextSet.delete(divisionToken);
      childTokens.forEach((token) => {
        if (token !== businessUnitToken) {
          nextSet.add(token);
        }
      });
      emitChange([...nextSet]);
      return;
    }

    if (nextSet.has(businessUnitToken)) {
      nextSet.delete(businessUnitToken);
    } else {
      nextSet.add(businessUnitToken);
    }

    const allChildrenSelected = childTokens.length > 0
      && childTokens.every((token) => nextSet.has(token));

    if (allChildrenSelected) {
      childTokens.forEach((token) => nextSet.delete(token));
      nextSet.add(divisionToken);
    }

    emitChange([...nextSet]);
  };

  const summary = (() => {
    if (canonicalValue.length === 0) {
      return allLabel;
    }

    if (canonicalValue.length === 1) {
      return parseBusinessUnitFilterToken(canonicalValue[0]).label || allLabel;
    }

    return `${canonicalValue.length} selected`;
  })();

  return (
    <div className="facility-hierarchy-filter" ref={rootRef}>
      <div className="facility-hierarchy-control-wrap">
        <button
          id={inputId}
          type="button"
          className={`facility-hierarchy-control${isOpen ? ' facility-hierarchy-control-open' : ''}`}
          aria-haspopup="tree"
          aria-expanded={isOpen}
          aria-label="Filter dashboard by Business Unit"
          onClick={() => setIsOpen((currentValue) => !currentValue)}
        >
          <span className={`facility-hierarchy-summary${canonicalValue.length === 0 ? ' facility-hierarchy-summary-placeholder' : ''}`}>
            {summary}
          </span>
          <span className="facility-hierarchy-chevron" aria-hidden="true">⌄</span>
        </button>
        {canonicalValue.length > 0 ? (
          <button
            type="button"
            className="facility-hierarchy-clear"
            aria-label="Clear business unit filter"
            title="Clear business unit filter"
            onClick={(event) => {
              event.stopPropagation();
              emitChange([]);
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="facility-hierarchy-menu" role="tree" aria-label="Business units by division">
          <div className="facility-hierarchy-search-wrap">
            <input
              type="search"
              className="facility-hierarchy-search"
              value={searchText}
              placeholder="Search divisions or business units"
              aria-label="Search divisions or business units"
              autoFocus
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <div className="facility-hierarchy-list">
            {visibleDivisions.map((entry) => {
              const matchDivision = entry.matchDivision ?? entry.division;
              const divisionToken = makeBusinessUnitDivisionToken(matchDivision);
              const childTokens = entry.businessUnits.map((businessUnit) =>
                makeBusinessUnitChildToken(matchDivision, businessUnit)
              );
              const divisionSelected = selectedSet.has(divisionToken);
              const selectedChildCount = childTokens.filter((token) => selectedSet.has(token)).length;
              const divisionIndeterminate = !divisionSelected && selectedChildCount > 0;
              const expanded = expandedDivisions.has(entry.division);
              const showChildren = normalizedSearch ? true : expanded;
              const businessUnitsToRender = entry.visibleBusinessUnits ?? entry.businessUnits;

              return (
                <div
                  className="facility-hierarchy-group"
                  key={entry.division}
                  role="treeitem"
                  aria-expanded={entry.businessUnits.length > 0 ? showChildren : undefined}
                >
                  <div className="facility-hierarchy-group-row">
                    <button
                      type="button"
                      className={`facility-hierarchy-expand${entry.businessUnits.length === 0 ? ' facility-hierarchy-expand-empty' : ''}`}
                      aria-label={`${showChildren ? 'Collapse' : 'Expand'} ${entry.division}`}
                      disabled={entry.businessUnits.length === 0}
                      onClick={() => {
                        setExpandedDivisions((currentDivisions) => {
                          const nextDivisions = new Set(currentDivisions);

                          if (nextDivisions.has(entry.division)) {
                            nextDivisions.delete(entry.division);
                          } else {
                            nextDivisions.add(entry.division);
                          }

                          return nextDivisions;
                        });
                      }}
                    >
                      {entry.businessUnits.length > 0 ? (showChildren ? '−' : '+') : ''}
                    </button>
                    <label className="facility-hierarchy-group-label">
                      <input
                        type="checkbox"
                        checked={divisionSelected}
                        ref={(element) => setIndeterminate(element, divisionIndeterminate)}
                        onChange={() => toggleDivision(entry)}
                      />
                      <span className="facility-hierarchy-group-name">{entry.division}</span>
                      {entry.businessUnits.length > 0 ? (
                        <span className="facility-hierarchy-count">{entry.businessUnits.length}</span>
                      ) : null}
                    </label>
                  </div>

                  {showChildren && businessUnitsToRender.length > 0 ? (
                    <div className="facility-hierarchy-children" role="group">
                      {businessUnitsToRender.map((businessUnit) => {
                        const businessUnitToken = makeBusinessUnitChildToken(
                          matchDivision,
                          businessUnit
                        );
                        const businessUnitSelected = divisionSelected || selectedSet.has(businessUnitToken);

                        return (
                          <label className="facility-hierarchy-child" key={businessUnit}>
                            <input
                              type="checkbox"
                              checked={businessUnitSelected}
                              onChange={() => toggleBusinessUnit(entry, businessUnit)}
                            />
                            <span>{businessUnit}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {visibleDivisions.length === 0 ? (
              <div className="facility-hierarchy-empty">No matches</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
