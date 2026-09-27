/** Presentation of saved drafts on the Replays page. */

export const RESULTS = [
  { value: 'win', label: 'Victoire' },
  { value: 'loss', label: 'Défaite' },
  { value: 'remake', label: 'Remake' },
];

const RESULT_VIEW = {
  win: { label: 'VICTOIRE', tone: 'ok' },
  loss: { label: 'DÉFAITE', tone: 'bad' },
  remake: { label: 'REMAKE', tone: '' },
};

/** Pill text and tone for a draft's result; an unknown result is a dashed question. */
export function resultView(result) {
  return RESULT_VIEW[result] || { label: 'RÉSULTAT ?', tone: 'dashed' };
}

const percent = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Figures shown above the list; the win rate counts drafts whose result is known. */
export function statsSummary(stats) {
  if (!stats?.total) return [];
  const wins = stats.wins || 0;
  const losses = stats.losses || 0;
  const decided = wins + losses;
  const items = [
    { label: 'Drafts', value: String(stats.total) },
    { label: 'Victoires', value: String(wins) },
    { label: 'Défaites', value: String(losses) },
    { label: 'Win rate', value: decided ? `${percent.format((wins / decided) * 100)} %` : '—' },
  ];
  if (stats.most_played_champion) items.push({ label: 'Champion', value: stats.most_played_champion });
  if (stats.best_role) items.push({ label: 'Rôle', value: String(stats.best_role).toUpperCase() });
  return items;
}

const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** "26 sept. 22:14". */
export function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${day.format(date)} ${time.format(date)}`;
}

/** The list endpoint omits timelines; it sends their length instead. */
export function stepCount(entry) {
  return entry.timeline_steps ?? entry.timeline?.length ?? 0;
}
