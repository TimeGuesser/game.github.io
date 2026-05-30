export function createPlayerState(row) {
  return {
    id: row.id,
    name: row.name,
    score: row.score ?? 0,
    answered: row.answered ?? false,
    ready: row.ready ?? false,
    lastRoundScore: row.last_round_score ?? 0,
    answer_lat: row.answer_lat,
    answer_lng: row.answer_lng,
    answer_year: row.answer_year,
    clientId: row.client_id,
    isHost: false
  };
}

export function normalizePlayers(rows, hostClientId) {
  return (rows || [])
    .map((row) => {
      const p = createPlayerState(row);
      p.isHost = p.clientId === hostClientId;
      return p;
    })
    .sort((a, b) => b.score - a.score);
}
