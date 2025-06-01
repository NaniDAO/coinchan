// begin snippet

/********************
 *    ORDERBOOK     *
 ********************/

// Track new orders created
ponder.on("Cookbook:Make", async ({ event, context }) => {
  const { maker, orderHash } = event.args;

  // Decode the transaction input to extract order parameters
  const data = event.transaction.input;
  const decoded = decodeFunctionData({
    abi: CookbookAbi,
    data,
  });

  if (decoded.functionName === "makeOrder") {
    const [tokenIn, idIn, amtIn, tokenOut, idOut, amtOut, deadline, partialFill] = decoded.args;

    // Validate deadline (contract requirement: deadline > block.timestamp)
    if (Number(deadline) <= event.block.timestamp) {
      logger.error(`Invalid deadline: ${deadline} <= ${event.block.timestamp}`);
      return;
    }

    // Check if order already exists (contract prevents duplicates)
    const existingOrder = await context.db.find(schema.order, { id: orderHash });
    if (existingOrder) {
      logger.error(`Order already exists: ${orderHash}`);
      return;
    }

    // Ensure maker account exists
    await context.db
      .insert(schema.account)
      .values({
        address: maker,
        createdAt: BigInt(event.block.timestamp),
      })
      .onConflictDoNothing();

    await context.db.insert(schema.order).values({
      id: orderHash,
      maker,
      tokenIn,
      idIn,
      amtIn,
      tokenOut,
      idOut,
      amtOut,
      deadline: timestampToDate(Number(deadline)),
      partialFill,
      inDone: 0n,
      outDone: 0n,
      status: "ACTIVE",
      createdAt: timestampToDate(Number(event.block.timestamp)),
      updatedAt: timestampToDate(Number(event.block.timestamp)),
      txHash: event.transaction.hash,
      blockNumber: BigInt(event.block.number),
    });

    logger.debug(`Order created: ${orderHash} by ${maker}`);
  }
});

// Track order fills
ponder.on("Cookbook:Fill", async ({ event, context }) => {
  const { taker, orderHash } = event.args;

  // Decode the transaction input to get fill parameters
  const data = event.transaction.input;
  const decoded = decodeFunctionData({
    abi: CookbookAbi,
    data,
  });

  if (decoded.functionName === "fillOrder") {
    const [maker, tokenIn, idIn, amtIn, tokenOut, idOut, amtOut, deadline, partialFill, fillPart] = decoded.args;

    // Calculate the actual fill amounts based on the contract logic
    const existingOrder = await context.db.find(schema.order, { id: orderHash });

    if (existingOrder) {
      // Ensure taker account exists
      await context.db
        .insert(schema.account)
        .values({
          address: taker,
          createdAt: BigInt(event.block.timestamp),
        })
        .onConflictDoNothing();

      const oldIn = existingOrder.inDone;
      const oldOut = existingOrder.outDone;

      // Replicate the contract's fill calculation logic exactly
      const sliceOut = partialFill ? (fillPart === 0n ? amtOut - oldOut : fillPart) : amtOut;

      // Validate sliceOut bounds (contract requirement)
      if (sliceOut === 0n || oldOut + sliceOut > amtOut) {
        logger.error(`Invalid sliceOut: ${sliceOut}, oldOut: ${oldOut}, amtOut: ${amtOut}`);
        return;
      }

      const sliceIn = partialFill ? (fillPart === 0n ? amtIn - oldIn : (amtIn * sliceOut) / amtOut) : amtIn;

      // Validate sliceIn is non-zero (contract requirement)
      if (sliceIn === 0n) {
        logger.error(`Invalid sliceIn: ${sliceIn}`);
        return;
      }

      const newOutDone = oldOut + sliceOut;
      const newInDone = oldIn + sliceIn;
      const isComplete = newOutDone === amtOut;

      // Update the order with new fill progress
      // Note: Contract deletes completed orders, but we keep them for historical tracking
      await context.db.update(schema.order, { id: orderHash }).set({
        inDone: newInDone,
        outDone: newOutDone,
        status: isComplete ? "COMPLETED" : "ACTIVE",
        updatedAt: timestampToDate(Number(event.block.timestamp)),
      });

      // Record the fill event
      await context.db.insert(schema.fill).values({
        id: `${event.transaction.hash}-${event.log.logIndex}`,
        orderHash,
        taker,
        maker: existingOrder.maker,
        tokenIn: existingOrder.tokenIn,
        idIn: existingOrder.idIn,
        tokenOut: existingOrder.tokenOut,
        idOut: existingOrder.idOut,
        amountIn: sliceIn,
        amountOut: sliceOut,
        txHash: event.transaction.hash,
        blockNumber: BigInt(event.block.number),
        timestamp: BigInt(event.block.timestamp),
        createdAt: timestampToDate(Number(event.block.timestamp)),
      });

      logger.debug(
        `Order filled: ${orderHash} by ${taker}, sliceIn: ${sliceIn}, sliceOut: ${sliceOut}, complete: ${isComplete}`,
      );
    }
  }
});

