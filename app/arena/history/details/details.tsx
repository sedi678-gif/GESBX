// Arena History Details Component
// Shows detailed information about arena match history

interface DetailsProps {
  matchId: string;
  playerStats: {
    wins: number;
    losses: number;
    draws: number;
    totalDamage: number;
  };
  opponentInfo: {
    username: string;
    rating: number;
  };
  matchDuration: number;
  finalResult: 'win' | 'loss' | 'draw';
}

export const Details: React.FC<DetailsProps> = ({
  matchId,
  playerStats,
  opponentInfo,
  matchDuration,
  finalResult
}) => {
  return (
    <div className="arena-history-details">
      <h3>Match Details: {matchId}</h3>
      <div className="player-stats">
        <p>Wins: {playerStats.wins}</p>
        <p>Losses: {playerStats.losses}</p>
        <p>Draws: {playerStats.draws}</p>
        <p>Total Damage: {playerStats.totalDamage}</p>
      </div>
      <div className="opponent-info">
        <p>Opponent: {opponentInfo.username}</p>
        <p>Rating: {opponentInfo.rating}</p>
      </div>
      <div className="match-info">
        <p>Duration: {matchDuration} seconds</p>
        <p>Result: {finalResult}</p>
      </div>
    </div>
  );
};