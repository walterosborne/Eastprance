import { useEffect, useMemo, useRef, useState } from 'react';
import {
  makeFacilityGroupToken,
  makeFacilityOriginalToken,
  parseFacilityFilterToken
} from './facilityFilterUtils';
import './facilityHierarchyFilter.css';

function normalizeLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeLabel(value).toLowerCase();
}

function mergeGroups(mappedGroups, fallbackGroups) {
  const groupsByKey = new Map();

  (Array.isArray(mappedGroups) ? mappedGroups : []).forEach((entry) => {
    const group = normalizeLabel(entry?.group);

    if (!group) {
      return;
    }

    groupsByKey.set(normalizeKey(group), {
      group,
      originals: [...new Set(
        (Array.isArray(entry?.originals) ? entry.originals : [])
          .map(normalizeLabel)
          .filter(Boolean)
      )].sort((left, right) => left.localeCompare(right))
    });
  });

  (Array.isArray(fallbackGroups) ? fallbackGroups : []).forEach((groupValue) => {
    const group = normalizeLabel(groupValue);
    const key = normalizeKey(group);

    if (group && !groupsByKey.has(key)) {
      groupsByKey.set(key, { group, originals: [] });
    }
  });

  return [...groupsByKey.values()].sort((left, right) => left.group.localeCompare(right.group));
}

function canonicalizeSelections(values, groups) {
  const groupByKey = new Map(groups.map((entry) => [normalizeKey(entry.group), entry.group]));
  const originalByKey = new Map();

  groups.forEach((entry) => {
    entry.originals.forEach((original) => {
      originalByKey.set(normalizeKey(original), original);
    });
  });

  return [...new Set((Array.isArray(values) ? values : []).map((value) => {
    const parsed = parseFacilityFilterToken(value);

    if (parsed.type === 'group') {
      return makeFacilityGroupToken(parsed.label);
    }

    if (parsed.type === 'original') {
      return makeFacilityOriginalToken(parsed.label);
    }

    const normalized = normalizeKey(parsed.label);

    if (groupByKey.has(normalized)) {
      return makeFacilityGroupToken(groupByKey.get(normalized));
    }

    if (originalByKey.has(normalized)) {
      return makeFacilityOriginalToken(originalByKey.get(normalized));
    }

    // Old saved values that no longer exist in the mapping remain usable as a flat group.
    return makeFacilityGroupToken(parsed.label);
  }).filter(Boolean))];
}

function setIndeterminate(element, indeterminate) {
  if (element) {
    element.indeterminate = indeterminate;
  }
}

