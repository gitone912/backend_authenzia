# Authenzia Backend API

A comprehensive Node.js Express backend for the Authenzia digital asset marketplace platform, featuring AI-powered duplicate detection, secure file handling, and payment processing infrastructure.

## 🚀 Features

### Core Functionality
- **User Authentication & Management**: JWT-based auth with user roles and profiles
- **Asset Management**: Upload, store, and manage digital assets with metadata
- **AI-Powered Duplicate Detection**: Uses Groq AI models + local image hashing for two-step verification
- **Secure File Processing**: Automatic watermarking, thumbnail generation, and QR code creation
- **Payment Infrastructure**: Payment tracking and access control (Coinbase integration ready)
- **Content Moderation**: AI-powered content validation and appropriateness checking

### AI Integration
- **Groq AI Models**: Uses Llama-4-Scout for image comparison and analysis
- **Image Hashing**: Local duplicate detection using perceptual hashing
- **Content Analysis**: Automatic tag generation, category suggestion, and pricing recommendations
- **Batch Processing**: Compare multiple images simultaneously

### Security Features
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive request validation using express-validator
- **File Type Restrictions**: Secure file upload with type and size validation
- **Access Control**: Role-based permissions and asset ownership verification

## 🛠️ Tech Stack

- **Runtime**: Node.js with ES modules
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **AI Services**: Groq SDK for image analysis
- **Image Processing**: Sharp for watermarking and manipulation
- **File Upload**: Multer for handling file uploads
- **Authentication**: JWT with bcrypt for password hashing
- **Validation**: express-validator for request validation
- **Security**: Helmet, CORS, rate limiting

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB 5+
- Groq API key
- npm or yarn package manager

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/authenzia
   JWT_SECRET=your-super-secret-jwt-key-here
   GROQ_API_KEY=your-groq-api-key-here
   FRONTEND_URL=http://localhost:5173
   ```

4. **Start MongoDB**
   ```bash
   # Local MongoDB
   mongod
   
   # Or use Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

5. **Run the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📚 API Documentation

### Swagger UI
The API documentation is available through Swagger UI at:
- **Development**: `http://localhost:5000/api-docs`
- **Production**: `https://api.authenzia.com/api-docs`

The Swagger documentation includes:
- Interactive API testing interface
- Request/response schemas
- Authentication requirements
- Example requests and responses
- Error code documentation

### API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/password` - Change password

#### Assets
- `POST /api/assets/upload` - Upload new asset
- `GET /api/assets` - Get all public assets
- `GET /api/assets/:id` - Get asset by ID
- `GET /api/assets/creator/:userId` - Get assets by creator
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset

### Payments
- `POST /api/payments/create` - Create payment for asset
- `POST /api/payments/:id/process` - Process payment (hardcoded)
- `GET /api/payments/:id/download` - Download asset after payment
- `GET /api/payments/:id/status` - Get payment status
- `GET /api/payments/user/:userId` - Get user payment history

### AI Services
- `POST /api/ai/compare` - Compare two images
- `POST /api/ai/check-duplicate` - Check for duplicate content
- `POST /api/ai/analyze` - Analyze image content
- `POST /api/ai/validate` - Validate content appropriateness
- `GET /api/ai/similar/:assetId` - Find similar assets
- `POST /api/ai/batch-compare` - Batch image comparison

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 5000 |
| `NODE_ENV` | Environment mode | development |
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017/authenzia |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | JWT expiration time | 7d |
| `GROQ_API_KEY` | Groq AI API key | - |
| `MAX_FILE_SIZE` | Maximum file upload size | 10MB |
| `UPLOAD_PATH` | File upload directory | ./uploads |
| `WATERMARK_TEXT` | Watermark text for images | SAMPLE |
| `FRONTEND_URL` | Frontend application URL | http://localhost:5173 |

### File Upload Limits

- **Images**: 10MB max
- **Documents**: 10MB max  
- **AI Processing**: 5MB max
- **Supported Formats**: JPEG, PNG, GIF, WebP, PDF, DOC, DOCX, TXT

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📁 Project Structure

```
backend/
├── config/           # Database and configuration
├── middleware/       # Express middleware
├── models/          # Mongoose models
├── routes/          # API route handlers
├── utils/           # Utility functions and services
├── uploads/         # File upload directory
├── server.js        # Main application file
├── package.json     # Dependencies and scripts
└── README.md        # This file
```

## 🔒 Security Considerations

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **File Validation**: Strict file type and size restrictions
- **Input Sanitization**: All user inputs are validated and sanitized
- **JWT Security**: Secure token handling with expiration
- **CORS Configuration**: Restricted to frontend domain only

## 🚀 Deployment

### Production Setup

1. **Set environment variables**
   ```bash
   NODE_ENV=production
   JWT_SECRET=<strong-secret>
   GROQ_API_KEY=<your-groq-key>
   ```

2. **Build and start**
   ```bash
   npm run build
   npm start
   ```

3. **Process Management** (recommended)
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start server.js --name authenzia-backend
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🔮 Future Enhancements

- **Coinbase Integration**: Real payment processing
- **Email Service**: Asset delivery notifications
- **CDN Integration**: Cloud file storage
- **Advanced AI**: More sophisticated duplicate detection
- **Analytics**: User behavior and platform metrics
- **Webhooks**: Real-time payment notifications

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation
- Review the error logs

## 🔗 Related Links

- [Frontend Application](../frontend_authenzia)
- [Groq AI Documentation](https://console.groq.com/docs)
- [Express.js Documentation](https://expressjs.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
