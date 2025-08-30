# Swagger API Documentation Guide

## 🚀 Quick Start

### Accessing the Documentation

1. **Start the server**:
   ```bash
   npm run dev
   ```

2. **Open Swagger UI**:
   - Navigate to: `http://localhost:5000/api-docs`
   - The documentation will load automatically

### Using Swagger UI

#### 🔐 Authentication
- Most endpoints require JWT authentication
- Click the "Authorize" button (🔒) at the top
- Enter your JWT token in the format: `Bearer YOUR_TOKEN_HERE`
- Click "Authorize" to apply

#### 🧪 Testing Endpoints
1. **Find an endpoint** in the documentation
2. **Click on the endpoint** to expand it
3. **Click "Try it out"** button
4. **Fill in the required parameters**:
   - For JSON requests: Edit the request body
   - For file uploads: Use the file selector
   - For query parameters: Fill in the form fields
5. **Click "Execute"** to send the request
6. **View the response** in the response section

#### 📝 Example Workflow

**1. Register a new user**:
- Go to `POST /auth/register`
- Click "Try it out"
- Enter user details:
  ```json
  {
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User"
  }
  ```
- Click "Execute"
- Copy the JWT token from the response

**2. Authenticate**:
- Click "Authorize" at the top
- Enter: `Bearer YOUR_JWT_TOKEN`
- Click "Authorize"

**3. Upload an asset**:
- Go to `POST /assets/upload`
- Click "Try it out"
- Upload a file and fill in metadata
- Click "Execute"

### 📋 Available Endpoints

#### Authentication (`/auth`)
- `POST /register` - Create new account
- `POST /login` - User login
- `GET /me` - Get current user profile
- `PUT /profile` - Update profile

#### Assets (`/assets`)
- `POST /upload` - Upload new asset
- `GET /` - List all assets
- `GET /{id}` - Get specific asset
- `PUT /{id}` - Update asset
- `DELETE /{id}` - Delete asset

#### Payments (`/payments`)
- `POST /create` - Create payment
- `GET /` - List payments
- `GET /{id}` - Get payment details

#### AI (`/ai`)
- `POST /compare` - Compare images
- `POST /analyze` - Analyze content

### 🔧 Troubleshooting

#### Common Issues

**"401 Unauthorized"**:
- Make sure you're authenticated
- Check that your JWT token is valid
- Ensure the token format is: `Bearer TOKEN`

**"400 Bad Request"**:
- Check the request body format
- Verify all required fields are provided
- Ensure file types are supported

**"500 Internal Server Error"**:
- Check server logs
- Verify database connection
- Ensure all environment variables are set

#### Getting Help

- Check the server console for detailed error messages
- Review the API response for specific error details
- Ensure your request matches the schema requirements

### 🎯 Tips

1. **Start with public endpoints** (like `/auth/register`) before testing protected ones
2. **Use the "Examples"** dropdown to see sample requests
3. **Check the "Schema"** tab to understand the data structure
4. **Use the "Responses"** section to see all possible response codes
5. **Bookmark the documentation URL** for easy access

### 📚 Additional Resources

- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [Express.js Documentation](https://expressjs.com/)
