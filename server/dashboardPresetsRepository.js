import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import { executeDatabricksQuery } from './databricksQuery.js';

const DASHBOARD_PRESETS_TABLE_SQL = '`integrated_operations_dev`.`analytics`.`dashboard_presets`';
const MAX_PRESET_SLOT = 3;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function getPresetStorageUnavailableMessage(error) {
  if (/TABLE_OR_VIEW_NOT_FOUND|TABLE_NOT_FOUND/i.test(String(error?.message ?? ''))) {
    return 'Preset storage is unavailable because the Databricks dashboard_presets table has not been migrated yet.';
  }
  return `Preset storage is unavailable: ${error.message}`;
}

function normalizePresetRow(row) {
  let state = null;
  try {
    state = row.PresetState ? JSON.parse(row.PresetState) : null;
  } catch {
    state = null;
  }
  return {
    slot: Number(row.PresetSlot),
    name: normalizeText(row.PresetName),
    state,
    created_at: row.CreatedAt ?? null,
    updated_at: row.UpdatedAt ?? null
  };
}

function validatePresetSlot(slot) {
  const numericSlot = Number(slot);
  if (!Number.isInteger(numericSlot) || numericSlot < 1 || numericSlot > MAX_PRESET_SLOT) {
    throw new Error(`Preset slot must be an integer between 1 and ${MAX_PRESET_SLOT}.`);
  }
  return numericSlot;
}

function validatePresetState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('Preset state must be a JSON object.');
  }
  return state;
}

async function queryPresetsForUser(myId) {
  const rows = await executeDatabricksQuery({
    scope: 'presets',
    tableName: 'integrated_operations_dev.analytics.dashboard_presets',
    query: `
      SELECT PresetSlot, PresetName, PresetState, CreatedAt, UpdatedAt
      FROM ${DASHBOARD_PRESETS_TABLE_SQL}
      WHERE MyID = :myId
      ORDER BY PresetSlot ASC
    `,
    parameters: [{ name: 'myId', value: String(myId), type: 'STRING' }]
  });
  return rows.map(normalizePresetRow);
}

export async function readDashboardPresetsOverview(currentUser) {
  const stopTimer = createTimer();
  try {
    const presets = await queryPresetsForUser(currentUser.my_id);
    logDebug('presets', 'Dashboard presets loaded from Databricks.', {
      myId: currentUser.my_id,
      presetCount: presets.length,
      duration: formatDuration(stopTimer())
    });
    return { storageAvailable: true, storageMessage: '', presets };
  } catch (error) {
    logError('presets', 'Failed to load dashboard presets from Databricks.', error, {
      myId: currentUser.my_id,
      duration: formatDuration(stopTimer())
    });
    return {
      storageAvailable: false,
      storageMessage: getPresetStorageUnavailableMessage(error),
      presets: []
    };
  }
}

export async function saveDashboardPreset(currentUser, slot, name, state) {
  const stopTimer = createTimer();
  const presetSlot = validatePresetSlot(slot);
  const presetName = normalizeText(name) || `Preset ${presetSlot}`;
  const presetState = JSON.stringify(validatePresetState(state));

  try {
    // Delta MERGE updates one user's slot atomically and preserves CreatedAt.
    await executeDatabricksQuery({
      scope: 'presets',
      tableName: 'integrated_operations_dev.analytics.dashboard_presets',
      query: `
        MERGE INTO ${DASHBOARD_PRESETS_TABLE_SQL} AS target
        USING (
          SELECT :myId AS MyID, :networkId AS NetworkID, :userName AS UserName,
            :presetSlot AS PresetSlot, :presetName AS PresetName, :presetState AS PresetState,
            current_timestamp() AS CreatedAt, current_timestamp() AS UpdatedAt,
            current_timestamp() AS last_updated
        ) AS source
        ON target.MyID = source.MyID AND target.PresetSlot = source.PresetSlot
        WHEN MATCHED THEN UPDATE SET
          target.NetworkID = source.NetworkID,
          target.UserName = source.UserName,
          target.PresetName = source.PresetName,
          target.PresetState = source.PresetState,
          target.UpdatedAt = source.UpdatedAt,
          target.last_updated = source.last_updated
        WHEN NOT MATCHED THEN INSERT (
          MyID, NetworkID, UserName, PresetSlot, PresetName, PresetState,
          CreatedAt, UpdatedAt, last_updated
        ) VALUES (
          source.MyID, source.NetworkID, source.UserName, source.PresetSlot,
          source.PresetName, source.PresetState, source.CreatedAt, source.UpdatedAt,
          source.last_updated
        )
      `,
      parameters: [
        { name: 'myId', value: String(currentUser.my_id), type: 'STRING' },
        { name: 'networkId', value: normalizeText(currentUser.network_id), type: 'STRING' },
        { name: 'userName', value: normalizeText(currentUser.name), type: 'STRING' },
        { name: 'presetSlot', value: String(presetSlot), type: 'BIGINT' },
        { name: 'presetName', value: presetName, type: 'STRING' },
        { name: 'presetState', value: presetState, type: 'STRING' }
      ]
    });

    const presets = await queryPresetsForUser(currentUser.my_id);
    logDebug('presets', 'Dashboard preset saved to Databricks.', {
      myId: currentUser.my_id,
      slot: presetSlot,
      presetCount: presets.length,
      duration: formatDuration(stopTimer())
    });
    return {
      preset: presets.find((preset) => preset.slot === presetSlot) ?? null,
      presets
    };
  } catch (error) {
    logError('presets', 'Failed to save dashboard preset to Databricks.', error, {
      myId: currentUser.my_id,
      slot: presetSlot,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
