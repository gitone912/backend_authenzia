import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import { spawn } from 'child_process';

// Import routes
import authRoutes from './routes/auth.js';
import assetRoutes from './routes/assets.js';
import paymentRoutes from './routes/payments.js';
import aiRoutes from './routes/ai.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { connectDB } from './config/database.js';

// Import X402 Service and Middleware
import X402Service from './utils/x402Service.js';
import { paymentMiddleware } from 'x402-express';

// Import Swagger configuration
import swaggerSpecs from './config/swagger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize X402 Service
const x402Service = new X402Service();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:3000', // Additional frontend port
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving with CORS headers
app.use('/uploads', (req, res, next) => {
  // Set CORS headers for static files
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Authenzia API Documentation',
  customfavIcon: '/favicon.ico'
}));

// X402 Payment Middleware - EXACTLY like your example
const receivingWallet = process.env.COINBASE_RECEIVING_WALLET || "0xc23088F6bfA04A33F3AA9eCdEd7dfa8aF1902b03";

// Simple X402 route configurations (like your weather example)
const x402Routes = {
  "GET /api/assets/:id/purchase": {
    price: "$0.01", // Fixed price for testing - just like your weather example
    network: "base-sepolia",
    config: {
      description: "Purchase NFT with X402 payment",
      inputSchema: {
        type: "object",
        properties: {
          buyerAddress: {
            type: "string",
            description: "Buyer's wallet address"
          }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          nft: { type: "object" }
        }
      }
    }
  },
  "GET /api/assets/:id/download": {
    price: "$0.005",
    network: "base-sepolia",
    config: {
      description: "Download high-resolution image",
      inputSchema: {
        type: "object",
        properties: {
          format: { type: "string" }
        }
      }
    }
  }
};

// Apply X402 middleware EXACTLY like your example
app.use(paymentMiddleware(
  receivingWallet,
  x402Routes,
  {
    url: "https://x402.org/facilitator"
  }
));

console.log('✅ X402 payment middleware applied successfully');
console.log('💰 Receiving wallet:', receivingWallet);
console.log('🎯 Protected routes configured');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Authenzia Backend is running',
    timestamp: new Date().toISOString()
  });
});

// X402 Server Start endpoint
let x402ServerProcess = null;

app.post('/api/start-x402-server', (req, res) => {
  try {
    console.log('🚀 Starting X402 server for purchase...');

    // Kill existing process if running
    if (x402ServerProcess) {
      console.log('🔄 Killing existing X402 server process...');
      x402ServerProcess.kill();
      x402ServerProcess = null;
    }

    // Start the X402 server
    x402ServerProcess = spawn('node', ['x402-server.js'], {
      cwd: __dirname,
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    x402ServerProcess.stdout.on('data', (data) => {
      console.log(`X402 Server: ${data}`);
    });

    x402ServerProcess.stderr.on('data', (data) => {
      console.error(`X402 Server Error: ${data}`);
    });

    x402ServerProcess.on('close', (code) => {
      console.log(`X402 server process exited with code ${code}`);
      x402ServerProcess = null;
    });

    // Give it a moment to start
    setTimeout(() => {
      res.json({
        success: true,
        message: 'X402 server started successfully',
        serverUrl: 'http://localhost:4021',
        weatherEndpoint: 'http://localhost:4021/weather'
      });
    }, 1000);

  } catch (error) {
    console.error('❌ Error starting X402 server:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start X402 server',
      details: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Authenzia Backend API',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/auth',
      assets: '/api/assets',
      payments: '/api/payments',
      ai: '/api/ai'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
