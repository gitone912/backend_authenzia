import express from "express";
import { paymentMiddleware } from "x402-express";
// import { facilitator } from "@coinbase/x402"; // For mainnet

const app = express();

app.use(paymentMiddleware(
  "0xc23088F6bfA04A33F3AA9eCdEd7dfa8aF1902b03", // your receiving wallet address
  {  // Route configurations for protected endpoints
    "GET /weather": {
      // USDC amount in dollars
      price: "$0.0000001",
      network: "base-sepolia", // for mainnet, see Running on Mainnet section
      // Optional: Add metadata for better discovery in x402 Bazaar
      config: {
        description: "Get current weather data for any location",
        inputSchema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City name" }
          }
        },
        outputSchema: {
          type: "object",
          properties: {
            weather: { type: "string" },
            temperature: { type: "number" }
          }
        }
      }
    },
  },
  {
    url: "https://x402.org/facilitator", // for testnet
  }
));

// Implement your route
app.get("/weather", (req, res) => {
  res.send({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:4021`);
});
