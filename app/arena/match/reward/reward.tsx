// Arena Match Reward Component
// Shows reward information after arena match

interface RewardProps {
  matchResult: 'win' | 'loss' | 'draw';
  rewardAmount: number;
  resourcesGained: {
    xp: number;
    currency: number;
    items: string[];
  };
  bonusMultiplier: number;
}

export const Reward: React.FC<RewardProps> = ({
  matchResult,
  rewardAmount,
  resourcesGained,
  bonusMultiplier
}) => {
  return (
    <div className="arena-reward">
      <h3>Match Result: {matchResult}</h3>
      <div className="reward-details">
        <p>Reward Amount: {rewardAmount}</p>
        <p>XP Gained: {resourcesGained.xp}</p>
        <p>Currency Gained: {resourcesGained.currency}</p>
        <p>Items: {resourcesGained.items.join(', ')}</p>
        <p>Bonus Multiplier: {bonusMultiplier}x</p>
      </div>
    </div>
  );
};