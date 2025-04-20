// Simple script to debug server initialization
try {
  console.log('== Starting server_debug.js ==');
  
  const express = require('express');
  console.log('Express module loaded');
  
  const app = express();
  console.log('Express app created');
  
  // Import routes one at a time to isolate issues
  console.log('About to import routes one by one...')
  
  let usersRoutes, postsRoutes, interactionsRoutes;
  
  try {
    console.log('- Importing users routes');
    usersRoutes = require('./routes/users');
    console.log('✅ users routes imported successfully');
  } catch (error) {
    console.error('❌ Failed to import users routes:', error);
  }
  
  try {
    console.log('- Importing posts routes');
    postsRoutes = require('./routes/posts');
    console.log('✅ posts routes imported successfully');
  } catch (error) {
    console.error('❌ Failed to import posts routes:', error);
  }
  
  try {
    console.log('- Importing interactions routes');
    interactionsRoutes = require('./routes/interactions');
    console.log('✅ interactions routes imported successfully');
  } catch (error) {
    console.error('❌ Failed to import interactions routes:', error);
  }
  
  // Register only routes that were successfully imported
  if (usersRoutes) {
    app.use('/api/users', usersRoutes);
    console.log('✅ users routes registered');
  }
  
  if (postsRoutes) {
    app.use('/api/posts', postsRoutes);
    console.log('✅ posts routes registered');
  }
  
  if (interactionsRoutes) {
    app.use('/api/interactions', interactionsRoutes);
    console.log('✅ interactions routes registered');
  }
  
  // Create a simple health check endpoint
  app.get('/api/debug/health', (req, res) => {
    res.json({ status: 'ok', message: 'Debug server is running' });
  });
  
  // Start server on port 3001 (to avoid conflicts)
  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`Debug server running on port ${PORT}`);
  });
  
} catch (error) {
  console.error('Top-level error in debug server:', error);
} 