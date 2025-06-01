import { useState, useEffect } from "react";
import { INDEXER_URL } from "@/lib/indexer";

export const OrdersDebug = () => {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const testQueries = async () => {
      const results = {
        indexerUrl: INDEXER_URL,
        envVar: import.meta.env.VITE_INDEXER_URL,
        timestamp: new Date().toISOString(),
      };

      try {
        // Test 1: Simple introspection query
        const introspectionQuery = `
          query {
            __schema {
              types {
                name
              }
            }
          }
        `;

        console.log("Testing introspection query...");
        const introspectionResponse = await fetch(INDEXER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: introspectionQuery }),
        });

        (results as any).introspection = {
          status: introspectionResponse.status,
          ok: introspectionResponse.ok,
        };

        if (introspectionResponse.ok) {
          const introspectionData = await introspectionResponse.json();
          (results as any).introspection.data = introspectionData;
        } else {
          (results as any).introspection.error = await introspectionResponse.text();
        }

        // Test 2: Check what order fields are available
        const orderFieldsQuery = `
          query {
            __type(name: "Order") {
              fields {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        `;

        // Test 2b: Simple orders query  
        const ordersQuery = `
          query TestOrders {
            orders(limit: 10) {
              items {
                id
                maker
                status
              }
            }
          }
        `;

        // Test 3: Count query
        const countQuery = `
          query CountOrders {
            orders {
              items {
                id
              }
            }
          }
        `;

        // Test order fields first
        console.log("Testing order fields query...");
        const orderFieldsResponse = await fetch(INDEXER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: orderFieldsQuery }),
        });

        (results as any).orderFields = {
          status: orderFieldsResponse.status,
          ok: orderFieldsResponse.ok,
        };

        if (orderFieldsResponse.ok) {
          const orderFieldsData = await orderFieldsResponse.json();
          (results as any).orderFields.data = orderFieldsData;
        } else {
          (results as any).orderFields.error = await orderFieldsResponse.text();
        }

        console.log("Testing orders query...");
        const ordersResponse = await fetch(INDEXER_URL, {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: ordersQuery }),
        });

        (results as any).orders = {
          status: ordersResponse.status,
          ok: ordersResponse.ok,
        };

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          (results as any).orders.data = ordersData;
        } else {
          (results as any).orders.error = await ordersResponse.text();
        }

        // Test 3: Count query
        console.log("Testing count query...");
        const countResponse = await fetch(INDEXER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: countQuery }),
        });

        (results as any).count = {
          status: countResponse.status,
          ok: countResponse.ok,
        };

        if (countResponse.ok) {
          const countData = await countResponse.json();
          (results as any).count.data = countData;
        } else {
          (results as any).count.error = await countResponse.text();
        }

        // Test 4: All available root fields query
        const rootFieldsQuery = `
          query {
            __type(name: "Query") {
              fields {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        `;

        console.log("Testing root fields query...");
        const rootFieldsResponse = await fetch(INDEXER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: rootFieldsQuery }),
        });

        if (rootFieldsResponse.ok) {
          const rootFieldsData = await rootFieldsResponse.json();
          (results as any).rootFields = rootFieldsData;
        }

      } catch (error) {
        (results as any).error = {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        };
      }

      setDebugInfo(results);
      setLoading(false);
    };

    testQueries();
  }, []);

  if (loading) {
    return <div className="p-4">Testing indexer connection...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Orders Debug Information</h2>
      <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-auto max-h-96">
        {JSON.stringify(debugInfo, null, 2)}
      </pre>
    </div>
  );
};