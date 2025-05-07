// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

interface ICoins {
    function name(uint256 id) external view returns (string memory);
    function symbol(uint256 id) external view returns (string memory);
    function tokenURI(uint256 id) external view returns (string memory);
    function balanceOf(address owner, uint256 id) external view returns (uint256);
}

interface ICoinchan {
    function getCoinsCount() external view returns (uint256);
    function getCoins(uint256 start, uint256 finish) external view returns (uint256[] memory);
}

interface IZAMM {
    struct PoolKey {
        uint256 id0;
        uint256 id1;
        address token0;
        address token1;
        uint96 swapFee;
    }

    struct Pool {
        uint112 reserve0;
        uint112 reserve1;
        uint32 blockTimestampLast;
        uint256 price0CumulativeLast;
        uint256 price1CumulativeLast;
        uint256 kLast;
        uint256 supply;
    }

    function pools(uint256 poolId) external view returns (Pool memory);
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

contract CoinsMetadataHelper {
    address constant COINS = 0x0000000000009710cd229bF635c4500029651eE8;
    address constant COINCHAN = 0x00000000007762D8DCADEddD5Aa5E9a5e2B7c6f5;
    address constant ZAMM = 0x00000000000008882D72EfA6cCE4B6a40b24C860;
    uint96 constant SWAP_FEE = 100; // 1%

    struct CoinData {
        uint256 coinId;
        string name;
        string symbol;
        string tokenURI;
        uint112 reserve0; // ETH reserve
        uint112 reserve1; // Coin reserve
        uint256 poolId;
        uint256 liquidity; // Total pool liquidity
    }

    constructor() payable {}

    // Get a specific Coin's data
    function getCoinData(uint256 coinId) public view returns (CoinData memory data) {
        data.coinId = coinId;
        data.name = ICoins(COINS).name(coinId);
        data.symbol = ICoins(COINS).symbol(coinId);
        data.tokenURI = ICoins(COINS).tokenURI(coinId);
        
        // Compute the pool ID
        data.poolId = computePoolId(coinId);
        
        // Get pool reserves
        IZAMM.Pool memory pool = IZAMM(ZAMM).pools(data.poolId);
        data.reserve0 = pool.reserve0;
        data.reserve1 = pool.reserve1;
        data.liquidity = pool.supply;
    }
 
    function getUserBalance(address user, uint256 coinId) public view returns (uint256 coinBal, uint256 lpBal) {
        return (ICoins(COINS).balanceOf(user, coinId), IZAMM(ZAMM).balanceOf(user, computePoolId(coinId)));    
    }

    function getUserBalances(
        address user, 
        uint256 start, 
        uint256 finish
    ) public view returns (uint256 ethBal, uint256[] memory coinBal, uint256[] memory lpBal) {
        ethBal = user.balance;
        
        uint256[] memory coinIds = ICoinchan(COINCHAN).getCoins(start, finish);
        
        coinBal = new uint256[](coinIds.length);
        lpBal = new uint256[](coinIds.length);
        
        for (uint256 i; i != coinIds.length; ++i) {
            coinBal[i] = ICoins(COINS).balanceOf(user, coinIds[i]);
            lpBal[i] = IZAMM(ZAMM).balanceOf(user, computePoolId(coinIds[i]));
        }
    }

    // Get data for multiple coins by their IDs
    function getCoinsByIds(uint256[] calldata coinIds) public view returns (CoinData[] memory) {
        CoinData[] memory result = new CoinData[](coinIds.length);
        for (uint256 i; i != coinIds.length; ++i) result[i] = getCoinData(coinIds[i]);
        return result;
    }

    // Get a batch of coin data based on start/finish indices
    function getCoinDataBatch(uint256 start, uint256 finish) public view returns (CoinData[] memory) {
        uint256[] memory coinIds = ICoinchan(COINCHAN).getCoins(start, finish);
        CoinData[] memory result = new CoinData[](coinIds.length);
        
        for (uint256 i; i != coinIds.length; ++i) result[i] = getCoinData(coinIds[i]);
        return result;
    }

    // Get ALL active coins' data
    function getAllCoinsData() public view returns (CoinData[] memory) {
        unchecked {
            uint256 totalCoins = ICoinchan(COINCHAN).getCoinsCount();
            if (totalCoins == 0) return new CoinData[](0);
            
            // Get all coins IDs (0 to totalCoins-1)
            uint256[] memory coinIds = ICoinchan(COINCHAN).getCoins(0, totalCoins - 1);
            CoinData[] memory result = new CoinData[](coinIds.length);
            
            for (uint256 i; i != coinIds.length; ++i) result[i] = getCoinData(coinIds[i]);
            return result;
        }
    }
    
    // Get a specific number of latest coins
    function getLatestCoins(uint256 count) public view returns (CoinData[] memory) {
        unchecked {
            uint256 totalCoins = ICoinchan(COINCHAN).getCoinsCount();
            if (totalCoins == 0 || count == 0) return new CoinData[](0);
            
            // Adjust count if it exceeds available coins
            if (count > totalCoins) count = totalCoins;
            
            uint256 start = totalCoins - count;
            uint256[] memory coinIds = ICoinchan(COINCHAN).getCoins(start, totalCoins - 1);
            CoinData[] memory result = new CoinData[](coinIds.length);
            
            for (uint256 i; i != coinIds.length; ++i) result[i] = getCoinData(coinIds[i]);
            return result;
        }
    }

    // Compute pool ID from coin ID
    function computePoolId(uint256 coinId) public pure returns (uint256 poolId) {
        // Create the pool key structure in memory
        IZAMM.PoolKey memory key = IZAMM.PoolKey({
            id0: 0,
            id1: coinId,
            token0: address(0),
            token1: COINS,
            swapFee: SWAP_FEE
        });
        
        assembly ("memory-safe") {
            // The PoolKey struct is already in memory at location 'key'
            // We need to hash the entire struct (0xa0 bytes)
            poolId := keccak256(key, 0xa0)
        }
    }

    // Helper to get the total count of coins
    function getCoinsCount() public view returns (uint256) {
        return ICoinchan(COINCHAN).getCoinsCount();
    }
}