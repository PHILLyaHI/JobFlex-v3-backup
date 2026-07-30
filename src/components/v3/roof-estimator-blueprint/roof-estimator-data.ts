// Roof estimator blueprint — demo fixture data, verbatim from the donor file
// jobflex-roof-estimator-blueprint_3.html (script section, "ROOF ESTIMATOR:
// ДАННЫЕ"). Values must not be edited independently of the donor: the page is a
// pixel-identical port, content included.

export type Sample = {
  id: number;
  label: string;
  detail: string;
};

/** Roof plane. `pts` are [x, y] pairs in feet. */
export type Face = {
  id: string;
  name: string;
  pitch: number;
  dir: string;
  pts: number[][];
};

/** Roof edge: `a` → `b`, [x, y] in feet. */
export type Edge = {
  type: string;
  a: number[];
  b: number[];
};

export const SAMPLES: Sample[] = [
  { id: 69153261, label: 'Single structure',    detail: '419 Prairie Ridge Ln, North Aurora IL' },
  { id: 69077209, label: 'Multiple structures', detail: 'Sample report' },
  { id: 69110976, label: 'Complex structure',   detail: 'Sample report' }
];

export const STATES: string[] = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

export const LINE_COLORS: Record<string, string> = { RIDGE: '#3a7d44', HIP: '#b88420', VALLEY: '#1854a0', RAKE: '#7c3aed', EAVE: '#475569' };
export const LINE_LABEL: Record<string, string> = { RIDGE: 'Ridge', HIP: 'Hip', VALLEY: 'Valley', RAKE: 'Rake', EAVE: 'Eave', FLASHING: 'Flashing' };

// Roof plan: hip base + a gable wing. Coordinates in feet.
export const faces: Face[] = [
  { id: 'F1', name: 'Front slope', pitch: 6, dir: 'S', pts: [[0,0],[56,0],[42,18],[14,18]] },
  { id: 'F2', name: 'Back slope',  pitch: 6, dir: 'N', pts: [[0,36],[56,36],[42,18],[14,18]] },
  { id: 'F3', name: 'West hip',    pitch: 6, dir: 'W', pts: [[0,0],[14,18],[0,36]] },
  { id: 'F4', name: 'East hip',    pitch: 6, dir: 'E', pts: [[56,0],[56,36],[42,18]] },
  { id: 'F5', name: 'Wing front',  pitch: 8, dir: 'S', pts: [[56,6],[78,6],[78,18],[56,18]] },
  { id: 'F6', name: 'Wing back',   pitch: 8, dir: 'N', pts: [[56,30],[78,30],[78,18],[56,18]] }
];

export const edges: Edge[] = [
  { type: 'RIDGE',  a: [14,18], b: [42,18] },
  { type: 'RIDGE',  a: [56,18], b: [78,18] },
  { type: 'HIP',    a: [0,0],   b: [14,18] },
  { type: 'HIP',    a: [0,36],  b: [14,18] },
  { type: 'HIP',    a: [56,0],  b: [42,18] },
  { type: 'HIP',    a: [56,36], b: [42,18] },
  { type: 'VALLEY', a: [56,6],  b: [50,12] },
  { type: 'VALLEY', a: [56,30], b: [50,24] },
  { type: 'EAVE',   a: [0,0],   b: [56,0] },
  { type: 'EAVE',   a: [0,36],  b: [56,36] },
  { type: 'EAVE',   a: [56,6],  b: [78,6] },
  { type: 'EAVE',   a: [56,30], b: [78,30] },
  { type: 'RAKE',   a: [78,6],  b: [78,18] },
  { type: 'RAKE',   a: [78,30], b: [78,18] }
];

/**
 * Donor: `const REPORT = { id: 69153261, address: '419 Prairie Ridge Ln, North
 * Aurora IL' };` — the script MUTATES both fields (a sample click rewrites the
 * address, an order rewrites the id), so the behavior module takes a per-mount
 * copy of this seed. Mutating the module constant directly would leak the last
 * visit's report into the next mount.
 */
export const REPORT_SEED: { id: number; address: string } = {
  id: 69153261,
  address: '419 Prairie Ridge Ln, North Aurora IL'
};

/** Donor: `const MS_STAGES = [...]` — the measuring screen's stage captions. */
export const MS_STAGES: string[] = ['Ordering report…', 'Locating the structure…', 'Tracing facets…', 'Measuring pitch…', 'Report ready'];
