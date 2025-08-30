#!/bin/bash

# Authenzia Backend Startup Script
echo "🚀 Starting Authenzia Backend..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    if [ -f env.example ]; then
        cp env.example .env
        echo "✅ .env file created from template."
        echo "📝 Please edit .env file with your configuration before continuing."
        echo "   Required: JWT_SECRET, GROQ_API_KEY, MONGODB_URI"
        exit 1
    else
        echo "❌ env.example not found. Please create .env file manually."
        exit 1
    fi
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
fi

# Check if MongoDB is running
echo "🔍 Checking MongoDB connection..."
if command -v mongosh &> /dev/null; then
    mongosh --eval "db.runCommand('ping')" --quiet > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  MongoDB is not running. Please start MongoDB first:"
        echo "   - Local: mongod"
        echo "   - Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest"
        echo ""
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo "⚠️  MongoDB client not found. Please ensure MongoDB is running."
fi

# Create upload directories
echo "📁 Creating upload directories..."
mkdir -p uploads/originals uploads/watermarked uploads/thumbnails uploads/qrcodes uploads/documents

# Start the server
echo "🚀 Starting server..."
echo "📱 Frontend URL: http://localhost:5173"
echo "🔗 API Base URL: http://localhost:5000/api"
echo "📊 Health Check: http://localhost:5000/api/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
