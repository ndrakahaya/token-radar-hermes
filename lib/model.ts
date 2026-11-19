// The token radar's momentum model (variant B): one snapshot of the protocol universe in, one ranked
// board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// rankable pre-token protocol below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its index entry records no token at all (no market cap, no CoinGecko id,
// no symbol). Live-token protocols stay out of the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base       = tvl_usd x BASE_MULTIPLE                                  (0.20)
//   growth     = clamp(change_7d, -50, 150) per cent
//   growthMult = 1 + max(growth,0)/100 x 0.8 + min(growth,0)/100 x 0.4     (asymmetric)
//   maturity   = sweet spot at 1 to 3 years of age, discounted when younger and when older
//   chainMult  = 1 + 0.04 x (chains - 1), capped at 1.20
//   implied    = max(1, round(base x growthMult x maturity x chainMult))
//
// The maturity curve is a function of age_days alone: a protocol with no listing date is scored at a
// neutral 0.88. No protocol name is ever special-cased; the same function scores every row.
//
// A risk score (0..100, higher is riskier) is derived from the same three record fields the model reads:
// age, weekly growth and chain count. It does not change the ranking; the dashboard shows it beside it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_floor: number;
  growth_cap: number;
  growth_up_weight: number;
  growth_down_weight: number;
  chain_step: number;
  chain_cap: number;
  young_days: number;
  sweet_peak_days: number;
  sweet_end_days: number;
  old_decay_days: number;
  young_floor: number;
  peak_bonus: number;
  old_floor: number;
  unknown_age_multiplier: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.2,
  growth_floor: -50,
  growth_cap: 150,
  growth_up_weight: 0.8,
  growth_down_weight: 0.4,
  chain_step: 0.04,
  chain_cap: 1.2,
  young_days: 365,
  sweet_peak_days: 730,
  sweet_end_days: 1095,
  old_decay_days: 1095,
  young_floor: 0.7,
  peak_bonus: 0.05,
  old_floor: 0.78,
  unknown_age_multiplier: 0.88,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'momentum-b';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  risk_score: number;
  risk_band: 'low' | 'watch' | 'high';
  model: {
    base_multiple: number;
    base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: numbers it can sort and filter on, plus the plan the model wrote. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  risk_score: number;
  risk_band: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  base_usd: number;
  growth_pct: number;
  farm_steps: string[];
}

/** Everything the dashboard needs: the rows and the model that ranked them. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  rows: RadarRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `listed_at` to `as_of`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The maturity curve: the sweet spot is one to three years old, peaking at two. Younger protocols ramp
 * up from `young_floor` at zero days to 1.00 at a year; older ones lose up to `1 - old_floor` over the
 * next `old_decay_days` days and then hold that floor. Continuous at both joins.
 */
export function maturityMultiplier(age: number | null, model: ModelConstants = MODEL): number {
  if (age === null) return model.unknown_age_multiplier;
  const a = Math.max(0, age);
  if (a <= model.young_days) {
    const t = a / model.young_days;
    return model.young_floor + (1 - model.young_floor) * t;
  }
  if (a <= model.sweet_end_days) {
    const span = model.sweet_end_days - model.young_days;
    const distance = Math.abs(a - model.sweet_peak_days) / (span / 2);
    return 1 + model.peak_bonus * (1 - Math.min(1, distance));
  }
  const over = Math.min(1, (a - model.sweet_end_days) / model.old_decay_days);
  return 1 - (1 - model.old_floor) * over;
}

/** The growth multiplier: rises 0.8 per +100% clamped at +150, falls 0.4 per -100% clamped at -50. */
export function growthMultiplier(growthPct: number, model: ModelConstants = MODEL): number {
  const up = Math.max(0, growthPct) / 100;
  const down = Math.min(0, growthPct) / 100;
  return 1 + up * model.growth_up_weight + down * model.growth_down_weight;
}

/** The chain diversity multiplier: more chains, more reach, capped. */
export function chainMultiplier(chains: number, model: ModelConstants = MODEL): number {
  const n = Math.max(1, chains);
  return Math.min(model.chain_cap, 1 + model.chain_step * (n - 1));
}

/**
 * The risk score, 0 (calm) to 100 (fragile): young age, violent weekly moves in either direction and a
 * thin chain footprint each add. It never changes a row's rank.
 */