// Track order cancellations
ponder.on("Cookbook:Cancel", async ({ event, context }) => {
  const { maker, orderHash } = event.args;

  // Verify the order exists before cancelling (contract checks this)
  const existingOrder = await context.db.find(schema.order, { id: orderHash });
  if (!existingOrder) {
    logger.error(`Attempted to cancel non-existent order: ${orderHash}`);
    return;
  }

  // Update order status to cancelled
  // Note: Contract deletes cancelled orders, but we keep them for historical tracking
  await context.db.update(schema.order, { id: orderHash }).set({
    status: "CANCELLED",
    updatedAt: timestampToDate(Number(event.block.timestamp)),
  });

  // Record the cancellation event
  await context.db.insert(schema.cancellation).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    orderHash,
    maker,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    createdAt: timestampToDate(Number(event.block.timestamp)),
  });

  logger.debug(`Order cancelled: ${orderHash} by ${maker}`);
});

// schema

import { index, onchainEnum, onchainTable, primaryKey, relations } from "ponder";

export const liquidityType = onchainEnum("liquidityType", ["MINT", "BURN"]);

export const account = onchainTable("account", (t) => ({
  address: t.hex().notNull().primaryKey(),
  createdAt: t.bigint().notNull(),
}));

export const accountRelation = relations(account, ({ one, many }) => ({
  transfersFrom: many(transfer, {
    relationName: "transfersFrom",
  }),
  transfersTo: many(transfer, {
    relationName: "transfersTo",
  }),
  transferSender: many(transfer, {
    relationName: "transferSender",
  }),
  coinsOwnerOf: many(coin),
  coinsBalanceOf: many(holder, {
    relationName: "coinsBalanceOf",
  }),
  ordersAsMaker: many(order),
  fillsAsTaker: many(fill, { relationName: "fillsAsTaker" }),
  fillsAsMaker: many(fill, { relationName: "fillsAsMaker" }),
  cancellations: many(cancellation),
}));

export const coin = onchainTable(
  "coin",
  (t) => ({
    id: t.bigint().primaryKey(),
    name: t.text(),
    symbol: t.text(),
    tokenURI: t.text(),
    imageUrl: t.text(),
    description: t.text(),
    totalSupply: t.bigint(),
    decimals: t.integer().default(18),
    owner: t.hex(),

    creationTxHash: t.hex(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }),
  (table) => ({
    symbolIdx: index().on(table.symbol),
  }),
);

export const coinRelations = relations(coin, ({ one, many }) => ({
  lockup: one(lockup, {
    fields: [coin.id],
    references: [lockup.coinId],
  }),
  pools: many(pool),
  holders: many(holder),
  ownerAccount: one(account, {
    fields: [coin.owner],
    references: [account.address],
  }),
}));

export const holder = onchainTable(
  "holder",
  (t) => ({
    coinId: t.bigint().notNull(),
    address: t.hex().notNull(),
    balance: t.bigint().notNull(),
    createdAt: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.coinId, table.address] }),
  }),
);

export const holderRelations = relations(holder, ({ one }) => ({
  coin: one(coin, {
    fields: [holder.coinId],
    references: [coin.id],
  }),
  account: one(account, {
    fields: [holder.address],
    references: [account.address],
    relationName: "coinsBalanceOf",
  }),
}));

export const transfer = onchainTable("transfer", (t) => ({
  id: t.text().primaryKey(),
  coinId: t.bigint().notNull(),
  sender: t.hex().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  amount: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  createdAt: t.bigint().notNull(),
}));

export const transfersRelations = relations(transfer, ({ one }) => ({
  coin: one(coin, {
    fields: [transfer.coinId],
    references: [coin.id],
  }),
  sender: one(account, {
    fields: [transfer.sender],
    references: [account.address],
    relationName: "transfersSender",
  }),
  to: one(account, {
    fields: [transfer.to],
    references: [account.address],
    relationName: "transfersTo",
  }),
  from: one(account, {
    fields: [transfer.from],
    references: [account.address],
    relationName: "transfersFrom",
  }),
}));

export const lockup = onchainTable("lockup", (t) => ({
  id: t.hex().primaryKey(),
  coinId: t.bigint().notNull(),
  poolId: t.hex(),
  creator: t.hex().notNull(),
  creationTime: t.timestamp(),
  unlockTime: t.timestamp(),
  vesting: t.boolean(),
  claimed: t.bigint(),
  liquidityLocked: t.bigint(),
}));

