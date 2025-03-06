const mongoose = require('mongoose');

// Import from capitalized files to handle case sensitivity
const Post = require('./Post');
const { UserChoice } = require('./User');

module.exports = {
  PostChoice: Post,  // Maintain backward compatibility with existing code
  User: UserChoice,  // Maintain backward compatibility with existing code
};