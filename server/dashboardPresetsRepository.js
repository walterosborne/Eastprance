import {
  createTimer,
  formatDuration,
  logDebug,
  logError
} from './debugLogger.js';
import {
  formatSqlIdentifier,
  getConnectionConfig,
  getPool
} from './sqlConnection.js';

const DASHBOARD_PRESETS_TABLE_NAME = 'westmarch_dashboard_presets';
const MAX_PRESET_SLOT = 3;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function isPresetTableMissingError(error) {
  return /invalid object name/i.test(String(error?.message ?? ''));
}

function getPresetStorageUnavailableMessage(error, missing) {
  if (Array.isArray(missing) && missing.length > 0) {
    return `Preset storage is unavailable because these database settings are missing: ${missing.join(', ')}.`;
  }

  if (isPresetTableMissingError(error)) {
    return `Preset storage is unavailable because ${DASHBOARD_PRESETS_TABLE_NAME} does not exist yet.`;
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

async function queryPresetsForUser(pool, myId) {
  const result = await pool
    .request()
    .input('myId', myId)
    .query(`
      SELECT
        [PresetSlot],
        [PresetName],
        [PresetState],
        [CreatedAt],
        [UpdatedAt]
      FROM ${formatSqlIdentifier(DASHBOARD_PRESETS_TABLE_NAME)}
      WHERE [MyID] = @myId
      ORDER BY [PresetSlot] ASC;
    `);

  return result.recordset.map(normalizePresetRow);
}

export async function readDashboardPresetsOverview(currentUser) {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();

  logDebug('presets', 'Loading dashboard presets overview.', {
    myId: currentUser.my_id,
    hasConnectionConfig: missing.length === 0,
    tableName: DASHBOARD_PRESETS_TABLE_NAME
  });

  if (missing.length > 0) {
    return {
      storageAvailable: false,
      storageMessage: getPresetStorageUnavailableMessage(null, missing),
      presets: []
    };
  }

  try {
    const pool = await getPool(config);
    const presets = await queryPresetsForUser(pool, currentUser.my_id);

    logDebug('presets', 'Dashboard presets overview loaded.', {
      myId: currentUser.my_id,
      presetCount: presets.length,
      duration: formatDuration(stopTimer())
    });

    return {
      storageAvailable: true,
      storageMessage: '',
      presets
    };
  } catch (error) {
    logError('presets', 'Failed to load dashboard presets overview.', error, {
      myId: currentUser.my_id,
      duration: formatDuration(stopTimer())
    });

    return {
      storageAvailable: false,
      storageMessage: getPresetStorageUnavailableMessage(error, []),
      presets: []
    };
  }
}

export async function saveDashboardPreset(currentUser, slot, name, state) {
  const stopTimer = createTimer();
  const { config, missing } = getConnectionConfig();
  const presetSlot = validatePresetSlot(slot);
  const presetName = normalizeText(name) || `Preset ${presetSlot}`;
  const presetState = JSON.stringify(validatePresetState(state));

  logDebug('presets', 'Saving dashboard preset.', {
    myId: currentUser.my_id,
    slot: presetSlot,
    tableName: DASHBOARD_PRESETS_TABLE_NAME
  });

  if (missing.length > 0) {
    throw new Error(getPresetStorageUnavailableMessage(null, missing));
  }

  try {
    const pool = await getPool(config);

    await pool
      .request()
      .input('myId', currentUser.my_id)
      .input('networkId', currentUser.network_id)
      .input('userName', currentUser.name)
      .input('presetSlot', presetSlot)
      .input('presetName', presetName)
      .input('presetState', presetState)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM ${formatSqlIdentifier(DASHBOARD_PRESETS_TABLE_NAME)}
          WHERE [MyID] = @myId
            AND [PresetSlot] = @presetSlot
        )
        BEGIN
          UPDATE ${formatSqlIdentifier(DASHBOARD_PRESETS_TABLE_NAME)}
          SET
            [NetworkID] = @networkId,
            [UserName] = @userName,
            [PresetName] = @presetName,
            [PresetState] = @presetState,
            [UpdatedAt] = SYSUTCDATETIME()
          WHERE [MyID] = @myId
            AND [PresetSlot] = @presetSlot;
        END
        ELSE
        BEGIN
          INSERT INTO ${formatSqlIdentifier(DASHBOARD_PRESETS_TABLE_NAME)} (
            [MyID],
            [NetworkID],
            [UserName],
            [PresetSlot],
            [PresetName],
            [PresetState],
            [CreatedAt],
            [UpdatedAt]
          )
          VALUES (
            @myId,
            @networkId,
            @userName,
            @presetSlot,
            @presetName,
            @presetState,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        END
      `);

    const presets = await queryPresetsForUser(pool, currentUser.my_id);

    logDebug('presets', 'Dashboard preset saved.', {
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
    logError('presets', 'Failed to save dashboard preset.', error, {
      myId: currentUser.my_id,
      slot: presetSlot,
      duration: formatDuration(stopTimer())
    });
    throw error;
  }
}
