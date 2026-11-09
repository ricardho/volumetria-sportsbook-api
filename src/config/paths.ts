import * as path from 'path';

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** Cada sessão vive em sua própria pasta autocontida (login + fixtures + resultados). Git-ignored. */
export const SESSIONS_ROOT = path.join(PROJECT_ROOT, '.sessions');

export const SAMPLES_DIR = path.join(PROJECT_ROOT, 'data', 'samples');
export const RAW_FIXTURES_DIR = path.join(PROJECT_ROOT, 'data', 'raw-fixtures');
