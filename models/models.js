const mongoose = require('mongoose');

const PostChoice = require('./post').PostChoice;
const User = require('./user').UserChoice;

module.exports = {
  PostChoice,
  User,
};
