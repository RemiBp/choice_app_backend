const mongoose = require('mongoose');

const Post = require('./Post');
const { UserChoice } = require('./User');

module.exports = {
  PostChoice: Post,
  User: UserChoice,
};