export const liquidityEvent = onchainTable("liquidity_event", (t) => ({
  id: t.hex().primaryKey(),
  poolId: t.bigint().notNull(),
  sender: t.hex().notNull(),
  type: liquidityType(),
  amount0: t.bigint().notNull(),
  amount1: t.bigint().notNull(),
  liquidity: t.bigint().notNull(),
  callData: t.hex(),

  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const swap = onchainTable("swap", (t) => ({
  id: t.hex().primaryKey(),
  poolId: t.bigint().notNull(),
  trader: t.hex().notNull(),
  toAddr: t.hex().notNull(),
  amount0In: t.bigint().notNull(),
  amount1In: t.bigint().notNull(),
  amount0Out: t.bigint().notNull(),
  amount1Out: t.bigint().notNull(),
  swapFee: t.numeric(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const pool = onchainTable("pool", (t) => ({
  id: t.bigint().primaryKey(), // == ZAMM poolId
  coin0Id: t.bigint().notNull(), // id0 in PoolKey (nullable if ETH)
  coin1Id: t.bigint(),
  token0: t.hex(), // address(token0)
  token1: t.hex(),
  swapFee: t.integer(),
  reserve0: t.bigint(), // latest reserves
  reserve1: t.bigint(),
  price0: t.numeric(), // latest price = reserve1 / reserve0
  price1: t.numeric(), // inverse price
  updatedAt: t.timestamp(),
}));

export const poolRelations = relations(pool, ({ many, one }) => ({
  coin0: one(coin, { fields: [pool.coin0Id], references: [coin.id] }),
  coin1: one(coin, { fields: [pool.coin1Id], references: [coin.id] }),
  pricePoints: many(pricePoint),
  candles: many(candle),
}));

export const pricePoint = onchainTable("price_point", (t) => ({
  id: t.text().primaryKey(), // `${event.txHash}-${event.logIndex}`
  poolId: t.bigint().notNull(),
  reserve0: t.bigint(),
  reserve1: t.bigint(),
  price0: t.numeric(), // reserve1 / reserve0
  price1: t.numeric(), // reserve0 / reserve1
  blockNumber: t.bigint(),
  timestamp: t.bigint().notNull(), // cast from event.args.timestamp or block
  txHash: t.hex(),
}));

export const pricePointRelations = relations(pricePoint, ({ one }) => ({
  pool: one(pool, { fields: [pricePoint.poolId], references: [pool.id] }),
}));

export const candle = onchainTable("candle", (t) => ({
  id: t.text().primaryKey(), // `${poolId}-${bucketStart}-${interval}`
  poolId: t.bigint().notNull(),
  interval: t.text(), // e.g. "1m" | "1h" | "1d"
  bucketStart: t.timestamp(), // inclusive
  open: t.numeric(),
  high: t.numeric(),
  low: t.numeric(),
  close: t.numeric(),
  updatedAt: t.timestamp(),
}));

export const candleRelations = relations(candle, ({ one }) => ({
  pool: one(pool, { fields: [candle.poolId], references: [pool.id] }),
}));

// Add this enum for order status
export const orderStatus = onchainEnum("orderStatus", ["ACTIVE", "COMPLETED", "CANCELLED"]);

export const order = onchainTable(
  "order",
  (t) => ({
    id: t.hex().primaryKey(), // orderHash
    maker: t.hex().notNull(),
    tokenIn: t.hex().notNull(),
    idIn: t.bigint().notNull(),
    amtIn: t.bigint().notNull(),
    tokenOut: t.hex().notNull(),
    idOut: t.bigint().notNull(),
    amtOut: t.bigint().notNull(),
    deadline: t.timestamp().notNull(),
    partialFill: t.boolean().notNull(),
    inDone: t.bigint().notNull().default(0n),
    outDone: t.bigint().notNull().default(0n),
    status: orderStatus().notNull().default("ACTIVE"),
    createdAt: t.timestamp().notNull(),
    updatedAt: t.timestamp().notNull(),
    txHash: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    statusIdx: index().on(table.status),
    deadlineIdx: index().on(table.deadline),
  }),
);

export const orderRelations = relations(order, ({ one, many }) => ({
  makerAccount: one(account, {
    fields: [order.maker],
    references: [account.address],
  }),
  fills: many(fill),
  cancellation: one(cancellation),
}));

export const fill = onchainTable("fill", (t) => ({
  id: t.text().primaryKey(), // `${txHash}-${logIndex}`
  orderHash: t.hex().notNull(),
  taker: t.hex().notNull(),
  maker: t.hex().notNull(),
  tokenIn: t.hex().notNull(),
  idIn: t.bigint().notNull(),
  tokenOut: t.hex().notNull(),
  idOut: t.bigint().notNull(),
  amountIn: t.bigint().notNull(),
  amountOut: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  createdAt: t.timestamp().notNull(),
}));

export const fillRelations = relations(fill, ({ one }) => ({
  order: one(order, {
    fields: [fill.orderHash],
    references: [order.id],
  }),
  takerAccount: one(account, {
    fields: [fill.taker],
    references: [account.address],
    relationName: "fillsAsTaker",
  }),
  makerAccount: one(account, {
    fields: [fill.maker],
    references: [account.address],
    relationName: "fillsAsMaker",
  }),
}));

export const cancellation = onchainTable("cancellation", (t) => ({
  id: t.text().primaryKey(), // `${txHash}-${logIndex}`
  orderHash: t.hex().notNull(),
  maker: t.hex().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  createdAt: t.timestamp().notNull(),
}));

export const cancellationRelations = relations(cancellation, ({ one }) => ({
  order: one(order, {
    fields: [cancellation.orderHash],
    references: [order.id],
  }),
  makerAccount: one(account, {
    fields: [cancellation.maker],
    references: [account.address],
  }),
}));
