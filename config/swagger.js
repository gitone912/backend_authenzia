import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Authenzia Backend API',
      version: '1.0.0',
      description: 'API documentation for Authenzia - AI-powered content platform with Coinbase integration',
      contact: {
        name: 'Authenzia Team',
        email: 'support@authenzia.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server'
      },
      {
        url: 'https://api.authenzia.com/api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'User ID'
            },
            username: {
              type: 'string',
              description: 'Username'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email'
            },
            role: {
              type: 'string',
              enum: ['user', 'creator', 'admin'],
              description: 'User role'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation date'
            }
          }
        },
        Asset: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Asset ID'
            },
            title: {
              type: 'string',
              description: 'Asset title'
            },
            description: {
              type: 'string',
              description: 'Asset description'
            },
            price: {
              type: 'number',
              description: 'Asset price in USD'
            },
            category: {
              type: 'string',
              description: 'Asset category'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Asset tags'
            },
            creator: {
              type: 'string',
              description: 'Creator ID'
            },
            imageUrl: {
              type: 'string',
              description: 'Asset image URL'
            },
            qrCodeUrl: {
              type: 'string',
              description: 'QR code URL'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Asset creation date'
            }
          }
        },
        Payment: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Payment ID'
            },
            assetId: {
              type: 'string',
              description: 'Asset ID'
            },
            buyerId: {
              type: 'string',
              description: 'Buyer ID'
            },
            amount: {
              type: 'number',
              description: 'Payment amount'
            },
            currency: {
              type: 'string',
              description: 'Payment currency'
            },
            status: {
              type: 'string',
              enum: ['pending', 'completed', 'failed'],
              description: 'Payment status'
            },
            transactionId: {
              type: 'string',
              description: 'External transaction ID'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Payment creation date'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            status: {
              type: 'number',
              description: 'HTTP status code'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './routes/*.js',
    './models/*.js',
    './server.js'
  ]
};

const specs = swaggerJsdoc(options);

export default specs;