export function riskScore(age: number | null, growthPct: number, chains: number): number {
  const ageRisk = age === null ? 0.55 : clamp(1 - age / 1095, 0, 1);
  const crashRisk = clamp(-growthPct / 50, 0, 1);
  const euphoriaRisk = clamp((growthPct - 60) / 90, 0, 1);
  const growthRisk = Math.max(crashRisk, euphoriaRisk);
  const chainRisk = clamp(1 - (Math.max(1, chains) - 1) / 5, 0, 1);
  return Math.round(clamp(40 * ageRisk + 35 * growthRisk + 25 * chainRisk, 0, 100));
}

/** The three bands the dashboard colours a risk score with. */
export function riskBand(score: number): 'low' | 'watch' | 'high' {
  return score < 34 ? 'low' : score < 62 ? 'watch' : 'high';
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { implied: number; baseUsd: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null; risk: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = growthMultiplier(growthPct, model);
  const maturityMult = maturityMultiplier(age, model);
  const chainMult = chainMultiplier(protocol.chains.length, model);
  const baseUsd = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(baseUsd * growthMult * maturityMult * chainMult));
  const risk = riskScore(age, growthPct, protocol.chains.length);
  return { implied, baseUsd, growthPct, growthMult, maturityMult, chainMult, age, risk };
}

