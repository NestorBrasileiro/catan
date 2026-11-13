import './RollStats.css';

// Of the 36 ways two dice can land, how many give each sum from 2 to 12
const WAYS = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
const CHART_HEIGHT = 72; // px

function times(n: number) {
  return n === 1 ? '1 vez' : `${n} vezes`;
}

interface RollStatsProps {
  stats: number[];        // times each sum came up, from 2 (index 0) to 12
  lastSum: number | null; // marked in the chart
}

// How many times each number was rolled, against how often it should come up
export default function RollStats({ stats, lastSum }: RollStatsProps) {
  const total = stats.reduce((a, b) => a + b, 0);
  const expected = WAYS.map(ways => (total * ways) / 36);
  const top = Math.max(1, ...stats, ...expected);
  const height = (value: number) => `${(value / top) * CHART_HEIGHT}px`;

  return (
    <details className="panel roll-stats" open>
      <summary>
        <h3>Dados</h3>
        <span className="muted">{total === 1 ? '1 rolagem' : `${total} rolagens`}</span>
      </summary>
      <ol className="roll-chart" style={{ height: CHART_HEIGHT + 34 }}>
        {stats.map((count, i) => {
          const sum = i + 2;
          const share = total ? Math.round((count / total) * 100) : 0;
          const hint = `${sum}: saiu ${times(count)} (${share}%). Esperado: ${expected[i].toFixed(1).replace('.', ',')}`;
          return (
            <li key={sum} className={sum === lastSum ? 'last' : undefined} title={hint} aria-label={hint}>
              <span className="roll-count" aria-hidden>{count}</span>
              <span className="roll-track" style={{ height: CHART_HEIGHT }} aria-hidden>
                <span className="roll-bar" style={{ height: height(count) }} />
                {total > 0 && <span className="roll-expected" style={{ bottom: height(expected[i]) }} />}
              </span>
              <span className="roll-sum" aria-hidden>{sum}</span>
            </li>
          );
        })}
      </ol>
      <p className="muted roll-legend"><span className="roll-expected-key" aria-hidden /> esperado pela probabilidade</p>
    </details>
  );
}
