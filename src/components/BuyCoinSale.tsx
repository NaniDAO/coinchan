export const BuyCoinSale = ({ coinId }: { coinId: bigint }) => {
  return (
    <div>
      {coinId.toString()}
      <button>Buy</button>
    </div>
  );
};