/** DefiLlama's version-marker rule: a name ending in a release number is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every protocol the board ranks: the whole watchlist, then every rankable early row below the floor. */
export function chooseRows(snapshot: Snapshot): SnapshotProtocol[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || byCodeUnit(a.slug, b.slug));
  for (const p of early) chosen.set(p.slug, p);
  return [...chosen.values()];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const scored = chooseRows(snapshot).map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || byCodeUnit(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    risk_score: s.risk,
    risk_band: riskBand(s.risk),
    model: {
      base_multiple: model.base_multiple,
      base_usd: Math.round(s.baseUsd),
      growth_pct: Math.round(s.growthPct * 100) / 100,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.risk).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The chains a protocol runs on, in its own order, as a readable phrase. */
function chainList(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  if (p.chains.length === 1) return p.chains[0]!;
  if (p.chains.length === 2) return `${p.chains[0]} and ${p.chains[1]}`;
  return `${p.chains[0]}, ${p.chains[1]} and ${p.chains.length - 2} more`;
}

/** How much gas one transaction of this kind costs, by where the protocol lives. */
interface GasProfile {
  label: string;
  setup: number;
  weekly: number;
  approval: number;
}

/** L1 chains price gas in tens of dollars; L2s and cheap L1s in cents; anything unknown is priced mid. */
const GAS_BY_CHAIN: Record<string, GasProfile> = {
  Ethereum: { label: 'Ethereum L1', setup: 18, weekly: 6, approval: 4 },
  Arbitrum: { label: 'an Arbitrum L2', setup: 0.6, weekly: 0.2, approval: 0.1 },
  Optimism: { label: 'an Optimism L2', setup: 0.6, weekly: 0.2, approval: 0.1 },
  Base: { label: 'the Base L2', setup: 0.4, weekly: 0.15, approval: 0.08 },
  'OP Mainnet': { label: 'the OP Mainnet L2', setup: 0.6, weekly: 0.2, approval: 0.1 },
  Polygon: { label: 'Polygon PoS', setup: 0.3, weekly: 0.1, approval: 0.05 },
  'Polygon zkEVM': { label: 'Polygon zkEVM', setup: 0.5, weekly: 0.2, approval: 0.1 },
  BSC: { label: 'BNB Chain', setup: 0.5, weekly: 0.2, approval: 0.1 },
  Avalanche: { label: 'Avalanche C-Chain', setup: 0.8, weekly: 0.3, approval: 0.15 },
  Solana: { label: 'Solana', setup: 0.02, weekly: 0.01, approval: 0.01 },
  Tron: { label: 'Tron', setup: 1.2, weekly: 0.6, approval: 0.4 },
  Sonic: { label: 'Sonic', setup: 0.3, weekly: 0.1, approval: 0.05 },
  Blast: { label: 'the Blast L2', setup: 0.4, weekly: 0.15, approval: 0.08 },
  Mantle: { label: 'the Mantle L2', setup: 0.5, weekly: 0.2, approval: 0.1 },
  Linea: { label: 'the Linea L2', setup: 0.7, weekly: 0.25, approval: 0.12 },
  Scroll: { label: 'the Scroll L2', setup: 0.6, weekly: 0.2, approval: 0.1 },
  zkSync: { label: 'the zkSync Era L2', setup: 0.6, weekly: 0.2, approval: 0.1 },
  'ZKsync Era': { label: 'the zkSync Era L2', setup: 0.6, weekly: 0.2, approval: 0.1 },
  Starknet: { label: 'the Starknet L2', setup: 0.4, weekly: 0.15, approval: 0.08 },
  Hyperliquid: { label: 'Hyperliquid', setup: 0.05, weekly: 0.02, approval: 0.02 },
  Sui: { label: 'Sui', setup: 0.05, weekly: 0.02, approval: 0.02 },
  Aptos: { label: 'Aptos', setup: 0.05, weekly: 0.02, approval: 0.02 },
  Berachain: { label: 'Berachain', setup: 0.3, weekly: 0.1, approval: 0.05 },
  Unichain: { label: 'the Unichain L2', setup: 0.4, weekly: 0.15, approval: 0.08 },
  Ink: { label: 'the Ink L2', setup: 0.35, weekly: 0.12, approval: 0.06 },
};

const DEFAULT_GAS: GasProfile = { label: 'its chain', setup: 4, weekly: 1.5, approval: 1 };

/** The gas profile of the chain a plan lands on: the first priced chain the protocol names. */
function gasFor(p: SnapshotProtocol): GasProfile {
  for (const chain of p.chains) {
    const gas = GAS_BY_CHAIN[chain];
    if (gas !== undefined) return gas;
  }
  return DEFAULT_GAS;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('synthetic')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('launchpad')) return `Deposit $${capital} of USDC into ${name} on ${chain} and join its next launch.`;
  if (c.includes('index') || c.includes('ott')) return `Mint $${capital} of ${name}'s index token on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The one warning a category earns: what has burned farmers of this kind of protocol before. */
function warningFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Watch the collateral ratios and the oracle the market reads: a fast price move is where lenders lose deposits.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return `Check impermanent loss and who controls the rewards: an emission that ends can take the yield with it.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Treat the bridge as the risk: a paused or drained bridge strands the funds on the far side.`;
  if (c.includes('staking') || c.includes('restak')) return `Read the slashing and unbonding terms: a slash takes principal and an exit queue can hold it for days.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('synthetic')) return `Margin can be liquidated in one candle: keep the position small and the leverage under two.`;
  if (c.includes('curator') || c.includes('allocator')) return `Read which markets the vault allocates to: a curator's own risk limits are the whole of yours.`;
  if (c.includes('stable')) return `Check what backs the peg and whether minting is paused: a stable that depegs takes the position with it.`;
  if (c.includes('insurance')) return `Read what the cover excludes: most policies do not pay for the failure farmers most fear.`;
  if (c.includes('rwa')) return `Check who custodies the real-world asset and how redemption works: the token is only as good as the claim behind it.`;
  return `Read the protocol's own docs and audit list before you commit: this board reads a public index, not its code.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Gas is priced for the chain
 * the plan lands on, and the last step carries the warning its category earns. Derived from the
 * protocol's own record (category, chains, TVL, age, risk), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, risk: number): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const reach = p.chains.length > 1 ? ` Its record lists ${chainList(p)}: farm on one of them and keep the rest as a read.` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.${reach}`,
      cost: 'nothing beyond the wallet',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas.setup} of gas on ${gas.label}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and note the date.`,
      cost: `about $${gas.weekly} of gas a week on ${gas.label}`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: `about $${gas.approval} of gas to claim, and never a fee to the page`,
      time: '10 minutes',
    },
    {
      text: `${warningFor(p)} This row scores ${risk}/100 on the radar's risk read.`,
      cost: 'nothing but the reading',
      time: '15 minutes of reading',
    },
  ];
}

/** A board row's compact form for data.js; the farm plan travels with it. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    risk_score: row.risk_score,
    risk_band: row.risk_band,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    base_usd: row.model.base_usd,
    growth_pct: row.model.growth_pct,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    rows: board.map(radarRow),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, spread, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (slugs.size !== board.length) return `the board repeats a slug: ${board.length} rows, ${slugs.size} slugs`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 a board needs`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value past the gate's ceiling`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