export default function FacilityHierarchyFilter({
  options = [],
  value = [],
  onChange,
  allLabel = 'All facilities',
  inputId = 'global-filter-facility'
}) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [mappedGroups, setMappedGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isCancelled = false;

    async function loadGroupings() {
      try {
        const response = await fetch('/api/facility-groupings');

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();

        if (!isCancelled) {
          setMappedGroups(Array.isArray(payload?.groups) ? payload.groups : []);
          setLoadError('');
        }
      } catch (error) {
        if (!isCancelled) {
          // Keep the filter usable with the group values already present in card data.
          setMappedGroups([]);
          setLoadError(error?.message || 'Unable to load facility groupings.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadGroupings();

    return () => {
      isCancelled = true;
    };
  }, []);

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

  const groups = useMemo(
    () => mergeGroups(mappedGroups, options),
    [mappedGroups, options]
  );
  const canonicalValue = useMemo(
    () => canonicalizeSelections(value, groups),
    [value, groups]
  );
  const selectedSet = useMemo(() => new Set(canonicalValue), [canonicalValue]);
  const normalizedSearch = normalizeKey(searchText);
  const visibleGroups = useMemo(() => {
    if (!normalizedSearch) {
      return groups;
    }

    return groups
      .map((entry) => {
        const groupMatches = normalizeKey(entry.group).includes(normalizedSearch);
        const matchingOriginals = entry.originals.filter((original) =>
          normalizeKey(original).includes(normalizedSearch)
        );

        if (!groupMatches && matchingOriginals.length === 0) {
          return null;
        }

        return {
          ...entry,
          visibleOriginals: groupMatches ? entry.originals : matchingOriginals
        };
      })
      .filter(Boolean);
  }, [groups, normalizedSearch]);

  const emitChange = (nextValues) => {
    onChange?.([...new Set(nextValues)]);
  };

  const toggleGroup = (entry) => {
    const groupToken = makeFacilityGroupToken(entry.group);
    const childTokens = entry.originals.map(makeFacilityOriginalToken);
    const nextSet = new Set(canonicalValue);

    if (nextSet.has(groupToken)) {
      nextSet.delete(groupToken);
    } else {
      childTokens.forEach((token) => nextSet.delete(token));
      nextSet.add(groupToken);
    }

    emitChange([...nextSet]);
  };

  const toggleOriginal = (entry, original) => {
    const groupToken = makeFacilityGroupToken(entry.group);
    const childTokens = entry.originals.map(makeFacilityOriginalToken);
    const originalToken = makeFacilityOriginalToken(original);
    const nextSet = new Set(canonicalValue);

    if (nextSet.has(groupToken)) {
      nextSet.delete(groupToken);
      childTokens.forEach((token) => {
        if (token !== originalToken) {
          nextSet.add(token);
        }
      });
      emitChange([...nextSet]);
      return;
    }

    if (nextSet.has(originalToken)) {
      nextSet.delete(originalToken);
    } else {
      nextSet.add(originalToken);
    }

    const allChildrenSelected = childTokens.length > 0
      && childTokens.every((token) => nextSet.has(token));

    if (allChildrenSelected) {
      childTokens.forEach((token) => nextSet.delete(token));
      nextSet.add(groupToken);
    }

    emitChange([...nextSet]);
  };

  const summary = (() => {
    if (canonicalValue.length === 0) {
      return allLabel;
    }

    if (canonicalValue.length === 1) {
      return parseFacilityFilterToken(canonicalValue[0]).label || allLabel;
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
          aria-label="Filter dashboard by Facility"
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
            aria-label="Clear facility filter"
            title="Clear facility filter"
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
        <div className="facility-hierarchy-menu" role="tree" aria-label="Facility groups">
          <div className="facility-hierarchy-search-wrap">
            <input
              type="search"
              className="facility-hierarchy-search"
              value={searchText}
              placeholder="Search groups or facilities"
              aria-label="Search facility groups"
              autoFocus
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <div className="facility-hierarchy-list">
            {visibleGroups.map((entry) => {
              const groupToken = makeFacilityGroupToken(entry.group);
              const childTokens = entry.originals.map(makeFacilityOriginalToken);
              const groupSelected = selectedSet.has(groupToken);
              const selectedChildCount = childTokens.filter((token) => selectedSet.has(token)).length;
              const groupIndeterminate = !groupSelected && selectedChildCount > 0;
              const expanded = expandedGroups.has(entry.group);
              const showChildren = normalizedSearch ? true : expanded;
              const originalsToRender = entry.visibleOriginals ?? entry.originals;

              return (
                <div className="facility-hierarchy-group" key={entry.group} role="treeitem" aria-expanded={entry.originals.length > 0 ? showChildren : undefined}>
                  <div className="facility-hierarchy-group-row">
                    <button
                      type="button"
                      className={`facility-hierarchy-expand${entry.originals.length === 0 ? ' facility-hierarchy-expand-empty' : ''}`}
                      aria-label={`${showChildren ? 'Collapse' : 'Expand'} ${entry.group}`}
                      disabled={entry.originals.length === 0}
                      onClick={() => {
                        setExpandedGroups((currentGroups) => {
                          const nextGroups = new Set(currentGroups);

                          if (nextGroups.has(entry.group)) {
                            nextGroups.delete(entry.group);
                          } else {
                            nextGroups.add(entry.group);
                          }

                          return nextGroups;
                        });
                      }}
                    >
                      {entry.originals.length > 0 ? (showChildren ? '−' : '+') : ''}
                    </button>
                    <label className="facility-hierarchy-group-label">
                      <input
                        type="checkbox"
                        checked={groupSelected}
                        ref={(element) => setIndeterminate(element, groupIndeterminate)}
                        onChange={() => toggleGroup(entry)}
                      />
                      <span className="facility-hierarchy-group-name">{entry.group}</span>
                      {entry.originals.length > 0 ? (
                        <span className="facility-hierarchy-count">{entry.originals.length}</span>
                      ) : null}
                    </label>
                  </div>

                  {showChildren && entry.originals.length > 0 ? (
                    <div className="facility-hierarchy-children" role="group">
                      {originalsToRender.map((original) => {
                        const originalToken = makeFacilityOriginalToken(original);
                        const checked = groupSelected || selectedSet.has(originalToken);

                        return (
                          <label className="facility-hierarchy-child" key={original} role="treeitem">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOriginal(entry, original)}
                            />
                            <span>{original}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!loading && visibleGroups.length === 0 ? (
              <div className="facility-hierarchy-empty">No matches</div>
            ) : null}
            {loading ? (
              <div className="facility-hierarchy-empty">Loading facilities…</div>
            ) : null}
          </div>

          {loadError ? (
            <div className="facility-hierarchy-warning">
              Group details unavailable; group-level filtering still works.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
